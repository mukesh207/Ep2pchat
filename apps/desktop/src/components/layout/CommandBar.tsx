import { useEffect, useState } from "react";
import { Shield, Search, BellOff, Command } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useUIStore } from "../../stores/useUIStore";

export const CommandBar = () => {
  const session = useAuthStore((state) => state.session);
  const securityStatus = useUIStore((state) => state.securityStatus);
  const [uptime, setUptime] = useState("00:00:00");
  
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setUptime(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="tactical-header z-50 flex items-center justify-between border-b border-border-tactical bg-background-secondary/90 backdrop-blur-md px-4 select-none shrink-0">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-accent-cyan flex items-center justify-center rounded-[2px] shadow-[0_0_8px_rgba(6,182,212,0.2)]">
            <Shield size={14} className="text-background-primary" strokeWidth={3} />
          </div>
          <span className="text-[12px] font-black tracking-[0.2em] uppercase text-text-primary">Trustline</span>
        </div>
        
        <div className="h-4 w-[1px] bg-border-tactical" />
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="telemetry-label">Threat Level</span>
            <div className="flex items-center gap-1.5">
              <div className={`status-dot ${securityStatus === 'protected' ? 'bg-accent-green' : securityStatus === 'alert' ? 'bg-accent-amber' : 'bg-accent-red'} shadow-[0_0_4px_rgba(16,185,129,0.5)]`} />
              <span className={`telemetry-value ${securityStatus === 'protected' ? 'text-accent-green' : securityStatus === 'alert' ? 'text-accent-amber' : 'text-accent-red'}`}>
                {securityStatus === 'protected' ? 'Alpha-1' : securityStatus === 'alert' ? 'Beta-4' : 'Omega-9'}
              </span>
            </div>
          </div>
          
          <div className="flex flex-col">
            <span className="telemetry-label">Uptime</span>
            <span className="telemetry-value">{uptime}</span>
          </div>

          <div className="flex flex-col">
            <span className="telemetry-label">Integrity</span>
            <span className="telemetry-value text-accent-cyan">99.9%</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 bg-background-primary/50 px-3 py-1 rounded-sm border border-border-tactical">
           <div className="flex flex-col items-end">
              <span className="telemetry-label">Active Node</span>
              <span className="telemetry-value text-[10px] opacity-80 truncate max-w-[120px]">{session?.email || "NOT_INITIALIZED"}</span>
           </div>
           <div className="h-6 w-[1px] bg-border-tactical" />
           <div className="flex items-center gap-2">
              <div className="status-dot bg-accent-cyan animate-pulse" />
              <span className="text-[10px] font-bold text-accent-cyan uppercase tracking-widest">Live Sync</span>
           </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-background-accent rounded-sm text-text-muted hover:text-text-primary transition-colors">
            <Search size={16} />
          </button>
          <button className="p-1.5 hover:bg-background-accent rounded-sm text-text-muted hover:text-text-primary transition-colors">
            <BellOff size={16} />
          </button>
          <button className="p-1.5 hover:bg-background-accent rounded-sm text-text-muted hover:text-text-primary transition-colors">
             <Command size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
