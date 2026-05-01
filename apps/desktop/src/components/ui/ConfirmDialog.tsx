import React, { useCallback, useState, createContext, useContext, useRef, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warn" | "info";
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType>({
  confirm: () => Promise.resolve(false),
});

export const useConfirm = () => useContext(ConfirmContext);

// ── Provider ─────────────────────────────────────────────────────────────────

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const handleResult = useCallback(
    (result: boolean) => {
      if (pending) {
        pending.resolve(result);
        setPending(null);
      }
    },
    [pending]
  );

  // Close on Escape
  useEffect(() => {
    if (!pending) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleResult(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pending, handleResult]);

  // Auto-focus the confirm button
  useEffect(() => {
    if (pending && dialogRef.current) {
      const btn = dialogRef.current.querySelector<HTMLButtonElement>(".confirm-dialog-confirm-btn");
      btn?.focus();
    }
  }, [pending]);

  const variant = pending?.options.variant ?? "warn";

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <>
          <div className="confirm-dialog-backdrop" onClick={() => handleResult(false)} />
          <div className="confirm-dialog" ref={dialogRef} role="alertdialog" aria-modal="true">
            <div className={`confirm-dialog-header confirm-dialog-${variant}`}>
              <span className="confirm-dialog-icon">
                {variant === "danger" && "⚠"}
                {variant === "warn" && "⚡"}
                {variant === "info" && "ℹ"}
              </span>
              <span className="confirm-dialog-title">{pending.options.title}</span>
            </div>
            <div className="confirm-dialog-body">
              <p className="confirm-dialog-message">{pending.options.message}</p>
            </div>
            <div className="confirm-dialog-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleResult(false)}
              >
                {pending.options.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={`btn btn-sm confirm-dialog-confirm-btn ${variant === "danger" ? "btn-danger" : "btn-primary"}`}
                onClick={() => handleResult(true)}
              >
                {pending.options.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </>
      )}
    </ConfirmContext.Provider>
  );
}
