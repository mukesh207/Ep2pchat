# Trustline: Technical Architecture & Cyber Security Blueprint

**Document Version:** 2.0
**Status:** IMPLEMENTED
**Date:** May 2026

This document outlines the state-of-the-art technological stack and architectural design that powers Trustline. The focus is absolute zero-trust, memory safety, hyper-scalability, and uncompromised cryptographic integrity.

---

## 1. System Overview

Trustline is an enterprise communications platform operating as a **Zero-Knowledge Blind Router**. The server infrastructure facilitates communication, manages authentication, and queues offline messages, but it is cryptographically incapable of reading message payloads. All cryptographic operations occur exclusively on the end-user's device within a secure Rust environment.

## 2. Core Infrastructure (Backend Engine)

The backend prioritizes high-concurrency routing, strict database isolation, and memory safety.

*   **Routing Engine & API:** **Rust (Axum + Tokio)**
    *   *Implementation:* Rust guarantees memory safety, eliminating buffer overflow risks. Axum serves REST APIs (auth, keys, admin) and a high-performance WebSocket router for real-time messaging. Tokio efficiently handles thousands of concurrent WebSocket connections across worker threads.
*   **Message Broker:** **NATS JetStream**
    *   *Implementation:* Used for distributed pub/sub. When a user sends a message, it is published to NATS, which routes it across clustered backend nodes to the recipient's active WebSocket connection, or queues it if the recipient is offline.
*   **Database (State & Metadata):** **PostgreSQL 16**
    *   *Implementation:* Employs **Row-Level Security (RLS)** extensively. Every API request executes within the context of the user's Organization ID. RLS strictly prevents any cross-tenant data leakage at the Postgres engine level.
*   **Database Access:** **SQLx**
    *   *Implementation:* Provides compile-time checked SQL queries, ensuring schema mismatches are caught during the build process.

## 3. Cryptographic Layer (The "Locked Briefcases")

Trustline avoids rolling custom crypto, relying exclusively on heavily audited industry standards implemented in the `crypto_core` Rust library.

*   **1-to-1 Encryption:** **Signal Protocol (X3DH + Double Ratchet)**
    *   *Implementation:* 
        *   **X3DH (Extended Triple Diffie-Hellman):** Establishes a shared secret between two users asynchronously.
        *   **Double Ratchet Algorithm:** Derives unique, ephemeral keys for every single message. Provides Perfect Forward Secrecy (PFS) and Post-Compromise Security (self-healing after a key leak).
*   **Cryptographic Primitives:** **libsodium (sodiumoxide)**
    *   *Implementation:* X25519 (Key Exchange), Ed25519 (Signatures), and XChaCha20-Poly1305 (Symmetric Encryption).
*   **Pre-Key Management:** The backend stores signed One-Time Pre-Keys (OTPKs). The client automatically replenishes these via the backend API when stocks run low.

## 4. Authentication (Passwordless Identity)

Trustline eliminates passwords completely to mitigate phishing and brute-force attacks.

*   **Primary Auth:** **WebAuthn / FIDO2**
    *   *Implementation:* Uses the `webauthn-rs` crate. Users authenticate using hardware authenticators (YubiKey, Apple TouchID, Windows Hello).
*   **Session Management:** **JWT (JSON Web Tokens)**
    *   *Implementation:* Short-lived JWTs authorize API and WebSocket connections. Tokens contain the Organization ID to dynamically scope database queries via RLS.

## 5. Client Application (Desktop Workspace)

*   **Application Framework:** **Tauri v2 + React 19**
    *   *Implementation:* Tauri bundles a fast web frontend (React, Vite, Tailwind CSS 4) with a lightweight Rust backend operating natively on the desktop.
*   **Inter-Process Communication (IPC):** 
    *   *Implementation:* The React UI never handles private keys. It issues commands to the Tauri Rust process via IPC. The local Rust process handles all encryption/decryption and interacts with the OS secure enclave.
*   **Local Storage:** **SQLCipher**
    *   *Implementation:* Chat history is stored locally in an AES-256 encrypted SQLite database, allowing full-text search (FTS5) locally without sending plaintext to the cloud.

## 6. Security Posture & Memory Safety

*   **Zero-Knowledge Storage:** The server database only stores `encrypted_payload` (byte arrays).
*   **Tenant Isolation:** Enforced by PostgreSQL RLS. A compromised backend API endpoint cannot fetch rows belonging to another organization.
*   **Memory Scrubbing:** The `crypto_core` ensures cryptographic keys are dropped from RAM immediately after the symmetric ratchet step completes.

## 7. High-Level Data Flow

1. **Onboarding:** Admin creates a user. User registers via WebAuthn, generating an Identity Keypair. The Public Key is sent to the server.
2. **Session Start (X3DH):** Alice wants to message Bob. Alice requests Bob's Identity Key and an OTPK from the Axum server. Alice computes the shared secret locally.
3. **Messaging (Ratchet):** Alice encrypts the text. The payload is sent via WebSocket to Axum.
4. **Routing:** Axum publishes the blob to NATS. NATS delivers it to Bob's WebSocket.
5. **Decryption:** Bob's Tauri client receives the blob, steps the Double Ratchet forward, decrypts the message, and stores it in local SQLCipher.
