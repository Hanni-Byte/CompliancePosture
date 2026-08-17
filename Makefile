VITE_CONTAINER=cp-vite
OLLAMA_CONTAINER=cp-ollama
PROD_CONTAINER=cp-prod
ALL_PROFILES=--profile dev --profile ollama --profile packs --profile prod

# ── Dev ──────────────────────────────────────────────────────────────────────

up:
	docker compose --profile dev up -d --build

# Same as `up` but does not start the Vite container. Run `npm run dev` in
# `app/` on the host instead. Avoids polling-based file watching, which is
# heavy on CPU when Vite runs in Docker. Still starts Ollama for offline dev.
up-without-vite:
	docker compose --profile ollama up -d

# Include every profile so `down` cleans up profile-gated services even when
# the stack was started with a narrower profile (otherwise Compose leaves
# them untouched and stopped containers linger).
down:
	docker compose $(ALL_PROFILES) down

restart: down up

# ── Prod image (Caddy static server on :8080) ────────────────────────────────

prod:
	docker compose --profile prod up -d --build

prod-down:
	docker compose --profile prod down

# ── E2E (Playwright vs prod image) ───────────────────────────────────────────

e2e:
	docker compose --profile e2e up --build --abort-on-container-exit --exit-code-from e2e

# ── Pack pipeline (Feature 2) ────────────────────────────────────────────────

packs:
	docker compose --profile packs up --build

# ── Logs ─────────────────────────────────────────────────────────────────────

logs:
	docker compose $(ALL_PROFILES) logs -f

logs_tail:
	docker compose $(ALL_PROFILES) logs -f --tail=100

vite_logs:
	docker logs -f $(VITE_CONTAINER)

ollama_logs:
	docker logs -f $(OLLAMA_CONTAINER)

prod_logs:
	docker logs -f $(PROD_CONTAINER)

# ── Shells ───────────────────────────────────────────────────────────────────

vite_bash:
	docker exec -it $(VITE_CONTAINER) /bin/sh

ollama_bash:
	docker exec -it $(OLLAMA_CONTAINER) /bin/sh

prod_bash:
	docker exec -it $(PROD_CONTAINER) /bin/sh

# Pull a model into the Ollama container, e.g. `make ollama-pull MODEL=llama3.2`
MODEL ?= llama3.2
ollama-pull:
	docker exec -it $(OLLAMA_CONTAINER) ollama pull $(MODEL)

# ── Quality gates (run on host; same commands CI runs) ───────────────────────

check:
	cd app && npm run check

typecheck:
	cd app && npm run typecheck

lint:
	cd app && npm run lint

depcruise:
	cd app && npm run depcruise

test:
	cd app && npm run test

smoke:
	cd app && npm run smoke

# ── Cleanup ──────────────────────────────────────────────────────────────────

# Removes containers + this project's volumes (node_modules cache, Ollama
# models will be re-downloaded). Scoped to this project — never a global prune.
clean:
	docker compose $(ALL_PROFILES) down -v

superclean: clean
	docker compose $(ALL_PROFILES) down --rmi local
	docker builder prune -f

.PHONY: up up-without-vite down restart prod prod-down packs logs logs_tail \
	vite_logs ollama_logs prod_logs vite_bash ollama_bash prod_bash \
	ollama-pull check e2e typecheck lint depcruise test smoke clean superclean