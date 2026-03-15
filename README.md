# Trustline: Enterprise-Grade E2EE Messaging

Trustline is a secure, multi-tenant, End-to-End Encrypted (E2EE) messaging platform designed for highly confidential enterprise operations. It eliminates passwords in favor of biometric Passkeys (WebAuthn) and ensures complete server-side blindness through advanced cryptographic handshakes.

## 🛡️ Core Security Features

*   **Zero-Knowledge Architecture:** The server acts as a blind router. It stores encrypted blobs but has no access to the keys required to decrypt them.
*   **Passwordless Onboarding:** Identity is verified via corporate email and approved by IT Admins. Authentication is handled strictly via WebAuthn/FIDO2 (FaceID, TouchID, Windows Hello).
*   **X3DH Handshake:** Implements the Extended Triple Diffie-Hellman (X3DH) protocol for secure session establishment.
*   **Tenant Isolation:** Powered by PostgreSQL Row-Level Security (RLS), ensuring data from different organizations is cryptographically and logically separated at the database level.
*   **Local Vault:** All private keys and message history are stored in a secure, local SQLite database on the user's device, never leaving the hardware.

## 🏗️ Project Architecture

```text
├── apps/desktop          # Tauri v2 + React (TypeScript) frontend
├── crates/backend        # Axum + Tokio + SQLx backend API & WebSocket engine
├── crates/crypto_core    # Shared Rust library for X3DH and libsodium primitives
├── migrations/           # Automated SQL schema & RLS policy management
├── docs/                 # Detailed FRD, Architecture, and UI/UX specs
└── docker-compose.yml    # Development & Production orchestration
```

## 🚀 Getting Started

### Prerequisites
*   **Rust:** 1.80+ (`rustup`)
*   **Node.js:** v20+
*   **Docker & Docker Compose**
*   **System Libs (Linux):** `libwebkit2gtk-4.1-dev`, `libsodium-dev`

### 1. Local Infrastructure
Start the database and messaging bus:
```bash
docker compose up -d
```

### 2. Start the Backend
```bash
cd crates/backend
# Ensure DATABASE_URL is set in .env
cargo run
```
The API will be available at `http://localhost:3000`.

### 3. Start the Desktop App
```bash
cd apps/desktop
npm install
npm run tauri dev
```

## 🛠️ Development Workflows

*   **Database Migrations:** SQL files in `/migrations` are automatically applied by the backend on startup.
*   **Cryptographic Core:** Logic is shared between the desktop app and backend via the `crypto_core` crate.
*   **Admin Dashboard:** Access the dashboard by clicking "Admin Access" on the welcome screen. In dev mode, registration is open by default.

## 🚢 Deployment

To deploy the full production stack with automated TLS (via Traefik and Let's Encrypt):

## 📅 Project Roadmap
Detailed progress is tracked in our elite [Implementation Plan](/home/st4rk/.gemini/antigravity/brain/a0da5252-5180-4d06-b27f-127f6d10cf50/implementation_plan.md).

---
**Secure Communication for the Modern Enterprise.**  
*Built with Rust & Tauri.*
