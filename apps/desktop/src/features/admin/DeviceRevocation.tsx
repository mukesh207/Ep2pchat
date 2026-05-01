import { useEffect, useMemo, useState } from "react";
import { Briefcase, Edit2, Loader2, Save, ShieldOff, X, Zap } from "lucide-react";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import type { AdminDevice, AdminUser } from "./useAdmin";

function relativeTime(value?: string) {
  if (!value) return "never";
  const date = new Date(value);
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function DeviceRevocation({
  users,
  fetchDevices,
  revokeDevice,
  updateAlias,
  nukeDevice,
  updateDepartment,
}: {
  users: AdminUser[];
  fetchDevices: (userId: string) => Promise<AdminDevice[]>;
  revokeDevice: (deviceId: string) => Promise<void>;
  updateAlias: (deviceId: string, alias: string) => Promise<void>;
  nukeDevice: (deviceId: string) => Promise<void>;
  updateDepartment: (userId: string, department: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [nukingId, setNukingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempAlias, setTempAlias] = useState("");
  const [isEditingDept, setIsEditingDept] = useState(false);
  const [tempDept, setTempDept] = useState("");
  const { confirm } = useConfirm();

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      `${user.email} ${user.username ?? ""}`.toLowerCase().includes(q),
    );
  }, [users, search]);

  useEffect(() => {
    if (!selectedUser) {
      setDevices([]);
      return;
    }
    setIsLoadingDevices(true);
    void fetchDevices(selectedUser.id)
      .then((rows) => setDevices(rows))
      .finally(() => setIsLoadingDevices(false));
  }, [selectedUser, fetchDevices]);

  const handleRevoke = async (deviceId: string) => {
    const confirmed = await confirm({
      title: "Revoke Device",
      message: "This will immediately disconnect the device and invalidate its encryption keys. This action cannot be undone.",
      confirmLabel: "Revoke Now",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!confirmed) return;

    setRevokingId(deviceId);
    try {
      await revokeDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } finally {
      setRevokingId(null);
    }
  };

  const handleNuke = async (deviceId: string) => {
    const confirmed = await confirm({
      title: "Remote Wipe (Nuke)",
      message: "CRITICAL: This will send a self-destruct command to the device, wiping its local encrypted vault, and permanently revoke its access. This cannot be undone.",
      confirmLabel: "NUKE DEVICE",
      variant: "danger",
    });
    if (!confirmed) return;

    setNukingId(deviceId);
    try {
      await nukeDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } finally {
      setNukingId(null);
    }
  };

  const handleSaveAlias = async (deviceId: string) => {
    try {
      await updateAlias(deviceId, tempAlias);
      setDevices((prev) => prev.map(d => d.id === deviceId ? { ...d, alias: tempAlias } : d));
      setEditingId(null);
    } catch {}
  };

  const handleSaveDept = async () => {
    if (!selectedUser) return;
    try {
      await updateDepartment(selectedUser.id, tempDept);
      selectedUser.department = tempDept;
      setIsEditingDept(false);
    } catch {}
  };

  return (
    <>
      <div className="section-header">
        <span className="section-header-title">DEVICE MANAGEMENT</span>
      </div>

      <div className="sidebar-search" style={{ maxWidth: 520, marginBottom: 14 }}>
        <div className="search-wrap">
          <input
            className="input"
            placeholder="Search user by email or username"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 2fr", gap: 16 }}>
        <div className="panel" style={{ padding: 10, maxHeight: 460, overflow: "auto" }}>
          {filteredUsers.length === 0 ? (
            <div className="admin-empty">No matching users.</div>
          ) : (
            filteredUsers.map((user) => (
              <button
                key={user.id}
                className={`contact-item${selectedUser?.id === user.id ? " active" : ""}`}
                style={{ width: "100%", textAlign: "left", border: "none", background: "transparent" }}
                onClick={() => setSelectedUser(user)}
              >
                <div className="contact-item-info">
                  <div className="contact-item-email">{user.username || user.email}</div>
                  <div className="contact-item-sub">{user.email}</div>
                </div>
              </button>
            ))
          )}
        </div>

        <div>
          {selectedUser == null ? (
            <div className="admin-empty">Select a user to view registered devices.</div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-1)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{selectedUser.username || selectedUser.email}</h3>
                    {isEditingDept ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                            <Briefcase size={10} color="var(--accent-teal)" />
                            <input 
                                className="input" 
                                style={{ height: 24, fontSize: '0.65rem', width: 140 }}
                                value={tempDept}
                                onChange={e => setTempDept(e.target.value)}
                                placeholder="Department name"
                                autoFocus
                            />
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={handleSaveDept}><Save size={12} /></button>
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setIsEditingDept(false)}><X size={12} /></button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, cursor: 'pointer' }} onClick={() => { setIsEditingDept(true); setTempDept(selectedUser.department || ""); }}>
                            <Briefcase size={10} color="var(--accent-teal)" />
                            <span style={{ fontSize: '0.7rem', color: 'var(--accent-teal)', fontWeight: 600 }}>
                                {selectedUser.department || "ASSIGN DEPARTMENT"}
                            </span>
                            <Edit2 size={8} style={{ opacity: 0.5 }} />
                        </div>
                    )}
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div className="text-muted" style={{ fontSize: '0.65rem' }}>{selectedUser.email}</div>
                    <div className="text-muted" style={{ fontSize: '0.65rem' }}>ID: {selectedUser.id}</div>
                </div>
              </div>
            </div>
          )}

          {selectedUser && (
            isLoadingDevices ? (
              <div className="admin-empty">Loading devices...</div>
            ) : devices.length === 0 ? (
              <div className="admin-empty">No active devices found for this user.</div>
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Device Info</th>
                      <th>Registered</th>
                      <th>Last Seen</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((device) => (
                      <tr key={device.id}>
                        <td>
                          {editingId === device.id ? (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input 
                                className="input" 
                                style={{ height: 26, fontSize: '0.75rem', width: 120 }}
                                value={tempAlias}
                                onChange={e => setTempAlias(e.target.value)}
                                autoFocus
                              />
                              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleSaveAlias(device.id)}><Save size={12} /></button>
                              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingId(null)}><X size={12} /></button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{device.alias || device.device_name}</span>
                                {device.alias && <span className="text-muted" style={{ fontSize: '0.6rem' }}>{device.device_name}</span>}
                              </div>
                              <button 
                                className="btn btn-ghost btn-sm btn-icon" 
                                style={{ opacity: 0.3 }}
                                onClick={() => {
                                  setEditingId(device.id);
                                  setTempAlias(device.alias || device.device_name);
                                }}
                              >
                                <Edit2 size={10} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td>{relativeTime(device.registered_at)}</td>
                        <td>{relativeTime(device.last_seen)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleRevoke(device.id)}
                              disabled={revokingId === device.id || nukingId === device.id}
                              title="Revoke access"
                            >
                              {revokingId === device.id ? <Loader2 size={12} className="spin" /> : <ShieldOff size={12} />}
                              Revoke
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--accent-warning)', borderColor: 'rgba(255, 170, 0, 0.2)' }}
                              onClick={() => handleNuke(device.id)}
                              disabled={revokingId === device.id || nukingId === device.id}
                              title="Remote wipe and revoke"
                            >
                              {nukingId === device.id ? <Loader2 size={12} className="spin" /> : <Zap size={12} />}
                              Nuke
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}
