#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Trustline — Remote Production Seeder
#  Hits the bootstrap API on a remote backend and generates autologin links.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo -e "Usage: ./seed_production.sh <backend_url>"
    echo -e "Example: ./seed_production.sh https://encryptedchat.in"
    exit 1
fi

BACKEND_URL="${1%/}"
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

info()  { echo -e "${CYAN}▸${RESET} $*"; }
ok()    { echo -e "${GREEN}✔${RESET} $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }
fail()  { echo -e "${RED}✖ $*${RESET}" >&2; exit 1; }

# ── Check Health ─────────────────────────────────────────────────────────────
info "Checking target health: $HEALTH_ENDPOINT"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT" || echo "000")
if [[ "$STATUS" != "200" ]]; then
    warn "Backend returned status $STATUS (not 200 OK)."
    echo -e "Continuing anyway, but seeding might fail."
else
    ok "Backend is responsive!"
fi

# ── Seed Demo Tenant ─────────────────────────────────────────────────────────
info "Seeding remote tenant with demo users..."
SEED_RESPONSE=$(curl -s -X POST "$SEED_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"scenario": "demo"}')

# Parse key fields
ADMIN_TOKEN=$(echo "$SEED_RESPONSE" | grep -o '"admin":{[^}]*}' | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//' || true)
ALICE_TOKEN=$(echo "$SEED_RESPONSE" | grep -o '"alice":{[^}]*}' | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//' || true)
ALICE_USER_ID=$(echo "$SEED_RESPONSE" | grep -o '"alice":{[^}]*}' | grep -o '"user_id":"[^"]*"' | sed 's/"user_id":"//;s/"//' || true)
ALICE_ORG_ID=$(echo "$SEED_RESPONSE" | grep -o '"alice":{[^}]*}' | grep -o '"org_id":"[^"]*"' | sed 's/"org_id":"//;s/"//' || true)
ALICE_DEVICE_ID=$(echo "$SEED_RESPONSE" | grep -o '"alice":{[^}]*}' | grep -o '"device_id":"[^"]*"' | sed 's/"device_id":"//;s/"//' || true)
BOB_TOKEN=$(echo "$SEED_RESPONSE" | grep -o '"bob":{[^}]*}' | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//' || true)
BOB_USER_ID=$(echo "$SEED_RESPONSE" | grep -o '"bob":{[^}]*}' | grep -o '"user_id":"[^"]*"' | sed 's/"user_id":"//;s/"//' || true)
BOB_DEVICE_ID=$(echo "$SEED_RESPONSE" | grep -o '"bob":{[^}]*}' | grep -o '"device_id":"[^"]*"' | sed 's/"device_id":"//;s/"//' || true)

if [[ -z "$ALICE_TOKEN" || "$ALICE_TOKEN" == "" ]]; then
    warn "Seed failed or response was invalid. Raw response:"
    echo "$SEED_RESPONSE"
    fail "Could not parse seed response."
fi

ok "Remote presentation users provisioned!"

# ── Output ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║          ${GREEN}✅ PRESENTATION ACCOUNTS CREATED${RESET}${BOLD}                      ║${RESET}"
echo -e "${BOLD}╠════════════════════════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║${RESET}                                                                ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  ${CYAN}Frontend API Map:${RESET} $BACKEND_URL                          ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}                                                                ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  ${YELLOW}Role Overview:${RESET}                                                ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}    Admin: admin@trustline.test                                 ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}    Alice: alice@trustline.test  (User Device A)                ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}    Bob:   bob@trustline.test    (User Device B)                ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}                                                                ${BOLD}║${RESET}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "Copy/paste these local app URLs to launch logged-in presentation apps:"
echo ""
echo -e "  ${BOLD}Alice (App Window 1):${RESET}"
echo -e "  ${DIM}http://localhost:1420/?e2e_token=${ALICE_TOKEN}&e2e_autologin=true&e2e_user_id=${ALICE_USER_ID}&e2e_org_id=${ALICE_ORG_ID}&e2e_device_id=${ALICE_DEVICE_ID}&e2e_email=alice@trustline.test${RESET}"
echo ""
echo -e "  ${BOLD}Bob (App Window 2):${RESET}"
echo -e "  ${DIM}http://localhost:1420/?e2e_token=${BOB_TOKEN}&e2e_autologin=true&e2e_user_id=${BOB_USER_ID}&e2e_org_id=${ALICE_ORG_ID}&e2e_device_id=${BOB_DEVICE_ID}&e2e_email=bob@trustline.test${RESET}"
echo ""
