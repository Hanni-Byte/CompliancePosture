# CompliancePosture — project rules for Claude Code

Browser-only AI compliance assessment tool (`complianceposture.hannibyte.com`). Full context lives in `docs/HANDOFF.md` — read it before any non-trivial change. The project constitution is `.specify/memory/constitution.md`; when in doubt, the Non-Negotiables below win over everything else.

## Non-Negotiables

1. **No backend for assessment data. Ever.** Static hosting only. Any feature requiring assessment content on a Hannibyte-controlled server is rejected or redesigned.
2. **BYOK is absolute.** No shared key, no proxy, no credit pool. The app must also run fully offline against local Ollama.
3. **Every finding cites a primary source** via structured retrieval — a `Citation` can only be constructed from chunks retrieval actually returned. A finding with `status ≠ not_applicable` must have ≥1 citation.
4. **A failed or invalid LLM response degrades to `status: "unknown"` — never to a fabricated finding.**
5. **The report is a draft posture, not legal advice.** The disclaimer is embedded in the template and cannot be disabled.
6. **Provider-agnostic by contract test:** every `LlmGateway` adapter passes the same contract suite.
7. **The dependency rule is enforced by dependency-cruiser in CI**, not by convention. Layers: `domain` (L1) → nothing; `application` (L2) → domain only; `adapters` (L3) → application + domain; `infrastructure` (L4) → anything. Only `infrastructure/main.tsx` knows concrete classes (manual DI).
8. **CSP enforces the privacy promise:** `connect-src` limited to self + registered provider origins. Custom-URL mode is the single documented exception, behind explicit user confirmation.
9. **Structured outputs at every LLM call site:** JSON schema per call, zod-validated in the adapter, invariants re-asserted in domain constructors. Unvalidated output never enters the store.
10. **No third-party scripts inside the app.** No CDN JS, no external fonts. Plausible on the landing page only. Datadog never inside the app.
11. **Dockerized from day one:** dev, pack-build, test, and prod all run in containers; prod is a static-file Caddy container with no API surface.
12. **Deviations require a written justification** committed with the change.

## Quality gates (all must pass per feature)

`tsc --strict` · eslint · unit tests (domain truth tables, use-case fakes) · gateway contract suite · citation-resolvability CI (every pack URL live, every chunk has a ref) · dependency-cruiser · `npm run smoke` golden-report diff · Docker image builds & serves.

## Conventions

- TypeScript strict; `Result<T,E>` unions across all boundaries — no exceptions cross layers.
- zod lives **only at edges** (LLM responses, pack files, imported assessments). Domain stays dependency-free (plain `asserts` invariants).
- Packs are not bundled — fetched on demand per selected framework. Pack schema is the only contract between app and Python pipeline (`tools/packs/`); neither imports the other.
- License: AGPL-3.0. DCO sign-off required on all commits/PRs.
- Develop with spec-kit: one feature per cycle in the `docs/HANDOFF.md` §12 order; every feature names its target layer(s).

## Commands

- `cd app && npm run dev` — local Vite dev server (or `docker compose --profile dev up`)
- `cd app && npm run check` — tsc + eslint + dependency-cruiser + tests (the local gate)
- `docker compose --profile prod up --build` — production image (Caddy, static)

## Explicit non-goals (do not build)

Accounts, hosted report storage, report emailing, payments, ISO 42001 as an assessed framework, multi-user collaboration, any proxy for LLM traffic, browser RUM.