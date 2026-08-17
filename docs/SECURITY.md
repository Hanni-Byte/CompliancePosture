# Security Policy

## Model

CompliancePosture is a browser-only static SPA. There is no backend, no database, and no server-side processing of assessment data. The threat model therefore centers on:

- **Key custody:** BYOK API keys live in memory by default, sessionStorage opt-in, never localStorage, never transmitted to Hannibyte. Wipe on demand.
- **Data at rest:** optional local persistence is AES-GCM encrypted (WebCrypto, PBKDF2 ≥ 600k iterations, SHA-256); IndexedDB stores ciphertext + salt + IV only.
- **Data in transit:** assessment content flows only browser → the LLM provider the user configured. CSP `connect-src` is generated at build time from the provider registry; the custom-URL mode is the single exception, behind explicit user confirmation.
- **Supply chain:** no third-party scripts, no CDN JS, no external fonts inside the app. Digest-pinned Docker base images; published build hashes (reproducible-build trust artifact).
- **Server:** the prod container serves static files via Caddy with access logs disabled/anonymized. It exposes no API surface.

## Reporting a vulnerability

Email contact@hannibyte.com. Please do not open public issues for vulnerabilities. We aim to acknowledge within 72 hours.