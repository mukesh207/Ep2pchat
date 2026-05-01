import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, LogOut, Settings, ShieldOff, UserRoundCheck, Users } from "lucide-react";
import PendingApprovals from "./PendingApprovals";
import DeviceRevocation from "./DeviceRevocation";
import AuditLog from "./AuditLog";
import OrgSettings from "./OrgSettings";
import { useAdmin, type AdminUser, type PendingUser } from "./useAdmin";

type TabKey = "pending" | "devices" | "audit" | "settings";

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
  const admin = useAdmin();
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pending, setPending] = useState<PendingUser[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    void admin.fetchUsers().then((rows: AdminUser[]) => setUsers(rows));
    void admin.fetchPending().then((rows: PendingUser[]) => setPending(rows));
  }, [isAdmin, admin]);

  const tabs = useMemo(
    () => [
      { id: "pending" as const, label: "Pending Approvals", icon: <UserRoundCheck size={13} /> },
      { id: "devices" as const, label: "Device Management", icon: <Users size={13} /> },
      { id: "audit" as const, label: "Audit Log", icon: <ClipboardList size={13} /> },
      { id: "settings" as const, label: "Organization Settings", icon: <Settings size={13} /> },
    ],
    [],
  );

  const refreshPending = async () => {
    const rows = await admin.fetchPending();
    setPending(rows);
  };

  if (!isAdmin) {
    return (
      <div className="admin-container">
        <div className="admin-error">
          <AlertTriangle size={48} />
          <h1>Access Denied</h1>
          <p>You do not have administrative privileges for this organization.</p>
          <button className="btn btn-primary" onClick={onBack}>
            Return to Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="admin-header-left">
          <ShieldOff size={20} />
          <div className="admin-header-titles">
            <span className="admin-header-main">ADMIN CONSOLE</span>
            <span className="admin-header-sub">Organization Governance</span>
          </div>
        </div>
        <div className="admin-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            <LogOut size={14} /> Close Admin
          </button>
        </div>
      </header>

      <div className="admin-body">
        <nav className="admin-sidebar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`admin-nav-item${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
              {tab.id === "pending" && pending.length > 0 && (
                <span className="admin-nav-badge">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="admin-content">
          {activeTab === "pending" ? (
            <PendingApprovals
              users={pending}
              onApprove={async (id) => {
                await admin.approveUser(id);
                // Also update the full users list
                void admin.fetchUsers().then(setUsers);
              }}
              onDeny={admin.denyUser}
              onApproveBulk={async (ids) => {
                await admin.approveBulk(ids);
                void admin.fetchUsers().then(setUsers);
              }}
              onDenyBulk={admin.denyBulk}
              onRefresh={refreshPending}
            />
          ) : null}

          {activeTab === "devices" ? (
            <DeviceRevocation
              users={users}
              fetchDevices={admin.fetchUserDevices}
              revokeDevice={async (id) => {
                await admin.revokeDevice(id);
                if (id === currentDeviceId) {
                  onRevocation();
                }
              }}
              updateAlias={admin.updateDeviceAlias}
              nukeDevice={admin.nukeDevice}
              updateDepartment={admin.updateUserDepartment}
            />
          ) : null}

          {activeTab === "audit" ? <AuditLog fetchAuditLog={admin.fetchAuditLog} /> : null}

          {activeTab === "settings" ? <OrgSettings /> : null}
        </div>
      </div>
    </div>
  );
}
