import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary — catches unhandled render errors and shows a
 * styled fallback instead of a blank white screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            background: "var(--bg-app, #0e1117)",
            color: "var(--text-primary, #e6edf3)",
            fontFamily: "var(--font-sans, system-ui, sans-serif)",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "3rem",
              marginBottom: "1rem",
              opacity: 0.6,
            }}
          >
            ⚠️
          </div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "0.85rem",
              color: "var(--text-muted, #8b949e)",
              maxWidth: 400,
              lineHeight: 1.5,
              margin: "0 0 1.5rem",
            }}
          >
            Trustline encountered an unexpected error. Your data is safe — click below to reload.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre
              style={{
                fontSize: "0.7rem",
                background: "rgba(255,255,255,0.05)",
                padding: "0.75rem 1rem",
                borderRadius: 6,
                maxWidth: 500,
                overflow: "auto",
                marginBottom: "1.5rem",
                textAlign: "left",
                color: "var(--text-muted, #8b949e)",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            style={{
              padding: "0.5rem 1.5rem",
              borderRadius: 6,
              border: "1px solid var(--border-primary, #30363d)",
              background: "var(--accent-primary, #6e56cf)",
              color: "#fff",
              fontSize: "0.85rem",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Reload Trustline
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
