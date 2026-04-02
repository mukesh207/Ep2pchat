# Contributing to Trustline

Thank you for your interest in contributing! This document provides guidelines for contributing to the Trustline E2EE messaging platform.

## Prerequisites

- Rust 1.80+
- Node.js v20+
- Docker & Docker Compose
- libsodium-dev

## Development Setup

```bash
# 1. Clone and configure
git clone https://github.com/mukesh207/Ep2pchat.git
cd Ep2pchat
cp .env.example .env

# 2. Start infrastructure
docker compose up -d

# 3. Run the backend
cargo run -p backend

# 4. In a new terminal — run the desktop app
cd apps/desktop
npm install
npm run tauri dev
```

## Code Style

- **Rust:** Format with `cargo fmt` (see `rustfmt.toml`), lint with `cargo clippy`
- **TypeScript:** Strict mode enabled — no `any` types allowed
- **Commits:** Use conventional commits (`feat:`, `fix:`, `sec:`, `chore:`)

## Branch Naming

- `feat/` — New features
- `fix/` — Bug fixes
- `sec/` — Security patches
- `chore/` — Maintenance

## Testing

```bash
# Backend + crypto unit/integration tests
cargo test --workspace

# Frontend E2E tests
cd apps/desktop && npm run e2e

# Linting
cargo clippy --workspace -- -D warnings
cargo fmt --check
```

## Security PRs

Security-related PRs require two distinct code reviewers before merge.

## Commit Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add group messaging support
fix: resolve OTPK exhaustion during high-traffic windows  
sec: patch timing side-channel in X3DH validation
```
