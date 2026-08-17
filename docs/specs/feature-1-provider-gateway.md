# Feature 1 — Provider gateway, key custody, CSP generation

Build-order row (HANDOFF §12 #1). Every requirement names its layer.

## Requirements

| # | Requirement | Layer |
|---|---|---|
| R1 | `LlmGateway` port: structured-only `complete<T>(purpose, prompt, schema)` with purpose ∈ ask\|extract\|evaluate\|narrate; `ping()` for key verification; `estimateCostSoFar()` | L2 (port) |
| R2 | `VaultPort`: key custody `memory` (default) or `session`; `wipe()`; key never touches localStorage or leaves the browser except to the provider | L2 (port) |
| R3 | `VerifyProviderKey` use case: 1-token ping; classifies failures as `auth` / `cors` / `network` / `rate_limit` / `provider_error`; returns `Result` | L2 (use case) |
| R4 | Provider registry (data): Mistral + Ollama for v1; per provider: id, label, base URL, CSP origins, auth style, structured-output mode, UI notes (Ollama `OLLAMA_ORIGINS` command; Anthropic browser header note reserved for v0.2) | L3 (data) |
| R5 | `OpenAiCompatibleGateway` covering Mistral and Ollama: JSON-schema structured outputs, zod validation at the edge, one repair retry on invalid output then typed failure (never fabricated content), backoff retry on 429/5xx, token/cost accounting, error mapping to `LlmError` | L3 (adapter) |
| R6 | `InMemoryVault` + `SessionVault`; wipe verified by test | L3 (adapter) |
| R7 | One gateway **contract suite** executed against every adapter (mocked fetch fixtures; live smoke behind env flag later) | test |
| R8 | CSP generated at build time from the provider registry: `connect-src 'self'` + registered provider origins only; emitted as a Caddy snippet consumed by the prod image | L4 (build) |
| R9 | Playwright e2e against the prod container: fetch to a canary origin is blocked by CSP; allowlisted provider origin is not blocked by CSP | e2e |
| R10 | Minimal setup UI: provider select, key input, verify button with classified error feedback; wired via hook (no business branching) + DI in `main.tsx` | L3 (controller) / L4 |

## Non-negotiables touched

- §2.2 BYOK absolute (vault, no proxy) · §2.6 provider-agnostic by contract test · §2.8 CSP enforces privacy · §2.9 structured outputs, zod at the edge · §2.4 invalid LLM output degrades, never fabricates.

## Definition of done

Contract suite passes for Mistral + Ollama · CSP blocks a canary origin in Playwright · key wipe verified · all standing gates green.