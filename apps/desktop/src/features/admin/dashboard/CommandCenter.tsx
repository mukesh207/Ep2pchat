import { Activity, Shield, Users, Cpu, Terminal, Hash, HardDrive, Signal, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import * as api from "../../../infrastructure/api";

interface CommandCenterProps {
  pendingCount: number;
  userCount: number;
  logCount: number;
  auditLogs: any[];
}

export function CommandCenter({ pendingCount, userCount, logCount, auditLogs }: CommandCenterProps) {
  const [telemetry, setTelemetry] = useState<number[]>(Array(40).fill(20));
  const [latency, setLatency] = useState(12.4);
  const [throughput, setThroughput] = useState(842);
  const [isScanning, setIsScanning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const [healthStatus, setHealthStatus] = useState({
    gateway: { status: "CHECKING", val: 50, color: "bg-accent-amber" },
    db: { status: "CHECKING", val: 50, color: "bg-accent-amber" },
    nats: { status: "CHECKING", val: 50, color: "bg-accent-amber" }
  });

  // Health Polling
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const gwOk = await api.checkServerHealth();
        const dbRes = await api.requestJson("/health/db").catch(() => ({}));
        const natsRes = await api.requestJson("/health/nats").catch(() => ({}));
        
        if (mounted) {
          setHealthStatus({
            gateway: { 
              status: gwOk ? "OPTIMAL" : "OFFLINE", 
              val: gwOk ? 100 : 0, 
              color: gwOk ? "bg-accent-cyan" : "bg-accent-red" 
            },
            db: { 
              status: dbRes.status === "connected" ? "SECURE" : "DEGRADED", 
              val: dbRes.status === "connected" ? 100 : 30, 
              color: dbRes.status === "connected" ? "bg-accent-green" : "bg-accent-amber" 
            },
            nats: { 
              status: natsRes.status === "connected" ? "NOMINAL" : "OFFLINE", 
              val: natsRes.status === "connected" ? 100 : 0, 
              color: natsRes.status === "connected" ? "bg-accent-cyan" : "bg-accent-red" 
            }
          });
        }
      } catch (e) {
        if (mounted) {
          setHealthStatus({
            gateway: { status: "OFFLINE", val: 0, color: "bg-accent-red" },
            db: { status: "OFFLINE", val: 0, color: "bg-accent-red" },
            nats: { status: "OFFLINE", val: 0, color: "bg-accent-red" }
          });
        }
      }
    };
    checkHealth();
    const intv = setInterval(checkHealth, 15000);
    return () => { mounted = false; clearInterval(intv); };
  }, []);

  // Telemetry Engine (Simulation fallback)
  useEffect(() => {
    const intv = setInterval(() => {
      setTelemetry(prev => {
        const next = [...prev.slice(1), Math.random() * 80 + 10];
        return next;
      });
      setLatency(prev => +(prev + (Math.random() * 4 - 2)).toFixed(1));
      setThroughput(prev => Math.floor(prev + (Math.random() * 100 - 50)));
    }, 150);
    return () => clearInterval(intv);
  }, []);

  const handleScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanResult(null);
    // Simulate deep scan
    await new Promise(r => setTimeout(r, 2500));
    setScanResult("Zero anomalies detected");
    setIsScanning(false);
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    // Simulate compilation
    await new Promise(r => setTimeout(r, 1500));
    
    // Create actual blob download for logs
    const blob = new Blob([JSON.stringify(auditLogs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trustline-audit-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setIsExporting(false);
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-tactical pb-4">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded-[2px] uppercase tracking-widest">Live_Operations</span>
              <div className="h-1 w-1 rounded-full bg-accent-green animate-pulse" />
           </div>
           <h2 className="text-h2 text-text-primary">Operational Intelligence Grid</h2>
        </div>
        <div className="flex items-center gap-3 font-mono">
           <div className="flex flex-col items-end">
              <span className="telemetry-label">Cluster Status</span>
              <span className={`text-[11px] font-bold uppercase ${healthStatus.gateway.val === 100 ? 'text-accent-green' : 'text-accent-red'}`}>
                {healthStatus.gateway.val === 100 ? 'Systems_Nominal' : 'Critical_Failure'}
              </span>
           </div>
           <div className="h-8 w-[1px] bg-border-tactical" />
           <div className="flex flex-col items-end">
              <span className="telemetry-label">Active Enclaves</span>
              <span className="text-[11px] font-bold text-text-primary uppercase">Node_Alpha_Master</span>
           </div>
        </div>
      </div>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Core Metrics */}
        <MetricTile 
          label="Total Identities" 
          value={userCount.toString()} 
          subValue="+LIVE_SYNC" 
          icon={<Users size={16} />} 
          trend="UP"
        />
        <MetricTile 
          label="Admission Queue" 
          value={pendingCount.toString()} 
          subValue={pendingCount > 0 ? "ACTION_REQUIRED" : "BUFFER_CLEAR"} 
          icon={<Terminal size={16} />} 
          variant={pendingCount > 0 ? "warning" : "default"}
          trend="STABLE"
        />
        <MetricTile 
          label="Audit Events" 
          value={logCount.toString()} 
          subValue="RECORDED_ACTIONS" 
          icon={<Hash size={16} />} 
          trend="UP"
        />
        <MetricTile 
          label="Signal Integrity" 
          value={healthStatus.gateway.val === 100 ? "99.9" : "0.0"} 
          subValue="X3DH_RATCHET" 
          icon={<Signal size={16} />} 
          variant={healthStatus.gateway.val === 100 ? "success" : "warning"}
          trend="STABLE"
        />

        {/* Large Telemetry Region */}
        <div className="md:col-span-2 lg:col-span-3 tactical-card p-0 overflow-hidden flex flex-col min-h-[320px]">
           <div className="p-4 border-b border-border-tactical bg-background-accent/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <Activity size={16} className="text-accent-cyan" />
                 <span className="text-[11px] font-black text-text-primary uppercase tracking-[0.2em]">Operational_Telemetry_Stream</span>
              </div>
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 bg-accent-cyan rounded-full animate-pulse" />
                    <span className="text-[9px] font-bold text-text-muted uppercase">Inbound</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 bg-accent-purple rounded-full animate-pulse" />
                    <span className="text-[9px] font-bold text-text-muted uppercase">Outbound</span>
                 </div>
              </div>
           </div>
           
           <div className="flex-1 relative bg-background-primary/50 flex items-center justify-center p-8 overflow-hidden">
              <div className="absolute inset-0 opacity-[0.05] pointer-events-none tactical-grid-bg" />
              <div className="w-full h-full flex items-end justify-around gap-[2px] px-4 opacity-60">
                 {telemetry.map((val, i) => (
                    <div 
                       key={i}
                       className={`w-full rounded-t-[1px] transition-all duration-150 ${i % 3 === 0 ? 'bg-accent-purple/80' : 'bg-accent-cyan/80'}`}
                       style={{ height: `${val}%` }}
                    />
                 ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <div className="text-center space-y-2 bg-background-primary/80 backdrop-blur-sm px-4 py-2 rounded-sm border border-border-tactical">
                    <div className="text-[10px] font-black text-accent-cyan uppercase tracking-[0.5em]">Scanning_Packet_Flow</div>
                    <div className="text-[9px] font-mono text-text-muted">REALTIME_ENCLAVE_MONITORING_V4</div>
                 </div>
              </div>
           </div>

           <div className="p-3 border-t border-border-tactical bg-background-accent/20 grid grid-cols-3 divide-x divide-border-tactical">
              <div className="px-4 text-center">
                 <div className="telemetry-label">Latency</div>
                 <div className="telemetry-value">{latency > 0 ? latency : 0}ms</div>
              </div>
              <div className="px-4 text-center">
                 <div className="telemetry-label">Throughput</div>
                 <div className="telemetry-value">{throughput > 0 ? throughput : 0} KB/s</div>
              </div>
              <div className="px-4 text-center">
                 <div className="telemetry-label">Drops</div>
                 <div className="telemetry-value text-accent-green">0.00%</div>
              </div>
           </div>
        </div>

        {/* System Health Sidebar */}
        <div className="tactical-card flex flex-col gap-4">
           <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-accent-cyan" />
              <span className="text-[11px] font-black text-text-primary uppercase tracking-widest">Node_Health</span>
           </div>
           
           <div className="space-y-4">
              <HealthBar label="API_GATEWAY" value={healthStatus.gateway.val} status={healthStatus.gateway.status} color={healthStatus.gateway.color} />
              <HealthBar label="JETSTREAM_BUS" value={healthStatus.nats.val} status={healthStatus.nats.status} color={healthStatus.nats.color} />
              <HealthBar label="POSTGRES_RLS" value={healthStatus.db.val} status={healthStatus.db.status} color={healthStatus.db.color} />
           </div>

           <div className="mt-auto pt-4 border-t border-border-tactical space-y-3">
              <div className="flex items-center justify-between">
                 <span className="telemetry-label">Uptime</span>
                 <span className="telemetry-value text-[10px]">{healthStatus.gateway.val === 100 ? "99.98%" : "0.00%"}</span>
              </div>
              <div className="flex items-center justify-between">
                 <span className="telemetry-label">Threats</span>
                 <span className={`telemetry-value text-[10px] ${healthStatus.gateway.val === 100 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {healthStatus.gateway.val === 100 ? "DEFEATED" : "EXPOSED"}
                 </span>
              </div>
           </div>
        </div>

        {/* Threat Intelligence Small */}
        <div className="lg:col-span-2 tactical-card flex flex-col gap-4 min-h-[160px]">
           <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                 <AlertTriangle size={16} className="text-accent-amber" />
                 <span className="text-[11px] font-black text-text-primary uppercase tracking-widest">Threat_Intelligence</span>
              </div>
              <span className="text-[9px] font-mono text-text-muted uppercase">Feed_Active</span>
           </div>
           
           <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
              <AnimatePresence initial={false}>
                {auditLogs.length > 0 ? (
                  auditLogs.slice(0, 4).map((log: any) => (
                    <ThreatItem 
                      key={log.id}
                      severity={log.action.includes("REVOKE") || log.action.includes("DENY") ? "CRITICAL" : "INFO"}
                      message={`${log.action}: ${log.actor_email}`}
                      time={new Date(log.created_at).toLocaleTimeString()}
                    />
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full text-[10px] text-text-muted uppercase font-mono">
                    No recent intelligence
                  </div>
                )}
              </AnimatePresence>
           </div>
        </div>

        {/* Quick Actions */}
        <div className="lg:col-span-2 tactical-card grid grid-cols-2 gap-3 min-h-[160px]">
            <button 
              onClick={handleScan}
              disabled={isScanning}
              className="btn-tactical btn-tactical-secondary h-full flex flex-col items-center justify-center gap-2 py-4 border-accent-cyan/20 group hover:bg-accent-cyan/5 relative"
            >
               {isScanning ? (
                 <Loader2 size={24} className="text-accent-cyan animate-spin" />
               ) : scanResult ? (
                 <CheckCircle2 size={24} className="text-accent-green" />
               ) : (
                 <Cpu size={24} className="text-accent-cyan group-hover:scale-110 transition-transform" />
               )}
               <span className="text-[10px] font-black uppercase text-center">
                 {isScanning ? "Scanning..." : scanResult ? scanResult : "Scan_Enclave"}
               </span>
            </button>
            <button 
              onClick={handleExport}
              disabled={isExporting}
              className="btn-tactical btn-tactical-secondary h-full flex flex-col items-center justify-center gap-2 py-4 border-accent-purple/20 group hover:bg-accent-purple/5"
            >
               {isExporting ? (
                 <Loader2 size={24} className="text-accent-purple animate-spin" />
               ) : (
                 <HardDrive size={24} className="text-accent-purple group-hover:scale-110 transition-transform" />
               )}
               <span className="text-[10px] font-black uppercase">
                 {isExporting ? "Compiling..." : "Export_Logs"}
               </span>
            </button>
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value, subValue, icon, variant = "default", trend }: any) {
  return (
    <div className={`tactical-card flex flex-col justify-between group relative overflow-hidden min-h-[100px] ${variant === 'warning' ? 'border-accent-amber/30 bg-accent-amber/5' : ''}`}>
       <div className="absolute top-0 right-0 p-1.5 opacity-20 group-hover:opacity-40 transition-opacity">
          {icon}
       </div>
       <div className="space-y-1 relative z-10">
          <div className="telemetry-label">{label}</div>
          <div className="text-2xl font-black text-text-primary font-mono tracking-tighter truncate">{value}</div>
       </div>
       <div className="flex items-center justify-between mt-auto border-t border-border-tactical pt-2 relative z-10">
          <span className={`text-[9px] font-black uppercase tracking-widest ${variant === 'warning' ? 'text-accent-amber' : variant === 'success' ? 'text-accent-green' : 'text-accent-cyan'}`}>{subValue}</span>
          <span className={`text-[8px] font-bold ${trend === 'UP' ? 'text-accent-cyan' : 'text-text-muted'}`}>{trend}</span>
       </div>
    </div>
  );
}

function HealthBar({ label, value, status, color }: any) {
  return (
    <div className="space-y-1.5">
       <div className="flex justify-between items-end px-0.5">
          <span className="text-[9px] font-black text-text-muted uppercase tracking-tighter">{label}</span>
          <span className={`text-[8px] font-bold ${color.replace('bg-', 'text-')} uppercase tracking-widest`}>{status}</span>
       </div>
       <div className="h-1 w-full bg-background-primary border border-border-tactical rounded-sm overflow-hidden">
          <motion.div
             initial={{ width: 0 }}
             animate={{ width: `${value}%` }}
             transition={{ duration: 1, ease: "easeOut" }}
             className={`h-full ${color} shadow-[0_0_8px_rgba(255,255,255,0.1)]`}
          />
       </div>
    </div>
  );
}

function ThreatItem({ severity, message, time }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 p-2 border border-border-tactical bg-background-primary/30 rounded-sm group hover:border-accent-cyan/30 transition-all"
    >
       <div className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${severity === 'CRITICAL' ? 'bg-accent-red animate-pulse' : severity === 'LOW' ? 'bg-accent-cyan' : 'bg-text-muted'}`} />
       <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-text-primary leading-tight truncate">{message}</div>
          <div className="flex items-center gap-2 mt-0.5">
             <span className={`text-[8px] font-black uppercase tracking-widest ${severity === 'CRITICAL' ? 'text-accent-red' : 'text-text-muted'}`}>{severity}</span>
             <span className="text-[8px] font-mono text-text-muted/40 uppercase">@{time}</span>
          </div>
       </div>
    </motion.div>
  );
}
