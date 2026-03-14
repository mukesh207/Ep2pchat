# Trustline: Master Implementation Plan

**Project:** Trustline (encryptedchat.in)
**Date:** March 2026

This is the comprehensive, phased implementation roadmap for building the Trustline platform. Each phase builds on the previous one, with clear milestones and deliverables.

---

## Phase 0: Environment & Prerequisites
> **Goal:** Ensure all developer tooling is installed and ready.

| Tool | Purpose | Install Command |
|---|---|---|
| **Rust (rustup)** | Backend, Crypto Core, Tauri backend | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Node.js (v20+)** | Frontend (React/TypeScript) | `nvm install 20` or system package manager |
| **PostgreSQL (v16+)** | Primary database | `sudo apt install postgresql` |
| **Docker** | Containerization | `sudo apt install docker.io` |
| **System Libs (Tauri)** | Native webview dependencies for Tauri | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` |

---

## Phase 1: Monorepo Scaffolding & Hello World
> **Goal:** Get a running Rust backend and a Tauri desktop window that can talk to each other.

### Directory Structure
```
Ep2pchat/
├── Cargo.toml                    # Rust Workspace root
├── crates/
│   ├── backend/                  # Axum WebSocket routing server
│   │   ├── Cargo.toml
│   │   └── src/main.rs
│   └── crypto_core/              # Shared libsodium-based crypto library
│       ├── Cargo.toml
│       └── src/lib.rs
├── apps/
│   └── desktop/                  # Tauri v2 + React + TypeScript
│       ├── src-tauri/
│       ├── src/                  # React components
│       ├── package.json
│       └── index.html
├── docs/                         # All our planning documents
│   ├── CONCEPT.md
│   ├── ARCHITECTURE.md
│   ├── FRD.md
│   ├── THREAT_MODEL_CRYPTO.md
│   ├── DATABASE_API_CONTRACT.md
│   └── UI_UX_JOURNEY.md
└── docker-compose.yml            # Local dev (Postgres, NATS)
```

### Tasks
- [ ] Install Rust toolchain (`rustup`)
- [ ] Install Node.js & system dependencies for Tauri
- [ ] Create root `Cargo.toml` workspace
- [ ] `cargo new crates/backend --bin` (Axum + Tokio)
- [ ] `cargo new crates/crypto_core --lib`
- [ ] Scaffold Tauri v2 app (`npx create-tauri-app@latest`)
- [ ] Move planning docs into `docs/` directory
- [ ] Verify: `cargo check` compiles the workspace
- [ ] Verify: `npm run tauri dev` opens a desktop window

### Milestone ✅
> A blank Tauri desktop window opens, and `cargo run --bin backend` starts an Axum server on `localhost:3000`.

---

## Phase 2: Database & Docker Compose
> **Goal:** Stand up a local PostgreSQL database with the schema defined in `DATABASE_API_CONTRACT.md`.

### Tasks
- [ ] Create `docker-compose.yml` with PostgreSQL 16 and NATS JetStream services
- [ ] Write SQL migration files (using `sqlx` or `refinery`) for:
  - `organizations`
  - `users`
  - `devices`
  - `one_time_pre_keys`
  - `encrypted_messages`
- [ ] Apply Row-Level Security (RLS) policies
- [ ] Integrate `sqlx` (async Postgres driver) into the `backend` crate
- [ ] Verify: Run `docker compose up` and confirm tables exist with RLS enabled

### Milestone ✅
> `docker compose up` starts Postgres + NATS. Migrations run automatically. RLS policies are active.

---

## Phase 3: Authentication — Passwordless Onboarding (WebAuthn/FIDO2)
> **Goal:** Implement the "HR Checkpoint" flow from `UI_UX_JOURNEY.md`.

### Backend (Rust/Axum)
- [ ] `POST /api/v1/auth/request-access` — Accept email, generate access code, create `pending` user
- [ ] `GET /api/v1/admin/pending-users` — List pending approvals (Admin only)
- [ ] `POST /api/v1/admin/approve-user` — Move user from `pending` to `active`
- [ ] Integrate `webauthn-rs` crate for FIDO2 server-side ceremony
- [ ] `POST /api/v1/auth/register-passkey/begin` — Start WebAuthn registration
- [ ] `POST /api/v1/auth/register-passkey/complete` — Complete & store credential
- [ ] `POST /api/v1/auth/login/begin` — Start WebAuthn authentication
- [ ] `POST /api/v1/auth/login/complete` — Verify & issue session token (short-lived JWT)

### Frontend (Tauri/React)
- [ ] Build the "Identity Gateway" welcome screen (email input)
- [ ] Build the "Waiting Room" UI (pending approval state)
- [ ] Build the Admin approval dashboard (list + approve/deny)
- [ ] Integrate `navigator.credentials.create()` for Passkey registration
- [ ] Integrate `navigator.credentials.get()` for Passkey login

### Milestone ✅
> A user can request access, an Admin approves them, the user registers a Passkey (biometric), and logs in without a password.

---

## Phase 4: Cryptographic Core — X3DH & Key Management
> **Goal:** Implement the cryptographic handshake flow from `THREAT_MODEL_CRYPTO.md`.

### `crypto_core` Library (Rust)
- [ ] Integrate `libsodium` (via `sodiumoxide` or `libsodium-sys-stable`)
- [ ] Implement `generate_identity_keypair()` — Long-term X25519
- [ ] Implement `generate_signed_pre_key()` — Medium-term, signed by IK
- [ ] Implement `generate_one_time_pre_keys(count)` — Batch of ephemeral keys
- [ ] Implement `x3dh_sender()` — Alice's side (4 DH exchanges → Master Secret)
- [ ] Implement `x3dh_receiver()` — Bob's side (mirror calculation)
- [ ] Implement `encrypt_message(plaintext, key)` → XChaCha20-Poly1305 ciphertext
- [ ] Implement `decrypt_message(ciphertext, key)` → plaintext
- [ ] Unit tests for every function

### Backend Integration
- [ ] `POST /api/v1/keys/upload` — Device uploads its public key bundle
- [ ] `GET /api/v1/keys/{user_id}` — Fetch target user's key bundle (consuming one OPK)

### Milestone ✅
> Two Rust unit tests perform a full X3DH handshake and successfully encrypt/decrypt a message between simulated Alice and Bob.

---

## Phase 5: Real-Time Messaging — WebSocket Engine
> **Goal:** Build the blind routing engine as defined in the API contract.

### Backend (Rust/Axum WebSockets)
- [ ] Implement authenticated WebSocket upgrade handler
- [ ] Build in-memory connection registry (`HashMap<DeviceId, WebSocketSender>`)
- [ ] Handle `KEYS_REQUEST` → Respond with target's key bundle
- [ ] Handle `MESSAGE_SEND` → Route encrypted payload to recipient's socket
- [ ] Handle offline queuing → Store in `encrypted_messages` table for later delivery
- [ ] Handle `MESSAGE_ACK` → Update delivery/read status
- [ ] Integrate NATS JetStream for horizontal scaling (multiple backend nodes)

### Frontend (Tauri/React)
- [ ] Establish authenticated WebSocket connection on login
- [ ] Perform X3DH handshake when opening a new conversation
- [ ] Encrypt messages client-side before sending
- [ ] Decrypt received messages client-side
- [ ] Display message status (Sent → Delivered → Read)
- [ ] Implement typing indicators

### Milestone ✅
> Alice sends an encrypted message from her Tauri desktop app → Server routes the blob → Bob's Tauri app decrypts and displays it in real-time.

---

## Phase 6: Premium UI Polish
> **Goal:** Transform the functional UI into a stunning, premium experience per `UI_UX_JOURNEY.md`.

### Tasks
- [ ] Implement dark-mode-first color system (Obsidian base, Electric Blue accents)
- [ ] Add `Inter` or `Geist` typography via Google Fonts
- [ ] Build the dual-pane layout (Sidebar + Chat Arena)
- [ ] Add the "Establishing Secure Channel..." animation on first message
- [ ] Add the "Decrypting Local Vault..." progress bar on app startup
- [ ] Implement smooth message slide-in animations
- [ ] Add the encryption shield icon next to contacts
- [ ] Build the device management settings panel
- [ ] Implement local search (SQLite via Tauri)

### Milestone ✅
> The desktop app looks and feels like a premium, state-of-the-art product with fluid animations and a cohesive dark aesthetic.

---

## Phase 7: Admin Dashboard & Operational Controls
> **Goal:** Build the administrative tools for enterprise operations.

### Tasks
- [ ] Build the Admin Dashboard layout (Stats, User Roster, Audit Log)
- [ ] Implement audit logging on all critical actions (approval, revocation, etc.)
- [ ] Build device revocation flow (Admin force-revokes a user's device)
- [ ] Implement retention policy settings (auto-purge old encrypted metadata)
- [ ] Implement encrypted moderation (user reports → admin reviews specific message)

### Milestone ✅
> An Admin can monitor the system, approve/deny users, revoke devices, and configure data retention policies.

---

## Phase 8: Containerization & Deployment
> **Goal:** Package Trustline for self-hosted deployment on `encryptedchat.in`.

### Tasks
- [ ] Write `Dockerfile` for the Rust backend
- [ ] Write `docker-compose.production.yml` (Backend + Postgres + NATS + Traefik)
- [ ] Configure Traefik for wildcard TLS (`*.encryptedchat.in`)
- [ ] Configure Cilium/WireGuard for inter-service encryption (if Kubernetes)
- [ ] Build Tauri desktop binaries for Linux, macOS, Windows
- [ ] Write deployment documentation

### Milestone ✅
> `docker compose up` on a VPS deploys the entire Trustline stack, accessible at `encryptedchat.in` with automatic TLS.

---

## Summary Timeline

| Phase | Description | Est. Duration |
|---|---|---|
| 0 | Environment Setup | 1 day |
| 1 | Monorepo Scaffolding | 2–3 days |
| 2 | Database & Docker | 2–3 days |
| 3 | Passwordless Auth (WebAuthn) | 1–2 weeks |
| 4 | Cryptographic Core (X3DH) | 1–2 weeks |
| 5 | Real-Time WebSocket Messaging | 2–3 weeks |
| 6 | Premium UI Polish | 1–2 weeks |
| 7 | Admin Dashboard | 1 week |
| 8 | Containerization & Deployment | 1 week |
| **Total** | | **~8–12 weeks** |
