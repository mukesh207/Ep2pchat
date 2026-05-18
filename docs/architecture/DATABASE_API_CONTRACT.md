# Database & API Contract

**Version:** 2.0  
**Stack:** Axum (Rust), PostgreSQL 16 (SQLx), NATS JetStream, WebSocket

---

## 1. PostgreSQL Schema & Row-Level Security

All tables enforcing tenant isolation use PostgreSQL Row-Level Security (RLS). The Axum server sets the `app.current_org_id` context before executing queries.

### Core Tables

#### `organizations`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary Key |
| `domain` | VARCHAR | Unique tenant identifier |

#### `users`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary Key |
| `org_id` | UUID | RLS Foreign Key |
| `email` | VARCHAR | Unique per org |
| `role` | ENUM | 'ADMIN', 'MEMBER' |

#### `devices` (Public Keys)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary Key |
| `user_id` | UUID | Owner |
| `identity_key` | BYTEA | Ed25519 Public Key |
| `signed_pre_key` | BYTEA | X25519 Public Key |

#### `encrypted_messages`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary Key |
| `sender_device_id` | UUID | Origin |
| `receiver_device_id`| UUID | Destination |
| `payload` | BYTEA | ChaCha20-Poly1305 blob |
| `status` | ENUM | 'SENT', 'DELIVERED', 'READ' |

---

## 2. REST API Contract (Axum / Tokio)

Base URL: `/api/v1`
Authorization: `Bearer <JWT>`

### Auth (`/auth`)
*   `POST /auth/register/start` - Initiate WebAuthn registration.
*   `POST /auth/register/finish` - Validate WebAuthn signature and store credential.
*   `POST /auth/login/start` - Initiate WebAuthn login assertion.
*   `POST /auth/login/finish` - Validate assertion and return JWT.

### Key Management (`/keys`)
*   `POST /keys/upload` - Client uploads Identity Key, Signed Pre-Key, and OTPKs.
*   `GET /keys/bundle/:user_id` - Fetch target user's pre-keys for X3DH handshake.
*   `GET /keys/replenish-status` - Check if client needs to generate more OTPKs.

### Users & Directory (`/users`)
*   `GET /users/roster` - Returns list of users in the authenticated user's organization.
*   `GET /users/me` - Current user identity and active sessions.

### Admin (`/admin`) - Requires 'ADMIN' role
*   `POST /admin/invite` - Pre-register a new email to the organization.
*   `DELETE /admin/revoke-device/:device_id` - Terminate a specific hardware session.
*   `GET /admin/audit-logs` - Organization security logs.

---

## 3. WebSocket Real-Time Router

Endpoint: `wss://<host>/ws`
Auth: Token passed as query parameter `?token=<JWT>`

### Client-to-Server Payloads

```json
// Send Message
{
  "type": "chat_message",
  "receiver_id": "uuid",
  "payload": "<base64_encoded_chacha20_blob>",
  "ephemeral_ratchet_key": "<base64_public_key>"
}

// Read Receipt
{
  "type": "receipt",
  "message_id": "uuid",
  "status": "read"
}
```

### Server-to-Client Payloads

```json
// Incoming Message Delivery
{
  "type": "incoming_chat",
  "sender_id": "uuid",
  "message_id": "uuid",
  "payload": "<base64_encoded_chacha20_blob>",
  "timestamp": "ISO8601"
}

// Presence Update (via NATS)
{
  "type": "presence",
  "user_id": "uuid",
  "status": "online"
}
```

## 4. NATS JetStream Subjects

The backend distributes WebSocket events using NATS.

*   `user.<user_id>.messages` - Direct routing of encrypted payloads.
*   `org.<org_id>.presence` - Broadcast online/offline states within an organization.
*   `system.audit` - Global fire-and-forget logging.
