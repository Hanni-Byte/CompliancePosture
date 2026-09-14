// Live provider smoke (D22) — MANUAL, never in CI. Proves the real wire
// format (response_format: json_schema) against real providers.
//
//   LIVE_SMOKE=1 npm run smoke:live                        # Ollama at localhost:11434
//   LIVE_SMOKE=1 MISTRAL_API_KEY=... npm run smoke:live    # + Mistral
//   OLLAMA_MODEL=llama3.2:1b  overrides the Ollama model.
import { OpenAiCompatibleGateway } from "../src/adapters/llm/openai-compatible.ts";
import { providerById } from "../src/adapters/llm/providers.ts";
import { InMemoryVault } from "../src/adapters/persistence/vaults.ts";

if (process.env.LIVE_SMOKE !== "1") {
  console.log("smoke:live skipped — set LIVE_SMOKE=1 to run against real providers");
  process.exit(0);
}

const schema = {
  name: "risk_classification",
  jsonSchema: {
    type: "object",
    properties: {
      risk_level: { type: "string", enum: ["prohibited", "high", "limited", "minimal"] },
      reason: { type: "string" },
    },
    required: ["risk_level", "reason"],
    additionalProperties: false,
  },
  parse: (raw) =>
    raw && typeof raw === "object" && typeof raw.reason === "string" &&
    ["prohibited", "high", "limited", "minimal"].includes(raw.risk_level)
      ? { risk_level: raw.risk_level, reason: raw.reason }
      : null,
};

const targets = [];
{
  const spec = providerById("ollama");
  targets.push({ spec: { ...spec, defaultModel: process.env.OLLAMA_MODEL ?? spec.defaultModel }, key: "" });
}
if (process.env.MISTRAL_API_KEY) {
  targets.push({ spec: providerById("mistral"), key: process.env.MISTRAL_API_KEY });
} else {
  console.log("mistral: skipped (no MISTRAL_API_KEY)");
}

let failed = false;
for (const { spec, key } of targets) {
  const vault = new InMemoryVault();
  vault.store(key);
  const gw = new OpenAiCompatibleGateway({ spec, vault });
  const t0 = Date.now();
  const ping = await gw.ping();
  console.log(`${spec.id}: ping →`, ping.ok ? `ok (${ping.value.model})` : `FAIL ${ping.error.kind}: ${ping.error.message}`);
  if (!ping.ok) { failed = true; continue; }
  const done = await gw.complete({
    purpose: "evaluate",
    prompt: { id: "live-smoke", version: 1 },
    system: "You classify AI systems under the EU AI Act. Answer only with JSON matching the schema.",
    user: "A chatbot that answers customer billing questions for a telecom company. Classify its risk level.",
    schema,
    maxTokens: 200,
  });
  console.log(`${spec.id}: structured completion →`, done.ok ? JSON.stringify(done.value) : `FAIL ${done.error.kind}: ${done.error.message}`);
  console.log(`${spec.id}: tokens`, JSON.stringify(gw.estimateCostSoFar()), `in ${Date.now() - t0} ms`);
  if (!done.ok) failed = true;
}
process.exit(failed ? 1 : 0);
