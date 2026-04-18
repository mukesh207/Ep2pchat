#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Trustline — EC2 Bootstrap Script
#  Run this ONCE inside the EC2 instance after first SSH login.
#  Installs Docker, Docker Compose, and starts the Trustline stack.
#
#  Usage (on EC2):
#    bash ~/Ep2pchat/scripts/ec2_bootstrap.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
info() { echo -e "${CYAN}▸${RESET} $*"; }
ok()   { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }

info "Updating system packages..."
sudo dnf update -y -q

info "Installing Docker..."
sudo dnf install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user
ok "Docker installed and enabled."

info "Installing Docker Compose plugin..."
sudo dnf install -y docker-compose-plugin
ok "Docker Compose plugin installed."

# Verify
docker --version
docker compose version

ok "Bootstrap complete!"
warn "IMPORTANT: Log out and SSH back in so the docker group takes effect."
warn "Then run:  bash ~/Ep2pchat/scripts/ec2_deploy.sh"
