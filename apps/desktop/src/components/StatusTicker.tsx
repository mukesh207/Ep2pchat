/**
 * StatusTicker — a live blinking "HUD status" ticker strip
 * shown in the top bar during an active session.
 */
import { useEffect, useState } from "react";

const MESSAGES = [
  "E2E ENCRYPTION ACTIVE",
  "ZERO-KNOWLEDGE ROUTING ENABLED",
  "X3DH HANDSHAKE VERIFIED",
  "RLS POLICIES: ENFORCED",
  "LOCAL VAULT: LOCKED",
  "FORWARD SECRECY: ON",
];

export default function StatusTicker() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % MESSAGES.length);
        setVisible(true);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: "0.6rem",
      color: "var(--accent-teal)",
      letterSpacing: "0.1em",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.3s ease",
      display: "flex",
      alignItems: "center",
      gap: 6,
    }}>
      <span style={{
        width: 5, height: 5, background: "var(--accent-teal)",
        borderRadius: "50%", flexShrink: 0,
        boxShadow: "0 0 6px var(--accent-teal)",
        animation: "blink 1s infinite"
      }} />
      {MESSAGES[idx]}
    </div>
  );
}
