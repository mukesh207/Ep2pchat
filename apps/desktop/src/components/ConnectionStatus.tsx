import { useEffect, useState } from "react";
import { socket, type ConnectionState } from "../lib/socket";

/**
 * A small pill/badge showing the WebSocket connection state.
 * Green = connected, amber = reconnecting, red = offline.
 */
export default function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(socket.connectionState);

  useEffect(() => {
    socket.onConnectionStateChange(setState);
  }, []);

  const config: Record<ConnectionState, { color: string; label: string }> = {
    CONNECTED: { color: "#22c55e", label: "Connected" },
    CONNECTING: { color: "#eab308", label: "Connecting…" },
    RECONNECTING: { color: "#f59e0b", label: "Reconnecting…" },
    DISCONNECTED: { color: "#ef4444", label: "Offline" },
  };

  const { color, label } = config[state];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        fontSize: "0.7rem",
        color: "var(--text-muted, #8b949e)",
        padding: "0.15rem 0.5rem",
        borderRadius: 999,
        background: "rgba(255,255,255,0.04)",
      }}
      title={`WebSocket: ${label}`}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          boxShadow: `0 0 4px ${color}`,
        }}
      />
      {label}
    </div>
  );
}
