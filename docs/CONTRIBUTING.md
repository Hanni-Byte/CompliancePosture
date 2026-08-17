# Contributing to CompliancePosture

Thanks for your interest. Before anything else, read `docs/HANDOFF.md` and the project constitution in `.specify/memory/constitution.md` — PRs that violate a Non-Negotiable are closed, not negotiated.

## Developer Certificate of Origin (DCO)

All commits must be signed off (`git commit -s`), certifying the [Developer Certificate of Origin 1.1](https://developercertificate.org/). PRs with unsigned commits fail CI. By signing off you certify you have the right to submit the contribution under the project license (AGPL-3.0).

## Ground rules

- One feature per PR, following the spec-kit cycle: every requirement names its target layer (L1 domain / L2 application / L3 adapters / L4 infrastructure / pack pipeline).
- All quality gates must pass: `tsc --strict`, eslint, unit tests, gateway contract suite, citation-resolvability, dependency-cruiser, smoke golden diff, Docker build.
- zod only at edges; domain stays dependency-free.
- `Result<T,E>` across boundaries; no exceptions cross layers.
- No new runtime dependency without justification in the PR description.

## Adding a knowledge pack (community frameworks)

A new framework = a new pack + topic map — zero agent-code changes. Build it with the pipeline in `tools/packs/`; the pack schema (zod in app, pydantic in pipeline) is the only contract. Pack PRs must pass citation-resolvability CI: every chunk has a stable `ref` and a live primary-source URL. Only openly redistributable sources are accepted (EUR-Lex, OWASP CC BY-SA, NIST public); paywalled standards (e.g. ISO 42001) are not.

## Development

```bash
docker compose --profile dev up     # containerized dev server
# or
cd app && npm install && npm run dev
cd app && npm run check             # local quality gate
```