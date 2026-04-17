# Software Requirements Specification (SRS)

**Product:** Trustline  
**Version:** 1.0  
**Platform:** Desktop Client (Linux, macOS, Windows) & Self-Hosted Linux Backend

---

## 1. Introduction

### 1.1 Purpose

Trustline is an enterprise collaboration platform designed to secure sensitive team communications. It ensures:

- True end-to-end encryption with perfect forward secrecy.
- Eradication of centralized database vulnerabilities via zero-knowledge architectures.
- High-performance localized operations to emulate traditional, non-secure SaaS chat speeds.

### 1.2 Tagline

> **"Enterprise-Grade E2EE Messaging — Zero-Knowledge by Design"**

---

## 2. Functional Requirements

### 2.1 Authentication & Registration (FR-001)

| ID       | Requirement                                                              |
| -------- | ------------------------------------------------------------------------ |
| FR-001.1 | Users must register exclusively using WebAuthn/FIDO2 standard Passkeys.  |
| FR-001.2 | The system shall support a waitlist that suspends users until admin approval. |
| FR-001.3 | Client software must natively generate a client-bound X25519 Identity Key. |
| FR-001.4 | Servers must validate auth challenges without receiving plaintext secrets. |

### 2.2 User Connectivity Interface (FR-002)

| ID       | Requirement                                                                 |
| -------- | --------------------------------------------------------------------------- |
| FR-002.1 | The platform shall display a tenant-aware roster of active employees.       |
| FR-002.2 | The platform shall display the online/offline connection state.             |
| FR-002.3 | Messages must support distinct Delivered and Read state transitions natively. |

### 2.3 End-to-End Cryptography Engine (FR-003)

| ID       | Requirement                                                                     |
| -------- | ------------------------------------------------------------------------------- |
| FR-003.1 | Implement the X3DH Key Agreement Protocol perfectly to commence chat sessions.  |
| FR-003.2 | Implement the Double Ratchet Algorithm to generate ephemeral keys per message.  |
| FR-003.3 | Automatically provision a set of One-Time Pre-Keys (OTPK) upon authentication.  |
| FR-003.4 | Encrypt all local device storage utilizing SQLite/SQLCipher (AES-GCM).          |

### 2.4 Active Device Management (FR-004)

| ID       | Requirement                                                                 |
| -------- | --------------------------------------------------------------------------- |
| FR-004.1 | Ensure that a cryptographic user Identity can be bound to multiple Devices. |
| FR-004.2 | Allow a user to review all currently bound physical hardware devices.       |
| FR-004.3 | Support instantaneous device-level revocation ("Kill Switch") by Admin/User.|

### 2.5 Central Blind Router (FR-005)

| ID       | Requirement                                                                 |
| -------- | --------------------------------------------------------------------------- |
| FR-005.1 | Route messages to targeted devices using only non-encrypted metadata tags.  |
| FR-005.2 | Safely queue and pause inbound delivery for currently offline users.        |
| FR-005.3 | Employ rigorous PostgreSQL Row-Level Security explicitly filtering tenants. |

---

## 3. Non-Functional Requirements

### 3.1 Performance Metrics

| ID      | Requirement                                                |
| ------- | ---------------------------------------------------------- |
| NFR-001 | Real-time WebSocket transmission routing must be < 500ms.  |
| NFR-002 | PostgreSQL / Axum infrastructure must support 10,000+ WS.  |
| NFR-003 | SQLite Full-Text Search locally must index offline in < 2s.|

### 3.2 Usability & Quality of Life

| ID      | Requirement                                                      |
| ------- | ---------------------------------------------------------------- |
| NFR-004 | Native UI framerates must maintain 60 FPS under cryptographic load. |
| NFR-005 | Strict Dark Mode and Light Mode synchronization via React.       |
| NFR-006 | Zero exposed developer jargon to the enterprise end-client.      |

### 3.3 Security & Zero-Trust Posture

| ID      | Requirement                                                               |
| ------- | ------------------------------------------------------------------------- |
| NFR-007 | Server API and database strictly operate as Zero-Knowledge elements.      |
| NFR-008 | Cross-tenant memory isolation enforced at the PostgreSQL process level.   |
| NFR-009 | Protection against hardware attacks matching FIDO2 best practices.        |

### 3.4 Runtime Compatibility

| ID      | Requirement                                                |
| ------- | ---------------------------------------------------------- |
| NFR-010 | React single-page UI strictly wrapped inside Tauri 2.0.    |
| NFR-011 | Compatible with macOS, Windows, and Linux window-managers. |

---

## 4. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Trustline Rust Client                     │
│  ┌──────────────┐  ┌───────────┐  ┌───────────────────────┐  │
│  │  React UI    │←→│ Tauri IPC │←→│  crypto_core (Rust)   │  │
│  │ (Typescript) │  │ Interface │  │ (X3DH / Ratchet)      │  │
│  └──────┬───────┘  └───────────┘  └───────────────────────┘  │
│         │                                                    │
└─────────┼────────────────────────────────────────────────────┘
          │ (WebSocket Transport)
┌─────────▼────────────────────────────────────────────────────┐
│                    Trustline Core Servers                    │
│  ┌────────────────┐  ┌─────────────┐  ┌───────────────────┐  │
│  │ Axum Router WS │  │ Admin / RLS │  │  Device Auth / WG │  │
│  └──────┬─────────┘  └─────────────┘  └───────────────────┘  │
│         │                                                    │
│  ┌──────▼─────────┐  ┌────────────────────────────────────┐  │
│  │ NATS JetStream │  │ Postgres 16 (RLS Secure Blobs)     │  │
│  └────────────────┘  └────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Data Storage Implementations

| Sub-System         | Persistence Mechanism                                  |
| ------------------ | ------------------------------------------------------ |
| Encrypted Blobs    | PostgreSQL 16 server-side.                             |
| Ephemeral Keys     | Client isolated OS Keyring (macOS Secure Enclave).     |
| Local App History  | SQLCipher (AES-GCM encryption on localized SQLite).    |
| Message Publishing | NATS server-side JetStream log cache.                  |

---

## 6. Constraints

- All server-side analytics are fundamentally prohibited by the Zero-Knowledge paradigm.
- Devices absent hardware-backed key support cannot successfully register identities.
- Native keyword searches are relegated specifically to the client's localized SQLite file. Central servers cannot query strings securely on encrypted BLOB data.
