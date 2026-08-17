# CompliancePosture — Claude Code Handoff Document

**Purpose of this file:** complete, self-contained context for building CompliancePosture from scratch. It consolidates the product spec, technical architecture, verified decision log, Docker strategy, and build order. Treat it as the source of truth; when in doubt, the Non-Negotiables (§2) win over everything else.

**Suggested use:** place this at the repo root. Extract §2 into `CLAUDE.md` + spec-kit's `constitution.md`, and keep the rest as `docs/HANDOFF.md`. Develop with spec-kit (`/speckit.specify` per feature, in the §12 order).

---

## 1. What we are building

**CompliancePosture** — a free, open-source, **browser-only** AI compliance assessment tool at `complianceposture.hannibyte.com`, linked from hannibyte.com.

An AI agent interviews the user (persona-aware: CEO / CTO / DPO / DEV / Other), fills a structured `AssessmentContext` about their company and its AI systems, evaluates it against authoritative frameworks via **local RAG** (GDPR, EU AI Act, OWASP LLM Top 10, OWASP Agentic Top 10, NIST AI RMF), and drafts a **Compliance Posture Document** in which **every finding links to its primary source** (EUR-Lex / owasp.org / nist.gov).

**Timing:** the EU AI Act (Reg. (EU) 2024/1689) reached full applicability on **August 2, 2026** — two weeks ago. SMBs need exactly this, now.

**Business model:** the tool is free and complete. The report's final section offers Hannibyte's AI & Security consulting for remediation (plain link, `?ref=cp`). The tool is top-of-funnel for consulting; there is no paid tier, no accounts, no feature gates.

**The three product promises:**
1. **Your data stays your own** — no backend; assessment data flows only browser → the LLM provider the user configured. Verifiable via open source + DevTools + CSP.
2. **Bring your own key (BYOK)** — Mistral / OpenAI / Anthropic / Ollama / custom OpenAI-compatible URL. Key never touches Hannibyte.
3. **Free forever, honestly monetized** — consulting CTA only.

---

## 2. Non-Negotiables (project constitution — copy into constitution.md)

1. **No backend for assessment data. Ever.** Static hosting only. Any feature requiring assessment content on a Hannibyte-controlled server is rejected or redesigned.
2. **BYOK is absolute.** No shared key, no proxy, no credit pool. The app must also run fully offline against local Ollama.
3. **Every finding cites a primary source**, produced by structured retrieval — a `Citation` can only be constructed from chunks retrieval actually returned. A finding with `status ≠ not_applicable` must have ≥1 citation.
4. **A failed or invalid LLM response degrades to `status: "unknown"` — never to a fabricated finding.**
5. **The report is a draft posture, not legal advice.** The disclaimer is embedded in the template and cannot be disabled.
6. **Provider-agnostic by contract test**, not by claim: every `LlmGateway` adapter passes the same contract suite.
7. **The dependency rule** (§7) is enforced by dependency-cruiser in CI, not by convention.
8. **CSP enforces the privacy promise**: `connect-src` limited to self + registered provider origins. The custom-URL mode is the single documented exception, behind an explicit user confirmation.
9. **Structured outputs at every LLM call site**: JSON schema declared per call, zod-validated in the adapter, invariants re-asserted in domain constructors. Unvalidated output never enters the store.
10. **No third-party scripts inside the app.** No CDN JS, no external fonts. Plausible on the landing page only. Datadog never inside the app.
11. **Dockerized from day one** (§10): dev, pack-build, test, and prod all run in containers; prod is a static-file Caddy container with no API surface.
12. **Deviations require a written justification** committed with the change.

### Quality gates (all must pass per feature)
`tsc --strict` · eslint · unit tests (domain truth tables, use-case fakes) · gateway contract suite · citation-resolvability CI (every pack URL live, every chunk has a ref) · dependency-cruiser · `npm run smoke` golden-report diff · Docker image builds & serves.

---

## 3. Decision log — checked and double-checked

Every decision from our design sessions, re-verified. ✅ = confirmed as-is. 🔧 = confirmed with a correction/addition discovered during the check. ⛔ = superseded.

| # | Decision | Status | Notes from re-check |
|---|---|---|---|
| D1 | Browser-only SPA, no backend | ✅ | Strictly stronger than AIPosture's "zero retention": zero *transmission*. |
| D2 | BYOK multi-provider (Mistral default, OpenAI, Anthropic, Ollama, custom URL) | 🔧 | Anthropic requires the `anthropic-dangerous-direct-browser-access: true` header — show a UI note. **Ollama correction:** by default Ollama only accepts requests from localhost origins; when the app is served from `https://complianceposture.hannibyte.com`, the user must run Ollama with `OLLAMA_ORIGINS=https://complianceposture.hannibyte.com` (document this in the UI with a copy-paste command). The HTTPS-page→`http://localhost:11434` call is allowed by modern Chrome/Firefox (localhost is exempt from mixed-content blocking), but document that Safari may block it — custom-URL over HTTPS is the fallback. |
| D3 | Local BM25 retrieval over prebuilt static packs; embedding rerank optional & off by default | ✅ | Deterministic, key-free, keeps "searching the law" fully local. |
| D4 | Frameworks v1: EU AI Act + OWASP LLM Top 10; v0.2 adds GDPR, NIST AI RMF, OWASP Agentic | ✅ | AI Act = the moat; OWASP = the security credential. |
| D5 | ISO 42001 excluded as an assessed framework | ✅ | Text is paywalled → cannot ship as an open-source pack. Clause-title mentions only; keep as consulting deliverable. |
| D6 | Web search agent tool deferred to v0.3 | ✅ | Second BYOK + second data path for marginal value vs curated packs. |
| D7 | Personas v1: CTO + CEO; v0.2 adds DPO + DEV | ✅ | Persona changes question priority/voice, not the slot schema. |
| D8 | Agent = deterministic state machine with LLM-filled typed steps (ask/extract/evaluate/narrate) | ✅ | Control flow is code; XState optional, plain discriminated unions fine. |
| D9 | Clean architecture, 4 layers, dependency rule CI-enforced | ✅ | We could **not** verify the farm-watch-commander repo (GitLab renders client-side; no fetchable content) — architecture is built on the canonical dependency rule instead, with 3 documented deviations (§7). |
| D10 | TS strict + React + Vite + zod + Tailwind; WebCrypto AES-GCM/PBKDF2; IndexedDB opt-in persistence | 🔧 | PBKDF2 ≥ 600k iterations (current OWASP guidance for SHA-256). Key custody: memory default, sessionStorage opt-in, never localStorage. |
| D11 | Pack pipeline in Python, offline, contract = pack schema only | ✅ | Mirrored schema: zod (app) + pydantic (pipeline); CI cross-validates. |
| D12 | Hosting: ~~GitHub Pages or Scalingo~~ → **Hetzner + Caddy + Docker** | ⛔→✅ | Superseded by your Hetzner account. Strengthens EU-infrastructure narrative. Caddy: auto-TLS, anonymized/disabled access logs ("we don't even log your IP"). |
| D13 | Datadog = infrastructure only (host metrics, uptime synthetics, deploy events). **Never** browser RUM | ✅ | RUM would inject a third-party script and violate D1/§2.10; CSP would block it anyway. Framing: "Datadog watches our server, never our users." |
| D14 | Plausible on landing page only | ✅ | Cookieless, EU. Success metric: landing→app conversion + optional anonymous "finished" ping (opt-in, no assessment data). |
| D15 | spec-kit workflow; features must name their target layer | ✅ | "A requirement that can't name its layer isn't specified yet." |
| D16 | License: AGPL-3.0 | 🔧 | Protects the consulting funnel from closed hosted forks. **Addition:** require DCO sign-off on contributions from day one (and consider a light CLA) — sole-holder relicensing flexibility (AGPL→Apache is possible, reverse isn't) only survives if external contributions don't fragment copyright. |
| D17 | Docker from the beginning | ✅ NEW | Full strategy in §10. Prod container = static files + Caddy, zero API surface — Docker does not create a "backend" and does not weaken D1. |
| D18 | Reproducible trust: SRI, published build hashes, reproducible builds, dogfooded report in repo | ✅ | Docker pins (digest-pinned base images) make reproducibility easier. |
| D19 | Report exports: .md (source of truth) → HTML → PDF via print stylesheet; raw .json | ✅ | Deterministic: same data → byte-identical markdown (golden-tested). |
| D20 | Errors: `Result<T,E>` unions across all boundaries; no exceptions cross layers | ✅ | One retry with repair prompt on invalid LLM output, then degrade per §2.4. |

---

## 4. User journey

```
Landing → Setup (provider + key ping-validated + frameworks)
        → Persona → Agentic interview (slot filling, skippable, "I don't know" is first-class)
        → Assessment (per framework × topic, visible progress, resumable)
        → Report (in-browser; export .md/.pdf/.json; optional encrypted save)
        → Remediation CTA → hannibyte.com?ref=cp
```

Interview is bounded (~15–25 turns); a running token/cost estimate is always visible; "generate my report now" early-exits with `report.partial = true`.

---

## 5. Domain model (L1 — TypeScript, mirrors the AIPosture Pydantic spine)

```ts
type Persona   = "CEO" | "CTO" | "DPO" | "DEV" | "OTHER";
type Framework = "EU_AI_ACT" | "GDPR" | "OWASP_LLM_TOP_10"
               | "OWASP_AGENTIC_TOP_10" | "NIST_AI_RMF";
type Severity  = "critical" | "high" | "medium" | "low" | "info";

interface SlotValue {
  value: unknown;                       // typed per slot registry entry
  confidence: "high" | "low";
  sourceQuote?: string;                 // user's verbatim words
  status: "filled" | "skipped" | "unknown";
}

interface AssessmentContext {
  id: string; createdAt: string;
  persona: Persona; frameworks: Framework[];
  slots: Record<SlotId, SlotValue>;
  machineState: SerializedPhase;        // enables save/resume + crash recovery
  partial: boolean;
}

interface Citation { packId: string; chunkId: string; ref: string; url: string; }
// INVARIANT: constructible only from the retrieved chunk set (anti-hallucination gate)

interface Finding {
  id: string; framework: Framework; topicId: string;
  title: string; severity: Severity;
  status: "gap" | "partial" | "ok" | "not_applicable" | "unknown";
  rationale: string; obligation: string; recommendation: string;
  citations: Citation[];                // ≥1 unless not_applicable
  basedOnSlots: SlotId[];               // traceability
}

interface Report {
  context: AssessmentContext; findings: Finding[];
  generatedAt: string; appVersion: string;
  packVersions: Record<string, string>; // reproducibility
}
```

**Slot groups:** Company (sector, size, EU establishment/targeting, respondent role) · AI inventory (per system: purpose, build-vs-buy, provider/model, AI-Act provider-vs-deployer role, user-facing?, agentic capabilities, interacts with natural persons?) · Data (personal-data categories, special categories, subjects incl. minors, training on user data, retention, non-EU transfers) · Risk surface (untrusted-input exposure, output reaching code/DB/email, human oversight, logging, access control, vendor DPAs) · Governance (DPO, DPIA, AI policy, incident response, training).

**Domain services (pure):** `applicability(topic, slots)` (deterministic guard — law-shaped logic never lives in a prompt) · `resolveCitations(rawRefs, retrievedChunks)` · `mergeFindings` · `assembleReport` (byte-deterministic, golden-tested) · `completeness(context)`.

---

## 6. Application layer (L2)

**Ports:** `LlmGateway` (structured-only `complete<T>` with purpose ∈ ask|extract|evaluate|narrate, `PromptRef`, `SchemaRef<T>`; plus `estimateCostSoFar()`) · `RetrievalPort` · `AssessmentRepository` · `VaultPort` (key custody: memory|session, `wipe()`) · `Clock` · `IdGen` · `ReportPresenter`.

**Use cases:** `VerifyProviderKey` (1-token ping; classifies auth/CORS/network failures) · `ConductInterview` (ask→answer→extract loop; low-confidence extraction triggers a confirmation question) · `EvaluateTopics` (per framework×topic: applicability guard → retrieve top-k → evaluate → resolveCitations → store; concurrency cap 2; independently resumable per topic) · `DraftReport` (pure assembly + `narrate` calls for display-only narrative that can never alter findings/severity/citations) · `PersistAssessment` / `ResumeAssessment` · `ExportAssessment`.

**AssessmentMachine:** `setup → persona → interview → assess(framework, topicIdx) → draft → done`, with `earlyExit` from interview. Serializable; state stored in `AssessmentContext`.

**Prompt registry:** versioned TS assets in `application/prompts/` — `{ id, version, template, schema }`. Content is L2; provider formatting (roles, json_schema vs tool-choice, Anthropic header) is L3.

**Topic maps** ship with packs as data: each topic declares dependent slots + seed retrieval queries. Example (EU AI Act): prohibited-practices screening · risk classification · deployer obligations (Art. 26) · transparency (Art. 50) · GPAI duties · AI literacy (Art. 4).

---

## 7. Architecture rules (L3/L4 + enforcement)

- **L3 driven adapters:** provider adapters (shared `OpenAiCompatibleBase` covers Mistral/OpenAI/Ollama/custom; Anthropic separate) each owning endpoint, structured-output mechanism, retries/backoff, token accounting, error mapping — all passing one contract suite. `PackLoader` (zod-validates manifest/chunks; fail-closed on corruption) + `Bm25Retriever` (pure TS; Web-Worker-movable behind the port). `IndexedDbAssessmentRepo` (ciphertext+salt+iv only). `InMemoryVault` / `SessionVault`.
- **L3 driving adapters:** React hooks (`useInterview`, `useAssessment`, `useReport`) — zero business branching. Presenters: markdown / pdf(print) / json.
- **L4:** `main.tsx` is the only file that knows concrete classes (manual DI; no container). Packs are **not bundled** — fetched on demand per selected framework. CSP generated at build time from the provider registry.
- **zod lives only at edges:** LLM responses, pack files, imported assessments. Domain stays dependency-free (plain `asserts` invariants).
- **Documented deviations (deliberate):** (1) no ViewModel indirection for chat turns — hooks consume use-case events directly; revisit if a second delivery mechanism ships. (2) prompts in L2 not L3 — split is content vs formatting. (3) topic maps/slot registry as pack data — domain owns their types + interpreters.

---

## 8. Knowledge packs & pipeline

```
packs/<framework>/manifest.json   # name, consolidated-version string, source URLs,
                                  # license note, chunking config, checksum
                    chunks.json   # [{ id, ref: "Art. 26(1)", title, text, url }]
                    index.bin     # prebuilt BM25 index
                    topics.json   # topic map (slots deps + seed queries)
```

Pipeline (`tools/packs/`, Python, containerized): `ingest → normalize → chunk (article/section granularity, stable ref anchors) → link (EUR-Lex/OWASP/NIST deep links) → index → emit(checksum)`. Sources: EUR-Lex (redistributable), OWASP (CC BY-SA), NIST (public). CI job builds packs and runs the app's pack-validation against them; **neither program imports the other** — the pack schema is the only contract (zod + mirrored pydantic).

Community extensibility: new framework = new pack + topic map, zero agent-code changes. Pack PRs must pass citation-resolvability CI.

---

## 9. Testing strategy

| Layer | Type | Highlights |
|---|---|---|
| L1 | pure unit | applicability truth tables per topic; citation resolution rejects unknown chunk ids; `assembleReport` golden determinism |
| L2 | unit + fakes | scripted `FakeLlmGateway` drives full interview; `EvaluateTopics` mid-framework resumability; degrade-to-unknown path |
| L3 | contract + integration | one gateway suite × N adapters (recorded fixtures; live smoke behind env flag); corrupted-pack fail-closed |
| L4 | e2e (Playwright, containerized) | setup→report vs mock provider; **CSP violation test: app must fail to reach a non-allowlisted origin** |
| cross | CLI smoke runner | `npm run smoke`: headless full assessment, fixtures in → report out → golden diff. Proves React-independence; CI regression gate for prompts & packs |

---

## 10. Docker strategy (day one)

**Principle:** Docker packages a *static site + web server*. The prod container exposes no API and stores nothing — it cannot weaken Non-Negotiable #1.

```
docker/
  Dockerfile            # multi-stage app image
  Dockerfile.packs      # pack pipeline image
  Caddyfile             # TLS, CSP headers, anonymized logs, SPA fallback
  compose.yaml          # profiles: dev · packs · e2e · prod
```

**App image (multi-stage, digest-pinned bases):**
```dockerfile
# build
FROM node:22-alpine@sha256:<digest> AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # emits dist/ incl. SRI hashes; runs gates in CI stage

# serve
FROM caddy:2-alpine@sha256:<digest>
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY packs/ /srv/packs/
```

**Caddyfile responsibilities:** auto-TLS for `complianceposture.hannibyte.com`; sets the build-generated CSP + security headers (`X-Content-Type-Options`, `Referrer-Policy: no-referrer`, COOP); access logs **disabled** (or IP-anonymized) — this is a marketing line, keep it true; SPA fallback to `index.html`; long-cache immutable assets, short-cache pack manifests.

**Compose profiles:**
- `dev`: Vite dev server container (hot reload, bind mount) + optional `ollama` service (with `OLLAMA_ORIGINS` preset) so contributors develop fully offline with zero API cost.
- `packs`: Python pipeline container; output bind-mounted to `packs/`.
- `e2e`: app image + mock-provider container + Playwright container.
- `prod`: the app image alone.

**CI/CD (GitHub Actions):** gates → build image → **publish image digest + build hash** (trust artifact, D18) → push to GHCR → deploy job SSHes to Hetzner, `docker compose pull && up -d`. Rollback = redeploy previous digest.

**Hetzner box:** small CX instance; Docker + compose; Datadog agent on the **host** (containers/CPU/disk + synthetics against the landing page from EU locations + deploy events from CI). Nothing of Datadog in any served byte.

---

## 11. Repository structure

```
complianceposture/
  CLAUDE.md                    # distilled §2 + pointers
  app/
    src/
      domain/{entities,services,data}/
      application/{ports,usecases,machine,prompts,result.ts}
      adapters/{llm,retrieval,persistence,presenters,controllers}/
      infrastructure/{ui,main.tsx}
      test/{fakes,contract,fixtures}/
  packs/                       # built packs (committed artifacts)
  tools/packs/                 # Python pipeline (pydantic-mirrored schema)
  docker/                      # Dockerfile, Dockerfile.packs, Caddyfile, compose.yaml
  docs/{SPEC.md,TECHNICAL-ARCHITECTURE.md,HANDOFF.md,SECURITY.md,CONTRIBUTING.md}
  .specify/                    # spec-kit (constitution = §2)
  .github/workflows/
  LICENSE                      # AGPL-3.0  ·  DCO required on all PRs
```

---

## 12. Build order (spec-kit feature cycles, each names its layers)

| # | Feature | Layers | Definition of done |
|---|---|---|---|
| 0 | Repo bootstrap: scaffolding, docker compose `dev`, CI skeleton with all gates wired (failing allowed only where the code doesn't exist yet), constitution committed | L4 | `docker compose --profile dev up` serves hello-world through Caddy locally; dependency-cruiser + tsc + eslint green |
| 1 | Provider adapter + key custody + `VerifyProviderKey` + CSP generation | L2/L3/L4 | contract suite passes for Mistral + Ollama; CSP blocks a canary origin in Playwright; key wipe verified |
| 2 | Pack pipeline + EU AI Act & OWASP LLM packs + `PackLoader`/`Bm25Retriever` | pipeline/L2/L3 | citation-resolvability CI green; in-browser demo: "search the AI Act locally" (standalone privacy proof) |
| 3 | Interview engine: slot registry, `ConductInterview`, prompt registry, chat UI | L1/L2/L3 | scripted-fake full interview test green; CTO + CEO personas; cost estimate visible |
| 4 | Assessment engine: topic maps, `EvaluateTopics`, citation resolution | L1/L2 | golden findings for fixture assessments; degrade-to-unknown tested; resumability tested |
| 5 | Report engine: `assembleReport`, `DraftReport`, presenters, exports, CTA | L1/L2/L3 | byte-deterministic golden report; .md/.pdf/.json exports; disclaimer + Hannibyte block present |
| 6 | Persistence & resume (WebCrypto vault, IndexedDB) | L2/L3 | encrypted-at-rest verified; resume mid-assess phase works |
| 7 | Deploy: prod image, Hetzner, Datadog host agent, landing page + Plausible | L4/ops | live at complianceposture.hannibyte.com; build hash published; synthetics green; dogfooded report committed to repo |

v0.1 ships after #7. v0.2: GDPR + NIST + Agentic packs, DPO/DEV personas, OpenAI/Anthropic/custom adapters, FR/NL. v0.3: embedding rerank, optional BYOK web search, community packs (NIS2/DORA), assessment diff view.

**Explicit non-goals (do not build):** accounts, hosted report storage, report emailing, payments, ISO 42001 as an assessed framework, multi-user collaboration, any proxy for LLM traffic, browser RUM.

---

## 13. Success criteria (6 months)

≥200 completed assessments (Plausible conversion + opt-in anonymous "finished" ping) · ≥3 qualified consulting conversations via `?ref=cp` · ≥2 external contributors · 0 privacy incidents **by construction**.

---

*CompliancePosture — built in Brussels by Hannibyte. Your data stays in your browser.*