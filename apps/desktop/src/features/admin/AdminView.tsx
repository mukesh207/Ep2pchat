import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, LogOut, ShieldOff, UserRoundCheck, Users } from "lucide-react";
import PendingApprovals from "./PendingApprovals";
import DeviceRevocation from "./DeviceRevocation";
import AuditLog from "./AuditLog";
import { useAdmin, type AdminUser, type PendingUser } from "./useAdmin";

type TabKey = "pending" | "devices" | "audit";

export default function AdminView({
  isAdmin,
  currentDeviceId,
  onRevocation,
  onBack,
}: {
  isAdmin: boolean;
  currentDeviceId: string | null;
  onRevocation: () => void;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [panelError, setPanelError] = useState("");

  const admin = useAdmin({
    currentDeviceId,
    onRevocation,
  });

  const tabs = useMemo(
    () => [
      { id: "pending" as const, label: "Pending Approvals", icon: <UserRoundCheck size={13} /> },
      { id: "devices" as const, label: "Device Management", icon: <Users size={13} /> },
      { id: "audit" as const, label: "Audit Log", icon: <ClipboardList size={13} /> },
    ],
    [],
  );

  const refreshPending = async () => {
    try {
      const rows = await admin.fetchPending();
      setPendingUsers(rows);
      setPanelError("");
    } catch (error: any) {
      setPanelError(error?.message || "Failed to load pending approvals.");
    }
  };

  const refreshUsers = async () => {
    try {
      const rows = await admin.fetchUsers();
      setUsers(rows);
      setPanelError("");
    } catch (error: any) {
      setPanelError(error?.message || "Failed to load users.");
    }
  };

  useEffect(() => {
    void refreshPending();
    void refreshUsers();

    const timer = window.setInterval(() => {
      void refreshPending();
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  if (!isAdmin) {
    return (
      <div className="app-container">
        <div className="admin-wrap" style={{ margin: 20 }}>
          <div className="workspace-alert">
            <ShieldOff size={14} /> Permission denied. Admin role is required.
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginTop: 12 }}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <header className="admin-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ShieldOff size={15} color="var(--accent-danger)" strokeWidth={1.5} />
          <span className="admin-header-title">ADMIN CONSOLE</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <LogOut size={12} /> Exit
        </button>
      </header>

      <div className="admin-body">
        <nav className="admin-nav">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`admin-nav-item${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
              {tab.id === "pending" && pendingUsers.length > 0 ? (
                <span className="section-header-count" style={{ marginLeft: "auto" }}>
                  {pendingUsers.length}
                </span>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="admin-content">
          {panelError ? (
            <div className="workspace-alert" style={{ marginBottom: 14 }}>
              <AlertTriangle size={12} />
              {panelError}
            </div>
          ) : null}

          {activeTab === "pending" ? (
            <PendingApprovals
              users={pendingUsers}
              onApprove={admin.approveUser}
              onDeny={admin.denyUser}
              onRefresh={refreshPending}
            />
          ) : null}

          {activeTab === "devices" ? (
            <DeviceRevocation
              users={users}
              fetchDevices={admin.fetchUserDevices}
              revokeDevice={admin.revokeDevice}
            />
          ) : null}

          {activeTab === "audit" ? <AuditLog fetchAuditLog={admin.fetchAuditLog} /> : null}
        </div>
      </div>
    </div>
  );
}
