# Security Policy

## Model

CompliancePosture is a browser-only static SPA. There is no backend, no database, and no server-side processing of assessment data. The threat model therefore centers on:

- **Key custody:** BYOK API keys live in memory by default, sessionStorage opt-in, never localStorage, never transmitted to Hannibyte. Wipe on demand.
- **Data at rest (planned, Feature 6):** optional local persistence will be AES-GCM encrypted (WebCrypto, PBKDF2 ≥ 600k iterations, SHA-256); IndexedDB will store ciphertext + salt + IV only. Today nothing is persisted except the opt-in sessionStorage key.
- **Data in transit:** assessment content flows only browser → the LLM provider the user configured. CSP `connect-src` is generated at build time from the provider registry; the custom-URL mode is the single exception, behind explicit user confirmation.
- **Supply chain:** no third-party scripts, no CDN JS, no external fonts inside the app. Digest-pinned Docker base images, SHA-pinned GitHub Actions, checksum-pinned CI tooling, exact-pinned Python deps; the published image digest is the trust artifact (D18). Knowledge-pack sources are pinned by revision + sha256 and verified on fetch; packs are sha256-verified again in the browser and fail closed.
- **Server:** the prod container serves static files via a source-built Caddy, unprivileged, with access logs disabled. It exposes no API surface. `/packs/*` is served without SPA fallback so missing files are real 404s.

## Automated scanning

Every scanner exists because of a concrete risk in this threat model — nothing is here for show (constitution §12: deviations and choices are justified in writing).

| Layer | Tool | Why it earns its place |
|---|---|---|
| SAST | CodeQL (`security-extended`, JS/TS + Actions workflows) | All application risk is client-side TypeScript that handles the user's API key; CodeQL is native, free for public repos, and feeds the Security tab via SARIF. |
| SCA | OSV-Scanner (push/PR/weekly) + Dependency Review (PRs) + Dependabot (npm, actions, docker) | The most credible attack on the "your key never leaves your browser" promise is a compromised npm dependency exfiltrating keys — supply chain is *the* primary threat here. |
| Secrets | GitHub native secret scanning + push protection (repo settings, not CI) | BYOK means the app has no secrets; the residual risk is ops tokens (Hetzner, GHCR, Datadog) landing in a commit. Native push protection blocks them before they exist in history; a CI secrets scanner on top would be redundant. |
| Container | Trivy on the built prod image (zero-tolerance: gates on ANY severity with an available fix; weekly cron) | The deployed artifact is Caddy + Alpine packages serving static files; its CVE surface changes with no code change, which is what the weekly scheduled scan catches. Caddy is compiled from source with a patched Go toolchain and lifted modules so fixes are applied the day they exist, not when upstream images rebuild. |
| DAST | OWASP ZAP baseline (passive) against the real built container | The security headers and CSP *are* the product promise; ZAP regression-gates them on every change. Accepted findings are documented in `.zap/rules.tsv`. Active scanning is deliberately excluded — there is no server-side logic to attack. |

**Deliberately not included:** Semgrep (generic rulesets duplicate CodeQL on a TS SPA — revisit if we want custom architecture rules as code), TruffleHog/Gitleaks in CI (native push protection covers the risk), active DAST/fuzzing of the server (static files only, no API surface).

## Reporting a vulnerability

Email contact@hannibyte.com. Please do not open public issues for vulnerabilities. We aim to acknowledge within 72 hours.