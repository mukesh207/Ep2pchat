import { ShieldOff, CheckCircle, Database, Lock, Globe, Server, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import * as vault from "../../../infrastructure/vault";
import * as api from "../../../infrastructure/api";

export function OrganizationSettings() {
  const [natsStatus, setNatsStatus] = useState({ state: "CHECKING", color: "bg-accent-amber text-accent-amber" });
  const [dbStatus, setDbStatus] = useState({ state: "CHECKING", color: "bg-accent-amber text-accent-amber" });

  useEffect(() => {
    let mounted = true;
    const fetchHealth = async () => {
      try {
        const dbRes = await api.requestJson("/health/db").catch(() => ({}));
        const natsRes = await api.requestJson("/health/nats").catch(() => ({}));
        
        if (mounted) {
          setDbStatus({
            state: dbRes.status === "connected" ? "OPTIMAL_SECURE" : "DEGRADED",
            color: dbRes.status === "connected" ? "bg-accent-green text-accent-green" : "bg-accent-amber text-accent-amber"
          });
          setNatsStatus({
            state: natsRes.status === "connected" ? "OPTIMAL_FLOW" : "DEGRADED",
            color: natsRes.status === "connected" ? "bg-accent-green text-accent-green" : "bg-accent-amber text-accent-amber"
          });
        }
      } catch {
        if (mounted) {
          setDbStatus({ state: "OFFLINE", color: "bg-accent-red text-accent-red" });
          setNatsStatus({ state: "OFFLINE", color: "bg-accent-red text-accent-red" });
        }
      }
    };
    fetchHealth();
  }, []);

  const handleWipeVault = async () => {
    if (confirm("⚠ CRITICAL: SEVER_ALL_IDENTITIES? This will destroy all local keys and communication history. This operation is irreversible.")) {
      try { 
        const v = await vault.initVault(); 
        await v.execute("DELETE FROM local_keys"); 
        await v.execute("DELETE FROM messages"); 
      } catch {}
      window.location.reload();
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-tactical pb-4">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded-[2px] uppercase tracking-widest">Enclave_Config</span>
              <div className="h-1 w-1 rounded-full bg-accent-cyan" />
           </div>
           <h2 className="text-h2 text-text-primary">Governance Control Center</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Retention Policy */}
        <div className="tactical-card p-0 overflow-hidden border border-border-tactical">
          <div className="p-3 border-b border-border-tactical bg-background-accent/30 flex items-center gap-3">
            <Database size={16} className="text-accent-cyan" />
            <span className="text-[11px] font-black text-text-primary uppercase tracking-widest">Data_Retention_Protocols</span>
          </div>
          
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="telemetry-label">Retention_Horizon</label>
              <select className="input-tactical py-1.5 text-[11px] bg-background-primary/50 cursor-pointer border-border-tactical/50">
                <option>PERMANENT_AUDIT_ONLY</option>
                <option selected>30_DAY_ENTERPRISE_CYCLE</option>
                <option>7_DAY_HIGH_SEC_PURGE</option>
                <option>24_HOUR_STRICT_EPHEMERAL</option>
              </select>
            </div>
            <div className="p-3 border border-border-tactical/30 bg-background-primary/30 rounded-sm">
               <p className="text-[10px] font-mono text-text-muted leading-relaxed uppercase">
                 [NOTICE]: All encrypted routing metadata and audit trails will be hard-purged from the secure buffer after the selected temporal window.
               </p>
            </div>
          </div>
        </div>

        {/* Node Enrollment */}
        <div className="tactical-card p-0 overflow-hidden border border-border-tactical">
          <div className="p-3 border-b border-border-tactical bg-background-accent/30 flex items-center gap-3">
            <Globe size={16} className="text-accent-cyan" />
            <span className="text-[11px] font-black text-text-primary uppercase tracking-widest">Node_Enrollment_Logic</span>
          </div>

          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between p-3 border border-border-tactical/50 bg-background-primary/40 group hover:border-accent-cyan/30 transition-all cursor-pointer">
              <div className="space-y-0.5">
                <div className="text-[11px] font-black text-text-primary uppercase tracking-tight">Open_Registration</div>
                <div className="text-[9px] font-mono text-text-muted uppercase">Allow_External_Admission</div>
              </div>
              <div className="h-5 w-10 border border-border-tactical p-0.5 bg-background-primary">
                 <div className="h-full w-4 bg-accent-cyan shadow-[0_0_8px_rgba(6,182,212,0.5)] translate-x-4 transition-transform" />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border border-border-tactical/50 bg-background-primary/40 group hover:border-accent-cyan/30 transition-all cursor-pointer">
              <div className="space-y-0.5">
                <div className="text-[11px] font-black text-text-primary uppercase tracking-tight">Hardware_MFA_Enforce</div>
                <div className="text-[9px] font-mono text-text-muted uppercase">Require_TPM_Anchors</div>
              </div>
              <div className="h-5 w-10 border border-border-tactical p-0.5 bg-background-primary">
                 <div className="h-full w-4 bg-text-muted opacity-20 translate-x-0 transition-transform" />
              </div>
            </div>
          </div>
        </div>

        {/* Infrastructure Health */}
        <div className="tactical-card p-0 overflow-hidden border border-border-tactical md:col-span-2 lg:col-span-1">
          <div className="p-3 border-b border-border-tactical bg-background-accent/30 flex items-center gap-3">
            <Server size={16} className="text-accent-cyan" />
            <span className="text-[11px] font-black text-text-primary uppercase tracking-widest">Infrastructure_Telemetry</span>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between py-1.5 border-b border-border-tactical/30">
              <span className="text-[10px] font-black text-text-muted uppercase tracking-tighter">NATS_JetStream_Cluster</span>
              <div className="flex items-center gap-2">
                <div className={`h-1 w-1 ${natsStatus.color.split(' ')[0]} animate-pulse`} />
                <span className={`text-[9px] font-mono ${natsStatus.color.split(' ')[1]} font-bold`}>{natsStatus.state}</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border-tactical/30">
              <span className="text-[10px] font-black text-text-muted uppercase tracking-tighter">PostgreSQL_RLS_Matrix</span>
              <div className="flex items-center gap-2">
                <div className={`h-1 w-1 ${dbStatus.color.split(' ')[0]}`} />
                <span className={`text-[9px] font-mono ${dbStatus.color.split(' ')[1]} font-bold`}>{dbStatus.state}</span>
              </div>
            </div>
            {(natsStatus.state !== "OPTIMAL_FLOW" || dbStatus.state !== "OPTIMAL_SECURE") && (
              <div className="p-2 border border-accent-amber/20 bg-accent-amber/5 rounded-sm flex gap-3">
                <AlertTriangle size={14} className="text-accent-amber shrink-0" />
                <p className="text-[9px] font-mono text-accent-amber uppercase leading-snug">
                  Warning: High_Availability_Disabled. Scaling_Required.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* System Destruction Zone */}
        <div className="tactical-card p-0 overflow-hidden border-accent-red/30 bg-accent-red/[0.02] md:col-span-2 lg:col-span-1">
          <div className="p-3 border-b border-accent-red/20 bg-accent-red/5 flex items-center gap-3">
            <Lock size={16} className="text-accent-red" />
            <span className="text-[11px] font-black text-accent-red uppercase tracking-widest">Critical_Override_Sector</span>
          </div>

          <div className="p-4 space-y-3">
            <button 
              onClick={handleWipeVault}
              className="btn-tactical bg-accent-red/10 border border-accent-red/30 text-accent-red hover:bg-accent-red hover:text-white w-full py-3.5 text-[10px] font-black"
            >
              <ShieldOff size={14} className="mr-2" /> WIPE_LOCAL_ENCLAVE_BUFFER
            </button>
            <button className="btn-tactical btn-tactical-primary w-full py-3.5 text-[10px] font-black shadow-[0_0_20px_rgba(6,182,212,0.15)] border-accent-cyan">
              <CheckCircle size={14} className="mr-2" /> PUSH_GLOBAL_CONFIG_UPDATE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
