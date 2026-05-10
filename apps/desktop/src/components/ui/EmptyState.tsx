import type { ReactNode } from "react";
import { Terminal, Activity } from "lucide-react";
import { motion } from "framer-motion";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

/**
 * Tactical Empty State Placeholder.
 * Inspired by professional monitoring dashboards.
 */
export default function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-6 animate-in fade-in duration-500 select-none">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative"
      >
        {/* Decorative scan ring */}
        <div className="absolute inset-0 -m-4 border border-accent-cyan/10 rounded-full animate-pulse-slow" />
        <div className="absolute inset-0 -m-8 border border-accent-cyan/5 rounded-full animate-ping [animation-duration:4s]" />
        
        <div className="h-16 w-16 border border-border-tactical bg-background-secondary flex items-center justify-center shadow-inner relative z-10">
          {icon ?? <Terminal size={32} className="text-text-muted opacity-30" strokeWidth={1.5} />}
        </div>
      </motion.div>

      <div className="space-y-1.5 relative z-10">
        <h3 className="text-sm font-black text-text-primary tracking-[0.2em] uppercase">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[10px] font-mono text-text-muted max-w-[280px] mx-auto leading-relaxed uppercase opacity-60">
            [SYS_MSG]: {subtitle}
          </p>
        )}
      </div>

      {action && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-10"
        >
          {action}
        </motion.div>
      )}

      {/* Decorative corners */}
      <div className="mt-12 flex items-center gap-1.5 opacity-20">
         <Activity size={12} className="text-accent-cyan" />
         <span className="text-[8px] font-black tracking-widest uppercase">Buffer_Standby</span>
      </div>
    </div>
  );
}
