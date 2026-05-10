import { useState } from "react";
import { Users, XCircle, ShieldCheck, Monitor, Cpu, History, ChevronRight, Terminal, Smartphone, Zap, Fingerprint } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface EndpointRegistryProps {
  data: any[];
  onShowInfo: (user: any) => Promise<void>;
  selectedUser: any | null;
  userDevices: any[];
  onCloseDetail: () => void;
  onRevoke: (userId: string) => Promise<void>;
  isLoading: boolean;
}

export function EndpointRegistry({ 
  data, onShowInfo, selectedUser, userDevices, onCloseDetail, onRevoke, isLoading 
}: EndpointRegistryProps) {
  const [search, setSearch] = useState("");

  const filtered = data.filter(u => 
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-tactical pb-4">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded-[2px] uppercase tracking-widest">Node_Registry</span>
              <div className="h-1 w-1 rounded-full bg-accent-green animate-pulse" />
           </div>
           <h2 className="text-h2 text-text-primary">Endpoint Trust Center</h2>
        </div>
        <div className="relative group w-full md:w-64">
          <Terminal className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-cyan transition-colors" size={12} />
          <input 
            type="text" 
            placeholder="FILTER_IDENTITIES..." 
            className="input-tactical pl-8 py-1.5 text-[11px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {/* List View */}
        <div className={`flex-1 flex flex-col gap-2 transition-all duration-300 ${selectedUser ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex items-center justify-between px-2 mb-1">
             <span className="telemetry-label">Registered Nodes</span>
             <span className="text-[9px] font-mono text-text-muted uppercase">Count: {filtered.length}</span>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-1 admin-table-scroll">
            {isLoading ? (
              <div className="space-y-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 w-full bg-background-accent/50 rounded-sm animate-pulse border border-border-tactical/30" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="tactical-card flex flex-col items-center justify-center py-16 text-center space-y-4">
                <Users className="text-text-muted opacity-20" size={48} />
                <div className="space-y-1">
                   <h3 className="text-sm font-black text-text-muted uppercase">Registry_Empty</h3>
                   <p className="text-[10px] text-text-muted uppercase tracking-tighter">No authorized node identities found</p>
                </div>
              </div>
            ) : (
              filtered.map(u => (
                <button 
                  key={u.id} 
                  onClick={() => onShowInfo(u)}
                  className={`w-full flex items-center justify-between p-3 border rounded-sm transition-all text-left group relative overflow-hidden ${
                    selectedUser?.id === u.id 
                    ? 'bg-accent-cyan/[0.05] border-accent-cyan/40 shadow-[inset_0_0_10px_rgba(6,182,212,0.05)]' 
                    : 'bg-background-secondary border-border-tactical hover:border-accent-cyan/30 hover:bg-background-accent'
                  }`}
                >
                  {selectedUser?.id === u.id && (
                     <div className="absolute top-0 left-0 w-1 h-full bg-accent-cyan shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                  )}
                  
                  <div className="flex items-center gap-4 relative z-10">
                    <div className={`h-8 w-8 flex items-center justify-center text-[11px] font-black border transition-colors ${
                      selectedUser?.id === u.id ? 'bg-accent-cyan border-transparent text-background-primary' : 'bg-background-primary border-border-tactical text-text-muted'
                    }`}>
                      {u.email[0].toUpperCase()}
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[12px] font-bold text-text-primary uppercase tracking-tight group-hover:text-accent-cyan transition-colors">{u.email}</div>
                      <div className="flex items-center gap-2 text-[9px] font-mono text-text-muted uppercase">
                        <span className="flex items-center gap-1"><Cpu size={10} /> {u.device_count || 0}_NODES</span>
                        <div className="h-2 w-[1px] bg-border-tactical" />
                        <span className={`flex items-center gap-1 ${u.status === 'active' ? 'text-accent-green' : 'text-text-muted'}`}>
                          <div className={`h-1 w-1 rounded-full ${u.status === 'active' ? 'bg-accent-green shadow-[0_0_4px_rgba(16,185,129,0.5)]' : 'bg-text-muted'}`} />
                          {u.status || "UNKNOWN"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={14} className={`text-text-muted transition-all ${selectedUser?.id === u.id ? 'translate-x-1 text-accent-cyan' : 'group-hover:translate-x-0.5'}`} />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail View */}
        <AnimatePresence>
          {selectedUser && (
            <motion.div 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="w-full lg:w-[480px] bg-background-secondary border border-border-tactical rounded-sm overflow-hidden flex flex-col shadow-2xl relative"
            >
               {/* Detail Header */}
              <div className="p-4 border-b border-border-tactical flex items-center justify-between bg-background-accent/50 relative">
                 <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-background-primary border border-border-tactical flex items-center justify-center text-lg font-black text-accent-cyan shadow-inner">
                       {selectedUser.email[0].toUpperCase()}
                    </div>
                    <div>
                       <h3 className="text-[13px] font-black text-text-primary uppercase tracking-tight truncate max-w-[220px]">{selectedUser.email}</h3>
                       <div className="flex items-center gap-2 mt-0.5">
                          <div className="h-1 w-1 rounded-full bg-accent-green shadow-[0_0_4px_rgba(16,185,129,1)]" />
                          <span className="text-[9px] font-black text-accent-green uppercase tracking-widest">Active_Session</span>
                       </div>
                    </div>
                 </div>
                 <button 
                  onClick={onCloseDetail}
                  className="p-1.5 hover:bg-background-accent rounded-sm text-text-muted hover:text-accent-red transition-colors border border-transparent hover:border-accent-red/20"
                 >
                    <XCircle size={18} />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Hardware Telemetry Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-border-tactical pb-2">
                    <h4 className="telemetry-label text-accent-cyan">Hardware Telemetry</h4>
                    <span className="text-[9px] font-black text-text-muted uppercase">{userDevices.length} ATTACHED</span>
                  </div>
                  
                  {userDevices.length === 0 ? (
                    <div className="p-8 border border-dashed border-border-tactical rounded-sm text-center bg-background-primary/30">
                      <p className="text-[10px] font-mono text-text-muted uppercase">No telemetry data available for this identity</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {userDevices.map(d => (
                        <div key={d.device_id} className="p-4 border border-border-tactical bg-background-primary/50 space-y-4 group/device hover:border-accent-cyan/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 bg-background-accent border border-border-tactical flex items-center justify-center text-accent-cyan group-hover/device:shadow-[0_0_8px_rgba(6,182,212,0.2)] transition-all">
                                 {d.device_name?.toLowerCase().includes('mobile') ? <Smartphone size={16} /> : <Monitor size={16} />}
                              </div>
                              <span className="text-[12px] font-black text-text-primary uppercase tracking-tight">{d.device_name || "UNKNOWN_NODE"}</span>
                            </div>
                            <div className="flex flex-col items-end">
                               <div className="h-1.5 w-6 bg-accent-green/20 rounded-full overflow-hidden border border-accent-green/30">
                                  <div className="h-full w-full bg-accent-green animate-pulse" />
                               </div>
                               <span className="text-[8px] font-black text-accent-green uppercase mt-1">ONLINE</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3 bg-background-secondary/50 border border-border-tactical/50 font-mono text-[9px]">
                            <div>
                               <div className="telemetry-label opacity-50 mb-0.5">Physical_ID</div>
                               <div className="text-text-primary truncate">{d.device_id.toUpperCase()}</div>
                            </div>
                            <div>
                               <div className="telemetry-label opacity-50 mb-0.5">Last_Seen</div>
                               <div className="text-text-primary">{d.last_seen ? new Date(d.last_seen).toISOString().split('T')[1].split('.')[0] : 'UNKNOWN'}</div>
                            </div>
                            <div className="col-span-2">
                               <div className="telemetry-label opacity-50 mb-0.5">Public_Identity_Anchor</div>
                               <div className="text-accent-cyan truncate flex items-center gap-2">
                                  <Fingerprint size={10} /> {d.identity_key}
                               </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Secure Governance Section */}
                <div className="space-y-4">
                  <h4 className="telemetry-label text-accent-cyan border-b border-border-tactical pb-2">Governance Actions</h4>
                  <div className="grid gap-2">
                    <button className="btn-tactical btn-tactical-secondary justify-start py-3 text-[10px] font-black hover:border-accent-cyan/30">
                      <ShieldCheck size={14} className="text-accent-green mr-3" /> VERIFY_IDENTITY_STATE
                    </button>
                    <button className="btn-tactical btn-tactical-secondary justify-start py-3 text-[10px] font-black hover:border-accent-cyan/30">
                      <History size={14} className="text-accent-cyan mr-3" /> RETRIEVE_OPERATIONAL_LOGS
                    </button>
                    <button 
                      onClick={() => onRevoke(selectedUser.id)}
                      className="btn-tactical bg-accent-red/5 border-accent-red/20 text-accent-red hover:bg-accent-red hover:text-white justify-start py-3 text-[10px] font-black transition-all"
                    >
                      <XCircle size={14} className="mr-3" /> REVOKE_ENCLAVE_ACCESS
                    </button>
                  </div>
                </div>
              </div>

              {/* Detail Footer */}
              <div className="p-3 bg-background-accent/80 border-t border-border-tactical flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] text-text-muted font-black tracking-widest uppercase">
                  <Zap size={10} className="text-accent-amber" /> Realtime_Telemetry_Active
                </div>
                <div className="text-[9px] font-mono text-text-muted/40 uppercase">UID_{selectedUser.id.slice(0, 8)}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
