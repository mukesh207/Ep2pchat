import { Lock } from "lucide-react";
import { motion } from "framer-motion";

/**
 * EncryptionSpinner — shown during X3DH handshaking
 * Animated orbital ring with a central lock icon
 */
export default function EncryptionSpinner({ label = "ESTABLISHING_SECURE_CHANNEL" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-10 space-y-8">
      {/* Orbital rings */}
      <div className="relative h-20 w-20 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border border-dashed border-accent-purple/30"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-2 rounded-full border border-dashed border-accent-cyan/20"
        />
        <div className="h-10 w-10 rounded-lg bg-background-secondary border border-border-tactical flex items-center justify-center text-accent-purple shadow-sm z-10">
          <Lock size={18} className="animate-pulse" />
        </div>
      </div>

      {/* Label */}
      <div className="text-center space-y-2 relative z-10">
        <div className="text-[11px] font-bold text-accent-purple uppercase tracking-[0.15em]">
          {label}
        </div>
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
              className="h-1 w-1 rounded-full bg-accent-purple"
            />
          ))}
        </div>
      </div>

      {/* Protocol Label */}
      <div className="text-[9px] font-mono text-text-muted uppercase tracking-widest font-medium opacity-40">
        X3DH::CURVE25519::XCHACHA20
      </div>
    </div>
  );
}
