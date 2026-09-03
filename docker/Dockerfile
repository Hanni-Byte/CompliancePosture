# CompliancePosture app image — static site + Caddy, zero API surface.
# Digest-pinned bases (D18: reproducible trust).
#
# Build knobs (override with --build-arg), nothing hardcoded below:
#   CADDY_VERSION   caddy ref to build: release tag, "latest", or commit SHA
#   CADDY_DEP_BUMPS modules lifted above caddy's own go.mod pins for security
# Pinned to the master commit that adapts caddy to the patched cel-go
# v0.29.2 (GHSA-gcjh-h69q-9w9g fix, unreleased as of 2026-08-17).
# TODO: switch back to the release tag once v2.11.5+ ships.
ARG CADDY_VERSION=b2693fb63a30e6d7be0972c3645e9a2c0a500e93
ARG CADDY_DEP_BUMPS="golang.org/x/net@latest golang.org/x/text@latest golang.org/x/crypto@latest google.golang.org/grpc@latest"

FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ .
RUN npm run build

# The official caddy image ships a binary compiled with a stale Go toolchain
# and vulnerable modules (x/net, x/text, grpc) — unfixable via apk. Compile
# Caddy from source with the current patched toolchain instead.
FROM golang:alpine@sha256:4c9fe60190a2a3350ddc51de80d0224b8a6698d12bdfc999fee45ea9d6c46dbc AS caddy-build
ARG CADDY_VERSION
ARG CADDY_DEP_BUMPS
WORKDIR /build
RUN printf '%s\n' \
      'package main' \
      'import (' \
      '	caddycmd "github.com/caddyserver/caddy/v2/cmd"' \
      '	_ "github.com/caddyserver/caddy/v2/modules/standard"' \
      ')' \
      'func main() { caddycmd.Main() }' > main.go \
 && go mod init caddy-dist \
 && go get "github.com/caddyserver/caddy/v2@${CADDY_VERSION}" \
 && go get ${CADDY_DEP_BUMPS} \
 && go mod tidy \
 && CGO_ENABLED=0 go build -trimpath -o /caddy

FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648
# The pinned base lags Alpine security releases (c-ares/curl CVEs); pull the
# patched packages while keeping the base digest-pinned.
RUN apk --no-cache upgrade
COPY --from=caddy-build /caddy /usr/bin/caddy
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/csp.caddy /etc/caddy/csp.caddy
COPY --from=build /app/dist /srv
COPY packs/ /srv/packs/