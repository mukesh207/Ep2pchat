# Trustline: The Master Technical & Ideological Encyclopedia
**Version 1.0 — Enterprise-Grade Zero-Knowledge Infrastructure**

---

## 1. Executive Summary & Ideology

Trustline is not merely a chat application; it is a high-assurance cryptographic protocol wrapped in a tactical enterprise interface. It is built for organizations that operate under the assumption that their infrastructure is compromised, their service providers are untrusted, and their communications are targeted by sophisticated adversaries.

### 1.1 The "Never Trust, Always Verify" Philosophy
Trustline operates on a strict **Zero-Trust Architecture (ZTA)**. In this model, the network perimeter is non-existent. Security is anchored in the device hardware and the cryptographic handshake between endpoints.

*   **Absolute Digital Sovereignty:** The organization retains 100% control over the keys. Trustline's developers or server operators cannot read messages even under subpoena or physical server seizure.
*   **Shift-Left Security:** Security is not an "add-on" at the end of development. It is the primary engineering constraint. Every feature is designed starting with its threat model.
*   **Attacker Stories:** We do not just build for users; we build against attackers. "As a malicious database admin, I should not be able to identify which users are speaking to each other."

### 1.2 The Zero-Knowledge Mandate
1.  **Blind Routing:** The backend routes encrypted "Blobs." It knows the recipient's UUID but not the content, the sender's identity key, or the ratchet header.
2.  **Ephemeral Metadata:** Routing logs are shredded according to strict administrative retention policies (SLA). Metadata is minimized to prevent behavioral profiling.
3.  **Memory Safety:** By using Rust for the entire backend and cryptographic core, we eliminate 70% of high-severity vulnerabilities commonly found in C/C++ communications software.

---

## 2. Global Architecture

Trustline is a 3-tier system separated by immutable cryptographic barriers.

### Tier 1: The Tactical Workspace (Client)
A native desktop application built with **Tauri v2** and **React 19**.
*   **Role:** Handles the UI, local message persistence, and user interactions.
*   **Security Boundary:** The React UI runs in a standard Webview. It is restricted from accessing private keys directly. It communicates with the "Cryptographic Barrier" (Rust core) via strictly typed IPC (Inter-Process Communication) calls.
*   **Storage:** Uses **SQLCipher** for AES-256-GCM encrypted local storage. Includes **FTS5 Full-Text Search** for zero-knowledge searching.

### Tier 2: The Cryptographic Core (Shared Library)
A pure Rust library (`crypto_core`) that governs the laws of physics for the platform.
*   **Handshake:** Implements **X3DH** (Extended Triple Diffie-Hellman) for initial key agreement.
*   **Conversation:** Implements the **Double Ratchet** for per-message encryption.
*   **Primitives:** Powered by **libsodium** (`sodiumoxide`) for X25519 (Key Exchange), Ed25519 (Signatures), and ChaCha20-Poly1305 (Symmetric Encryption).

### Tier 3: The Blind Relay (Backend)
A hyper-scalable, stateless routing engine.
*   **Engine:** Rust (**Axum** + **Tokio**).
*   **Broker:** **NATS JetStream** for distributed, cross-node message routing.
*   **Database:** **PostgreSQL 16** with **Row-Level Security (RLS)** to guarantee tenant isolation.

---

## 3. Cryptographic Deep Dive

### 3.1 X3DH (Initial Key Agreement)
When Alice wants to message Bob, she fetches his "Public Bundle" from the server. This bundle contains his Identity Key (IK), Signed Pre-Key (SPK), and a One-Time Pre-Key (OPK).

**The Calculation Sequence:**
1.  `DH1 = DH(IK_A, SPK_B)`
2.  `DH2 = DH(EK_A, IK_B)`
3.  `DH3 = DH(EK_A, SPK_B)`
4.  `DH4 = DH(EK_A, OPK_B)`
5.  `SK = HKDF-SHA256(DH1 || DH2 || DH3 || DH4)`

*   **Salt:** 32 zero-bytes.
*   **Info String:** `TrustlineX3DH_v1`.
*   **Result:** A 32-byte Master Secret used to initialize the Double Ratchet.

### 3.2 The Double Ratchet
Once the Master Secret is derived, the session enters the Double Ratchet state.

*   **DH Ratchet:** Alice generates a new ephemeral X25519 key for every response. When Bob receives it, he performs a DH calculation and advances the "Root Key."
*   **Symmetric Ratchet:** For every message sent in a single "turn," the "Chain Key" is hashed using HKDF to produce a unique Message Key.
*   **Forward Secrecy:** Once a Message Key is used, it is deleted from memory. Past messages cannot be decrypted even if future keys are leaked.
*   **Post-Compromise Security:** Because each "turn" involves a fresh DH exchange, the session "self-heals" security automatically.

### 3.3 Message Envelope Structure
Every message sent over the wire contains:
```json
{
  "ciphertext": "base64_encoded_payload",
  "header": {
    "dh_public": "Alice's current ratchet public key",
    "prev_counter": "Number of messages in previous chain",
    "msg_counter": "Sequence number in current chain"
  }
}
```

---

## 4. Backend Engineering & Data Sovereignty

### 4.1 Tenant Isolation (RLS)
PostgreSQL Row-Level Security ensures that even a global administrator cannot accidentally (or maliciously) query data across organizations.

**Implementation:**
1.  **Enable RLS:** `ALTER TABLE users ENABLE ROW LEVEL SECURITY;`
2.  **Define Policy:** 
    ```sql
    CREATE POLICY tenant_isolation ON users
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid);
    ```
3.  **Application Logic:** The Rust backend establishes a connection and immediately executes:
    `SET LOCAL app.current_org_id = 'uuid-here';`
    This context is scoped to the transaction, making cross-tenant leakage impossible.

### 4.2 Distributed Routing Topology
Trustline nodes are stateless. They use NATS JetStream as the source of truth for message routing.
*   **Subject:** `routing.<device_id>`
*   **Flow:** If `Instance A` receives a message for `Device B` (connected to `Instance B`), it publishes the message to the NATS subject. `Instance B` is subscribed to that subject and pushes the message down the WebSocket to the client.

---

## 5. Client-Side Security & The "Barrier"

### 5.1 The IPC Security Model
The V8 JavaScript engine is prone to various side-channel attacks and memory-scraping vulnerabilities. To mitigate this, Trustline uses a "Cryptographic Barrier."
*   **Rust Core:** Handles all private keys and mathematical operations.
*   **TypeScript UI:** Only handles the rendering of text and the dispatching of encrypted blobs.
*   **Zero-Heap Leakage:** Private keys never enter the JavaScript heap. They are held in memory by Rust and scrubbed (`Zeroize`) the moment they are no longer needed.

### 5.2 Local Vault Persistence (SQLCipher)
The local database on the user's computer is encrypted with a key derived from the user's hardware-bound passkey.
*   **Column Encryption:** Sensitive fields like the X3DH identity secret are doubly encrypted with a unique salt before being stored in the database.
*   **FTS5 Search:** Trustline uses SQLite's Full-Text Search 5. Triggers automatically index decrypted messages locally, allowing the user to search their chat history instantly without the server ever knowing what they are searching for.

---

## 6. Authentication: The FIDO2/Passkey Lifecycle

Trustline is 100% passwordless.

1.  **Request Access:** User submits their corporate email.
2.  **Admin Approval:** A human admin verifies the employee and sets their status to `active` in the RLS-protected database.
3.  **Passkey Registration:** The client triggers a WebAuthn ceremony. The device (TPM/Secure Enclave) creates a hardware-bound credential.
4.  **Identity Binding:** The device generates X25519 identity keys and uploads the public portion. The private portion is locked behind the hardware passkey.
5.  **Session:** Successful WebAuthn assertion issues a short-lived (24h) JWT.

---

## 7. Operational & Development Standards

### 7.1 SecDevOps Workflow
*   **100% Test Coverage:** Mandatory for all modules in `crates/crypto_core`.
*   **Audit-Driven CI:** Every Pull Request triggers:
    *   `cargo audit` (Dependency vulnerability check)
    *   `cargo clippy` (Static code analysis)
    *   `cargo test` (Unit/Integration tests)
    *   `npm run e2e` (Playwright protocol validation)

### 7.2 Deployment Strategy
*   **Infrastructure:** Orchestrated via Docker Compose with **Traefik** for automatic TLS (mTLS in cluster).
*   **NATS Persistence:** JetStream is configured with file-based persistence and 3x replication for high availability.
*   **Database:** PostgreSQL 16 with automated WAL-G backups to encrypted S3 buckets.

---

## 8. Threat Model & Mitigations

| Threat | Mitigation |
| :--- | :--- |
| **Server Compromise** | Zero-Knowledge architecture. Attacker gets only encrypted blobs. |
| **Credential Stuffing** | FIDO2/Passkeys. There are no passwords to steal. |
| **Lateral Movement** | PostgreSQL RLS + Multi-tenant network isolation. |
| **Device Theft** | Private keys are hardware-locked; Remote Revocation (Kill Switch). |
| **Future Key Leak** | Forward Secrecy via Double Ratchet protects past history. |

---
**Trustline: Secure Communication for the Modern Enterprise.**
*Built with Rust, Tauri, and uncompromised privacy.*
