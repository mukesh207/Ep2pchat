import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ────────────────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  addToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {} });

export const useToast = () => useContext(ToastContext);

// ── Toast Provider ───────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const addToast = useCallback((message: string, variant: ToastVariant = "info") => {
    setToasts((prev) => {
      // Prevent duplicate toasts if the same message and variant are already active
      const isDuplicate = prev.some(t => t.message === message && t.variant === variant);
      if (isDuplicate) return prev;

      const id = nextId.current++;
      return [...prev, { id, message, variant }];
    });
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-3 items-end pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ── Single Toast ─────────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const variantStyles = {
    success: "border-accent-green/30 bg-accent-green/5 text-accent-green",
    error: "border-accent-red/30 bg-accent-red/5 text-accent-red",
    info: "border-accent-purple/30 bg-accent-purple/5 text-accent-purple",
  };

  const icons = {
    success: <CheckCircle size={18} />,
    error: <AlertCircle size={18} />,
    info: <Info size={18} />,
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={`pointer-events-auto flex items-center gap-4 px-5 py-4 rounded-xl border backdrop-blur-xl min-w-[320px] max-w-[480px] shadow-xl ${variantStyles[toast.variant]}`}
    >
      <div className="shrink-0">{icons[toast.variant]}</div>
      <div className="flex-1 text-[13px] font-semibold leading-snug">
        {toast.message}
      </div>
      <button 
        className="h-6 w-6 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all opacity-60 hover:opacity-100" 
        onClick={() => onDismiss(toast.id)}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
