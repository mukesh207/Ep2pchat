import { useState, useEffect } from "react";
import { Activity, Shield, Users, ClipboardList, Settings, LogOut, AlertTriangle, Cpu, Globe, ArrowLeft } from "lucide-react";
import * as api from "../../infrastructure/api";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../../stores/useAuthStore";
import { useUIStore } from "../../stores/useUIStore";

// Modular Components
import { CommandCenter } from "./dashboard/CommandCenter";
import { AdmissionQueue } from "./dashboard/AdmissionQueue";
import { EndpointRegistry } from "./dashboard/EndpointRegistry";
import { SecurityLedger } from "./dashboard/SecurityLedger";
import { OrganizationSettings } from "./dashboard/OrganizationSettings";

type AdminTab = "COMMAND" | "ADMISSION" | "REGISTRY" | "LEDGER" | "POLICIES";

function AdminPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<AdminTab>("COMMAND");
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  
  // State for EndpointRegistry
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userDevices, setUserDevices] = useState<any[]>([]);
  const { session } = useAuthStore();
  const { adminRefreshTrigger } = useUIStore();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      setPanelError("");
      if (tab === "COMMAND") {
        const [pending, users, logs] = await Promise.all([
          api.getPendingUsers(),
          api.getAllUsers(),
          api.getAuditLogs()
        ]);
        setData([pending.users || [], users.users || [], logs.logs || []]);
      } else if (tab === "ADMISSION") {
        const r = await api.getPendingUsers();
        setData(r.users || []);
      } else if (tab === "REGISTRY") {
        const r = await api.getAllUsers();
        setData(r.users || []);
      } else if (tab === "LEDGER") {
        const r = await api.getAuditLogs();
        setData(r.logs || []);
      } else if (tab === "POLICIES") {
        setData([]);
      }
    } catch (err: any) {
      setPanelError(err.message || "Running without backend connection. Cannot fetch admin data.");
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tab, adminRefreshTrigger]);

  const handleApprove = async (id: string) => {
    try {
      await api.approveUser(id);
      fetchData();
    } catch (err: any) {
      setPanelError(err.message || "Approval failed.");
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("Reject this node admission request?")) return;
    try {
      await api.denyUser(id);
      fetchData();
    } catch (err: any) {
      setPanelError(err.message || "Rejection failed.");
    }
  };

  const handleShowInfo = async (user: any) => {
    setSelectedUser(user);
    try {
      const res = await api.getUserKeys(user.id);
      setUserDevices(res.devices || []);
    } catch (err: any) {
      setUserDevices([]);
      setPanelError(err.message || "Failed to load device info.");
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      const detail = await api.getUserKeys(userId);
      const firstDevice = detail.devices?.[0];
      if (!firstDevice) throw new Error("No active device found for this user.");
      await api.revokeDevice(firstDevice.device_id);
      setSelectedUser(null);
      fetchData();
    } catch (err: any) {
      setPanelError(err.message || "Failed to revoke device.");
    }
  };

  const NAV: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: "COMMAND",   label: "Command",    icon: <Activity size={16} /> },
    { key: "ADMISSION", label: "Admission",  icon: <Users size={16} /> },
    { key: "REGISTRY",  label: "Registry",   icon: <Cpu size={16} /> },
    { key: "LEDGER",    label: "Ledger",     icon: <ClipboardList size={16} /> },
    { key: "POLICIES",  label: "Policies",   icon: <Settings size={16} /> },
  ];

  return (
    <div className="flex h-screen bg-background-primary overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 tactical-sidebar flex flex-col z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center">
            <Shield size={18} className="text-accent-purple" />
          </div>
          <span className="font-bold text-text-primary tracking-tight">Trustline Admin</span>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-meta font-medium transition-all group ${
                tab === item.key 
                ? "bg-accent-purple/10 text-accent-purple shadow-sm" 
                : "text-text-muted hover:text-text-primary hover:bg-background-accent"
              }`}
            >
              <span className={tab === item.key ? "text-accent-purple" : "text-text-muted group-hover:text-text-primary"}>
                {item.icon}
              </span>
              {item.label}
              {item.key === "ADMISSION" && tab !== "ADMISSION" && data.length > 0 && Array.isArray(data) && (
                <span className="ml-auto h-5 w-5 rounded-full bg-accent-amber/10 text-accent-amber text-[10px] flex items-center justify-center border border-accent-amber/20 font-bold">
                  {data.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto space-y-4">
           <div className="p-4 rounded-xl bg-background-accent/30 border border-border-tactical space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                 <Globe size={12} className="text-accent-cyan" /> Network Status
              </div>
              <div className="flex items-center gap-2">
                 <div className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                 <span className="text-[11px] font-bold text-text-secondary">Enclave Secured</span>
              </div>
           </div>
           
           <button 
            onClick={onBack}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-meta font-medium text-text-muted hover:text-accent-red hover:bg-accent-red/5 transition-all group"
           >
             <LogOut size={16} /> Exit Console
           </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-background-primary relative">
        {/* Subtle grid background overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.02] z-0">
           <div className="absolute inset-0 bg-tactical-grid bg-repeat" />
        </div>

        <header className="h-16 border-b border-border-tactical flex items-center justify-between px-8 z-10 bg-background-primary/50 backdrop-blur-md">
          <div className="flex items-center gap-4">
             <button onClick={onBack} className="p-2 hover:bg-background-accent rounded-lg text-text-muted transition-colors lg:hidden">
                <ArrowLeft size={18} />
             </button>
             <div className="flex flex-col">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] leading-none mb-1">Organizational Unit</span>
                <span className="text-sm font-bold text-text-primary tracking-tight">Global Operations Center</span>
             </div>
          </div>

          <div className="flex items-center gap-6">
             <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-background-accent border border-border-tactical">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse" />
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">SOC Level 1 Active</span>
             </div>
             <div className="h-8 w-8 rounded-full bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center text-xs font-bold text-accent-purple">
                {(session?.username || session?.email || "AD")[0].toUpperCase()}
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 z-10 relative custom-scrollbar">
          {panelError && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-4 rounded-xl bg-accent-red/5 border border-accent-red/20 flex items-start gap-4"
            >
              <AlertTriangle className="text-accent-red shrink-0" size={18} />
              <div className="space-y-1">
                <div className="text-meta font-bold text-accent-red uppercase tracking-wider">Operational Fault</div>
                <div className="text-sm text-text-secondary">{panelError}</div>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {tab === "COMMAND" && (
              <CommandCenter 
                key="command"
                pendingCount={Array.isArray(data[0]) ? data[0].length : 0}
                userCount={Array.isArray(data[1]) ? data[1].length : 0}
                logCount={Array.isArray(data[2]) ? data[2].length : 0}
                auditLogs={Array.isArray(data[2]) ? data[2] : []}
              />
            )}
            {tab === "ADMISSION" && (
              <AdmissionQueue 
                key="admission"
                data={data}
                onApprove={handleApprove}
                onReject={handleReject}
                isLoading={isLoading}
              />
            )}
            {tab === "REGISTRY" && (
              <EndpointRegistry 
                key="registry"
                data={data}
                onShowInfo={handleShowInfo}
                selectedUser={selectedUser}
                userDevices={userDevices}
                onCloseDetail={() => setSelectedUser(null)}
                onRevoke={handleRevoke}
                isLoading={isLoading}
              />
            )}
            {tab === "LEDGER" && (
              <SecurityLedger 
                key="ledger"
                data={data}
                isLoading={isLoading}
              />
            )}
            {tab === "POLICIES" && (
              <OrganizationSettings key="policies" />
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default AdminPanel;
