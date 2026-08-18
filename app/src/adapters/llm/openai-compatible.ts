import { z } from "zod";
import type {
  CostEstimate,
  LlmError,
  LlmGateway,
  LlmRequest,
  ProviderPing,
} from "../../application/ports/llm-gateway";
import type { Result } from "../../application/result";
import { err, ok } from "../../application/result";
import type { VaultPort } from "../../application/ports/vault";
import type { ProviderSpec } from "./providers";

/** Response envelopes are validated with zod here, at the edge (§2.9). */
const chatCompletionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

const modelsSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

export interface GatewayOptions {
  spec: ProviderSpec;
  vault: VaultPort;
  model?: string;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_TRANSPORT_RETRIES = 2;

/**
 * One adapter covers every OpenAI-compatible provider (Mistral, Ollama,
 * later OpenAI/custom). Owns: auth, structured-output wire format, retries
 * with backoff, token accounting, and error mapping to LlmError.
 */
export class OpenAiCompatibleGateway implements LlmGateway {
  private readonly spec: ProviderSpec;
  private readonly vault: VaultPort;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private cost: CostEstimate = { inputTokens: 0, outputTokens: 0, calls: 0 };

  constructor(options: GatewayOptions) {
    this.spec = options.spec;
    this.vault = options.vault;
    this.model = options.model ?? options.spec.defaultModel;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.sleep =
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async complete<T>(request: LlmRequest<T>): Promise<Result<T, LlmError>> {
    const messages = [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ];
    const first = await this.chat<T>(request, messages);
    if (first.ok || first.error.kind !== "invalid_response") return first;

    // One repair attempt with the validation failure fed back (§D20), after
    // which the caller degrades to "unknown" (§2.4) — never fabricate.
    const repair = await this.chat<T>(request, [
      ...messages,
      {
        role: "user",
        content: `Your previous reply was not valid JSON for the schema "${request.schema.name}". Reply again with ONLY a JSON object that satisfies the schema. No prose.`,
      },
    ]);
    return repair;
  }

  async ping(signal?: AbortSignal): Promise<Result<ProviderPing, LlmError>> {
    const response = await this.request(
      `${this.spec.baseUrl}/models`,
      { method: "GET", headers: this.headers(), signal: signal ?? null },
    );
    if (!response.ok) return response;

    const body: unknown = await response.value.json().catch(() => null);
    const parsed = modelsSchema.safeParse(body);
    if (!parsed.success) {
      return err({
        kind: "provider_error",
        message: "Unexpected /models response shape",
      });
    }
    const model =
      parsed.data.data.find((m) => m.id === this.model)?.id ??
      parsed.data.data[0]?.id ??
      this.model;
    return ok({ providerId: this.spec.id, model });
  }

  estimateCostSoFar(): CostEstimate {
    return { ...this.cost };
  }

  private async chat<T>(
    request: LlmRequest<T>,
    messages: { role: string; content: string }[],
  ): Promise<Result<T, LlmError>> {
    const response = await this.request(
      `${this.spec.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { ...this.headers(), "content-type": "application/json" },
        signal: request.signal ?? null,
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.schema.name,
              schema: request.schema.jsonSchema,
              strict: true,
            },
          },
          ...(request.maxTokens !== undefined
            ? { max_tokens: request.maxTokens }
            : {}),
        }),
      },
    );
    if (!response.ok) return response;

    const body: unknown = await response.value.json().catch(() => null);
    const envelope = chatCompletionSchema.safeParse(body);
    if (!envelope.success) {
      return err({
        kind: "invalid_response",
        message: "Response envelope failed validation",
      });
    }

    this.cost = {
      calls: this.cost.calls + 1,
      inputTokens: this.cost.inputTokens + (envelope.data.usage?.prompt_tokens ?? 0),
      outputTokens:
        this.cost.outputTokens + (envelope.data.usage?.completion_tokens ?? 0),
    };

    let candidate: unknown;
    try {
      candidate = JSON.parse(envelope.data.choices[0]!.message.content);
    } catch {
      return err({ kind: "invalid_response", message: "Content is not JSON" });
    }
    const value = request.schema.parse(candidate);
    if (value === null) {
      return err({
        kind: "invalid_response",
        message: `Content failed schema "${request.schema.name}"`,
      });
    }
    return ok(value);
  }

  private headers(): Record<string, string> {
    const key = this.vault.retrieve();
    return key ? { authorization: `Bearer ${key}` } : {};
  }

  /** Transport layer: retries retryable statuses, maps failures to LlmError. */
  private async request(
    url: string,
    init: RequestInit,
  ): Promise<Result<Response, LlmError>> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchFn(url, init);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return err({ kind: "aborted", message: "Request aborted" });
        }
        return this.classifyFetchFailure();
      }

      if (response.ok) return ok(response);
      if (response.status === 401 || response.status === 403) {
        return err({
          kind: "auth",
          message: `Provider rejected the key (HTTP ${response.status})`,
        });
      }
      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_TRANSPORT_RETRIES) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await this.sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 250 * 2 ** attempt,
        );
        continue;
      }
      if (response.status === 429) {
        return err({ kind: "rate_limit", message: "Rate limited (HTTP 429)" });
      }
      return err({
        kind: "provider_error",
        message: `Provider error (HTTP ${response.status})`,
        status: response.status,
      });
    }
  }

  /**
   * fetch() rejects identically for CORS blocks and network failures. Probe
   * the origin with an opaque no-cors request: reachable → the original
   * failure was CORS; unreachable → genuine network failure.
   */
  private async classifyFetchFailure(): Promise<Result<never, LlmError>> {
    try {
      await this.fetchFn(this.spec.baseUrl, { method: "GET", mode: "no-cors" });
      return err({
        kind: "cors",
        message:
          this.spec.id === "ollama"
            ? "Ollama refused this origin — restart it with OLLAMA_ORIGINS set (see setup notes)."
            : "The provider blocked this origin (CORS).",
      });
    } catch {
      return err({
        kind: "network",
        message: "Could not reach the provider — check your connection or URL.",
      });
    }
  }
}