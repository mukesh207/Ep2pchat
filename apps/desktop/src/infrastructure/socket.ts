// ── Trustline WebSocket Client ──────────────────────────────────────────────
// Provides reliable WebSocket connectivity with:
// - Exponential backoff reconnection (1s → 30s)
// - Outbound message queue (flush on reconnect)
// - Connection state tracking with callbacks
// - Ping/pong heartbeat (25s interval)

import { WS_BASE_URL } from "../constants/config";

/** Payload shape for all WebSocket messages. */
export interface WsMessage {
    type: string;
    payload: Record<string, unknown>;
}

/** Possible connection states for the WebSocket client. */
export type ConnectionState =
    | "CONNECTING"
    | "CONNECTED"
    | "DISCONNECTED"
    | "RECONNECTING";

// ── Backoff configuration ──────────────────────────────────────────────────

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_MULTIPLIER = 2;
const HEARTBEAT_INTERVAL_MS = 25000;
const WS_PROTOCOL_V1 = "trustline.v1";
const WS_AUTH_PROTOCOL_PREFIX = "auth.jwt.";

export class TrustlineSocket {
    private ws: WebSocket | null = null;
    private handlers: ((msg: WsMessage) => void)[] = [];
    private stateHandlers: ((state: ConnectionState) => void)[] = [];
    private currentToken = "";
    private disabled = false;
    private reconnectTimer: number | null = null;
    private heartbeatTimer: number | null = null;
    private currentDeviceId: string | null = null;
    private backoffMs = BACKOFF_INITIAL_MS;
    private _state: ConnectionState = "DISCONNECTED";

    /** Messages queued while disconnected — flushed on reconnect. */
    private outboundQueue: string[] = [];

    constructor(private baseUrl: string) {}

    /** Current connection state (read-only). */
    get connectionState(): ConnectionState {
        return this._state;
    }

    /** Tear down the socket completely (e.g. on logout). */
    destroy(): void {
        this.disabled = true;
        this.clearTimers();
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.close(1000, "logged out");
            this.ws = null;
        }
        this.outboundQueue = [];
        this.setState("DISCONNECTED");
    }

    /** Open (or reconnect) the WebSocket connection. */
    connect(token = "", deviceId?: string | null): void {
        if (this.disabled) this.disabled = false;
        if (token) this.currentToken = token;
        this.currentDeviceId = deviceId ?? null;

        this.clearTimers();
        this.setState("CONNECTING");

        const url = new URL(this.baseUrl, window.location.href);
        if (this.currentDeviceId) url.searchParams.set("device_id", this.currentDeviceId);
        
        // Removed WS_AUTH_PROTOCOL_PREFIX to prevent JWT leakage in reverse proxy logs.
        // Modern browsers log headers, so we send the token via an AUTH message after upgrade.
        const protocols = [WS_PROTOCOL_V1];

        this.ws = new WebSocket(url, protocols);

        this.ws.onopen = () => {
            this.backoffMs = BACKOFF_INITIAL_MS; // reset backoff on success
            
            // Immediately authenticate
            if (this.currentToken) {
                this.ws?.send(JSON.stringify({ 
                    type: "AUTH", 
                    payload: { token: this.currentToken } 
                }));
            }

            this.setState("CONNECTED");
            this.flushQueue();
            this.startHeartbeat();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg: WsMessage = JSON.parse(event.data as string);
                this.handlers.forEach((h) => h(msg));
            } catch {
                console.warn("[WS] Failed to parse incoming message");
            }
        };

        this.ws.onclose = () => {
            this.ws = null;
            this.stopHeartbeat();
            this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            // onerror is always followed by onclose — let onclose handle reconnection
        };
    }

    /**
     * Send a typed message. If the socket is not CONNECTED the message
     * is queued and will be sent automatically once reconnected.
     */
    send(type: string, payload: Record<string, unknown>): void {
        const raw = JSON.stringify({ type, payload });
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(raw);
        } else {
            this.outboundQueue.push(raw);
        }
    }

    /** Register a handler for incoming messages. */
    onMessage(handler: (msg: WsMessage) => void): void {
        this.handlers.push(handler);
    }

    /** Register a handler for connection state changes. */
    onConnectionStateChange(handler: (state: ConnectionState) => void): void {
        this.stateHandlers.push(handler);
    }

    // ── Private helpers ────────────────────────────────────────────────────

    private setState(state: ConnectionState): void {
        if (this._state === state) return;
        this._state = state;
        this.stateHandlers.forEach((h) => h(state));
    }

    /** Exponential backoff reconnection. */
    private scheduleReconnect(): void {
        if (this.disabled) return;
        if (this.reconnectTimer !== null) return;

        this.setState("RECONNECTING");
        console.info(`[WS] Reconnecting in ${this.backoffMs}ms...`);

        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect(this.currentToken, this.currentDeviceId);
        }, this.backoffMs);

        // Increase backoff for next attempt (capped)
        this.backoffMs = Math.min(this.backoffMs * BACKOFF_MULTIPLIER, BACKOFF_MAX_MS);
    }

    /** Flush all queued outbound messages. */
    private flushQueue(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        while (this.outboundQueue.length > 0) {
            const raw = this.outboundQueue.shift()!;
            this.ws.send(raw);
        }
    }

    /** Ping the server every 25s to keep the connection alive. */
    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = window.setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: "PING", payload: {} }));
            }
        }, HEARTBEAT_INTERVAL_MS);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer !== null) {
            window.clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private clearTimers(): void {
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.stopHeartbeat();
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toBase64Url(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Singleton WebSocket client instance. */
export const socket = new TrustlineSocket(WS_BASE_URL);

/** Convenience: tear down the global socket (e.g. on logout). */
export function destroySocket(): void {
    socket.destroy();
}

/** Get the current connection state of the global socket. */
export function getConnectionState(): ConnectionState {
    return socket.connectionState;
}
