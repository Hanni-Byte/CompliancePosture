# Feature 2 — Knowledge packs: pipeline, EU AI Act + OWASP LLM Top 10, PackLoader + BM25

Build-order row (HANDOFF §12 #2). Every requirement names its layer. Decisions D21, D25 apply.

## Requirements

| # | Requirement | Layer |
|---|---|---|
| R1 | Pack schema — the **only** contract between pipeline and app: `manifest.json` (id, framework, name, version string, source URLs + pinned revisions + raw sha256, license note, chunk/topic counts, sha256 per file — **no wall-clock fields**, builds are byte-reproducible), `chunks.json` (`[{ id, ref, title, text, url }]`), `topics.json` (`[{ id, title, seedQueries, dependsOnSlots, appliesFrom }]`). No `index.bin` (D21). | contract (zod in L3 + pydantic in pipeline) |
| R2 | Python pipeline `tools/packs`: `ingest → normalize → chunk → link → emit`; pinned sources (Cellar CELEX 32024R1689 for the AI Act; OWASP GitHub markdown at a pinned commit); deterministic output (same inputs → byte-identical files); `validate` subcommand re-checks emitted packs against the pydantic schema | pipeline |
| R3 | EU AI Act pack: chunks per article, split per paragraph when an article exceeds the size budget (`ref` = `Art. 26` / `Art. 26(1)`), annexes per annex section; URLs = EUR-Lex human-facing document URL + `#art_N`/`#anx_N` anchor; topic map with `appliesFrom` dates for the phased application | pipeline + data |
| R4 | OWASP LLM Top 10 **2026** pack (OWASP GenAI Security Project, pinned release commit): one chunk per risk section, `ref` = `LLM01:2026 — Description`; URLs deep-link to the exact markdown file at the pinned commit in the OWASP-owned repo (no 2026 web pages exist yet); topic map | pipeline + data |
| R5 | Domain types for packs, chunks, topics; invariants asserted (non-empty ref/url/text, unique chunk ids) | L1 |
| R6 | `RetrievalPort`: `loadPack(id)`, `search(id, query, k)` returning ranked chunks; `PackError` union | L2 (port) |
| R7 | `PackLoader`: fetches `/packs/<id>/…` on demand, zod-validates every file, verifies sha256 against the manifest, **fails closed** on any mismatch or corruption | L3 (adapter) |
| R8 | `Bm25Retriever`: pure TS, deterministic tokenizer, index built in-browser from `chunks.json` at load (D21); ranking stable across runs | L3 (adapter) |
| R9 | "Search the law locally" demo panel: choose pack, type a query, see ranked chunks with `ref` + primary-source link — the standalone privacy proof (no LLM involved) | L3 (controller) / L4 |
| R10 | Citation-resolvability CI: every chunk has `ref` + `url`; every unique URL is verified live — EUR-Lex URLs by confirming the anchor id exists in the Cellar document (D25), others by HTTP status; pydantic and zod both validate the committed packs (cross-validation, D11) | CI |
| R11 | Live provider smoke (`LIVE_SMOKE=1`, manual): ping + one structured completion against real Ollama and, with a user-supplied key, Mistral (D22) | test |
| R12 | `packs` compose profile + `Dockerfile.packs` build the packs reproducibly; committed packs match a fresh build (checksum diff) | ops |

## Definition of done

Citation-resolvability CI green · in-browser demo "search the AI Act locally" works from the prod image · pydantic/zod cross-validation green · committed packs reproducible from the pipeline · all standing gates green.
