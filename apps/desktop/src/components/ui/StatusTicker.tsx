import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MESSAGES = [
  "E2E_ENCRYPTION_ACTIVE",
  "ZERO_KNOWLEDGE_ROUTING_ENABLED",
  "X3DH_HANDSHAKE_VERIFIED",
  "RLS_POLICIES_ENFORCED",
  "LOCAL_VAULT_LOCKED",
  "FORWARD_SECRECY_ENGAGED",
];

export default function StatusTicker() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIdx(i => (i + 1) % MESSAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 px-3 py-1 border border-border-tactical bg-background-primary/40 select-none">
      <div className="h-1.5 w-1.5 rounded-full bg-accent-cyan shadow-[0_0_4px_rgba(6,182,212,0.8)] animate-pulse" />
      <div className="h-4 overflow-hidden min-w-[200px] flex items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.2 }}
            className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2"
          >
            <span className="text-accent-cyan/50 font-mono">[{idx.toString().padStart(2, '0')}]</span>
            {MESSAGES[idx]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
