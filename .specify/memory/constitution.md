# CompliancePosture Constitution

These Non-Negotiables govern every feature, spec, and PR. When any other document, plan, or convenience conflicts with this file, this file wins. Deviations require a written justification committed with the change (§12).

## Non-Negotiables

1. **No backend for assessment data. Ever.** Static hosting only. Any feature requiring assessment content on a Hannibyte-controlled server is rejected or redesigned.
2. **BYOK is absolute.** No shared key, no proxy, no credit pool. The app must also run fully offline against local Ollama.
3. **Every finding cites a primary source**, produced by structured retrieval — a `Citation` can only be constructed from chunks retrieval actually returned. A finding with `status ≠ not_applicable` must have ≥1 citation.
4. **A failed or invalid LLM response degrades to `status: "unknown"` — never to a fabricated finding.**
5. **The report is a draft posture, not legal advice.** The disclaimer is embedded in the template and cannot be disabled.
6. **Provider-agnostic by contract test**, not by claim: every `LlmGateway` adapter passes the same contract suite.
7. **The dependency rule** (HANDOFF §7) is enforced by dependency-cruiser in CI, not by convention.
8. **CSP enforces the privacy promise**: `connect-src` limited to self + registered provider origins. The custom-URL mode is the single documented exception, behind an explicit user confirmation.
9. **Structured outputs at every LLM call site**: JSON schema declared per call, zod-validated in the adapter, invariants re-asserted in domain constructors. Unvalidated output never enters the store.
10. **No third-party scripts inside the app.** No CDN JS, no external fonts. Plausible on the landing page only. Datadog never inside the app.
11. **Dockerized from day one** (HANDOFF §10): dev, pack-build, test, and prod all run in containers; prod is a static-file Caddy container with no API surface.
12. **Deviations require a written justification** committed with the change.

## Quality gates (all must pass per feature)

`tsc --strict` · eslint · unit tests (domain truth tables, use-case fakes) · gateway contract suite · citation-resolvability CI (every pack URL live, every chunk has a ref) · dependency-cruiser · `npm run smoke` golden-report diff · Docker image builds & serves.

## Process

- spec-kit workflow: one feature per cycle in the HANDOFF §12 order; every feature/requirement names its target layer. "A requirement that can't name its layer isn't specified yet."
- License: AGPL-3.0. DCO sign-off required on all contributions.
- Explicit non-goals (do not build): accounts, hosted report storage, report emailing, payments, ISO 42001 as an assessed framework, multi-user collaboration, any proxy for LLM traffic, browser RUM.