# 🛡️ Trustline

**Enterprise-Grade E2EE Messaging — Zero-Knowledge by Design**

[![CI](https://github.com/mukesh207/Ep2pchat/actions/workflows/ci.yml/badge.svg)](https://github.com/mukesh207/Ep2pchat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Overview

Trustline is a high-security, multi-tenant, end-to-end encrypted messaging platform for confidential enterprise communication. The server operates as a **zero-knowledge blind router** — it routes encrypted blobs but never possesses the keys to decrypt them. All cryptographic operations execute client-side in Rust via Tauri IPC, ensuring private keys never leave the device.

## Key Features

- 🔐 **Zero-Knowledge Blind Router** — server never sees plaintext; stores only encrypted blobs
- 🔑 **Signal Protocol** — X3DH key exchange + Double Ratchet for forward secrecy
- 🪪 **Passwordless Auth** — WebAuthn/FIDO2 passkeys (no passwords anywhere)
- 🏢 **Tenant Isolation** — PostgreSQL Row-Level Security enforces org boundaries at the DB layer
- 📡 **Distributed Routing** — NATS JetStream for cross-instance message delivery
- 🗄️ **Encrypted Local Vault** — SQLCipher + AES-GCM column encryption + FTS5 search
- 🔄 **OTPK Auto-Replenishment** — one-time pre-keys generated in Rust, auto-uploaded
- 📱 **Offline Message Replay** — messages persisted and delivered on reconnect

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Desktop Client                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  React 19 UI │←→│  Tauri IPC   │←→│  crypto_core (Rust)    │ │
│  │  (TypeScript) │  │  Commands    │  │  X3DH + Double Ratchet │ │
│  └──────┬───────┘  └──────────────┘  └────────────────────────┘ │
│         │  WebSocket                                             │
└─────────┼────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Backend (Rust / Axum)                        │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ WebSocket│  │  WebAuthn    │  │  Key Mgmt│  │  Admin API  │ │
│  │  Router  │  │  Auth        │  │  (X3DH)  │  │  (RLS)      │ │
│  └────┬─────┘  └──────────────┘  └──────────┘  └─────────────┘ │
│       │                                                          │
│  ┌────▼─────────────────┐  ┌─────────────────────────────────┐  │
│  │  NATS JetStream      │  │  PostgreSQL 16 (RLS)            │  │
│  │  Distributed PubSub  │  │  Encrypted blob storage         │  │
│  └──────────────────────┘  └─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Rust, Axum 0.8, Tokio, SQLx 0.8, WebAuthn-rs |
| **Desktop** | Tauri v2, React 19, Vite 7, TypeScript 5, Tailwind CSS 4 |
| **Crypto** | libsodium (sodiumoxide), X3DH, Double Ratchet, ChaCha20-Poly1305 |
| **Database** | PostgreSQL 16 + Row-Level Security |
| **Messaging** | NATS JetStream |
| **Auth** | WebAuthn / FIDO2 Passkeys, JWT |
| **Testing** | Playwright (E2E), cargo test (unit/integration) |
| **CI/CD** | GitHub Actions |

## Project Structure

```
├── apps/desktop/              # Tauri v2 + React desktop client
│   ├── src/                   # React UI, API client, crypto wrappers
│   ├── src-tauri/             # Rust-based Tauri commands
│   └── e2e/                   # Playwright E2E tests
├── crates/
│   ├── backend/               # Axum API server (auth, ws, keys, admin)
│   └── crypto_core/           # X3DH + Double Ratchet library
├── migrations/                # PostgreSQL schema + RLS policies (14 files)
├── deploy/                    # Production Docker Compose + Traefik
├── docs/                      # Architecture, ADRs, threat model, product docs
├── docker-compose.yml         # Dev infrastructure (Postgres + NATS)
├── Dockerfile                 # Multi-stage backend build
└── Makefile                   # Deployment automation
```

## Prerequisites

- **Rust** 1.80+ (`rustup install stable`)
- **Node.js** 20+ with npm
- **Docker** & Docker Compose
- **libsodium-dev** (`apt install libsodium-dev` / `brew install libsodium`)
- **System keychain** — GNOME Keyring (Linux), macOS Keychain, or Windows Credential Manager

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/mukesh207/Ep2pchat.git
cd Ep2pchat

# 2. Configure environment
cp .env.example .env
# Edit .env with your own JWT_SECRET and database password

# 3. Start infrastructure (PostgreSQL + NATS)
docker compose up -d

# 4. Run the backend
cargo run -p backend

# 5. In another terminal — install frontend deps and launch the desktop app
cd apps/desktop
npm install
npm run tauri dev
```

## Testing

```bash
# Backend unit & integration tests
cargo test --workspace

# Frontend E2E tests (requires running backend + infrastructure)
cd apps/desktop
npm run e2e

# Rust linting
cargo clippy --workspace
cargo fmt --check
```

## Deployment

Production deployment uses Docker Compose with Traefik for TLS termination:

```bash
# Preview production config
make prod-config

# Deploy production stack
make prod-up

# Check health endpoints
make health
```

See [`deploy/README.md`](deploy/README.md) for detailed deployment instructions.

## Security Model

| Property | Implementation |
|----------|---------------|
| **Zero-Knowledge** | Server stores only encrypted blobs; all crypto runs client-side |
| **Forward Secrecy** | Double Ratchet derives unique per-message keys |
| **Post-Compromise Security** | Ratchet self-heals after key exposure |
| **Tenant Isolation** | PostgreSQL RLS enforces org boundaries at the row level |
| **Key Storage** | Private keys in OS Secure Enclave / encrypted SQLite vault |
| **Authentication** | Hardware-bound WebAuthn passkeys (no passwords) |

For the full threat model, see [`docs/architecture/THREAT_MODEL_CRYPTO.md`](docs/architecture/THREAT_MODEL_CRYPTO.md).

### Responsible Disclosure

If you discover a security vulnerability, please report it to **security@trustline.app**. See [`SECURITY.md`](SECURITY.md) for our disclosure policy.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Blueprint](docs/architecture/ARCHITECTURE.md) | System design and component overview |
| [Database & API Contract](docs/architecture/DATABASE_API_CONTRACT.md) | Schema, WebSocket protocol, REST API |
| [Crypto Threat Model](docs/architecture/THREAT_MODEL_CRYPTO.md) | Threat actors, attack vectors, mitigations |
| [Functional Requirements](docs/product/FRD.md) | User stories and feature specs |
| [UI/UX Journey](docs/product/UI_UX_JOURNEY.md) | User flows and interaction patterns |
| [ADR-001](docs/adr/ADR-001.md) | Zero-Knowledge Blind Router Architecture |
| [ADR-002](docs/adr/ADR-002.md) | WebAuthn/FIDO2 Passwordless Authentication |
| [ADR-003](docs/adr/ADR-003.md) | PostgreSQL RLS Tenant Isolation |
| [ADR-004](docs/adr/ADR-004.md) | Double Ratchet Forward Secrecy |

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch naming, commit format, and development setup.

## License

[MIT](LICENSE) © Trustline Contributors
