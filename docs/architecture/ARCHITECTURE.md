# Trustline: Technical Architecture & Cyber Security Blueprint

**Document Version:** 1.0
**Author:** Senior Technical Architect & Lead Cybersecurity Engineer
**Date:** March 2026

This document outlines the state-of-the-art technological stack and architectural design to realize the vision of "Trustline" described in `CONCEPT.md`. The focus is absolute zero-trust, memory safety, hyper-scalability, and uncompromised cryptographic integrity.

---

## 1. The Core Infrastructure (The "Mailroom")

The backend architecture focuses on high-concurrency, memory safety, and acting strictly as a "blind router." It will not be able to decrypt payloads.

*   **Core Routing Engine:** **Rust (with Tokio)** 
    *   *Why?* Rust guarantees memory safety (preventing buffer overflows and common vulnerabilities) while offering C-level performance. Tokio provides an asynchronous runtime capable of handling millions of concurrent WebSocket connections efficiently.
*   **Message Broker / PubSub:** **NATS JetStream**
    *   *Why?* Far lighter and faster than Kafka. NATS is designed for distributed, secure, multi-tenant communications. It perfectly fits the model of routing encrypted blobs with ephemeral metadata.
*   **Primary Database (User/Org Metadata):** **PostgreSQL**
    *   *Why?* Rock-solid reliability. We will heavily utilize Postges' **Row-Level Security (RLS)** to enforce tenant isolation at the database layer (making cross-tenant leakage virtually impossible).
*   **Testing & CI/CD Pipelines:** **Playwright & GitHub Actions**
    *   *Why?* End-to-end integration tests explicitly verifying WebSocket connections, multi-tenant boundaries, and message delivery to catch regressions.

## 2. Advanced Cryptography (The "Locked Briefcases")

We will utilize the modern gold standards for secure communication. We avoid rolling our own crypto at all costs.

*   **1-to-1 End-to-End Encryption:** **The Signal Protocol (Double Ratchet Algorithm + X3DH)**
    *   *Why?* The industry standard for E2EE, providing Forward Secrecy and Post-Compromise Security.
*   **Multi-Party (Group) Encryption:** **Messaging Layer Security (MLS - RFC 9420)**
    *   *Why?* Standardized by the IETF, MLS scales securely to thousands of members in a group without the severe performance bottleneck of traditional pairwise encryption (which the Signal protocol struggles with in giant groups).
*   **Cryptographic Primitives:** **libsodium** (specifically `ed25519` for signatures and `XChaCha20-Poly1305` for symmetric encryption).

## 3. Passwordless Authentication (The "Unforgeable ID Badge")

Passwords are the weakest link and will be completely eliminated from the entire stack.

*   **Authentication Protocol:** **WebAuthn / FIDO2 (Passkeys)**
    *   *Why?* Binding authentication hardware securely to user identities. The private keys never leave the device’s Secure Enclave (Apple Secure Enclave, Android Titan M, Windows TPM). 
*   **Session Management:** **Opaquely Signed PASE (Password-Authenticated Key Exchange) / Short-lived JWTs**
    *   *Why?* Sessions are extremely short-lived. Long-term device trust is maintained via cryptographic handshakes with the device's hardware enclave, not a long-living database token.

## 4. Client Applications (The "Workspace")

Client-side execution mapping directly onto bare-metal hardware features is critical for both snappy UI experiences and cryptographic operations.

*   **Desktop Applications (Windows / Mac / Linux):** **Tauri + React/Svelte**
    *   *Why?* Electron is bloated and has a large attack surface. Tauri v2 uses the OS's native webview and runs a lightweight Rust backend locally. This gives the application system-level capabilities (like secure local storage via SQLCipher + FTS5) with maximum safety.
*   **Mobile Applications (iOS / Android):** **React Native (with JSI/Turbomodules) or Native (Swift/Kotlin)**
    *   *Why?* To bridge directly into native cryptography engines. We will use native modules heavily so mathematical operations aren't bottlenecked by the JavaScript thread.

## 5. Security Posture & Deployment

*   **Containerization & Orchestration:** **Docker & Kubernetes** 
    *   *Why?* Allows for isolated, microservice-based deployments in any enterprise’s on-premise hardware or private cloud.
*   **Networking Security Engine:** **Cilium (eBPF)**
    *   *Why?* For Kubernetes deployments, Cilium uses eBPF in the Linux kernel to enforce deep packet inspection, network isolation, and transparent encryption between microservices (using WireGuard).
*   **Reverse Proxy / Load Balancer:** **Traefik or Envoy**
    *   *Why?* Dynamic routing with automatic mTLS (mutual TLS) terminating edges.
*   **Memory / State Wiping:** Secure allocators will be used in the client code to immediately scrub sensitive keys from RAM the moment they are no longer in use, defeating cold-boot and memory-dump attacks.

---

### Architectural Flow Summary
1.  **Onboarding:** Admin approves user ID -> User registers device (FIDO2 Enclave generates keypair).
2.  **Handshake:** User A wants to talk to User B -> Fetches User B's public pre-keys from the Server -> Initializes X3DH handshake to derive a shared secret.
3.  **Messaging:** User A encrypts message with shared secret (Double Ratchet) -> Sends locked payload to Server (Rust + NATS) -> Server blindly routes payload to User B based on ephemeral UUIDs -> User B decrypts locally.
4.  **Tear Down:** Server instantly discards routing metadata according to admin-defined retention SLA.
