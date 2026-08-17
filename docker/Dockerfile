# CompliancePosture app image — static site + Caddy, zero API surface.
# Digest-pinned bases (D18: reproducible trust).

FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ .
RUN npm run build

FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY packs/ /srv/packs/