#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Trustline — EC2 Deploy Script
#  Run this AFTER ec2_bootstrap.sh (and after re-logging in).
#  Starts the full production stack: Traefik + Backend + PostgreSQL + NATS
#
#  Usage (on EC2, from ~/Ep2pchat):
#    bash ~/Ep2pchat/scripts/ec2_deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
info() { echo -e "${CYAN}▸${RESET} $*"; }
ok()   { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }

PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJ_DIR"

ENV_FILE="$PROJ_DIR/deploy/.env.production"
COMPOSE_FILE="$PROJ_DIR/deploy/docker-compose.production.yml"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found. Create it first!" >&2
    exit 1
fi

info "Starting Trustline production stack..."
info "  compose: $COMPOSE_FILE"
info "  env:     $ENV_FILE"
echo ""

# First run takes ~5-10 min on t3.micro (Rust compile)
docker compose \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    up -d --build

ok "Stack started! Watching logs for 30 seconds..."
docker compose -f "$COMPOSE_FILE" logs --tail=50 --follow &
LOGS_PID=$!
sleep 30
kill $LOGS_PID 2>/dev/null || true

echo ""
info "Checking health endpoints..."
sleep 5

API_HOST=$(grep '^API_HOST=' "$ENV_FILE" | cut -d= -f2)
BASE="https://${API_HOST}"

echo ""
ok "Stack is up. Run health checks after DNS propagates (1-5 min):"
echo "  curl $BASE/health"
echo "  curl $BASE/api/v1/health/db"
echo "  curl $BASE/api/v1/health/nats"
echo ""
