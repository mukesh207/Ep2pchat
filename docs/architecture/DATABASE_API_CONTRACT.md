# Trustline: Database Schema & API Contract

**Document Version:** 1.0
**Context:** This document outlines the backend PostgreSQL database schema with a focus on Row-Level Security (RLS) for tenant isolation, and the primary WebSocket/API contracts used to transfer encrypted payloads.

---

## 1. The PostgreSQL Database Schema

We are building a multi-tenant architecture. Every single table (except the core `organizations` table) must have an `org_id` and strict RLS policies attached. A bug in the Rust backend *must not* be able to accidentally leak data across organizations.

### A. Core Tables

```sql
-- 1. Organizations (The Tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(255) UNIQUE NOT NULL, -- e.g., 'acme.encryptedchat.in'
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Users (The Employees)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending_approval', -- 'pending_approval', 'active', 'suspended'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, email)
);

-- 3. Devices (The Cryptographic Identities)
-- A user can have multiple devices (e.g., iPhone, Laptop). Each device has its own keys.
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    
    -- Public Keys (Uploaded by the client, NEVER the private keys)
    identity_key_public BYTEA NOT NULL, 
    signed_pre_key_public BYTEA NOT NULL,
    signed_pre_key_signature BYTEA NOT NULL,
    
    is_active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- 4. One-Time Pre-Keys (Consumed during X3DH session establishment)
CREATE TABLE one_time_pre_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    key_id INT NOT NULL,
    public_key BYTEA NOT NULL
);

-- 5. Encrypted Messages (The Blind Router Payload)
-- The server CANNOT read 'ciphertext'. It only knows who sent it and where it's going.
CREATE TABLE encrypted_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    sender_device_id UUID REFERENCES devices(id),
    recipient_device_id UUID REFERENCES devices(id),
    
    -- The actual encrypted data (Encrypted with XChaCha20-Poly1305)
    ciphertext BYTEA NOT NULL, 
    
    -- Ephemeral routing metadata
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### B. Row-Level Security (RLS) - The Isolation Guarantee

RLS ensures that even if a developer writes `SELECT * FROM users`, the database itself intercepts the query and *only* returns users for the currently authenticated organization.

```sql
-- Enable RLS on all tenant data tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_messages ENABLE ROW LEVEL SECURITY;

-- The Rust backend will set the local context variable `app.current_org_id` 
-- when establishing the database connection pool for a specific request.
CREATE POLICY tenant_isolation_users ON users 
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_messages ON encrypted_messages 
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid);
```

---

## 2. The WebSocket Protocol Contract

Because this is a real-time chat application, the majority of the communication happens over a persistent, authenticated WebSocket connection (connected to the Tokio/Axum Rust backend).

All payloads are wrapped in a standard Envelope format.

### A. The Envelope

```json
{
  "type": "MESSAGE_SEND",
  "request_id": "req-1234abcd",
  "payload": { ... }
}
```

### B. Route: Requesting Keys to start a session (`KEYS_REQUEST`)
Alice wants to talk to Bob, so she asks the server for Bob's device's public keys.

**Client -> Server**
```json
{
  "type": "KEYS_REQUEST",
  "payload": {
    "target_user_id": "uuid-bob"
  }
}
```

**Server -> Client**
```json
{
  "type": "KEYS_RESPONSE",
  "payload": {
    "target_user_id": "uuid-bob",
    "devices": [
      {
        "device_id": "uuid-bobs-iphone",
        "identity_key": "base64_string...",
        "signed_pre_key": "base64_string...",
        "signed_pre_key_sig": "base64_string...",
        "one_time_pre_key": "base64_string..." // The server deletes this OPK after sending it
      }
    ]
  }
}
```

### C. Route: Sending an Encrypted Message (`MESSAGE_SEND`)
Alice has performed the X3DH math locally and encrypted her message. She hands the locked briefcase to the server.

**Client -> Server**
```json
{
  "type": "MESSAGE_SEND",
  "payload": {
    "recipient_device_id": "uuid-bobs-iphone",
    "ciphertext": "base64_encoded_xchacha20_blob",
    "ephemeral_public_key": "base64_string..." // Needed for Bob to calculate the shared secret
  }
}
```

### D. Route: Receiving a Message (`MESSAGE_RECEIVE`)
The server blindly routes the message to Bob's active WebSocket connection.

**Server -> Client (Bob)**
```json
{
  "type": "MESSAGE_RECEIVE",
  "payload": {
    "message_id": "uuid-msg-123",
    "sender_device_id": "uuid-alices-laptop",
    "ciphertext": "base64_encoded_xchacha20_blob",
    "ephemeral_public_key": "base64_string...",
    "timestamp": "2026-03-12T19:00:00Z"
  }
}
```

---

## 3. The Initial REST APIs (Outside the Socket)

For the HR Checkpoint / Onboarding flow, standard HTTPS REST endpoints are used before a permanent WebSocket is established.

*   `POST /api/v1/auth/request-access` - Generates the access code for IT approval.
*   `POST /api/v1/auth/register-passkey` - The WebAuthn ritual to register a new device to an approved User ID.
*   `GET /api/v1/admin/pending-users` - Fetches the queue of employees waiting for approval (Admin only).
