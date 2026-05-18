# IEEE Formatting Diagrams & Workflows

**Version:** 2.0  
**Context:** Trustline Platform

This document describes the core workflows and sequence diagrams suitable for IEEE paper submissions.

## 1. Zero-Knowledge System Architecture

```mermaid
graph LR
    subgraph Local Device [User End-Device]
        UI[React UI] -->|IPC| Tauri[Tauri Rust Core]
        Tauri <-->|Crypto Ops| Libsodium[libsodium]
        Tauri <-->|Read/Write| SQLC[(SQLCipher Vault)]
    end

    subgraph Server Infrastructure [Untrusted Cloud]
        API[Axum API & WS Router]
        NATS[NATS Pub/Sub]
        PG[(PostgreSQL + RLS)]
        
        API <--> NATS
        API <--> PG
    end

    Tauri <-->|Encrypted Blob via WSS| API
```
*Figure 1: High-Level Architecture showing the separation of the trusted execution environment (local device) from the untrusted routing infrastructure (server).*

---

## 2. WebAuthn Passwordless Flow

```mermaid
sequenceDiagram
    participant User as User Authenticator (FIDO2)
    participant Client as Tauri Client
    participant Server as Axum Backend
    participant DB as PostgreSQL

    Client->>Server: POST /auth/login/start
    Server->>DB: Fetch user challenge config
    Server-->>Client: Return Challenge + Allowed Credentials
    Client->>User: Request biometric/hardware signature
    User-->>Client: Signed Assertion
    Client->>Server: POST /auth/login/finish (Signature)
    Server->>Server: Verify signature mathematically
    Server-->>Client: Issue short-lived JWT
```
*Figure 2: Authentication sequence demonstrating the absence of shared secrets (passwords) over the wire.*

---

## 3. X3DH Key Agreement & Message Routing

```mermaid
sequenceDiagram
    participant Alice as Alice's Device
    participant Server as Blind Router (Axum)
    participant Bob as Bob's Device

    Note over Alice, Bob: Session Initialization
    Alice->>Server: GET /keys/bundle/Bob
    Server-->>Alice: Bob's Identity Key + Signed Pre-Key + OTPK
    Alice->>Alice: Compute Shared Secret (X3DH)
    
    Note over Alice, Bob: Message Encryption (Double Ratchet)
    Alice->>Alice: Ratchet KDF -> Generate Ephemeral Message Key
    Alice->>Alice: Encrypt Payload (XChaCha20-Poly1305)
    
    Note over Alice, Server: Routing
    Alice->>Server: WSS: Send {receiver: Bob, blob: EncryptedPayload}
    Server->>Server: Store Blob in DB (RLS restricted)
    Server->>Server: Publish to NATS Subject user.Bob.messages
    
    Note over Server, Bob: Delivery
    Server->>Bob: WSS: Deliver Blob
    Bob->>Bob: Step Ratchet Forward
    Bob->>Bob: Decrypt Payload
    Bob->>Bob: Store in SQLCipher
```
*Figure 3: Sequence diagram detailing the integration of X3DH for session establishment and the Double Ratchet for forward-secret message delivery via an untrusted router.*
