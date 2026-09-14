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
    .array(z.object({ message: z.object({ content: z.string() }), finish_reason: z.string().nullish() }))
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

/** Transport policy — a value object, not a decorator, consumed by the shared transport. */
export interface RetryPolicy {
  /** Total attempts for retryable statuses (429/5xx). */
  maxAttempts: number;
  /** Upper bound applied to `Retry-After`, so a provider cannot park the tab. */
  retryAfterCapMs: number;
  /** Per-request deadline; combined with the caller's signal. */
  timeoutMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, retryAfterCapMs: 10_000, timeoutMs: 30_000 };

export interface GatewayOptions {
  spec: ProviderSpec;
  vault: VaultPort;
  model?: string;
  retry?: Partial<RetryPolicy>;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Abort-aware sleep: resolves early (and cleanly) when the signal fires. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * One adapter covers every OpenAI-compatible provider (Mistral, Ollama,
 * later OpenAI/custom). Owns: auth, structured-output wire format, retries
 * with capped backoff, timeouts, token accounting, and error mapping to
 * LlmError. Never rejects (D20).
 */
export class OpenAiCompatibleGateway implements LlmGateway {
  private readonly spec: ProviderSpec;
  private readonly vault: VaultPort;
  private readonly model: string;
  private readonly policy: RetryPolicy;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private cost: CostEstimate = { inputTokens: 0, outputTokens: 0, calls: 0 };

  constructor(options: GatewayOptions) {
    this.spec = options.spec;
    this.vault = options.vault;
    this.model = options.model ?? options.spec.defaultModel;
    this.policy = { ...DEFAULT_RETRY_POLICY, ...options.retry };
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.sleep = options.sleep ?? abortableSleep;
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
    return this.chat<T>(request, [
      ...messages,
      {
        role: "user",
        content: `Your previous reply was not valid JSON for the schema "${request.schema.name}". Reply again with ONLY a JSON object that satisfies the schema. No prose.`,
      },
    ]);
  }

  async ping(signal?: AbortSignal): Promise<Result<ProviderPing, LlmError>> {
    const response = await this.request(`${this.spec.baseUrl}/models`, { method: "GET", headers: this.headers() }, signal);
    if (!response.ok) return response;

    const body = await this.readJson(response.value, signal);
    if (!body.ok) return body;
    const parsed = modelsSchema.safeParse(body.value);
    if (!parsed.success) {
      return err({ kind: "provider_error", message: "Unexpected /models response shape" });
    }
    // Report the model `complete` will use — or fail honestly if it is absent.
    if (!parsed.data.data.some((m) => m.id === this.model)) {
      const hint = this.spec.id === "ollama" ? ` Run: ollama pull ${this.model}` : "";
      return err({ kind: "provider_error", message: `Model "${this.model}" is not available on ${this.spec.label}.${hint}` });
    }
    return ok({ providerId: this.spec.id, model: this.model });
  }

  estimateCostSoFar(): CostEstimate {
    return { ...this.cost };
  }

  private async chat<T>(request: LlmRequest<T>, messages: { role: string; content: string }[]): Promise<Result<T, LlmError>> {
    const response = await this.request(
      `${this.spec.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { ...this.headers(), "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: {
            type: "json_schema",
            json_schema: { name: request.schema.name, schema: request.schema.jsonSchema, strict: true },
          },
          ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
        }),
      },
      request.signal,
    );
    if (!response.ok) return response;

    const body = await this.readJson(response.value, request.signal);
    if (!body.ok) return body;
    const envelope = chatCompletionSchema.safeParse(body.value);
    if (!envelope.success) {
      // A malformed envelope is the provider's problem, not something a repair prompt can fix.
      return err({ kind: "provider_error", message: "Response envelope failed validation" });
    }

    this.cost = {
      calls: this.cost.calls + 1,
      inputTokens: this.cost.inputTokens + (envelope.data.usage?.prompt_tokens ?? 0),
      outputTokens: this.cost.outputTokens + (envelope.data.usage?.completion_tokens ?? 0),
    };

    const choice = envelope.data.choices[0]!;
    let candidate: unknown;
    try {
      candidate = JSON.parse(choice.message.content);
    } catch {
      const truncated = choice.finish_reason === "length";
      return err({
        kind: "invalid_response",
        message: truncated ? "Response was cut off (max_tokens too low)" : "Content is not JSON",
      });
    }
    const value = request.schema.parse(candidate);
    if (value === null) {
      return err({ kind: "invalid_response", message: `Content failed schema "${request.schema.name}"` });
    }
    return ok(value);
  }

  private headers(): Record<string, string> {
    const key = this.vault.retrieve();
    return key ? { authorization: `Bearer ${key}` } : {};
  }

  private async readJson(response: Response, signal?: AbortSignal): Promise<Result<unknown, LlmError>> {
    try {
      return ok(await response.json());
    } catch {
      if (signal?.aborted) return err({ kind: "aborted", message: "Request aborted" });
      return err({ kind: "provider_error", message: "Response body is not JSON" });
    }
  }

  /** Transport layer: deadline, capped retries, abort awareness, error mapping. */
  private async request(url: string, init: RequestInit, signal?: AbortSignal): Promise<Result<Response, LlmError>> {
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) return err({ kind: "aborted", message: "Request aborted" });
      const deadline = AbortSignal.timeout(this.policy.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
      let response: Response;
      try {
        response = await this.fetchFn(url, { ...init, signal: combined });
      } catch (cause) {
        if (signal?.aborted) return err({ kind: "aborted", message: "Request aborted" });
        if (deadline.aborted || (cause instanceof DOMException && cause.name === "TimeoutError")) {
          return err({ kind: "network", message: `No response from the provider within ${this.policy.timeoutMs / 1000}s` });
        }
        return this.classifyFetchFailure();
      }

      if (response.ok) return ok(response);
      if (response.status === 401 || response.status === 403) {
        return err({ kind: "auth", message: `Provider rejected the key (HTTP ${response.status})` });
      }
      const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
      if (RETRYABLE_STATUS.has(response.status) && attempt < this.policy.maxAttempts) {
        const wait = retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : 250 * 2 ** (attempt - 1);
        await this.sleep(Math.min(wait, this.policy.retryAfterCapMs), signal);
        continue;
      }
      if (response.status === 429) {
        return err({
          kind: "rate_limit",
          message: "Rate limited (HTTP 429)",
          ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        });
      }
      return err({ kind: "provider_error", message: `Provider error (HTTP ${response.status})`, status: response.status });
    }
  }

  /**
   * fetch() rejects identically for CORS blocks and network failures. Probe
   * the origin with an opaque no-cors request: reachable → the original
   * failure was CORS; unreachable → genuine network failure.
   */
  private async classifyFetchFailure(): Promise<Result<never, LlmError>> {
    try {
      await this.fetchFn(this.spec.baseUrl, { method: "GET", mode: "no-cors", signal: AbortSignal.timeout(this.policy.timeoutMs) });
      return err({ kind: "cors", message: this.spec.corsHint ?? "The provider blocked this origin (CORS)." });
    } catch {
      return err({ kind: "network", message: "Could not reach the provider — check your connection or URL." });
    }
  }
}

/** `Retry-After` as delay-seconds or an HTTP date; undefined when absent/unparseable. */
export function parseRetryAfter(header: string | null, now: () => number = Date.now): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now()) / 1000));
}
