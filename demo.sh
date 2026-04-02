#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Trustline — 1-Click Docker Demo
#  Launches Postgres + NATS + Backend, seeds a demo tenant with test users.
#
#  Usage:
#    ./demo.sh          Build & start everything, seed demo data
#    ./demo.sh --down   Tear down all demo containers and volumes
#    ./demo.sh --logs   Tail backend logs
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.demo.yml"
BACKEND_URL="http://localhost:3000"
SEED_ENDPOINT="$BACKEND_URL/api/v1/test/bootstrap"
HEALTH_ENDPOINT="$BACKEND_URL/health"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Helpers ──────────────────────────────────────────────────────────────────
info()  { echo -e "${CYAN}▸${RESET} $*"; }
ok()    { echo -e "${GREEN}✔${RESET} $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }
fail()  { echo -e "${RED}✖ $*${RESET}" >&2; exit 1; }

# ── Handle --down / --logs ───────────────────────────────────────────────────
if [[ "${1:-}" == "--down" ]]; then
    info "Tearing down demo stack…"
    docker compose $COMPOSE_FILES down -v --remove-orphans 2>/dev/null || true
    ok "Demo stack removed."
    exit 0
fi

if [[ "${1:-}" == "--logs" ]]; then
    docker compose $COMPOSE_FILES logs -f backend
    exit 0
fi

# ── Pre-flight checks ───────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail "Docker is not installed."
docker info >/dev/null 2>&1     || fail "Docker daemon is not running."

# ── Build & Start ────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║           ${CYAN}⚡ TRUSTLINE DEMO${RESET}${BOLD}  — Launching…                   ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

info "Building and starting containers (postgres + nats + backend)…"
docker compose $COMPOSE_FILES up --build -d 2>&1 | while IFS= read -r line; do
    echo -e "  ${DIM}${line}${RESET}"
done

# ── Wait for backend health ──────────────────────────────────────────────────
info "Waiting for backend to become healthy…"
MAX_WAIT=90
WAITED=0
while true; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT" 2>/dev/null || echo "000")
    if [[ "$STATUS" == "200" ]]; then
        ok "Backend is healthy!"
        break
    fi
    WAITED=$((WAITED + 2))
    if [[ $WAITED -ge $MAX_WAIT ]]; then
        fail "Backend failed to start within ${MAX_WAIT}s. Run: ./demo.sh --logs"
    fi
    sleep 2
    printf "\r  ${DIM}Waiting… %ds / %ds${RESET}" "$WAITED" "$MAX_WAIT"
done
echo ""

# ── Seed demo tenant ────────────────────────────────────────────────────────
info "Seeding demo tenant with test users…"
SEED_RESPONSE=$(curl -s -X POST "$SEED_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"scenario": "demo"}')

# Parse key fields with lightweight grep/sed (no jq dependency)
parse_json() {
    echo "$SEED_RESPONSE" | grep -o "\"$1\":\"[^\"]*\"" | head -1 | sed "s/\"$1\":\"//;s/\"//"
}

ADMIN_TOKEN=$(echo "$SEED_RESPONSE" | grep -o '"admin":{[^}]*}' | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')
ALICE_TOKEN=$(echo "$SEED_RESPONSE" | grep -o '"alice":{[^}]*}' | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')
ALICE_USER_ID=$(echo "$SEED_RESPONSE" | grep -o '"alice":{[^}]*}' | grep -o '"user_id":"[^"]*"' | sed 's/"user_id":"//;s/"//')
ALICE_ORG_ID=$(echo "$SEED_RESPONSE" | grep -o '"alice":{[^}]*}' | grep -o '"org_id":"[^"]*"' | sed 's/"org_id":"//;s/"//')
ALICE_DEVICE_ID=$(echo "$SEED_RESPONSE" | grep -o '"alice":{[^}]*}' | grep -o '"device_id":"[^"]*"' | sed 's/"device_id":"//;s/"//')
BOB_TOKEN=$(echo "$SEED_RESPONSE" | grep -o '"bob":{[^}]*}' | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')
BOB_USER_ID=$(echo "$SEED_RESPONSE" | grep -o '"bob":{[^}]*}' | grep -o '"user_id":"[^"]*"' | sed 's/"user_id":"//;s/"//')
BOB_DEVICE_ID=$(echo "$SEED_RESPONSE" | grep -o '"bob":{[^}]*}' | grep -o '"device_id":"[^"]*"' | sed 's/"device_id":"//;s/"//')

if [[ -z "$ALICE_TOKEN" ]]; then
    warn "Seed may have failed. Raw response:"
    echo "$SEED_RESPONSE"
    fail "Could not parse seed response."
fi

ok "Demo tenant seeded!"

# ── Print the banner ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║              ${GREEN}✅ TRUSTLINE DEMO IS READY${RESET}${BOLD}                     ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║${RESET}                                                              ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  ${CYAN}API:${RESET}  $BACKEND_URL                              ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  ${CYAN}WS:${RESET}   ws://localhost:3000/ws                           ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}                                                              ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  ${YELLOW}Demo Accounts (org: Trustline Corp)${RESET}                       ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  ┌──────────────────────────────────────────────────────┐     ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  │  ${BOLD}Admin${RESET}   admin@trustline.test                         │     ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  │  ${BOLD}Alice${RESET}   alice@trustline.test                         │     ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  │  ${BOLD}Bob${RESET}     bob@trustline.test                           │     ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  └──────────────────────────────────────────────────────┘     ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}                                                              ${BOLD}║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║${RESET}  ${DIM}Quick-start: run the desktop app and open one of these:${RESET}     ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}                                                              ${BOLD}║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Alice autologin:${RESET}"
echo -e "  ${DIM}http://localhost:1420/?e2e_token=${ALICE_TOKEN}&e2e_autologin=true&e2e_user_id=${ALICE_USER_ID}&e2e_org_id=${ALICE_ORG_ID}&e2e_device_id=${ALICE_DEVICE_ID}&e2e_email=alice@trustline.test${RESET}"
echo ""
echo -e "  ${BOLD}Bob autologin:${RESET}"
echo -e "  ${DIM}http://localhost:1420/?e2e_token=${BOB_TOKEN}&e2e_autologin=true&e2e_user_id=${BOB_USER_ID}&e2e_org_id=${ALICE_ORG_ID}&e2e_device_id=${BOB_DEVICE_ID}&e2e_email=bob@trustline.test${RESET}"
echo ""
echo -e "  ${BOLD}Manage:${RESET}"
echo -e "    ./demo.sh --logs    ${DIM}Tail backend logs${RESET}"
echo -e "    ./demo.sh --down    ${DIM}Stop & remove everything${RESET}"
echo ""
