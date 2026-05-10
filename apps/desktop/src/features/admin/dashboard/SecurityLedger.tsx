import { useState, useMemo } from "react";
import { Search, Filter, Download, User, Activity, ShieldCheck, Globe, Clock, ArrowDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SecurityLedgerProps {
  data: any[];
  isLoading: boolean;
}

export function SecurityLedger({ data, isLoading }: SecurityLedgerProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => data.filter(l => 
    (l.action || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.actor_email || "").toLowerCase().includes(search.toLowerCase())
  ), [data, search]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-tactical pb-4">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded-[2px] uppercase tracking-widest">Audit_Log</span>
              <div className="h-1 w-1 rounded-full bg-accent-cyan animate-pulse" />
           </div>
           <h2 className="text-h2 text-text-primary">Threat Intelligence Stream</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group w-full md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-cyan transition-colors" size={12} />
            <input 
              type="text" 
              placeholder="SEARCH_AUDIT_TRAIL..." 
              className="input-tactical pl-8 py-1.5 text-[11px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-tactical btn-tactical-secondary p-1.5 border-border-tactical">
            <Filter size={14} />
          </button>
          <button className="btn-tactical btn-tactical-secondary p-1.5 border-border-tactical">
            <Download size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-background-primary/30 border border-border-tactical rounded-sm overflow-hidden flex flex-col relative">
        {/* Table Header */}
        <div className="grid grid-cols-[1.2fr_2fr_1fr] gap-4 p-3 border-b border-border-tactical bg-background-accent/40 select-none">
          <div className="telemetry-label">Temporal / Origin</div>
          <div className="telemetry-label">Operation / Payload</div>
          <div className="telemetry-label text-right">Integrity / State</div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar font-mono admin-table-scroll">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-12 w-full bg-background-accent/50 rounded-sm animate-pulse border border-border-tactical/30" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <Activity className="text-text-muted opacity-10" size={64} />
              <div className="space-y-1">
                 <h3 className="text-sm font-black text-text-muted uppercase tracking-widest">No Security Events</h3>
                 <p className="text-[10px] text-text-muted uppercase tracking-tighter">Identity stream buffer is empty</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border-tactical/30">
              <AnimatePresence initial={false}>
                {filtered.map(l => (
                  <motion.div 
                    key={l.id} 
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="grid grid-cols-[1.2fr_2fr_1fr] gap-4 p-3 hover:bg-accent-cyan/[0.02] transition-colors items-start group"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-text-primary font-bold text-[11px]">
                        <User size={12} className="text-accent-cyan" />
                        {l.actor_email?.toUpperCase() || "SYSTEM_AGENT"}
                      </div>
                      <div className="flex items-center gap-2 text-text-muted text-[10px]">
                        <Clock size={10} />
                        {new Date(l.created_at).toISOString().replace('T', ' ').split('.')[0]}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-sm bg-accent-cyan" />
                        <span className="text-[11px] font-black text-text-primary tracking-widest uppercase">{l.action}</span>
                      </div>
                      <div className="bg-background-primary/80 border border-border-tactical/50 p-2 overflow-hidden group-hover:border-accent-cyan/20 transition-colors">
                         <pre className="text-[9px] text-accent-cyan/60 leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono">
                           {JSON.stringify(l.details)}
                         </pre>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2 bg-background-accent/50 px-2 py-0.5 border border-border-tactical/50 rounded-[1px]">
                         <ShieldCheck size={10} className="text-accent-green" />
                         <span className="text-[9px] font-black text-text-primary uppercase">Verified</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[8px] text-text-muted font-black tracking-widest uppercase opacity-40 group-hover:opacity-100 transition-opacity">
                        <Globe size={10} /> Gen-4_Ledger
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="p-2 border-t border-border-tactical bg-background-accent/40 flex items-center justify-between px-4">
           <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                 <div className="h-1 w-1 rounded-full bg-accent-green animate-ping" />
                 <span className="text-[9px] font-black text-text-muted uppercase">Scanning_Realtime</span>
              </div>
              <span className="text-[9px] font-mono text-text-muted/40 uppercase tracking-widest">Events: {filtered.length}</span>
           </div>
           <button className="text-accent-cyan hover:text-white transition-colors">
              <ArrowDown size={14} />
           </button>
        </div>
      </div>
    </div>
  );
}
