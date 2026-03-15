use ax_ws::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State, Query},
    response::{IntoResponse, Response},
};
use axum as ax_ws;
use axum::http::StatusCode;
use dashmap::DashMap;
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;
use crate::AppState;
use crate::keys::get_user_keys_internal;
use crate::auth::Claims;
use base64::Engine;
use sqlx::Row;
use jsonwebtoken::{decode, DecodingKey, Validation};

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
        Self {
            connections: Arc::new(DashMap::new()),
        }
    }
}

// ── Protocol Envelope ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct WsQuery {
    pub token: String,
    pub device_id: Option<Uuid>,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum WsEnvelope {
    #[serde(rename = "KEYS_REQUEST")]
    KeysRequest { target_user_id: Uuid },
    #[serde(rename = "MESSAGE_SEND")]
    MessageSend {
        recipient_device_id: Uuid,
        ciphertext: String,        // base64
        ephemeral_public_key: String, // base64
        nonce: String,              // base64
    },
    #[serde(rename = "MESSAGE_ACK")]
    MessageAck { message_id: Uuid },
}

/// Internal NATS relay payload — what gets published across instances.
#[derive(Serialize, Deserialize, Debug)]
struct NatsRelayPayload {
    sender_device_id: Uuid,
    sender_identity_key: String,
    ciphertext: String,
    ephemeral_public_key: String,
    nonce: String,
    message_id: Uuid,
    timestamp: chrono::DateTime<chrono::Utc>,
}

// ── WebSocket Upgrade Handler ───────────────────────────────────────────────

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<AppState>,
) -> Response {
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "super_secret_fallback_key_for_dev".to_string());

    let token_data = match decode::<Claims>(
        &query.token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    ) {
        Ok(data) => data,
        Err(_) => return (StatusCode::UNAUTHORIZED, "Invalid or expired token").into_response(),
    };

    let device_id = query.device_id.unwrap_or_else(Uuid::new_v4);

    ws.on_upgrade(move |socket| handle_socket(socket, state, device_id, token_data.claims))
}

// ── Core Socket Handler ─────────────────────────────────────────────────────

async fn handle_socket(socket: WebSocket, state: AppState, device_id: Uuid, claims: Claims) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

    let user_id = claims.sub;
    let org_id = claims.org_id;

    // Register this device in the lock-free DashMap
    state.ws.connections.insert(device_id, ActiveConnection {
        tx: tx.clone(),
        user_id,
        org_id,
    });

    tracing::info!(
        device_id = %device_id,
        user_id = %user_id,
        "WebSocket connected"
    );

    // ── NATS Subscriber ─────────────────────────────────────────────────
    // Subscribe to messages routed to THIS device from any backend instance.
    let nats_subject = format!("routing.{}", device_id);
    let mut nats_sub = match state.nats.subscribe(nats_subject.clone()).await {
        Ok(sub) => sub,
        Err(e) => {
            tracing::error!("Failed to subscribe to NATS subject {}: {}", nats_subject, e);
            state.ws.connections.remove(&device_id);
            return;
        }
    };

    // Forward NATS messages to the local WebSocket sender channel.
    let nats_tx = tx.clone();
    let nats_task = tokio::spawn(async move {
        while let Some(msg) = nats_sub.next().await {
            if let Ok(payload_str) = std::str::from_utf8(&msg.payload) {
                if let Ok(relay) = serde_json::from_str::<NatsRelayPayload>(payload_str) {
                    let ws_msg = json!({
                        "type": "MESSAGE_RECEIVE",
                        "payload": {
                            "message_id": relay.message_id,
                            "sender_device_id": relay.sender_device_id,
                            "sender_identity_key": relay.sender_identity_key,
                            "ciphertext": relay.ciphertext,
                            "ephemeral_public_key": relay.ephemeral_public_key,
                            "nonce": relay.nonce,
                            "timestamp": relay.timestamp,
                        }
                    });
                    if nats_tx.send(Message::Text(ws_msg.to_string().into())).is_err() {
                        break;
                    }
                }
            }
        }
    });

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
        let device_id = device_id;
        tokio::spawn(async move {
            let mut heartbeat_interval = tokio::time::interval(
                std::time::Duration::from_secs(30)
            );

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
        },
        _ = (&mut recv_task) => {
            send_task.abort();
            nats_task.abort();
        },
    };

    // ── Cleanup ─────────────────────────────────────────────────────────
    state.ws.connections.remove(&device_id);

    // Unsubscribe from NATS (fire-and-forget on task abort)
    tracing::info!(
        device_id = %device_id,
        user_id = %user_id,
        "WebSocket disconnected, cleaned up"
    );
}

// ── Envelope Handler ────────────────────────────────────────────────────────

async fn handle_envelope(envelope: WsEnvelope, sender_device_id: Uuid, state: &AppState) {
    match envelope {
        WsEnvelope::KeysRequest { target_user_id } => {
            let response = match get_user_keys_internal(&state.db, target_user_id).await {
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
        WsEnvelope::MessageSend { recipient_device_id, ciphertext, ephemeral_public_key, nonce } => {
            // Look up sender's identity key
            let sender_row = sqlx::query("SELECT identity_key_public FROM devices WHERE id = $1")
                .bind(sender_device_id)
                .fetch_optional(&state.db)
                .await
                .unwrap_or_default();

            let sender_ik = sender_row
                .map(|r| {
                    base64::engine::general_purpose::STANDARD
                        .encode(r.get::<Vec<u8>, _>("identity_key_public"))
                })
                .unwrap_or_default();

            let message_id = Uuid::new_v4();
            let timestamp = chrono::Utc::now();

            let relay_payload = NatsRelayPayload {
                sender_device_id,
                sender_identity_key: sender_ik,
                ciphertext: ciphertext.clone(),
                ephemeral_public_key: ephemeral_public_key.clone(),
                nonce: nonce.clone(),
                message_id,
                timestamp,
            };

            // ── Distributed Routing via NATS ────────────────────────────
            // Publish to the recipient's NATS subject. If ANY backend
            // instance has that device connected, it will receive this.
            let nats_subject = format!("routing.{}", recipient_device_id);
            let payload_bytes = serde_json::to_vec(&relay_payload).unwrap_or_default();

            let nats_delivered = state.nats
                .publish(nats_subject, payload_bytes.into())
                .await
                .is_ok();

            // Also attempt local delivery (if recipient is on THIS instance)
            let locally_delivered = if let Some(conn) = state.ws.connections.get(&recipient_device_id) {
                let ws_msg = json!({
                    "type": "MESSAGE_RECEIVE",
                    "payload": {
                        "message_id": message_id,
                        "sender_device_id": sender_device_id,
                        "sender_identity_key": relay_payload.sender_identity_key,
                        "ciphertext": &ciphertext,
                        "ephemeral_public_key": &ephemeral_public_key,
                        "nonce": &nonce,
                        "timestamp": timestamp,
                    }
                });
                conn.tx.send(Message::Text(ws_msg.to_string().into())).is_ok()
            } else {
                false
            };

            // If neither NATS nor local delivery worked, store for later.
            if !nats_delivered && !locally_delivered {
                tracing::warn!(
                    recipient = %recipient_device_id,
                    "Recipient offline and NATS publish failed — storing for offline delivery"
                );
                let ciphertext_bytes = base64::engine::general_purpose::STANDARD
                    .decode(&ciphertext)
                    .unwrap_or_default();
                let _ = sqlx::query(
                    "INSERT INTO encrypted_messages (sender_device_id, recipient_device_id, ciphertext, org_id)
                     VALUES ($1, $2, $3, (SELECT org_id FROM devices WHERE id = $1))"
                )
                .bind(sender_device_id)
                .bind(recipient_device_id)
                .bind(ciphertext_bytes)
                .execute(&state.db)
                .await;
            }
        }
        WsEnvelope::MessageAck { message_id } => {
            let _ = sqlx::query("UPDATE encrypted_messages SET delivered_at = NOW() WHERE id = $1")
                .bind(message_id)
                .execute(&state.db)
                .await;
        }
    }
}
