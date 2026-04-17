# Feature Requirements Document (FRD)

**Product:** Trustline  
**Version:** 1.0  
**Platform:** Desktop (macOS, Windows, Linux)  

---

## Tagline

> **"Enterprise-Grade E2EE Messaging — Zero-Knowledge by Design"**
>
> Uncompromising organizational security built on a client-side Zero-Knowledge architecture.

---

## Feature Overview

```
┌────────────────────────────────────────────────────────┐
│                      Trustline                         │
├────────────────────────────────────────────────────────┤
│  AUTHENTICATE   │  MESSAGING     │  MANAGEMENT         │
│  ────────────   │  ─────────     │  ──────────         │
│  Passkeys Login │  E2EE Chat     │  Active Roster      │
│  Zero-Knowledge │  Offline Sync  │  Kill Switch        │
│  Auth Gateways  │  Local Search  │  Admin RLS Gate     │
└────────────────────────────────────────────────────────┘
```

---

## 1. Authentication & Onboarding (AUTHENTICATE)

### 1.1 Passwordless Verification

- Complete bypass of traditional server-hosted passwords 
- Hardware-backed WebAuthn/FIDO2 credentials seamlessly bound to local TPM/Enclave
- Instant "Waitlist" validation routing for enterprise administrators to accept users

### 1.2 Zero-Knowledge Provisioning

| Action                     | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| Native Identity Generation | Client automatically provisions an `X25519` Identity Key.                 |
| Silent Registration        | The client registers only public payloads to Trustline Relay nodes.       |
| Hardware Anchoring         | Prevents lateral account theft even if the central database is extracted. |

---

## 2. Secure Messaging & Vault (MESSAGING)

### 2.1 E2EE Collaborative Channels

- Standard 1-on-1 enterprise messaging capabilities
- Native Double Ratchet processing algorithm for continuous forward secrecy
- Real-time read receipts, delivery indicators, and ephemeral typing visualizers 

### 2.2 Blind Routing Engine

| Action                 | How                                                                          |
| ---------------------- | ---------------------------------------------------------------------------- |
| Offline Message Sync   | Server securely queues messages if a hardware endpoint is offline (encrypted).|
| Zero-Knowledge Payload | Payload contents are completely opaque to the relay network.                 |
| RLS Segregation        | Messages belong solely to one PostgreSQL tenant context.                     |

### 2.3 On-Device Encrypted Vault 

- Messages are preserved inside an encrypted localized SQLite database via Tauri 
- Integrated SQL Cipher + AES-GCM columnar encryption 
- Rapid offline sub-second search querying completely independent from centralized endpoints

---

## 3. Organization & Management (MANAGEMENT)

### 3.1 Device Management & Kill Switch

| Action               | Experience                                                           |
| -------------------- | -------------------------------------------------------------------- |
| Decentralized Access | Users can link new enterprise laptops/phones natively.               |
| Emergency Revocation | Revoke compromised devices through a direct single-click interface.  |
| Administrator Gate   | Admins can remotely purge untrusted devices and block new additions. |

### 3.2 Tenant Roster Control 

- Consolidated view of all verified active cryptographic staff within the user's Enterprise partition 
- Strict waitlist authorization pipeline to gate unregistered users

---

## 4. UI Screens

| Screen             | Purpose                                                     |
| ------------------ | ----------------------------------------------------------- |
| Authentication UI  | Waitlist access gateway, local passkey interactions         |
| Main Dashboard     | Active chat selection, active roster listing, tenant search |
| Messaging Context  | Active E2EE thread, input field, contextual indicators      |
| Settings & Audit   | Device linkages, active sessions, kill switch executions    |
| Admin Dashboard    | Global waitlist accept/reject controls                      |

---

## 5. Protocols & Systems Used

| Feature                | Protocol Context                          |
| ---------------------- | ----------------------------------------- |
| Key Exchange           | `X3DH` Extruded Key Framework             |
| Cipher Construction    | `ChaCha20-Poly1305` Authenticated Ciphers |
| Enterprise Segregation | `PostgreSQL Row-Level Security` (RLS)     |
| Real-Time Subsystem    | `NATS JetStream` / `WebSockets`           |

---

## 6. Permissions Required

| Permission              | Why                                                            |
| ----------------------- | -------------------------------------------------------------- |
| Secure OS Enclave Access| Required for passkey biometrics / key safeguarding.            |
| Persistent File Store   | Authorized app storage needed for the encrypted SQLite Vault.  |
| Outbound Network Bound  | Secure connections required over WSS for JetStream topologies. |
