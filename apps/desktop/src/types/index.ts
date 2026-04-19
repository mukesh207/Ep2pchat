// ── Trustline Shared Type Definitions ──────────────────────────────────────
// Central type definitions shared across the desktop frontend.

// ── Domain Models ──────────────────────────────────────────────────────────

export enum WsMessageType {
  MESSAGE_SEND = "MESSAGE_SEND",
  MESSAGE_RECEIVE = "MESSAGE_RECEIVE",
  MESSAGE_ACK = "MESSAGE_ACK",
  MESSAGE_READ = "MESSAGE_READ",
  MESSAGE_STATUS = "MESSAGE_STATUS",
  MESSAGE_CONFIRM = "MESSAGE_CONFIRM",
  TYPING_EVENT = "TYPING_EVENT",
  KEYS_REQUEST = "KEYS_REQUEST",
  KEYS_RESPONSE = "KEYS_RESPONSE",
  DEVICE_REVOKED = "DEVICE_REVOKED",
  ERROR = "ERROR",
}

export interface Contact {
  id: string;
  email: string;
  username?: string;
  status?: "pending_approval" | "active" | "suspended" | "revoked";
  device_count?: number;
  devices?: DeviceBundle[];
}

export interface DeviceBundle {
  device_id: string;
  identity_key: string;
  signed_pre_key: string;
  signed_pre_key_signature: string;
  one_time_pre_key: string | null;
}

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  is_me: boolean;
  status?: "sending" | "sent" | "delivered" | "read" | "received";
}

export type RootView = "AUTH" | "CHAT" | "ADMIN";

export interface SessionState {
  userId: string;
  orgId: string;
  isAdmin: boolean;
}

// ── Crypto & Key Types ─────────────────────────────────────────────────────

export interface KeyBundle {
  identity_public: string;
  identity_secret: string;
  signed_pre_key_public: string;
  signed_pre_key_secret: string;
  signed_pre_key_signature: string;
  one_time_pre_keys: OneTimeKey[];
}

export interface OneTimeKey {
  key_id: number;
  public_key: string;
  secret_key: string;
}

export interface KeyUploadPayload {
  user_id: string;
  org_id: string;
  device_name: string;
  identity_key: string;
  signed_pre_key: string;
  signed_pre_key_sig: string;
  one_time_pre_keys: { key_id: number; public_key: string }[];
}

export interface LocalKeys {
  id?: number;
  identity_public: string;
  identity_secret: string;
  signed_pre_key_public: string;
  signed_pre_key_secret: string;
  signed_pre_key_signature: string;
  is_active?: boolean;
}

// ── WebSocket Types ────────────────────────────────────────────────────────

export interface WsIncomingMessage {
  type: string;
  payload: Record<string, unknown>;
}

// ── Vault Types ────────────────────────────────────────────────────────────

export interface VaultMessage {
  id: string;
  temp_id?: string;
  conversation_id?: string;
  sender_id: string;
  recipient_id?: string;
  content: string;
  timestamp: string;
  is_me: boolean;
  message_status: string;
}

// ── API Response Types ─────────────────────────────────────────────────────

export interface UsersResponse {
  users: Contact[];
}

export interface DevicesResponse {
  devices: Array<{
    id: string;
    device_name?: string;
    is_active: boolean;
    created_at?: string;
  }>;
}

export interface PendingUsersResponse {
  users: Array<{
    id: string;
    email: string;
    access_code?: string;
    created_at?: string;
  }>;
}

export interface AuditLogsResponse {
  logs: Array<{
    id: string;
    action: string;
    actor_email?: string;
    target_email?: string;
    details?: string;
    created_at: string;
  }>;
  total?: number;
  page?: number;
}
