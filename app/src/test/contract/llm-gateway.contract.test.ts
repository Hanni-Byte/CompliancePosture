import { describe, expect, it } from "vitest";
import { OpenAiCompatibleGateway } from "../../adapters/llm/openai-compatible";
import { providerById, type ProviderSpec } from "../../adapters/llm/providers";
import { InMemoryVault } from "../../adapters/persistence/vaults";
import type { LlmRequest, SchemaRef } from "../../application/ports/llm-gateway";

/**
 * The gateway contract (§2.6): every adapter must pass this exact suite.
 * Providers are exercised through mocked fetch fixtures; a live smoke run
 * behind an env flag arrives with the interview engine.
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

function completionRequest(): LlmRequest<Answer> {
  return {
    purpose: "ask",
    prompt: { id: "test-prompt", version: 1 },
    system: "You are a test.",
    user: "Say hi.",
    schema: answerSchema,
  };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function completionBody(content: unknown, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return {
    choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage,
  };
}

/** fetch mock that pops scripted outcomes; records every call it served. */
function scriptedFetch(script: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn: typeof fetch = (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, ...(init !== undefined ? { init } : {}) });
    const next = script.shift();
    if (!next) throw new Error("contract test: fetch script exhausted");
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  return { fn, calls };
}

interface SentChatBody {
  messages: { role: string; content: string }[];
  response_format: { type: string; json_schema: { name: string } };
}

function sentBody(call: { init?: RequestInit } | undefined): SentChatBody {
  if (typeof call?.init?.body !== "string") {
    throw new Error("contract test: expected a string request body");
  }
  return JSON.parse(call.init.body) as SentChatBody;
}

const instantSleep = () => Promise.resolve();

for (const providerId of ["mistral", "ollama"] as const) {
  const found = providerById(providerId);
  if (found === null) throw new Error(`registry is missing ${providerId}`);
  const spec: ProviderSpec = found;

  describe(`LlmGateway contract — ${providerId}`, () => {
    function gateway(script: (Response | Error)[], key = spec.requiresKey ? "sk-test" : "") {
      const vault = new InMemoryVault();
      vault.store(key);
      const { fn, calls } = scriptedFetch(script);
      return {
        gw: new OpenAiCompatibleGateway({ spec, vault, fetchFn: fn, sleep: instantSleep }),
        calls,
      };
    }

    it("returns a schema-validated structured completion and accounts tokens", async () => {
      const { gw, calls } = gateway([jsonResponse(completionBody({ answer: "hi" }))]);
      const result = await gw.complete(completionRequest());
      expect(result).toEqual({ ok: true, value: { answer: "hi" } });
      expect(gw.estimateCostSoFar()).toEqual({ inputTokens: 10, outputTokens: 5, calls: 1 });

      const body = sentBody(calls[0]);
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.name).toBe("answer");
      expect(calls[0]?.url).toBe(`${spec.baseUrl}/chat/completions`);
    });

    it("sends the key as a bearer header exactly when the provider requires one", async () => {
      const { gw, calls } = gateway([jsonResponse(completionBody({ answer: "x" }))]);
      await gw.complete(completionRequest());
      const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
      if (spec.requiresKey) {
        expect(headers.authorization).toBe("Bearer sk-test");
      } else {
        expect(headers.authorization).toBeUndefined();
      }
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
      expect(sentBody(calls[1]).messages.length).toBe(3);
    });

    it("recovers when the repair attempt returns valid content", async () => {
      const { gw } = gateway([
        jsonResponse(completionBody("oops")),
        jsonResponse(completionBody({ answer: "fixed" })),
      ]);
      const result = await gw.complete(completionRequest());
      expect(result).toEqual({ ok: true, value: { answer: "fixed" } });
    });

    it("maps 401 to auth", async () => {
      const { gw } = gateway([jsonResponse({ error: "bad key" }, 401)]);
      const result = await gw.ping();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("auth");
    });

    it("retries 429 with backoff, then reports rate_limit", async () => {
      const { gw, calls } = gateway([
        jsonResponse({}, 429, { "retry-after": "0" }),
        jsonResponse({}, 429),
        jsonResponse({}, 429),
      ]);
      const result = await gw.complete(completionRequest());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("rate_limit");
      expect(calls.length).toBe(3);
    });

    it("retries a 5xx and succeeds on the second attempt", async () => {
      const { gw } = gateway([
        jsonResponse({}, 503),
        jsonResponse(completionBody({ answer: "ok" })),
      ]);
      const result = await gw.complete(completionRequest());
      expect(result).toEqual({ ok: true, value: { answer: "ok" } });
    });

    it("classifies fetch rejection as cors when the origin is reachable via no-cors probe", async () => {
      const { gw } = gateway([
        new TypeError("Failed to fetch"),
        new Response(null, { status: 200 }),
      ]);
      const result = await gw.ping();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("cors");
    });

    it("classifies fetch rejection as network when the probe also fails", async () => {
      const { gw } = gateway([
        new TypeError("Failed to fetch"),
        new TypeError("Failed to fetch"),
      ]);
      const result = await gw.ping();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("network");
    });

    it("ping lists models and reports the provider id", async () => {
      const { gw, calls } = gateway([
        jsonResponse({ data: [{ id: spec.defaultModel }, { id: "other" }] }),
      ]);
      const result = await gw.ping();
      expect(result).toEqual({
        ok: true,
        value: { providerId: spec.id, model: spec.defaultModel },
      });
      expect(calls[0]?.url).toBe(`${spec.baseUrl}/models`);
    });
  });
}