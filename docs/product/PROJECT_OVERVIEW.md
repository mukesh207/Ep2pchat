# Trustline: Enterprise-Grade E2EE Messaging Platform

Trustline (also referred to as **Ep2pchat** in the codebase) is a high-security, multi-tenant, End-to-End Encrypted (E2EE) messaging platform designed for confidential enterprise communication. It prioritizes data sovereignty, passwordless authentication, and a zero-knowledge architecture.

## 🌟 Vision & Core Concept
The primary goal of Trustline is to provide a seamless, modern chat experience while guaranteeing that the central server remains a **"blind router."** The server routes encrypted blobs but never possesses the keys to decrypt them, ensuring absolute privacy for organizations.

### Key Value Propositions:
*   **Zero-Knowledge Architecture:** The server cannot read any message content.
*   **Passwordless Security:** Authentication is handled strictly via **WebAuthn/FIDO2 (Passkeys)**, eliminating password-related vulnerabilities.
*   **Tenant Isolation:** Uses **PostgreSQL Row-Level Security (RLS)** to ensure cryptographic and logical separation of data between different organizations.
*   **Data Sovereignty:** Designed for self-hosting, giving organizations 100% control over their communications infrastructure.

---

## 🛠️ Technology Stack

### Backend (The "Mailroom")
*   **Language:** Rust (1.80+)
*   **Framework:** [Axum 0.8](https://github.com/tokio-rs/axum) with [Tokio](https://tokio.rs/) for high-concurrency asynchronous task handling.
*   **Database:** PostgreSQL with [SQLx](https://github.com/launchbadge/sqlx) (using RLS for multi-tenancy).
*   **Message Broker:** [NATS JetStream](https://nats.io/) for lightweight, high-performance distributed messaging.
*   **Containerization:** Docker & Docker Compose (with Traefik TLS in production).

### Desktop Client (The "Workspace")
*   **Framework:** [Tauri v2](https://tauri.app/) (Rust-based core) + [React 19](https://reactjs.org/) (TypeScript 5).
*   **State Management:** React hooks and context.
*   **Local Storage:** SQLCipher encrypted local vault with AES-GCM and FTS5 search (never leaves the device).
*   **Styling:** Modern, high-fidelity UI via Tailwind CSS 4.
*   **Testing:** Playwright E2E integration tests.

### Cryptography (The "Locked Briefcases")
*   **Protocol:** [Signal Protocol](https://getsignal.org/docs/) implementation (Double Ratchet + X3DH).
*   **Primitives:** [libsodium](https://libsodium.gitbook.io/doc/) (`ed25519` for signatures, `XChaCha20-Poly1305` for encryption).
*   **Future Proofing:** Messaging Layer Security (MLS - RFC 9420) for scalable group encryption.

---

## 🏗️ System Architecture

1.  **Onboarding:** Admin approves a corporate email -> User registers a device via WebAuthn (Biometrics/Security Key) -> Device generates `X25519` identity keys.
2.  **Handshake (X3DH):** Sender fetches recipient's public pre-keys from the server to establish a shared secret without needing the recipient to be online.
3.  **Messaging (Double Ratchet):** Every message is encrypted with a unique, one-time key derived from the shared secret, providing **Forward Secrecy** and **Post-Compromise Security**.
4.  **Blind Routing:** The backend receives an encrypted blob and a `recipient_device_id`, then routes it via NATS to the active WebSocket or stores it for asynchronous delivery.
5.  **Offline Replay:** Messages to offline users are securely persisted by the router and accurately replayed on reconnect.

---

## 📁 Project Structure

```text
├── apps/desktop          # Tauri v2 + React (TypeScript) frontend
│   ├── src/              # Frontend UI logic
│   └── src-tauri/        # Rust-based desktop core
├── crates/backend        # Axum + Tokio backend API engine
│   └── src/              # Auth, WebSocket, and RLS logic
├── crates/crypto_core    # Shared Rust library for X3DH and cryptographic primitives
├── migrations/           # PostgreSQL schema, RLS policies, and audit logs
├── docs/                 # Comprehensive documentation (Architecture, FRD, Threat Model)
├── UIreferences/         # UI/UX design references
└── docker-compose.yml    # Infrastructure orchestration (DB, NATS, Traefik)
```

---

## 🔐 Security Features & Roles

### User Roles
*   **Standard Employee:** Can register multiple devices, participate in E2EE chats, and revoke their own devices.
*   **Tenant Admin:** Can approve/deny new users, monitor system health, and revoke any user's device (cannot read messages).

### Advanced Protections
*   **Forward Secrecy:** Past messages remain secure even if future keys are compromised.
*   **Post-Compromise Security:** The system recovers security automatically after a brief compromise.
*   **Ephemeral Metadata:** Routing logs are shredded according to strict administrative retention policies.
*   **Local Vault:** Private keys are stored in the device's Secure Enclave or a local encrypted SQLite db.

---

## 🚀 Future Roadmap
*   **Group Messaging:** Implementing MLS for secure, scalable multi-party collaboration.
*   **Ephemeral Rooms:** Self-destructing messages for high-stakes discussions.
*   **Federation:** Allowing trusted self-hosted organizations to communicate securely across domains.
*   **Mobile Apps:** Native iOS/Android clients bridging directly into mobile hardware security modules.

---
**Trustline: Secure Communication for the Modern Enterprise.**  
*Built with Rust, Tauri, and absolute privacy in mind.*
