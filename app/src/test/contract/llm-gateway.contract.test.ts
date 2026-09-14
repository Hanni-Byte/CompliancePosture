import { describe, expect, it } from "vitest";
import { OpenAiCompatibleGateway, parseRetryAfter, type RetryPolicy } from "../../adapters/llm/openai-compatible";
import { providerById, type ProviderSpec } from "../../adapters/llm/providers";
import { InMemoryVault } from "../../adapters/persistence/vaults";
import type { LlmRequest, SchemaRef } from "../../application/ports/llm-gateway";

/**
 * The gateway contract (§2.6): every adapter must pass this exact suite.
 * Providers are exercised through mocked fetch fixtures; the live smoke
 * (`npm run smoke:live`, D22) proves the real wire format manually.
 */

interface Answer {
  answer: string;
}
const answerSchema: SchemaRef<Answer> = {
  name: "answer",
  jsonSchema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
    additionalProperties: false,
  },
  parse: (raw) =>
    typeof raw === "object" && raw !== null && "answer" in raw &&
    typeof (raw as Record<string, unknown>).answer === "string"
      ? { answer: (raw as Record<string, unknown>).answer as string }
      : null,
};

function completionRequest(extra: Partial<LlmRequest<Answer>> = {}): LlmRequest<Answer> {
  return {
    purpose: "ask",
    prompt: { id: "test-prompt", version: 1 },
    system: "You are a test.",
    user: "Say hi.",
    schema: answerSchema,
    ...extra,
  };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function completionBody(content: unknown, usage = { prompt_tokens: 10, completion_tokens: 5 }, finishReason = "stop") {
  return {
    choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: finishReason }],
    usage,
  };
}

interface ScriptedCall {
  url: string;
  init?: RequestInit;
}
type Step = Response | Error | ((init: RequestInit | undefined) => Response | Promise<Response>);

/** fetch mock that pops scripted outcomes; records every call it served. */
function scriptedFetch(script: Step[]) {
  const calls: ScriptedCall[] = [];
  const fn: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, ...(init !== undefined ? { init } : {}) });
    const next = script.shift();
    if (!next) throw new Error("contract test: fetch script exhausted");
    if (next instanceof Error) return Promise.reject(next);
    if (typeof next === "function") return Promise.resolve(next(init));
    return Promise.resolve(next);
  };
  return { fn, calls };
}

function bodyOf(call: ScriptedCall | undefined): { messages: { role: string; content: string }[]; response_format: { type: string; json_schema: { name: string } }; max_tokens?: number; model: string } {
  return JSON.parse(call?.init?.body as string) as ReturnType<typeof bodyOf>;
}

const modelsListing = (spec: ProviderSpec) => jsonResponse({ data: [{ id: spec.defaultModel }, { id: "other" }] });

for (const providerId of ["mistral", "ollama"] as const) {
  const maybe = providerById(providerId);
  if (maybe === null) throw new Error(`registry is missing ${providerId}`);
  const spec: ProviderSpec = maybe;

  describe(`LlmGateway contract — ${providerId}`, () => {
    function gateway(script: Step[], options: { key?: string; retry?: Partial<RetryPolicy> } = {}) {
      const vault = new InMemoryVault();
      vault.store(options.key ?? (spec.requiresKey ? "sk-test" : ""));
      const { fn, calls } = scriptedFetch(script);
      const sleeps: number[] = [];
      const gw = new OpenAiCompatibleGateway({
        spec,
        vault,
        fetchFn: fn,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
        ...(options.retry ? { retry: options.retry } : {}),
      });
      return { gw, calls, sleeps };
    }

    it("returns a schema-validated structured completion and accounts tokens", async () => {
      const { gw, calls } = gateway([jsonResponse(completionBody({ answer: "hi" }))]);
      const result = await gw.complete(completionRequest({ maxTokens: 64 }));
      expect(result).toEqual({ ok: true, value: { answer: "hi" } });
      expect(gw.estimateCostSoFar()).toEqual({ inputTokens: 10, outputTokens: 5, calls: 1 });

      const body = bodyOf(calls[0]);
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.name).toBe("answer");
      expect(body.max_tokens).toBe(64);
      expect(body.model).toBe(spec.defaultModel);
      expect(calls[0]?.url).toBe(`${spec.baseUrl}/chat/completions`);
      expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal); // deadline always attached
    });

    it("accounts tokens as zero when the provider omits usage", async () => {
      const { gw } = gateway([jsonResponse({ choices: [{ message: { content: JSON.stringify({ answer: "x" }) } }] })]);
      expect((await gw.complete(completionRequest())).ok).toBe(true);
      expect(gw.estimateCostSoFar()).toEqual({ inputTokens: 0, outputTokens: 0, calls: 1 });
    });

    it("sends the key as a bearer header exactly when the provider requires one", async () => {
      const { gw, calls } = gateway([jsonResponse(completionBody({ answer: "x" }))]);
      await gw.complete(completionRequest());
      const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
      if (spec.requiresKey) expect(headers.authorization).toBe("Bearer sk-test");
      else expect(headers.authorization).toBeUndefined();
    });

    it("repairs once on invalid content, then fails as invalid_response — never fabricates", async () => {
      const { gw, calls } = gateway([
        jsonResponse(completionBody("not json {")),
        jsonResponse(completionBody({ wrong: "shape" })),
      ]);
      const result = await gw.complete(completionRequest());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("invalid_response");
      expect(calls.length).toBe(2);
      expect(bodyOf(calls[1]).messages.length).toBe(3);
    });

    it("recovers when the repair attempt returns valid content", async () => {
      const { gw } = gateway([jsonResponse(completionBody("oops")), jsonResponse(completionBody({ answer: "fixed" }))]);
      expect(await gw.complete(completionRequest())).toEqual({ ok: true, value: { answer: "fixed" } });
    });

    it("explains a truncated response instead of blaming the model", async () => {
      const { gw } = gateway([jsonResponse(completionBody('{"answer": "cut', undefined, "length")), jsonResponse(completionBody('{"ans', undefined, "length"))]);
      const result = await gw.complete(completionRequest({ maxTokens: 5 }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/max_tokens/);
    });

    it("maps a malformed envelope to provider_error without a repair round-trip", async () => {
      const { gw, calls } = gateway([jsonResponse({ nope: true })]);
      const result = await gw.complete(completionRequest());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("provider_error");
      expect(calls.length).toBe(1);
    });

    it("maps 401 to auth and sends the key exactly once (no repair after auth failure)", async () => {
      const { gw, calls } = gateway([jsonResponse({ error: "bad key" }, 401)]);
      const result = await gw.complete(completionRequest());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("auth");
      expect(calls.length).toBe(1);
    });

    it("retries 429 honouring a capped Retry-After, then reports rate_limit with the delay", async () => {
      const { gw, calls, sleeps } = gateway(
        [jsonResponse({}, 429, { "retry-after": "2" }), jsonResponse({}, 429, { "retry-after": "3600" }), jsonResponse({}, 429, { "retry-after": "7" })],
        { retry: { retryAfterCapMs: 10_000 } },
      );
      const result = await gw.complete(completionRequest());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toEqual({ kind: "rate_limit", message: "Rate limited (HTTP 429)", retryAfterSeconds: 7 });
      expect(calls.length).toBe(3);
      expect(sleeps).toEqual([2000, 10_000]); // second wait capped, never an hour
    });

    it("backs off exponentially when Retry-After is absent", async () => {
      const { gw, sleeps } = gateway([jsonResponse({}, 503), jsonResponse({}, 503), jsonResponse(completionBody({ answer: "ok" }))]);
      expect(await gw.complete(completionRequest())).toEqual({ ok: true, value: { answer: "ok" } });
      expect(sleeps).toEqual([250, 500]);
    });

    it("reports provider_error with the status after retries are exhausted", async () => {
      const { gw } = gateway([jsonResponse({}, 503), jsonResponse({}, 503), jsonResponse({}, 503)]);
      const result = await gw.complete(completionRequest());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toEqual({ kind: "provider_error", message: "Provider error (HTTP 503)", status: 503 });
    });

    it("classifies an abort as aborted, even during backoff", async () => {
      const controller = new AbortController();
      const { gw, calls } = gateway([
        () => {
          controller.abort();
          return jsonResponse({}, 503);
        },
        jsonResponse(completionBody({ answer: "never" })),
      ]);
      const result = await gw.complete(completionRequest({ signal: controller.signal }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("aborted");
      expect(calls.length).toBe(1);
    });

    it("classifies a fetch rejection under an aborted signal as aborted", async () => {
      const controller = new AbortController();
      const { gw } = gateway([
        () => {
          controller.abort();
          throw new DOMException("aborted", "AbortError");
        },
      ]);
      const result = await gw.ping(controller.signal);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("aborted");
    });

    it("gives up with a network error when the deadline passes", async () => {
      const { gw } = gateway([new DOMException("timed out", "TimeoutError")], { retry: { timeoutMs: 5 } });
      const result = await gw.ping();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("network");
        expect(result.error.message).toMatch(/within/);
      }
    });

    it("classifies fetch rejection as cors when the origin is reachable via no-cors probe", async () => {
      const { gw } = gateway([new TypeError("Failed to fetch"), new Response(null, { status: 200 })]);
      const result = await gw.ping();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("cors");
        if (spec.corsHint) expect(result.error.message).toBe(spec.corsHint);
      }
    });

    it("classifies fetch rejection as network when the probe also fails", async () => {
      const { gw } = gateway([new TypeError("Failed to fetch"), new TypeError("Failed to fetch")]);
      const result = await gw.ping();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("network");
    });

    it("ping reports the configured model when the provider lists it", async () => {
      const { gw, calls } = gateway([modelsListing(spec)]);
      expect(await gw.ping()).toEqual({ ok: true, value: { providerId: spec.id, model: spec.defaultModel } });
      expect(calls[0]?.url).toBe(`${spec.baseUrl}/models`);
    });

    it("ping fails honestly when the configured model is not available", async () => {
      const { gw } = gateway([jsonResponse({ data: [{ id: "something-else" }] })]);
      const result = await gw.ping();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("provider_error");
        expect(result.error.message).toContain(spec.defaultModel);
      }
    });

    it("ping maps an unexpected /models shape to provider_error", async () => {
      const { gw } = gateway([jsonResponse({ models: [] })]);
      const result = await gw.ping();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("provider_error");
    });
  });
}

describe("parseRetryAfter", () => {
  it("parses delay-seconds and HTTP dates, ignores garbage", () => {
    expect(parseRetryAfter("3")).toBe(3);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
    const now = Date.parse("Mon, 14 Sep 2026 10:00:00 GMT");
    expect(parseRetryAfter("Mon, 14 Sep 2026 10:00:30 GMT", () => now)).toBe(30);
  });
});
