# CompliancePosture

Free, open-source, **browser-only** AI compliance assessment. An AI agent interviews you about your company and its AI systems, evaluates the answers against authoritative frameworks via local RAG — EU AI Act, OWASP LLM Top 10 (v1); GDPR, NIST AI RMF, OWASP Agentic Top 10 (v0.2) — and drafts a Compliance Posture Document in which every finding links to its primary source (EUR-Lex / owasp.org / nist.gov).

**Live at:** `complianceposture.hannibyte.com` *(after v0.1 ships)*

## The three promises

1. **Your data stays your own** — no backend; assessment data flows only from your browser to the LLM provider *you* configured. Verifiable via open source + DevTools + CSP.
2. **Bring your own key** — Mistral / OpenAI / Anthropic / Ollama / custom OpenAI-compatible URL. Your key never touches Hannibyte. Works fully offline with local Ollama.
3. **Free forever, honestly monetized** — the report ends with a plain link to Hannibyte's consulting. No accounts, no paid tier, no feature gates.

## Status

Pre-v0.1, under active development. Build order and full context: [`docs/HANDOFF.md`](docs/HANDOFF.md). Project constitution: [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Development

```bash
make up               # containerized dev: Vite on :5173 + local Ollama
make up-without-vite  # Ollama only; run Vite on the host: cd app && npm run dev
make check            # tsc + eslint + dependency-cruiser + tests + smoke
make prod             # production image (Caddy, static) on :8080
make down             # stop everything
```

See the `Makefile` for logs/shell/cleanup targets, or use `docker compose --profile <dev|ollama|packs|prod>` directly.

## Contributing

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md). DCO sign-off (`git commit -s`) is required on all commits.

## License

[AGPL-3.0](LICENSE). The report this tool produces is a draft posture, **not legal advice**.

---

*Built in Brussels by [Hannibyte](https://hannibyte.com). Your data stays in your browser.*