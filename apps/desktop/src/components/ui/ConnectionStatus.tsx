import { useEffect, useState } from "react";
import { socket, type ConnectionState } from "../../infrastructure/socket";

/**
 * A small pill/badge showing the WebSocket connection state.
 * Green = connected, amber = reconnecting, red = offline.
 */
export default function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(socket.connectionState);

  useEffect(() => {
    socket.onConnectionStateChange(setState);
  }, []);

  const config: Record<ConnectionState, { pulseClass: string; label: string }> = {
    CONNECTED: { pulseClass: "status-pulse-green", label: "CONNECTED" },
    CONNECTING: { pulseClass: "status-pulse-amber", label: "CONNECTING…" },
    RECONNECTING: { pulseClass: "status-pulse-amber", label: "RECONNECTING…" },
    DISCONNECTED: { pulseClass: "status-pulse-red", label: "OFFLINE" },
  };

  const { pulseClass, label } = config[state];

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5 shadow-sm transition-all"
      title={`WebSocket: ${label}`}
    >
      <div className={`status-pulse ${pulseClass} shrink-0`} />
      <span className="text-[11px] font-semibold text-text-secondary tracking-tight">
        {label}
      </span>
    </div>
  );
}
