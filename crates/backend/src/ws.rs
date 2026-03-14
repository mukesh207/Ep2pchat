use ax_ws::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::Response,
};
use axum as ax_ws;
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use uuid::Uuid;
use crate::AppState;
use crate::keys::get_user_keys_internal;
use base64::Engine;
use sqlx::Row;

pub struct ActiveConnection {
    pub tx: tokio::sync::mpsc::UnboundedSender<Message>,
    pub user_id: Uuid,
    pub org_id: Uuid,
}

pub type ConnectionRegistry = Arc<RwLock<HashMap<Uuid, ActiveConnection>>>;

#[derive(Clone)]
pub struct WsState {
    pub connections: ConnectionRegistry,
}

impl WsState {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum WsEnvelope {
    #[serde(rename = "KEYS_REQUEST")]
    KeysRequest { target_user_id: Uuid },
    #[serde(rename = "MESSAGE_SEND")]
    MessageSend {
        recipient_device_id: Uuid,
        ciphertext: String, // base64
        ephemeral_public_key: String, // base64
        nonce: String, // base64
    },
    #[serde(rename = "MESSAGE_ACK")]
    MessageAck { message_id: Uuid },
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

    // In a real app, these come from JWT
    let device_id = Uuid::new_v4(); 
    let user_id = Uuid::new_v4();
    let org_id = Uuid::new_v4();

    {
        let mut conns = state.ws.connections.write().unwrap();
        conns.insert(device_id, ActiveConnection {
            tx: tx.clone(),
            user_id,
            org_id,
        });
    }

    let mut send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if ws_tx.send(message).await.is_err() {
                break;
            }
        }
    });

    let mut recv_task = {
        let state = state.clone();
        tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_rx.next().await {
                if let Message::Text(text) = msg {
                    if let Ok(envelope) = serde_json::from_str::<WsEnvelope>(&text) {
                        handle_envelope(envelope, device_id, &state).await;
                    }
                }
            }
        })
    };

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    {
        let mut conns = state.ws.connections.write().unwrap();
        conns.remove(&device_id);
    }
}

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
            let conns = state.ws.connections.read().unwrap();
            if let Some(conn) = conns.get(&sender_device_id) {
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
            
            let sender_ik = sender_row.map(|r| base64::engine::general_purpose::STANDARD.encode(r.get::<Vec<u8>, _>("identity_key_public"))).unwrap_or_default();

            let message_payload = json!({
                "type": "MESSAGE_RECEIVE",
                "payload": {
                    "message_id": Uuid::new_v4(),
                    "sender_device_id": sender_device_id,
                    "sender_identity_key": sender_ik,
                    "ciphertext": ciphertext,
                    "ephemeral_public_key": ephemeral_public_key,
                    "nonce": nonce,
                    "timestamp": chrono::Utc::now(),
                }
            });

            let routed = {
                let conns = state.ws.connections.read().unwrap();
                if let Some(conn) = conns.get(&recipient_device_id) {
                    let _ = conn.tx.send(Message::Text(message_payload.to_string().into()));
                    true
                } else {
                    false
                }
            };

            if !routed {
                let ciphertext_bytes = base64::engine::general_purpose::STANDARD.decode(&ciphertext).unwrap_or_default();
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
