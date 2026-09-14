# Pack pipeline

Offline Python pipeline that builds the knowledge packs the app serves from `/packs/<id>/`:

`ingest (fetch-once cache, pinned sources) → normalize → chunk (stable ref anchors) → link (primary-source deep links) → emit (deterministic JSON + sha256)`

The pack schema (`packs/schema.py`, mirrored by `app/src/adapters/retrieval/pack-schema.ts`) is the **only** contract with the app. Neither program imports the other; CI validates the committed packs with both sides and rebuilds them to prove byte-reproducibility.

## Packs

| id | source (pinned) | citation URLs | extras |
|---|---|---|---|
| `eu_ai_act` | Publications Office Cellar, CELEX 32024R1689 (OJ L 2024/1689) | EUR-Lex HTML + `#art_N` / `#anx_N` anchors | topic map with `appliesFrom` dates |
| `owasp_llm_top10` | OWASP GenAI Security Project repo, `2026/final` at a pinned commit | exact markdown file at that commit | `crosswalk.json`: EU AI Act (resolved to `eu_ai_act` chunk ids), GPAI CoP, NIST AI RMF, ISO 42001/27001, DORA, ATLAS + documented incidents |

Sources must be openly redistributable (EUR-Lex reuse decision, OWASP CC BY-SA 4.0). Paywalled standards (ISO 42001) never become packs (D5) — they appear only as crosswalk clause titles.

## Commands

```bash
make packs                                   # containerized build → packs/ (+ index.json)
make packs-test                              # ruff + pytest in the pipeline image
cd tools/packs && python -m packs build --out ../../packs --raw raw
python -m packs validate ../../packs          # schema + checksums
python -m packs check ../../packs --raw raw   # fresh build == committed (CI gate)
```

Sources are declared as `Source(url, revision, sha256)` pins (https only); `fetch_verified` refuses bytes that do not match — from the network or from the `tools/packs/raw/` cache (gitignored). Manifests carry the pins, so any pack can be traced to exactly what was ingested. `build` also emits `packs/index.json`, the catalogue the app lists packs from; packs are built in `depends_on` order so crosswalks resolve against already-built packs. Adding a framework = a new `sources/<x>.py` + `topics/<x>.json` + a `PackDef` in `build.py`; zero app changes.
