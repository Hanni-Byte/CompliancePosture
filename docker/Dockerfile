# CompliancePosture app image — static site + Caddy, zero API surface.
# Digest-pinned bases (D18: reproducible trust).

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ .
RUN npm run build

FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY packs/ /srv/packs/