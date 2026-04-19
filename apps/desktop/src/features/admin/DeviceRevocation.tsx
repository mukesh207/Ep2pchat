import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldOff } from "lucide-react";
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
}: {
  users: AdminUser[];
  fetchDevices: (userId: string) => Promise<AdminDevice[]>;
  revokeDevice: (deviceId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

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
    const confirmed = window.confirm("Revoke this device now? This will disconnect it immediately.");
    if (!confirmed) return;

    setRevokingId(deviceId);
    try {
      await revokeDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } finally {
      setRevokingId(null);
    }
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
        <div className="panel" style={{ padding: 10, maxHeight: 360, overflow: "auto" }}>
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
          ) : isLoadingDevices ? (
            <div className="admin-empty">Loading devices...</div>
          ) : devices.length === 0 ? (
            <div className="admin-empty">No active devices found for this user.</div>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Registered</th>
                    <th>Last Seen</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.device_name}</td>
                      <td>{relativeTime(device.registered_at)}</td>
                      <td>{relativeTime(device.last_seen)}</td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRevoke(device.id)}
                          disabled={revokingId === device.id}
                        >
                          {revokingId === device.id ? <Loader2 size={12} className="spin" /> : <ShieldOff size={12} />}
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
