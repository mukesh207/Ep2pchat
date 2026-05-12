use crate::auth::Claims;
use crate::AppState;
use ax_ws::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::{IntoResponse, Response},
};
use axum as ax_ws;
use axum::http::{header, HeaderMap, StatusCode};
use base64::Engine;
use dashmap::DashMap;
use futures_util::{sink::SinkExt, stream::StreamExt};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

// ── Connection Registry (Lock-Free) ─────────────────────────────────────────

pub struct ActiveConnection {
    pub tx: tokio::sync::mpsc::UnboundedSender<Message>,
    pub user_id: Uuid,
    pub org_id: Uuid,
}

/// Lock-free concurrent connection registry using DashMap.
/// Eliminates RwLock contention under high concurrency.
pub type ConnectionRegistry = Arc<DashMap<Uuid, ActiveConnection>>;

#[derive(Clone)]
pub struct WsState {
    pub connections: ConnectionRegistry,
}

impl WsState {
    pub fn new() -> Self {
        Self { connections: Arc::new(DashMap::new()) }
    }
}

// ── Protocol Envelope ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct WsQuery {
    pub device_id: Option<Uuid>,
}

const WS_PROTOCOL_V1: &str = "trustline.v1";
const WS_AUTH_PROTOCOL_PREFIX: &str = "auth.jwt.";

fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn extract_token_from_subprotocol(headers: &HeaderMap) -> Option<String> {
    let protocols = headers.get(header::SEC_WEBSOCKET_PROTOCOL)?.to_str().ok()?;

    for item in protocols.split(',').map(str::trim) {
        let Some(encoded) = item.strip_prefix(WS_AUTH_PROTOCOL_PREFIX) else {
            continue;
        };
        let Ok(raw_token) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(encoded) else {
            continue;
        };
        let Ok(token) = String::from_utf8(raw_token) else {
            continue;
        };
        if !token.trim().is_empty() {
            return Some(token);
        }
    }
    None
}

fn has_ws_protocol(headers: &HeaderMap, protocol: &str) -> bool {
    headers
        .get(header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(',').map(str::trim).any(|item| item == protocol))
        .unwrap_or(false)
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum WsEnvelope {
    #[serde(rename = "KEYS_REQUEST")]
    KeysRequest { target_user_id: Uuid },
    #[serde(rename = "MESSAGE_SEND")]
    MessageSend {
        temp_id: Option<String>,
        recipient_device_id: Uuid,
        ciphertext: String, // base64
        /// Only present on the first (X3DH handshake) message; None for all
        /// subsequent ratchet messages.
        ephemeral_public_key: Option<String>, // base64
        /// Double Ratchet header — carries dh_public / prev_counter / msg_counter.
        header: serde_json::Value,
    },
    #[serde(rename = "MESSAGE_ACK")]
    MessageAck { message_id: Uuid },
    #[serde(rename = "MESSAGE_READ")]
    MessageRead { message_id: Uuid },
    #[serde(rename = "TYPING_EVENT")]
    TypingEvent { recipient_device_id: Uuid, is_typing: bool },
    #[serde(rename = "STORY_KEY_SHARE")]
    StoryKeyShare {
        recipient_device_id: Uuid,
        ciphertext: String,
        header: serde_json::Value,
    },
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum RoutedEvent {
    Message {
        sender_device_id: Uuid,
        sender_user_id: Uuid,
        sender_identity_key: String,
        ciphertext: String,
        ephemeral_public_key: Option<String>,
        header: serde_json::Value,
        message_id: Uuid,
        timestamp: chrono::DateTime<chrono::Utc>,
    },
    MessageStatus {
        message_id: Uuid,
        status: String,
        user_id: Uuid,
    },
    Typing {
        sender_user_id: Uuid,
        is_typing: bool,
    },
    DeviceRevoked {
        device_id: Uuid,
    },
    StoryKeyShare {
        sender_user_id: Uuid,
        ciphertext: String,
        header: serde_json::Value,
    },
}

// ── WebSocket Upgrade Handler ───────────────────────────────────────────────

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    let token = extract_bearer_token(&headers).or_else(|| extract_token_from_subprotocol(&headers));
    let Some(token) = token else {
        return (StatusCode::UNAUTHORIZED, "Missing authentication token").into_response();
    };

    let token_data = match decode::<Claims>(
        &token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    ) {
        Ok(data) => data,
        Err(_) => return (StatusCode::UNAUTHORIZED, "Invalid or expired token").into_response(),
    };

    // Session Revocation Check: Ensure JTI exists in database
    let session_check = sqlx::query("SELECT 1 FROM sessions WHERE jti = $1")
        .bind(token_data.claims.jti)
        .fetch_optional(&state.db)
        .await;

    if let Ok(None) | Err(_) = session_check {
        return (StatusCode::UNAUTHORIZED, "Session has been revoked or logged out").into_response();
    }

    let Some(device_id) = query.device_id else {
        return (StatusCode::BAD_REQUEST, "device_id is required").into_response();
    };

    let device_check = sqlx::query(
        "SELECT 1 FROM devices WHERE id = $1 AND user_id = $2 AND org_id = $3 AND is_active = TRUE",
    )
    .bind(device_id)
    .bind(token_data.claims.sub)
    .bind(token_data.claims.org_id)
    .fetch_optional(&state.db)
    .await;

    let Ok(Some(_)) = device_check else {
        return (StatusCode::UNAUTHORIZED, "Device is not active for this session").into_response();
    };

    let ws =
        if has_ws_protocol(&headers, WS_PROTOCOL_V1) { ws.protocols([WS_PROTOCOL_V1]) } else { ws };

    ws.on_upgrade(move |socket| handle_socket(socket, state, device_id, token_data.claims))
}

// ── Core Socket Handler ─────────────────────────────────────────────────────

async fn broadcast_presence(state: &AppState, org_id: Uuid, user_id: Uuid, status: &str) {
    let subject = format!("presence.org.{}", org_id);
    let event = json!({
        "type": "PRESENCE_UPDATE",
        "payload": { "user_id": user_id, "status": status }
    });
    if let Ok(payload_bytes) = serde_json::to_vec(&event) {
        state.nats.publish(subject, payload_bytes).await;
    }

    let status_string = status.to_string();
    let _ = crate::db::with_rls_context(&state.db, org_id, move |tx| Box::pin(async move {
        sqlx::query("UPDATE users SET presence_status = $1 WHERE id = $2 AND org_id = $3")
            .bind(status_string)
            .bind(user_id)
            .bind(org_id)
            .execute(&mut *tx)
            .await
    })).await;
}

async fn handle_socket(socket: WebSocket, state: AppState, device_id: Uuid, claims: Claims) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

    let user_id = claims.sub;
    let org_id = claims.org_id;

    // Register this device in the lock-free DashMap
    state.ws.connections.insert(device_id, ActiveConnection { tx: tx.clone(), user_id, org_id });

    tracing::info!(
        device_id = %device_id,
        user_id = %user_id,
        "WebSocket connected"
    );

    // Broadcast online presence
    broadcast_presence(&state, org_id, user_id, "online").await;

    // ── Offline Message Delivery ─────────────────────────────────────────
    // Flush any messages persisted while this device was offline.
    // NOTE: Do NOT mark as delivered here - wait for client MESSAGE_ACK after successful decrypt.
    let pending = crate::db::with_rls_context(&state.db, org_id, |tx| Box::pin(async move {
        sqlx::query(
            "SELECT em.id, em.sender_device_id, d.user_id AS sender_user_id, em.ciphertext,
                    em.sender_identity_key, em.ephemeral_public_key, em.ratchet_header, em.created_at
             FROM encrypted_messages em
             JOIN devices d ON d.id = em.sender_device_id
             WHERE recipient_device_id = $1 AND delivered_at IS NULL
             ORDER BY em.created_at ASC"
        )
        .bind(device_id)
        .fetch_all(&mut *tx)
        .await
    })).await.unwrap_or_default();

    for row in &pending {
        let msg_id: Uuid = row.get("id");
        let sender_did: Uuid = row.get("sender_device_id");
        let sender_uid: Uuid = row.get("sender_user_id");
        let ct: Vec<u8> = row.get("ciphertext");
        let sender_ik: String = row.get("sender_identity_key");
        let ephemeral_pk: Option<String> = row.get("ephemeral_public_key");
        let ratchet_hdr: Option<serde_json::Value> = row.get("ratchet_header");
        let ts: chrono::DateTime<chrono::Utc> = row.get("created_at");

        let ws_msg = json!({
            "type": "MESSAGE_RECEIVE",
            "payload": {
                "message_id": msg_id,
                "sender_device_id": sender_did,
                "sender_user_id": sender_uid,
                "sender_identity_key": sender_ik,
                "ciphertext": base64::engine::general_purpose::STANDARD.encode(&ct),
                "ephemeral_public_key": ephemeral_pk,
                "header": ratchet_hdr,
                "timestamp": ts,
            }
        });
        if tx.send(Message::Text(ws_msg.to_string().into())).is_err() {
            break;
        }
        // Do NOT mark delivered here - wait for client MESSAGE_ACK
    }

    // ── NATS Subscriber ─────────────────────────────────────────────────

    // Subscribe to messages routed to THIS device from any backend instance.
    let nats_subject = format!("routing.{}", device_id);
    // Forward NATS messages to the local WebSocket sender channel when NATS is available.
    let nats_tx = tx.clone();
    let nats_task = if let Some(mut nats_sub) = state.nats.subscribe(nats_subject.clone()).await {
        tokio::spawn(async move {
            while let Some(msg) = nats_sub.next().await {
                if let Ok(payload_str) = std::str::from_utf8(&msg.payload) {
                    if let Ok(event) = serde_json::from_str::<RoutedEvent>(payload_str) {
                        let ws_msg = match event {
                            RoutedEvent::Message {
                                sender_device_id,
                                sender_user_id,
                                sender_identity_key,
                                ciphertext,
                                ephemeral_public_key,
                                header,
                                message_id,
                                timestamp,
                            } => json!({
                                "type": "MESSAGE_RECEIVE",
                                "payload": {
                                    "message_id": message_id,
                                    "sender_device_id": sender_device_id,
                                    "sender_user_id": sender_user_id,
                                    "sender_identity_key": sender_identity_key,
                                    "ciphertext": ciphertext,
                                    "ephemeral_public_key": ephemeral_public_key,
                                    "header": header,
                                    "timestamp": timestamp,
                                }
                            }),
                            RoutedEvent::MessageStatus { message_id, status, user_id } => json!({
                                "type": "MESSAGE_STATUS",
                                "payload": { "message_id": message_id, "status": status, "user_id": user_id }
                            }),
                            RoutedEvent::Typing { sender_user_id, is_typing } => json!({
                                "type": "TYPING_EVENT",
                                "payload": { "sender_user_id": sender_user_id, "is_typing": is_typing }
                            }),
                            RoutedEvent::DeviceRevoked { device_id } => json!({
                                "type": "DEVICE_REVOKED",
                                "payload": { "device_id": device_id }
                            }),
                            RoutedEvent::StoryKeyShare { sender_user_id, ciphertext, header } => json!({
                                "type": "STORY_KEY_SHARE",
                                "payload": {
                                    "sender_user_id": sender_user_id,
                                    "ciphertext": ciphertext,
                                    "header": header
                                }
                            }),
                        };
                        if nats_tx.send(Message::Text(ws_msg.to_string().into())).is_err() {
                            break;
                        }
                    }
                }
            }
        })
    } else {
        tracing::warn!("NATS unavailable, cross-node routing disabled for {}", nats_subject);
        tokio::spawn(async {})
    };

    // ── Presence Subscriber ─────────────────────────────────────────────
    let presence_subject = format!("presence.org.{}", org_id);
    let presence_tx = tx.clone();
    let presence_task = if let Some(mut presence_sub) = state.nats.subscribe(presence_subject).await {
        tokio::spawn(async move {
            while let Some(msg) = presence_sub.next().await {
                if let Ok(payload_str) = std::str::from_utf8(&msg.payload) {
                    if presence_tx.send(Message::Text(payload_str.to_string().into())).is_err() {
                        break;
                    }
                }
            }
        })
    } else {
        tokio::spawn(async {})
    };

    // ── Admin Subscriber ────────────────────────────────────────────────
    // Subscribe to organization-wide administrative events (e.g. admission requests)
    let admin_task = if claims.role == "ADMIN" {
        let admin_subject = format!("admin.org.{}", org_id);
        let admin_tx = tx.clone();
        if let Some(mut admin_sub) = state.nats.subscribe(admin_subject).await {
            tokio::spawn(async move {
                tracing::debug!(user_id = %user_id, subject = %admin_subject, "Subscribing admin to events");
                while let Some(msg) = admin_sub.next().await {
                    if let Ok(payload_str) = std::str::from_utf8(&msg.payload) {
                        if admin_tx.send(Message::Text(payload_str.to_string().into())).is_err() {
                            break;
                        }
                    }
                }
            })
        } else {
            tokio::spawn(async {})
        }
    } else {
        tokio::spawn(async {})
    };

    // ── Outbound: channel → WebSocket ───────────────────────────────────
    let mut send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if ws_tx.send(message).await.is_err() {
                break;
            }
        }
    });

    // ── Inbound: WebSocket → handler ────────────────────────────────────
    let mut recv_task = {
        let state = state.clone();
        tokio::spawn(async move {
            let mut heartbeat_interval = tokio::time::interval(std::time::Duration::from_secs(30));

            loop {
                tokio::select! {
                    // Process incoming WebSocket messages
                    msg = ws_rx.next() => {
                        match msg {
                            Some(Ok(Message::Text(text))) => {
                                if let Ok(envelope) = serde_json::from_str::<WsEnvelope>(&text) {
                                    handle_envelope(envelope, device_id, &state).await;
                                }
                            }
                            Some(Ok(Message::Pong(_))) => {
                                // Client is alive, heartbeat acknowledged
                            }
                            Some(Ok(Message::Close(_))) | None => {
                                // Client disconnected
                                break;
                            }
                            Some(Err(e)) => {
                                tracing::warn!(device_id = %device_id, "WebSocket error: {}", e);
                                break;
                            }
                            _ => {} // Ignore Ping/Binary
                        }
                    }
                    // Send periodic Ping to detect dead connections
                    _ = heartbeat_interval.tick() => {
                        if let Some(conn) = state.ws.connections.get(&device_id) {
                            if conn.tx.send(Message::Ping(vec![].into())).is_err() {
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                }
            }
        })
    };

    // Wait for either task to finish, then clean up.
    tokio::select! {
        _ = (&mut send_task) => {
            recv_task.abort();
            nats_task.abort();
            presence_task.abort();
            admin_task.abort();
        },
        _ = (&mut recv_task) => {
            send_task.abort();
            nats_task.abort();
            presence_task.abort();
            admin_task.abort();
        },
    };

    // ── Cleanup ─────────────────────────────────────────────────────────
    state.ws.connections.remove(&device_id);

    // Broadcast offline presence
    let is_still_online = state.ws.connections.iter().any(|entry| entry.value().user_id == user_id && *entry.key() != device_id);
    if !is_still_online {
        broadcast_presence(&state, org_id, user_id, "offline").await;
    }

    // Unsubscribe from NATS (fire-and-forget on task abort)
    tracing::info!(
        device_id = %device_id,
        user_id = %user_id,
        "WebSocket disconnected, cleaned up"
    );
}

// ── Envelope Handler ────────────────────────────────────────────────────────

fn deliver_event_to_device(state: &AppState, device_id: Uuid, event: RoutedEvent) {
    let ws_msg = match &event {
        RoutedEvent::Message {
            sender_device_id,
            sender_user_id,
            sender_identity_key,
            ciphertext,
            ephemeral_public_key,
            header,
            message_id,
            timestamp,
        } => json!({
            "type": "MESSAGE_RECEIVE",
            "payload": {
                "message_id": message_id,
                "sender_device_id": sender_device_id,
                "sender_user_id": sender_user_id,
                "sender_identity_key": sender_identity_key,
                "ciphertext": ciphertext,
                "ephemeral_public_key": ephemeral_public_key,
                "header": header,
                "timestamp": timestamp,
            }
        }),
        RoutedEvent::MessageStatus { message_id, status, user_id } => json!({
            "type": "MESSAGE_STATUS",
            "payload": { "message_id": message_id, "status": status, "user_id": user_id }
        }),
        RoutedEvent::Typing { sender_user_id, is_typing } => json!({
            "type": "TYPING_EVENT",
            "payload": { "sender_user_id": sender_user_id, "is_typing": is_typing }
        }),
        RoutedEvent::DeviceRevoked { device_id } => json!({
            "type": "DEVICE_REVOKED",
            "payload": { "device_id": device_id }
        }),
        RoutedEvent::StoryKeyShare { sender_user_id, ciphertext, header } => json!({
            "type": "STORY_KEY_SHARE",
            "payload": {
                "sender_user_id": sender_user_id,
                "ciphertext": ciphertext,
                "header": header
            }
        }),
    };

    if let Some(conn) = state.ws.connections.get(&device_id) {
        let _ = conn.tx.send(Message::Text(ws_msg.to_string().into()));
        return;
    }

    let subject = format!("routing.{}", device_id);
    if let Ok(payload_bytes) = serde_json::to_vec(&event) {
        let nats = state.nats.clone();
        tokio::spawn(async move {
            nats.publish(subject, payload_bytes).await;
        });
    }
}

#[derive(Debug)]
enum WsError {
    Forbidden(&'static str),
    NotFound(&'static str),
    BadRequest(&'static str),
    Internal(&'static str),
}

impl WsError {
    fn message(&self) -> &'static str {
        match self {
            WsError::Forbidden(msg) => msg,
            WsError::NotFound(msg) => msg,
            WsError::BadRequest(msg) => msg,
            WsError::Internal(msg) => msg,
        }
    }
}

#[derive(Debug)]
struct DeviceRow {
    #[allow(dead_code)]
    device_id: Uuid,
    #[allow(dead_code)]
    user_id: Uuid,
    org_id: Uuid,
    is_active: bool,
}

fn send_ws_error(state: &AppState, sender_device_id: Uuid, err: WsError) {
    if let Some(conn) = state.ws.connections.get(&sender_device_id) {
        let response = json!({
            "type": "ERROR",
            "payload": { "message": err.message() }
        });
        let _ = conn.tx.send(Message::Text(response.to_string().into()));
    }
}

fn sender_context(state: &AppState, sender_device_id: Uuid) -> Result<(Uuid, Uuid), WsError> {
    state
        .ws
        .connections
        .get(&sender_device_id)
        .map(|conn| (conn.user_id, conn.org_id))
        .ok_or(WsError::Forbidden("Sender device is not connected"))
}

async fn verify_user_in_org(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    org_id: Uuid,
) -> Result<(), WsError> {
    let exists = sqlx::query("SELECT 1 FROM users WHERE id = $1 AND org_id = $2")
        .bind(user_id)
        .bind(org_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| WsError::Internal("Failed to verify target user"))?
        .is_some();

    if exists {
        Ok(())
    } else {
        Err(WsError::Forbidden("Cross-tenant key request denied"))
    }
}

async fn verify_device_in_org(
    pool: &sqlx::PgPool,
    device_id: uuid::Uuid,
    org_id: uuid::Uuid,
) -> Result<DeviceRow, WsError> {
    let row = sqlx::query(
        "SELECT id, user_id, org_id, is_active
         FROM devices
         WHERE id = $1",
    )
    .bind(device_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| WsError::Internal("Failed to verify target device"))?;

    match row {
        Some(r) => {
            let device = DeviceRow {
                device_id: r.get("id"),
                user_id: r.get("user_id"),
                org_id: r.get("org_id"),
                is_active: r.get("is_active"),
            };

            if device.org_id != org_id {
                return Err(WsError::Forbidden("Cross-tenant access denied"));
            }

            if !device.is_active {
                return Err(WsError::Forbidden("Target device is not active"));
            }

            Ok(device)
        }
        None => Err(WsError::NotFound("Target device not found")),
    }
}

pub(crate) async fn handle_envelope(
    envelope: WsEnvelope,
    sender_device_id: Uuid,
    state: &AppState,
) {
    match envelope {
        WsEnvelope::KeysRequest { target_user_id } => {
            let (_, sender_org_id) = match sender_context(state, sender_device_id) {
                Ok(ctx) => ctx,
                Err(err) => {
                    send_ws_error(state, sender_device_id, err);
                    return;
                }
            };

            if let Err(err) = verify_user_in_org(&state.db, target_user_id, sender_org_id).await {
                send_ws_error(state, sender_device_id, err);
                return;
            }

            let response =
                match crate::keys::get_user_keys_internal(&state.db, target_user_id, sender_org_id)
                    .await
                {
                    Ok(devices) => json!({
                        "type": "KEYS_RESPONSE",
                        "payload": {
                            "target_user_id": target_user_id,
                            "devices": devices
                        }
                    }),
                    Err(e) => json!({ "type": "ERROR", "payload": { "message": e } }),
                };
            if let Some(conn) = state.ws.connections.get(&sender_device_id) {
                let _ = conn.tx.send(Message::Text(response.to_string().into()));
            }
        }
        WsEnvelope::MessageSend {
            temp_id,
            recipient_device_id,
            ciphertext,
            ephemeral_public_key,
            header,
        } => {
            let (sender_user_id, sender_org_id) = match sender_context(state, sender_device_id) {
                Ok(ctx) => ctx,
                Err(err) => {
                    send_ws_error(state, sender_device_id, err);
                    return;
                }
            };

            if let Err(err) =
                verify_device_in_org(&state.db, recipient_device_id, sender_org_id).await
            {
                send_ws_error(state, sender_device_id, err);
                return;
            }

            // Look up sender's identity key
            let sender_row = sqlx::query("SELECT identity_key_public FROM devices WHERE id = $1")
                .bind(sender_device_id)
                .fetch_optional(&state.db)
                .await;

            let sender_row = match sender_row {
                Ok(row) => row,
                Err(_) => {
                    send_ws_error(
                        state,
                        sender_device_id,
                        WsError::Internal("Failed to fetch sender device keys"),
                    );
                    return;
                }
            };

            let sender_ik = sender_row
                .map(|r| {
                    base64::engine::general_purpose::STANDARD
                        .encode(r.get::<Vec<u8>, _>("identity_key_public"))
                })
                .unwrap_or_default();

            let message_id = Uuid::new_v4();
            let timestamp = chrono::Utc::now();

            // Persist all outbound messages regardless of where the recipient is connected.
            let ciphertext_bytes =
                match base64::engine::general_purpose::STANDARD.decode(&ciphertext) {
                    Ok(bytes) => bytes,
                    Err(_) => {
                        send_ws_error(
                            state,
                            sender_device_id,
                            WsError::BadRequest("Invalid ciphertext: expected base64 payload"),
                        );
                        return;
                    }
                };
            let persisted = sqlx::query(
                "INSERT INTO encrypted_messages
                 (id, sender_device_id, recipient_device_id, ciphertext,
                  sender_identity_key, ephemeral_public_key, ratchet_header, org_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7,
                         (SELECT org_id FROM devices WHERE id = $2))",
            )
            .bind(message_id)
            .bind(sender_device_id)
            .bind(recipient_device_id)
            .bind(ciphertext_bytes)
            .bind(&sender_ik)
            .bind(&ephemeral_public_key) // Option<String> — NULL for subsequent ratchet msgs
            .bind(&header) // serde_json::Value stored as JSONB
            .execute(&state.db)
            .await
            .is_ok();

            if let Some(local_temp_id) = temp_id {
                if let Some(sender_conn) = state.ws.connections.get(&sender_device_id) {
                    let confirm = json!({
                        "type": "MESSAGE_CONFIRM",
                        "payload": {
                            "temp_id": local_temp_id,
                            "server_message_id": message_id,
                            "timestamp": timestamp,
                        }
                    });
                    let _ = sender_conn.tx.send(Message::Text(confirm.to_string().into()));
                }
            }

            // ── Local Delivery (same instance) ─────────────────────────
            let event = RoutedEvent::Message {
                sender_device_id,
                sender_user_id,
                sender_identity_key: sender_ik.clone(),
                ciphertext: ciphertext.clone(),
                ephemeral_public_key: ephemeral_public_key.clone(),
                header: header.clone(),
                message_id,
                timestamp,
            };
            let locally_delivered = if state.ws.connections.contains_key(&recipient_device_id) {
                deliver_event_to_device(state, recipient_device_id, event);
                true
            } else {
                false
            };

            if locally_delivered {
                if !persisted {
                    tracing::warn!(message_id = %message_id, "Message delivered live but persistence failed");
                }
                return;
            }

            // ── Distributed Routing via NATS ────────────────────────────
            // Publish to the recipient's NATS subject. Any backend instance
            // holding that device's live connection will receive it.
            deliver_event_to_device(
                state,
                recipient_device_id,
                RoutedEvent::Message {
                    sender_device_id,
                    sender_user_id,
                    sender_identity_key: sender_ik.clone(),
                    ciphertext: ciphertext.clone(),
                    ephemeral_public_key: ephemeral_public_key.clone(),
                    header: header.clone(),
                    message_id,
                    timestamp,
                },
            );

            tracing::debug!(
                recipient = %recipient_device_id,
                "Recipient not on this instance — persisted and published for delivery"
            );
            if !persisted {
                tracing::warn!(message_id = %message_id, "Published message without confirmed persistence");
            }
            tracing::debug!(message_id = %message_id, "Stored outbound message for delivery tracking");
        }

        WsEnvelope::MessageAck { message_id } => {
            let (sender_user_id, _) = match sender_context(state, sender_device_id) {
                Ok(ctx) => ctx,
                Err(err) => {
                    send_ws_error(state, sender_device_id, err);
                    return;
                }
            };

            let msg_check =
                sqlx::query("SELECT recipient_device_id FROM encrypted_messages WHERE id = $1")
                    .bind(message_id)
                    .fetch_optional(&state.db)
                    .await;
            match msg_check {
                Ok(Some(r)) => {
                    let rec_id: Uuid = r.get("recipient_device_id");
                    if rec_id != sender_device_id {
                        tracing::warn!(
                            "Receipt spoofing attempt: caller={} msg={}",
                            sender_device_id,
                            message_id
                        );
                        send_ws_error(
                            state,
                            sender_device_id,
                            WsError::Forbidden("Receipt spoofing denied"),
                        );
                        return;
                    }
                }
                Ok(None) => {
                    send_ws_error(state, sender_device_id, WsError::NotFound("Message not found"));
                    return;
                }
                Err(_) => {
                    send_ws_error(
                        state,
                        sender_device_id,
                        WsError::Internal("Failed to verify message receipt"),
                    );
                    return;
                }
            }

            let row = sqlx::query(
                "UPDATE encrypted_messages
                 SET delivered_at = COALESCE(delivered_at, NOW())
                 WHERE id = $1
                 RETURNING sender_device_id",
            )
            .bind(message_id)
            .fetch_optional(&state.db)
            .await;

            if let Ok(Some(record)) = row {
                let original_sender_device_id: Uuid = record.get("sender_device_id");
                deliver_event_to_device(
                    state,
                    original_sender_device_id,
                    RoutedEvent::MessageStatus {
                        message_id,
                        status: "delivered".to_string(),
                        user_id: sender_user_id,
                    },
                );
            }
        }
        WsEnvelope::MessageRead { message_id } => {
            let (reader_user_id, _) = match sender_context(state, sender_device_id) {
                Ok(ctx) => ctx,
                Err(err) => {
                    send_ws_error(state, sender_device_id, err);
                    return;
                }
            };

            let msg_check =
                sqlx::query("SELECT recipient_device_id FROM encrypted_messages WHERE id = $1")
                    .bind(message_id)
                    .fetch_optional(&state.db)
                    .await;
            match msg_check {
                Ok(Some(r)) => {
                    let rec_id: Uuid = r.get("recipient_device_id");
                    if rec_id != sender_device_id {
                        tracing::warn!(
                            "Receipt spoofing attempt: caller={} msg={}",
                            sender_device_id,
                            message_id
                        );
                        send_ws_error(
                            state,
                            sender_device_id,
                            WsError::Forbidden("Receipt spoofing denied"),
                        );
                        return;
                    }
                }
                Ok(None) => {
                    send_ws_error(state, sender_device_id, WsError::NotFound("Message not found"));
                    return;
                }
                Err(_) => {
                    send_ws_error(
                        state,
                        sender_device_id,
                        WsError::Internal("Failed to verify message receipt"),
                    );
                    return;
                }
            }

            let row = sqlx::query(
                "UPDATE encrypted_messages
                 SET read_at = COALESCE(read_at, NOW()), delivered_at = COALESCE(delivered_at, NOW())
                 WHERE id = $1
                 RETURNING sender_device_id"
            )
            .bind(message_id)
            .fetch_optional(&state.db)
            .await;

            if let Ok(Some(record)) = row {
                let original_sender_device_id: Uuid = record.get("sender_device_id");
                deliver_event_to_device(
                    state,
                    original_sender_device_id,
                    RoutedEvent::MessageStatus {
                        message_id,
                        status: "read".to_string(),
                        user_id: reader_user_id,
                    },
                );
            }
        }
        WsEnvelope::TypingEvent { recipient_device_id, is_typing } => {
            let (sender_user_id, sender_org_id) = match sender_context(state, sender_device_id) {
                Ok(ctx) => ctx,
                Err(err) => {
                    send_ws_error(state, sender_device_id, err);
                    return;
                }
            };
            if let Err(err) =
                verify_device_in_org(&state.db, recipient_device_id, sender_org_id).await
            {
                send_ws_error(state, sender_device_id, err);
                return;
            }

            deliver_event_to_device(
                state,
                recipient_device_id,
                RoutedEvent::Typing { sender_user_id, is_typing },
            );
        }

        WsEnvelope::StoryKeyShare { recipient_device_id, ciphertext, header } => {
            let (sender_user_id, org_id) = match sender_context(state, sender_device_id) {
                Ok(ctx) => ctx,
                Err(err) => {
                    send_ws_error(state, sender_device_id, err);
                    return;
                }
            };

            // Verify target device belongs to same org
            if let Err(err) = verify_device_in_org(&state.db, recipient_device_id, org_id).await {
                send_ws_error(state, sender_device_id, err);
                return;
            }

            deliver_event_to_device(
                state,
                recipient_device_id,
                RoutedEvent::StoryKeyShare {
                    sender_user_id,
                    ciphertext,
                    header,
                },
            );
        }
    }
}
