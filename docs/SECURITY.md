# Security Policy

## Model

CompliancePosture is a browser-only static SPA. There is no backend, no database, and no server-side processing of assessment data. The threat model therefore centers on:

- **Key custody:** BYOK API keys live in memory by default, sessionStorage opt-in, never localStorage, never transmitted to Hannibyte. Wipe on demand.
- **Data at rest:** optional local persistence is AES-GCM encrypted (WebCrypto, PBKDF2 ≥ 600k iterations, SHA-256); IndexedDB stores ciphertext + salt + IV only.
- **Data in transit:** assessment content flows only browser → the LLM provider the user configured. CSP `connect-src` is generated at build time from the provider registry; the custom-URL mode is the single exception, behind explicit user confirmation.
- **Supply chain:** no third-party scripts, no CDN JS, no external fonts inside the app. Digest-pinned Docker base images; published build hashes (reproducible-build trust artifact).
- **Server:** the prod container serves static files via Caddy with access logs disabled/anonymized. It exposes no API surface.

## Automated scanning

Every scanner exists because of a concrete risk in this threat model — nothing is here for show (constitution §12: deviations and choices are justified in writing).

| Layer | Tool | Why it earns its place |
|---|---|---|
| SAST | CodeQL (`security-extended`, JS/TS + Actions workflows) | All application risk is client-side TypeScript that handles the user's API key; CodeQL is native, free for public repos, and feeds the Security tab via SARIF. |
| SCA | OSV-Scanner (push/PR/weekly) + Dependency Review (PRs) + Dependabot (npm, actions, docker) | The most credible attack on the "your key never leaves your browser" promise is a compromised npm dependency exfiltrating keys — supply chain is *the* primary threat here. |
| Secrets | GitHub native secret scanning + push protection (repo settings, not CI) | BYOK means the app has no secrets; the residual risk is ops tokens (Hetzner, GHCR, Datadog) landing in a commit. Native push protection blocks them before they exist in history; a CI secrets scanner on top would be redundant. |
| Container | Trivy on the built prod image (gates fixable HIGH/CRITICAL; weekly cron) | The deployed artifact is Caddy + Alpine packages serving static files; its CVE surface changes with no code change, which is what the weekly scheduled scan catches. |
| DAST | OWASP ZAP baseline (passive) against the real built container | The security headers and CSP *are* the product promise; ZAP regression-gates them on every change. Accepted findings are documented in `.zap/rules.tsv`. Active scanning is deliberately excluded — there is no server-side logic to attack. |

**Deliberately not included:** Semgrep (generic rulesets duplicate CodeQL on a TS SPA — revisit if we want custom architecture rules as code), TruffleHog/Gitleaks in CI (native push protection covers the risk), active DAST/fuzzing of the server (static files only, no API surface).

## Reporting a vulnerability

Email contact@hannibyte.com. Please do not open public issues for vulnerabilities. We aim to acknowledge within 72 hours.