# Pack pipeline (arrives with Feature 2)

Offline Python pipeline that builds the knowledge packs served from `/packs`:

`ingest → normalize → chunk (article/section granularity, stable ref anchors) → link (EUR-Lex/OWASP/NIST deep links) → index (BM25) → emit (checksum)`

The pack schema is the **only** contract with the app — zod on the app side, a mirrored pydantic model here; CI cross-validates. Neither program imports the other.

Sources must be openly redistributable: EUR-Lex, OWASP (CC BY-SA), NIST (public). Every chunk must carry a stable `ref` (e.g. `Art. 26(1)`) and a live primary-source URL — enforced by the citation-resolvability CI gate.