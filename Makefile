ifneq (,$(wildcard .env.production))
include .env.production
export
endif

COMPOSE_PROD := docker compose --env-file .env.production -f deploy/docker-compose.production.yml

.PHONY: help dev-up dev-down dev-backend dev-desktop lint test prod-up prod-down prod-logs prod-ps prod-config health

help:
	@echo "──── Development ────"
	@echo "  make dev-up         Start dev infrastructure (Postgres + NATS)"
	@echo "  make dev-down       Stop dev infrastructure"
	@echo "  make dev-backend    Run the backend server"
	@echo "  make dev-desktop    Run the Tauri desktop app"
	@echo "  make lint           Run cargo clippy + fmt check"
	@echo "  make test           Run all workspace tests"
	@echo ""
	@echo "──── Production ────"
	@echo "  make prod-config    Render production compose config"
	@echo "  make prod-up        Build and start production stack"
	@echo "  make prod-down      Stop production stack"
	@echo "  make prod-logs      Tail production logs"
	@echo "  make prod-ps        Show production service status"
	@echo "  make health         Check public health endpoints"

# ── Development ─────────────────────────────────────────────────

dev-up:
	docker compose up -d

dev-down:
	docker compose down

dev-backend:
	cargo run -p backend

dev-desktop:
	cd apps/desktop && npm run tauri dev

lint:
	cargo clippy --workspace -- -D warnings
	cargo fmt --check

test:
	cargo test --workspace

# ── Production ──────────────────────────────────────────────────

prod-config:
	$(COMPOSE_PROD) config

prod-up:
	$(COMPOSE_PROD) up -d --build

prod-down:
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f --tail=200

prod-ps:
	$(COMPOSE_PROD) ps

health:
	curl -fsS https://$(API_HOST)/health
	curl -fsS https://$(API_HOST)/api/v1/health/db
	curl -fsS https://$(API_HOST)/api/v1/health/nats
