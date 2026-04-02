import type { ReactNode } from "react";
import { Shield } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}

/**
 * Reusable empty-state placeholder shown when no content is available,
 * such as when no conversation is selected.
 */
export default function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-muted, #8b949e)",
        textAlign: "center",
        padding: "2rem",
        gap: "0.75rem",
      }}
    >
      <div style={{ opacity: 0.4 }}>
        {icon ?? <Shield size={48} strokeWidth={1} />}
      </div>
      <h3
        style={{
          fontSize: "1rem",
          fontWeight: 500,
          color: "var(--text-secondary, #c9d1d9)",
          margin: 0,
        }}
      >
        {title}
      </h3>
      {subtitle && (
        <p
          style={{
            fontSize: "0.8rem",
            maxWidth: 280,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
