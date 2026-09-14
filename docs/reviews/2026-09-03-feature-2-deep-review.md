# Deep review — `feat/knowledge-packs` (Feature 2) — 2026-09-03

**Scope.** Everything on the branch (uncommitted tree vs `main`): pack pipeline (`tools/packs`), committed packs, `PackLoader`/BM25/search panel, CI gates, Docker/Caddy changes, docs.
**Method.** sweep1 (design-patterns → contract audit + migration review + security audit → pattern synthesis), sweep2 (tech-debt, style, test-health), sweep3 (performance, dependency, production-readiness), `/code-review high`, `/security-review`. Eleven independent passes, cross-referenced and de-duplicated here. Read-only; nothing was changed by the review.

**Coverage note.** The `/code-review high` run completed one of its angles (line-by-line diff scan — findings #1, #2, #8, #12 below) before the remaining seven angles were terminated by an API session limit on 2026-09-03; those angles (removed-behaviour, cross-file tracing, conventions, reuse, simplification, efficiency, altitude) were not re-run. The other ten passes completed normally, and their overlap with the missing angles is substantial (style, tech-debt and the synthesis cover reuse/simplification/conventions), so the findings list is considered complete for P0/P1 purposes; a re-run of `/code-review` is recommended after the P0 fixes land.

**Verification baseline before review:** `npm run check` green (tsc, eslint, dependency-cruiser 24 modules/0 violations, 42 tests, offline pack check, smoke) · Playwright 5/5 vs the no-cache prod image · Trivy zero-tolerance exit 0 · ZAP 65 PASS/0 WARN · pipeline `validate` + byte-identical `check` green · citation-resolvability 136/136 URLs live · live smoke vs real Ollama passed (Mistral pending key).

## 1. Verdict

**Mergeable after a short P0 pass.** No exploitable vulnerability, no layering violation, data integrity of the pack path is exemplary (fail-closed, tested). The real defects are at the edges the constitution cares most about: the loader misreports transport failures (SPA fallback), the pipeline's source-integrity chain is a fingerprint rather than a verification, the gateway has no timeouts, and the packs' CC BY-SA attribution is never shown. All are small. Structural debt is in plumbing (scripts, CI, Docker), not in the domain.

## 2. Scorecards

| Sweep | Audit | /5 | Headline |
|---|---|---|---|
| 1 | API/contracts (adapted: pack schema, LlmGateway, RetrievalPort, Result) | 4 · 3 · 3 · 4 | no `schemaVersion`; `ping` reports a model `complete` won't use; `not_found` unreachable in prod |
| 1 | Migration safety | n/a | no database, no migrations; only persisted state is one sessionStorage key |
| 1 | Security audit | 4 | raw sources hashed, never verified; Cellar over http; pack text = future prompt context (fence it in F3/F4) |
| 1 | Security review (high-precision) | — | no finding ≥ 8/10 confidence; one 7/10 corroborating the digest gap |
| 2 | Tech debt | — | 9 items; top: citation gate re-implements `PackLoader` in unlinted JS |
| 2 | Style | — | no correctness issues; pack registry triplicated; naming nits |
| 2 | Test health | 3 · 2 · 4 · 3 · 4 | pyramid · gaps · quality · flakiness · maintainability |
| 3 | Performance | — | load ≈ 35 ms desktop, search 0.2 ms, bundle 84 kB gz; fetch waterfall + `no-cache` |
| 3 | Dependencies | — | 0 npm vulns; licenses OK; **attribution not rendered**; Python unlocked; CI tools unpinned |
| 3 | Production readiness | 3 · 3 · 5 · 4 · 4 · 3 | observability · reliability · data integrity · performance · concurrency · deploy safety |

## 3. Consolidated findings

Severity reflects impact on the product promises (privacy, citation integrity, honesty of the report), not just exploitability. Each item lists every audit that raised it.

### P0 — fix on this branch before merge

| # | Finding | Where | Raised by |
|---|---|---|---|
| 1 | **SPA fallback swallows missing pack files.** `try_files … /index.html` returns 200 `text/html` for any `/packs/*` miss, so `not_found` is dead code and a deploy omission shows as *"Pack refused (integrity)"* — i.e. the UI accuses the server of tampering. | `docker/Caddyfile:30`, `pack-loader.ts:137` | contracts, prod-ready, perf, code-review |
| 2 | **`PackLoader.load` can reject instead of returning `Result`.** `arrayBuffer()` and `sha256()` awaits sit outside the try; `crypto.subtle` is undefined in insecure contexts (LAN dev). Hook has `.then` with no `.catch` → panel stuck on "Loading…" forever. Violates D20. | `pack-loader.ts:85,143`, `use-pack-search.ts:26` | contracts, prod-ready, code-review |
| 3 | **Source integrity is a fingerprint, not a verification.** `fetch_cached` hashes whatever arrives; nothing compares to an expected digest; Cellar is fetched over `http://` (pipeline **and** CI gate). MITM on a maintainer's `make packs` yields a self-certifying tampered pack; raw cache makes it sticky. Cellar serves HTTPS (verified). | `fetch.py:12-24`, `eu_ai_act.py:27`, `check-packs.mjs:75` | security audit, security review, tech-debt |
| 4 | **No request timeout; unbounded `Retry-After`; backoff ignores abort.** A half-open connection hangs `ping()` forever; a provider can park the tab for an hour; "cancel" appears to hang. `aborted` has zero test coverage. | `openai-compatible.ts:200-207`, `llm-gateway.ts:32` | prod-ready, contracts, security audit |
| 5 | **`ping` lies about the model.** Falls back to the first listed model when `spec.defaultModel` is absent, but `complete` always sends `spec.defaultModel` → "verified" then every call 404s. | `openai-compatible.ts:100-103,122` | contracts |
| 6 | **`SessionVault` can throw** (private mode, quota) → unhandled rejection, UI pinned at "verifying", button disabled forever. | `vaults.ts:31,36`, `use-provider-setup.ts:51` | prod-ready |
| 7 | **Pack attribution never rendered.** CC BY-SA 4.0 (OWASP + crosswalk) and the EU reuse notice are validated in the manifest but shown nowhere; no `NOTICE`. This is a licence obligation, not polish. | `SearchPanel.tsx`, repo root | dependency audit, synthesis |
| 8 | **Dev server serves nothing at `/packs`.** No `publicDir`/proxy, so the search panel fails in `npm run dev` / dev compose. | `app/vite.config.ts` | code-review |

### P1 — before Feature 3 (interview) and Feature 7 (deploy)

| # | Finding | Where | Raised by |
|---|---|---|---|
| 9 | Citation gate re-implements load→sha256→zod→invariants in unlinted, untyped JS; header comment stale. Should instantiate `PackLoader` with an fs `fetchFn`. | `check-packs.mjs:24-48`, `eslint.config.js:22` | tech-debt #1, style, synthesis |
| 10 | Pack registry triplicated (`PACKS`, `packIds`, `PACK_LABELS`); README's "zero app changes to add a framework" is currently false. Pipeline should emit `packs/index.json`; `RetrievalPort.listPacks()`. Needs a §8 deviation note. | `build.py:34`, `main.tsx:20`, `SearchPanel.tsx:5-8` | patterns, style, tech-debt, synthesis |
| 11 | No `schemaVersion` in the pack manifest; strict objects both sides ⇒ every additive change hard-breaks open tabs. Also pydantic `Manifest.files` values unconstrained vs zod `^[0-9a-f]{64}$`; TS invariants lack the crosswalk-listed⇔present check pydantic has. | `schema.py:75-98`, `pack-schema.ts:62`, `pack.ts:100` | contracts, style |
| 12 | Pipeline: `eu_ai_act` ingested twice, dependency undeclared; `validate_dir` `KeyError` not caught; `check()` ignores files that exist only in the committed tree (stale `crosswalk.json` passes). | `build.py:63,97,120,147` | patterns, code-review, contracts |
| 13 | Prompt-injection surface pre-loaded: chunk text and crosswalk `notes` are third-party prose destined for prompts. Not a bug today; Feature 3/4 must fence them as data and a contract test must assert it before the first prompt lands. | packs/* | security audit |
| 14 | Untested: domain invariants (constitution names "truth tables"), `generate-csp` (NN #8's mechanism), `check-packs` (NN #3's gate, never seen failing), both hooks/panels, **entire Python chunker** (only byte-equality, a change detector). Contract suite doesn't capture `sleep` args, 401-no-repair, `aborted`. | see test-health §recommendations | test-health, tech-debt #3 |
| 15 | Deploy readiness (Feature 7): no `HEALTHCHECK` (Coolify rolling deploys), root user, no `.dockerignore` (`COPY app/` overwrites `node_modules` locally), Caddyfile TLS comment contradicts D24 (TLS terminates at Coolify — Caddy must stay on `:80`), COEP `require-corp` likely defeats the no-cors CORS/network probe in prod (verify in Playwright, then drop COEP or the probe). | `docker/Dockerfile`, `docker/Caddyfile:1-2,14` | prod-ready |
| 16 | D18 "reproducible build" is false by construction (`@latest` Go bumps + `apk upgrade`); image built 4× per PR. Publish the *digest* as the trust artifact and build once, or pin module versions via a `go.mod` Dependabot can track. | `Dockerfile:11,43`, `ci.yml`, `security.yml` | security audit, tech-debt #2, prod-ready |
| 17 | Supply-chain pins: `python:3.14-slim` tag-only; pip deps floor-only, no lockfile, no `pip` Dependabot ecosystem; `osv-scanner` from `releases/latest` unverified; `zaproxy:stable`, `ollama:latest` floating; all 15 Actions tag- not SHA-pinned; Playwright image not digest-pinned. | `Dockerfile.packs:4`, `pyproject.toml`, `security.yml:52,121`, `compose.yaml` | dependency, security audit |
| 18 | CI fetches primary sources live on every PR (`.cache/raw` never restored) — upstream outage or re-render fails unrelated PRs. Cache it (`actions/cache` keyed on CELEX + pinned commits); keep the live liveness check (constitution requires it) on `main` + schedule + pack-touching PRs. | `ci.yml:62,49` | test-health, tech-debt #4 |
| 19 | Performance: files fetched sequentially (`Promise.all` saves 1–2 RTT); `cache: "no-cache"` on sha256-pinned files defeats the 300 s Caddy cache (only `manifest.json` needs it); precompress packs (`file_server precompressed`). Worker not needed yet. | `pack-loader.ts:80-88,133`, `Caddyfile:5,23` | performance |

### P2 — backlog

`retryAfterSeconds` declared, never populated · `finish_reason: "length"` ignored (truncation looks like model misbehaviour) · same 200-non-JSON failure maps to different kinds in `chat` vs `ping` · no negative cache (typing in the panel refetches a broken 475 kB pack) · wipe-during-verify TOCTOU · no `ErrorBoundary`/`onUncaughtError` · `need()` returns `Uint8Array | Err` not `Result` · `spec.id === "ollama"` branch in the generic gateway → `corsHint` on `ProviderSpec` · invisible combining-char regex `bm25.ts:20` → `̀-ͯ` · names `xw`, `s`, `latest`, single letters in `crosswalk.py` · duplicated `sha256` helpers (TS test/loader, Python fetch/emit) · `str_strip_whitespace=False` default · two `# type: ignore` masking `PackDef.framework: str` · e2e defined twice (compose vs ci.yml, already diverged) · `sleep 2` vs poll loop in CI · e2e selectors bound to UI copy · sessionStorage "never written to disk" wording · SECURITY.md describes the unbuilt IndexedDB vault (mark planned) · HANDOFF §7 names (`OpenAiCompatibleBase`, `Bm25Retriever`) vs code (`Gateway`, `Index`) — code is right, update the doc · HANDOFF §10 still describes SSH deploy superseded by D24 · smoke gate permanently green until Feature 5 (documented) · vitest 5 available (major).

## 4. Pattern-based remediation (from the synthesis)

Ranked by findings fixed per unit of effort. Everything here keeps the pack schema as the only pipeline↔app contract and packs unbundled.

- **A. Complete the `PackLoader` edge (S; fixes #1, #2, #19, part of #9).** One try/catch envelope around `load()`; treat non-JSON content-type as `not_found`; `Promise.all` over manifest files; `no-cache` only for `manifest.json`. Then `check-packs` becomes `new PackLoader({ fetchFn: fsFetch, sha256: nodeSha })` plus the URL/crosswalk checks.
- **B. Pipeline-emitted catalogue (M; fixes #10, #7, README claim).** `build()` writes `packs/index.json` `{id, framework, name, version, license}`; `RetrievalPort.listPacks()`; panel renders name + licence line; report presenter renders attribution. Add a §8 deviation note.
- **C. Pinned `Source` descriptor + `depends_on` in `PackDef` (S; fixes #3, #12).** `Source(url, revision, sha256)` with `https://` only; `fetch_cached` raises on mismatch (covers raw-cache poisoning); topological build with `built: dict[str, list[Chunk]]`; `check()` compares full file sets both ways.
- **D. `RetryPolicy` + abort-aware `sleep` in the transport (S; fixes #4, #5-adjacent, P2 retry/finish items).** `AbortSignal.any([signal, AbortSignal.timeout(ms)])`, cap Retry-After, populate `retryAfterSeconds`, `sleep(ms, signal)`; contract suite gains sleep-arg capture, abort-during-backoff, 401-no-repair.
- **E. `schemaVersion: 1` in both mirrors (S; fixes #11).** TS emits `{ kind: "unsupported_version" }` instead of `invalid` for newer packs.

**Explicitly not pattern problems** (fix as plain bugs/config, do not abstract): Cellar http→https; every pin in #16–#17; `HEALTHCHECK`/non-root/`.dockerignore`/HSTS; `SessionVault` try/catch; `ErrorBoundary`; COEP decision; TOCTOU re-check; dev `/packs` serving; `KeyError` in except tuple; naming and regex nits; doc wording.

## 5. Constitution and documentation cross-checks

- Test-health's "make citation checks offline on PRs" conflicts with the constitution's gate *"every pack URL live"* and D25 — keep liveness, cache the raw sources, run live on `main`/schedule/pack PRs.
- Performance's "content-addressed pack paths" would change the §8 layout — only the `cache:` change is deviation-free.
- Style's "collapse three load implementations" must stop at the TS pair; merging `build.py` breaches §8 "neither program imports the other".
- One contract-audit claim was wrong and is corrected here: the live smoke *does* exist (`app/scripts/live-smoke.mjs`, D22) and passed against real Ollama on 2026-09-03; only the Mistral leg is pending a key.
- Docs to update in the same PR: §7 names, §8 (`index.json` if B is adopted), §10 (superseded by D24), SECURITY.md vault wording, Caddyfile TLS comment.

## 6. Recommended split

- **This branch (P0, ~half a day):** #1–#8 plus remediation A, C (digest pins + https), D (timeouts/cap/abort), and `packs/NOTICE` + a licence line in the panel. Re-run the full gate set and the Playwright suite (add: 404 → `not_found`; timeout → `network`; tampered raw source → pipeline refuses).
- **Follow-up PRs before Feature 3:** #9–#14 (B catalogue, E schemaVersion, pipeline tests, chunker pytest, prompt-fence contract test).
- **Feature 7 branch:** #15–#17 (Coolify readiness, pins, D18 wording), #18 (CI caching), remaining P2.

## 7. Fixes applied — 2026-09-14

All P0, P1 and the actionable P2 / Feature-7 items were fixed on this branch and re-verified. Not done, by design: the prompt-fence contract test (#13) needs the prompt registry that arrives with Feature 3; a `/code-review` re-run is still recommended after merge.

| # | Fix | Where |
|---|---|---|
| 1 | `/packs/*` served by its own `handle` block (real 404s, no SPA fallback, precompressed zstd/gzip: 474 KB → 68 KB); loader treats non-JSON responses as `not_found` | `docker/Caddyfile`, `docker/Dockerfile`, `pack-loader.ts` |
| 2 | `PackLoader.load` is one `Result` envelope (never rejects); files fetched in parallel; `no-cache` only on the manifest, sha256-pinned siblings cached with one `reload` retry; 30 s failure memo; `listPacks()` | `pack-loader.ts`, `retrieval.ts` |
| 3 | Pinned `Source(url, revision, sha256)` descriptors, https-only, verified on fetch and on cache read; AI Act pinned to the resolved Cellar document (the CELEX alias 303s to plain http) | `tools/packs/packs/fetch.py`, `sources/*.py`, `check-packs.ts` |
| 4 | `RetryPolicy` (30 s deadline via `AbortSignal.any` + `timeout`, `Retry-After` capped at 10 s, abort-aware sleep, `retryAfterSeconds` populated, `finish_reason: length` explained, malformed envelope → `provider_error` without a repair round-trip) | `openai-compatible.ts` |
| 5 | `ping` fails honestly when the configured model is absent (with `ollama pull` hint) instead of reporting a model `complete` would not use | `openai-compatible.ts` |
| 6 | `VaultPort.store` returns `Result`; `SessionVault` guards every storage access; new `storage` error kind surfaces in the UI; verify hook guards against wipe-during-verify | `vault.ts`, `vaults.ts`, `verify-provider-key.ts`, `use-provider-setup.ts` |
| 7 | Attribution rendered under every pack (manifest `license`); repo `NOTICE` | `SearchPanel.tsx`, `NOTICE` |
| 8 | Vite dev/preview serve `/packs` like prod (JSON, real 404s) | `app/vite.config.ts` |
| 9 | Citation gate is TypeScript, instantiates `PackLoader` with an fs `fetchFn`; `scripts/` and `e2e/` are type-checked and linted | `scripts/check-packs.ts`, `tsconfig.json`, `eslint.config.js` |
| 10 | Pipeline emits `packs/index.json`; `RetrievalPort.listPacks()`; no pack ids in app code (D26) | `build.py`, `pack-loader.ts`, `use-pack-search.ts` |
| 11 | `schemaVersion` in manifest + index (both mirrors); `unsupported_version` error kind; pydantic `files` digests constrained; TS invariants mirror the crosswalk-presence check; compile-time zod↔domain parity assertions | `schema.py`, `pack-schema.ts`, `pack.ts` |
| 12 | `PackDef.depends_on` + topological build (no double parse); `check()` diffs both directions incl. `index.json`; `validate` catches `KeyError`, stray files, id≠dir | `build.py` |
| 14 | Tests: domain truth table (13 cases), `buildCsp`, loader edge cases, contract suite (sleep args, 401-no-repair, abort, timeout, cap, model absent, truncation), hooks + panels under jsdom, 18 pytest cases for the chunker/parsers/schema/fetch — 99 vitest + 18 pytest | `*.test.ts(x)`, `tools/packs/tests/` |
| 15 | `HEALTHCHECK`, unprivileged `caddy` user (`cap_net_bind_service`), `.dockerignore`, HSTS, COEP `credentialless` (probe verified in Playwright), Caddyfile documents TLS at Coolify | `docker/Dockerfile`, `docker/Caddyfile` |
| 16 | D18 reworded: image digest is the trust artifact, not reproducibility; image built once per CI run and shared as an artifact; Trivy + ZAP share one build | `docs/HANDOFF.md`, `.github/workflows/*` |
| 17 | Pins: all Actions SHA-pinned, `osv-scanner` release + sha256, ZAP/Playwright/Ollama/python digests, exact Python `requirements.txt` + Dependabot `pip` ecosystem | `.github/*`, `docker/*`, `tools/packs/requirements.txt` |
| 18 | `.cache/raw` cached in CI keyed on the source pins; liveness check kept (constitution) with one retry | `.github/workflows/ci.yml` |
| 19 | Parallel fetch, cache policy, precompression (see #1, #2) | — |
| P2 | `corsHint` on `ProviderSpec`; `ErrorBoundary` + `onUncaughtError`; explicit `̀-ͯ` regex; names (`xw`→`crosswalk`, `s`→`panel`, `latest`→`latestLoadTicket`, single letters); shared sha256 helpers; `# type: ignore`s removed; e2e defined once (compose) and reused by CI; poll loops; sessionStorage wording; SECURITY.md vault marked planned; HANDOFF §7/§8/§10 updated | various |

**Re-verification (2026-09-14):** `npm run check` green (tsc, eslint incl. scripts/e2e, dependency-cruiser 26 modules/0 violations, 99 tests, offline pack check, smoke) · online citation check 136/136 · pytest 18/18 + ruff clean, in the pipeline image too · fresh-fetch reproducibility byte-identical · prod image: healthy, uid 100, real 404s, zstd packs · Playwright 8/8 (incl. catalogue, 404, COEP probe) · Trivy zero-tolerance exit 0 · ZAP 65 PASS / 0 WARN · live smoke vs real Ollama passed with the new transport (ping + structured completion, 5.6 s).
