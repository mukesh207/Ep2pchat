#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Trustline — Push Latest Code to EC2
#  Run from your laptop (project root) to sync latest changes to EC2.
#
#  Usage:
#    bash scripts/push_to_ec2.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PEM_KEY="${PEM_KEY:-/home/st4rk/Public/Ep2pchat/aws.ubuntu.pem}"
EC2_USER="${EC2_USER:-ec2-user}"
EC2_HOST="${EC2_HOST:-54.196.202.50}"
EC2_DIR="${EC2_DIR:-~/Ep2pchat}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
info() { echo -e "${CYAN}▸${RESET} $*"; }
ok()   { echo -e "${GREEN}✔${RESET} $*"; }

PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJ_DIR"

info "Syncing code to EC2 (${EC2_HOST})..."
rsync -avz --progress \
    --exclude='target/' \
    --exclude='node_modules/' \
    --exclude='.git/' \
    --exclude='.env*' \
    --exclude='*.pem' \
    --exclude='apps/desktop/dist/' \
    --exclude='apps/desktop/test-results/' \
    -e "ssh -i ${PEM_KEY}" \
    . "${EC2_USER}@${EC2_HOST}:${EC2_DIR}/"

ok "Code synced to EC2!"
echo ""
echo "  To rebuild and restart the backend on EC2:"
echo "  ssh -i ${PEM_KEY} ${EC2_USER}@${EC2_HOST}"
echo "  cd ~/Ep2pchat && bash scripts/ec2_deploy.sh"
