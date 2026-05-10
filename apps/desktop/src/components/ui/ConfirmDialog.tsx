import React, { useCallback, useState, createContext, useContext, useRef, useEffect } from "react";
import { AlertTriangle, Info, Zap, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
      const btn = dialogRef.current.querySelector<HTMLButtonElement>(".btn-tactical-primary");
      btn?.focus();
    }
  }, [pending]);

  const variant = pending?.options.variant ?? "warn";

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AnimatePresence>
        {pending && (
          <div className="modal-overlay-tactical" onClick={() => handleResult(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="modal-content-tactical max-w-[440px]" 
              ref={dialogRef} 
              role="alertdialog" 
              aria-modal="true"
              onClick={e => e.stopPropagation()}
            >
              <header className={`h-14 border-b border-border-tactical flex items-center justify-between px-6 bg-background-secondary/80 backdrop-blur-md`}>
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${
                    variant === "danger" ? "bg-accent-red animate-pulse" : 
                    variant === "warn" ? "bg-accent-amber animate-pulse" : 
                    "bg-accent-cyan animate-pulse"
                  }`} />
                  <span className="text-[13px] font-semibold text-text-primary">Confirmation Required</span>
                </div>
                <button className="h-6 w-6 rounded flex items-center justify-center text-text-muted hover:text-accent-red transition-all" onClick={() => handleResult(false)}><X size={16} /></button>
              </header>


              <div className="p-8 space-y-6">
                <div className="flex items-start gap-5">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                    variant === "danger" ? "bg-accent-red/10 text-accent-red border border-accent-red/20" : 
                    variant === "warn" ? "bg-accent-amber/10 text-accent-amber border border-accent-amber/20" : 
                    "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
                  }`}>
                    {variant === "danger" && <AlertTriangle size={24} />}
                    {variant === "warn" && <Zap size={24} />}
                    {variant === "info" && <Info size={24} />}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-text-primary tracking-tight leading-tight">{pending.options.title}</h3>
                    <p className="text-[14px] text-text-secondary leading-relaxed font-medium">{pending.options.message}</p>
                  </div>
                </div>
              </div>


              <footer className="p-6 border-t border-border-tactical bg-background-secondary/80 flex gap-3">
                <button
                  className="btn-tactical btn-tactical-secondary flex-1 font-semibold"
                  onClick={() => handleResult(false)}
                >
                  {pending.options.cancelLabel ?? "Abort"}
                </button>
                <button
                  className={`btn-tactical flex-1 font-semibold ${
                    variant === "danger" ? "bg-accent-red text-white border-transparent" : 
                    "btn-tactical-primary"
                  }`}
                  onClick={() => handleResult(true)}
                >
                  {pending.options.confirmLabel ?? "Confirm"}
                </button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
