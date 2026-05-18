# 🛡️ Trustline: Cryptographic Threat Model

**Version:** 2.0  
**Updated:** May 2026

This document defines the threat model, attack vectors, and cryptographic mitigations for the Trustline E2EE platform.

---

## 1. System Assumptions

1.  **Zero-Trust Server:** The Axum backend, PostgreSQL database, and NATS broker are considered "untrusted." A full breach of the server infrastructure MUST NOT yield plaintext user messages.
2.  **Trusted Client Hardware:** The user's physical device (OS, RAM, Secure Enclave) is trusted during active use.
3.  **Modern Cryptanalysis:** Algorithms assume resistance against standard classical computing attacks up to 256-bit symmetric strength.

## 2. Threat Actors

*   **TA1: Compromised Infrastructure Admin:** A rogue sysadmin with full database/shell access to the production servers.
*   **TA2: Network Eavesdropper:** An attacker monitoring all transit traffic (ISP, public WiFi).
*   **TA3: Device Thief:** An attacker who steals the physical hardware of a user.
*   **TA4: Advanced Persistent Threat (APT):** An attacker capable of compromising long-term keys from memory.

---

## 3. Cryptographic Mitigations

### 3.1 Server Compromise (TA1)
**Attack:** TA1 dumps the `encrypted_messages` PostgreSQL table.
**Mitigation:** 
- The server only holds `payload` columns encrypted via `XChaCha20-Poly1305`.
- Keys are never transmitted to the server. The server acts strictly as a blind router.

### 3.2 Network Interception (TA2)
**Attack:** TA2 intercepts WebSocket traffic.
**Mitigation:**
- All traffic is wrapped in standard TLS 1.3 (via Traefik).
- Even if TLS is stripped, the inner payload is secured by the Double Ratchet algorithm, rendering intercepted packets useless without the client's current ephemeral keys.

### 3.3 Device Theft (TA3)
**Attack:** TA3 physically steals an unlocked laptop or extracts the SQLite database.
**Mitigation:**
- The local Tauri database uses `SQLCipher` (AES-256-GCM).
- The decryption key for the local DB is bound to OS-level secure storage (e.g., macOS Keychain, Windows Credential Manager).

### 3.4 Key Compromise & Forward Secrecy (TA4)
**Attack:** TA4 extracts a user's long-term Identity Key.
**Mitigation:**
- Trustline uses the **Double Ratchet Algorithm**.
- **Perfect Forward Secrecy (PFS):** Compromising a long-term key does not decrypt historical messages, as they were encrypted with ephemeral keys that have already been destroyed.
- **Post-Compromise Security (PCS):** Once the user sends a new message (ratcheting the Diffie-Hellman state), the keys self-heal, locking TA4 out of future messages.

---

## 4. Authentication Threats (Phishing)

**Attack:** Attackers use social engineering to trick a user into handing over a password.
**Mitigation:**
- Trustline does not use passwords.
- Authentication utilizes **WebAuthn / FIDO2**. Hardware tokens (YubiKey) or biometric enclaves cryptographically bind the credential to the physical origin domain (`https://app.trustline.in`). Phishing proxies are mathematically defeated.

## 5. Metadata Leakage

**Residual Risk:** While payloads are zero-knowledge, the server *must* route messages. Therefore, the server observes metadata: "Alice talked to Bob at 10:00 AM."
**Current Mitigation:** 
- Metadata retention is ephemeral. Delivered messages can be configured to hard-delete from PostgreSQL immediately upon client receipt acknowledgment.
- NATS queues are strictly in-memory or aggressively pruned.

---
*End of Threat Model*