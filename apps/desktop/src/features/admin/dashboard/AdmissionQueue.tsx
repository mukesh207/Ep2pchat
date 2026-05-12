import { useState } from "react";
import { CheckCircle, UserCheck, Shield, Clock, Terminal, UserX, Cpu, Fingerprint } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AdmissionQueueProps {
  data: any[];
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  isLoading: boolean;
}

export function AdmissionQueue({ data, onApprove, onReject, isLoading }: AdmissionQueueProps) {
  const [search, setSearch] = useState("");

  const filtered = data.filter(u => 
    (u.username || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-tactical pb-4">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded-[2px] uppercase tracking-widest">Entry_Buffer</span>
              <div className="h-1 w-1 rounded-full bg-accent-amber animate-pulse" />
           </div>
           <h2 className="text-h2 text-text-primary">Node Admission Queue</h2>
        </div>
        <div className="relative group w-full md:w-64">
          <Terminal className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-cyan transition-colors" size={12} />
          <input 
            type="text" 
            placeholder="SCAN_PENDING_REQUESTS..." 
            className="input-tactical pl-8 py-1.5 text-[11px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 admin-table-scroll">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 w-full bg-background-accent/50 rounded-sm animate-pulse border border-border-tactical/30" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="tactical-card flex flex-col items-center justify-center py-24 text-center space-y-4 bg-background-primary/30">
            <div className="h-16 w-16 rounded-sm border border-border-tactical flex items-center justify-center bg-background-secondary shadow-inner opacity-20">
              <UserCheck className="text-text-muted" size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-text-muted uppercase tracking-widest">Buffer_Clear</h3>
              <p className="text-[10px] text-text-muted uppercase tracking-tighter">No pending node connection requests detected</p>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map(u => (
              <motion.div 
                key={u.id} 
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="tactical-card p-0 border border-border-tactical bg-background-secondary overflow-hidden group hover:border-accent-cyan/30 transition-all shadow-xl"
              >
                <div className="p-1 border-b border-border-tactical bg-background-accent/30 flex items-center justify-between px-4 py-1.5">
                   <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-text-primary uppercase tracking-[0.2em]">Incoming_Access_Request</span>
                      <div className="h-2 w-[1px] bg-border-tactical" />
                      <span className="text-[9px] font-mono text-text-muted">UID_{u.id.slice(0, 8)}</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                      <div className="h-1 w-1 bg-accent-amber rounded-full animate-pulse" />
                      <span className="text-[8px] font-black text-accent-amber uppercase tracking-widest">Awaiting_Approval</span>
                   </div>
                </div>

                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 border border-border-tactical flex items-center justify-center text-xl font-black text-accent-cyan bg-background-primary shadow-inner">
                      {(u.username || u.email)[0].toUpperCase()}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[13px] font-black text-text-primary uppercase tracking-tight group-hover:text-accent-cyan transition-colors">{u.username || u.email}</div>
                      <div className="flex items-center gap-4 text-[9px] font-mono text-text-muted uppercase">
                        <span className="flex items-center gap-1.5"><Shield size={10} /> {u.email}</span>
                        <span className="flex items-center gap-1.5"><Clock size={10} /> REC_ {new Date(u.requested_at || Date.now()).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 bg-background-primary/50 p-3 border border-border-tactical/50 rounded-sm">
                    <div className="hidden lg:block space-y-1">
                      <span className="telemetry-label opacity-60">Handshake_Key</span>
                      <div className="text-[12px] font-mono font-bold text-accent-cyan tracking-widest">{u.access_code || "XXXX-XXXX"}</div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                       <button 
                          onClick={() => onReject(u.id)}
                          className="h-9 w-9 flex items-center justify-center border border-border-tactical hover:bg-accent-red/10 hover:text-accent-red hover:border-accent-red/30 transition-all rounded-sm text-text-muted" title="Reject Request">
                          <UserX size={16} />
                       </button>
                       <button 
                        onClick={() => onApprove(u.id)}
                        className="btn-tactical btn-tactical-primary h-9 px-4 border border-accent-cyan shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                       >
                         <CheckCircle size={14} className="mr-2" /> AUTHORIZE_NODE
                       </button>
                    </div>
                  </div>
                </div>

                <div className="p-2 border-t border-border-tactical bg-background-accent/10 flex items-center gap-6 px-4">
                   <div className="flex items-center gap-2">
                      <Fingerprint size={10} className="text-text-muted" />
                      <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Hardware_Signature: [NOT_VERIFIED]</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <Cpu size={10} className="text-text-muted" />
                      <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Protocol: X3DH_v4</span>
                   </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
