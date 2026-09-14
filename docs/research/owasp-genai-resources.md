# Research notes — OWASP GenAI Security Project resources (2026-09-03)

What we verified, what we use, and what it is good for. All sources CC BY-SA 4.0 unless noted.

## 1. OWASP Top 10 for LLM Applications **2026** (v1.0, published 2026-08-04)

- **Authoritative text**: `genai-security-project/GenAI-LLM-Top10`, folder `2026/final/`, pinned at commit `9253e38a` (2026-08-26, includes the Zenodo DOI/CITATION release). The PDF (`OWASP-GenAI-LLM-Top-10-2026-v1.0.pdf`, 122 pages) is byte-identical to the genai.owasp.org download and carries the same list.
- **No per-risk pages on genai.owasp.org yet** (`/llmrisk/…` still serves 2025). Citations therefore deep-link to the exact markdown at the pinned commit; switch to web pages when OWASP publishes them.
- **Changes vs 2025** that affect our topic maps and slots: reordering by severity (Excessive Agency → LLM03, Supply Chain → LLM04, Unbounded Consumption → LLM06, Improper Output Handling → LLM10) and one new entry, **LLM08 Hidden Context Exposure** (supersedes "System Prompt Leakage": covers tool/function schemas, behavioural control logic, permissions/roles, output-format rules — not just the system prompt).
- **Appendix A — Related Framework Mappings** (OWASP-authored): LLM01–10 → Agentic Top 10 (ASI, 2026), GenAI Data Security (DSGAI v1.0, 2026-03), MITRE ATLAS v2026.06, MITRE ATT&CK v19.1, CWE 4.20, NIST AI 600-1, NIST AI RMF 1.0, CSA AICM v1.1, OWASP AIVSS v0.8. **No EU AI Act mapping** — that comes from the Crosswalk (below). Useful for v0.2 (NIST AI RMF pack) and for the Agentic pack.
- **Appendix B** (architecture & threat modeling) is an empty stub in the repo as of the pin.

## 2. OWASP GenAI Security **Crosswalk** (v4.0.0, `genai-security-project/crosswalk`, pinned `490a7e48`, 2026-08-28)

- **What it is**: 51 OWASP entries (LLM Top 10 2026, Agentic Top 10 2026 "ASI", Agentic Skills Top 10 "AST", GenAI Data Security "DSGAI" 2026) mapped to **25 frameworks** incl. **EU AI Act, EU AI Act GPAI Code of Practice, NIST AI RMF 1.0, ISO/IEC 42001:2023, ISO/IEC 27001:2022, DORA, ENISA, MITRE ATLAS, CIS v8.1, SOC 2, PCI DSS, FedRAMP**. Also an npm package (`genai-security-crosswalk`), per-framework JSON in `data/frameworks/`, tools (`compliance-report.js` → OSCAL, `incidents-report.js` → STIX), and a web app with a coverage scorer.
- **Structured data**: `data/entries/<ID>.json` → `{ id, name, source_list, version, severity, audience[], mappings[] {framework, control_id, control_name, tier (Foundational/Enhanced/…), scope, url?, notes, confidence}, tools[], incidents[] {name, year, incident_id}, crossrefs {agentic_top10, dsgai_2026} }`.
- **Quirk to remember**: for `EU AI Act` rows the fields are swapped — `control_name` holds the article (`Art. 15 — Accuracy, robustness, cybersecurity`, `Art. 55(1)(b) — Systemic risk GPAI`) and `control_id` holds the obligation sentence. Our ingester handles this and **resolves each article to our own `eu_ai_act` chunk ids at build time** (build fails if a reference cannot be resolved).
- **How we use it (Feature 2 → 4)**: `packs/owasp_llm_top10/crosswalk.json` carries, per LLM entry, the EU AI Act / CoP / NIST AI RMF / ISO 42001 / ISO 27001 / DORA / ATLAS links plus documented real-world incidents. The assessment engine can (a) attach verified AI Act citations to OWASP findings, (b) mention ISO 42001 clause titles only (D5), (c) cite incident counts in the report narrative.
- **Its EU AI Act timeline** matches ours: prohibitions 2025-02-02, GPAI 2025-08-02, high-risk obligations 2026-08-02, further sector obligations 2027-08-02.
- **v0.2 leverage**: ASI (Agentic Top 10) and DSGAI entries are already mapped to the same frameworks — the Agentic pack gets its crosswalk for free.

## 3. Agent Control Standard (ACS) — `genai-security-project/agent-control-standard` (v0.1 public preview)

- Code Apache-2.0, docs CC BY-SA 4.0. Goal: agents that are **inspectable, traceable, instrumentable** — an ACS protocol between an *Observed Agent* and a *Guardian Agent*, observability via OpenTelemetry + OCSF, and an **Agent BOM (AgBOM)** via CycloneDX/SPDX/SWID. Concepts documented: agents, capability, identity, intent, provenance, session lifecycle, skill, trust.
- **Not a pack** (it is a standard, not an assessed framework) but a strong input for the **v0.2 agentic slots** — "Do you have an inventory of tools/models/skills your agents use (AgBOM)?", "Can every action be traced to its originating task?", "Can you deny/modify an agent action centrally?" — and a natural remediation reference in findings for Excessive Agency (LLM03) and the Agentic Top 10.
- Roadmap: v1 adds instrumentation + MCP/A2A client hooks; v3 adds deny/modify on MCP/A2A. Watch for v1 before recommending it as a control in reports.

## 4. Consequences for the build order

- Feature 2 (now): OWASP pack = **2026 edition** + crosswalk sidecar. Topic map ids follow the 2026 numbering.
- Feature 3: slot registry should include agentic slots informed by ACS (tool inventory, traceability, central control) and the LLM08 hidden-context surface (tool schemas, roles).
- Feature 4: OWASP findings enriched with resolved AI Act citations from the crosswalk; ISO 42001 by clause title only.
- v0.2: Agentic Top 10 + DSGAI packs can reuse the same ingesters (same repo layout, same crosswalk entries).
