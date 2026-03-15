/**
 * EncryptionSpinner — shown during X3DH handshaking
 * Animated orbital ring with a central lock icon
 */
export default function EncryptionSpinner({ label = "ESTABLISHING SECURE CHANNEL" }: { label?: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      height: "100%",
      padding: 40,
    }}>
      {/* Orbital rings */}
      <div style={{ position: "relative", width: 80, height: 80 }}>
        {/* Outer ring */}
        <svg
          style={{
            position: "absolute", inset: 0,
            animation: "rotate-slow 3s linear infinite",
          }}
          width="80" height="80" viewBox="0 0 80 80"
        >
          <circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth="1"
            strokeDasharray="16 8"
            opacity="0.6"
          />
          <circle cx="40" cy="4" r="3" fill="var(--accent-primary)" opacity="0.9" />
        </svg>

        {/* Inner ring */}
        <svg
          style={{
            position: "absolute", inset: 8,
            animation: "rotate-slow 2s linear infinite reverse",
          }}
          width="64" height="64" viewBox="0 0 64 64"
        >
          <circle
            cx="32" cy="32" r="28"
            fill="none"
            stroke="var(--accent-teal)"
            strokeWidth="1"
            strokeDasharray="6 12"
            opacity="0.4"
          />
        </svg>

        {/* Center shield icon */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"
              fill="rgba(240,165,0,0.15)"
              stroke="var(--accent-primary)"
              strokeWidth="1.5"
            />
            <path
              d="M9 12l2 2 4-4"
              stroke="var(--accent-primary)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Label */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: "var(--accent-primary)",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          animation: "amber-pulse 1.5s ease infinite",
          marginBottom: 8,
        }}>
          {label}
        </div>
        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                width: 4, height: 4,
                borderRadius: "50%",
                background: "var(--accent-primary)",
                opacity: 0.3,
                animation: `blink 1.2s ${i * 0.3}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Binary stream decoration */}
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.55rem",
        color: "var(--text-muted)",
        opacity: 0.5,
        letterSpacing: "0.05em",
      }}>
        X3DH::CURVE25519::XCHACHA20-POLY1305
      </div>
    </div>
  );
}
