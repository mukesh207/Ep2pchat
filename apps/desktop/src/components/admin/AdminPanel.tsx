import { useState, useEffect } from "react";
import { AlertTriangle, Users, ClipboardList, Settings, ShieldOff, CheckCircle, Info, XCircle, LogOut } from "lucide-react";
import * as api from "../../api";
import * as vault from "../../lib/vault";

type AdminTab = "PENDING" | "USERS" | "LOGS" | "SETTINGS";

function AdminPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab]   = useState<AdminTab>("PENDING");
  const [data, setData] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userDevices, setUserDevices]   = useState<any[]>([]);
  const [panelError, setPanelError] = useState("");

  const fetchData = async () => {
    try {
      setPanelError("");
      if (tab === "PENDING")  { const r = await api.getPendingUsers(); setData(r.users || []); }
      if (tab === "USERS")    { const r = await api.getAllUsers();     setData(r.users || []); }
      if (tab === "LOGS")     { const r = await api.getAuditLogs();   setData(r.logs  || []); }
      if (tab === "SETTINGS") setData([]);
    } catch (err: any) {
      setPanelError("Running without backend connection: Showing simulated admin data.");
      if (tab === "PENDING") {
        setData([
          { id: "demo-p1", email: "newhire@trustline.io", username: "alex", access_code: "ALX-9021" },
          { id: "demo-p2", email: "contractor@corp.com", username: "frank", access_code: "FRK-4421" },
          { id: "demo-p3", email: "auditor@external.com", username: "olivia", access_code: "OLI-7733" }
        ]);
      } else if (tab === "USERS") {
        setData([
          { id: "1", email: "alice@blacksite.io", username: "alice", status: "active", device_count: 2 },
          { id: "2", email: "charlie@blacksite.io", username: "charlie", status: "active", device_count: 1 },
          { id: "3", email: "ops-admin@nexacore.dev", username: "ops-admin", status: "active", device_count: 3 },
          { id: "4", email: "sec@archivist.net", username: "archivist", status: "suspended", device_count: 0 },
        ]);
      } else if (tab === "LOGS") {
        setData([
          { id: "demo-l1", action: "DEVICE_REVOKED", actor_email: "ops-admin@nexacore.dev", created_at: new Date(Date.now() - 3600000).toISOString(), details: { device_id: "d-888" } },
          { id: "demo-l2", action: "USER_APPROVED", actor_email: "ops-admin@nexacore.dev", created_at: new Date().toISOString(), details: { user_id: "demo-p1" } },
        ]);
      } else {
        setData([]);
      }
    }
  };

  useEffect(() => { fetchData(); }, [tab]);

  const handleApprove = async (id: string) => {
    try { await api.approveUser(id); fetchData(); } catch (err: any) { setPanelError(err.message || "Approval failed."); }
  };

  const handleShowInfo = async (user: any) => {
    setSelectedUser(user);
    try {
      const res = await api.getUserKeys(user.id);
      setUserDevices(res.devices || []);
    } catch (err: any) { setUserDevices([]); setPanelError(err.message || "Failed to load device info."); }
  };

  const NAV: { key: AdminTab; label: string; icon: React.ReactNode; color?: string }[] = [
    { key: "PENDING",  label: "PENDING",   icon: <AlertTriangle size={13} />, color: "var(--accent-warn)" },
    { key: "USERS",    label: "ROSTER",    icon: <Users         size={13} /> },
    { key: "LOGS",     label: "AUDIT LOG", icon: <ClipboardList size={13} /> },
    { key: "SETTINGS", label: "POLICIES",  icon: <Settings      size={13} /> },
  ];

  return (
    <div className="admin-wrap">
      <header className="admin-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ShieldOff size={15} color="var(--accent-danger)" strokeWidth={1.5} />
          <span className="admin-header-title">IT ADMIN CONSOLE</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.57rem", color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            ⚠ UNAUTHORIZED ACCESS IS A FEDERAL CRIME
          </span>
        </div>
        <button id="admin-exit-btn" className="btn btn-ghost btn-sm" onClick={onBack}>
          <LogOut size={12} /> EXIT
        </button>
      </header>

      <div className="admin-body">
        <nav className="admin-nav">
          {NAV.map(item => (
            <div
              key={item.key}
              id={`admin-nav-${item.key.toLowerCase()}`}
              className={`admin-nav-item${tab === item.key ? " active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              {item.icon}{item.label}
            </div>
          ))}
        </nav>

        <div className="admin-content">
          {panelError && (
            <div className="workspace-alert" style={{ marginBottom: 16 }}>
              <AlertTriangle size={12} />
              {panelError}
            </div>
          )}
          {/* PENDING */}
          {tab === "PENDING" && (
            <>
              <div className="section-header">
                <AlertTriangle size={14} color="var(--accent-warn)" />
                <span className="section-header-title">PENDING APPROVALS</span>
                {data.length > 0 && <span className="section-header-count">{data.length}</span>}
              </div>
              {data.length === 0 ? (
                <div className="admin-empty">NO PENDING ACCESS REQUESTS</div>
              ) : (
                <table className="admin-table">
                  <thead><tr><th>IDENTITY</th><th>ACCESS CODE</th><th>STATUS</th><th>ACTION</th></tr></thead>
                  <tbody>{data.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div className="user-cell">
                          <div className="avatar" style={{ width: 26, height: 26, fontSize: "0.65rem" }}>{(u.username || u.email)[0].toUpperCase()}</div>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>{u.username || u.email}</span>
                            {u.username && <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{u.email}</span>}
                          </div>
                        </div>
                      </td>
                      <td><span className="mono-cell">{u.access_code || "N/A"}</span></td>
                      <td><span className="status-badge pending">PENDING</span></td>
                      <td><button id={`approve-${u.id}`} className="btn btn-teal btn-sm" onClick={() => handleApprove(u.id)}><CheckCircle size={11} /> APPROVE</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </>
          )}

          {/* USERS */}
          {tab === "USERS" && (
            <>
              <div className="section-header">
                <Users size={14} color="var(--accent-primary)" />
                <span className="section-header-title">IDENTITY ROSTER</span>
                <span className="section-header-count">{data.length}</span>
              </div>
              {data.length === 0 ? (
                <div className="admin-empty">NO REGISTERED IDENTITIES</div>
              ) : (
                <table className="admin-table">
                  <thead><tr><th>IDENTITY</th><th>DEVICES</th><th>STATUS</th><th>ACTION</th></tr></thead>
                  <tbody>{data.map(u => (
                    <tr key={u.id}>
                      <td><div className="user-cell"><div className="avatar" style={{ width: 26, height: 26, fontSize: "0.65rem" }}>{u.email[0].toUpperCase()}</div>{u.email}</div></td>
                      <td><span className="mono-cell">{u.device_count || 0}</span></td>
                      <td><span className={`status-badge ${u.status}`}>{u.status?.toUpperCase()}</span></td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button id={`info-${u.id}`} className="btn btn-ghost btn-sm" onClick={() => handleShowInfo(u)}><Info size={11} /> INFO</button>
                          <button
                            id={`revoke-${u.id}`}
                            className="btn btn-danger btn-sm"
                            onClick={async () => {
                              try {
                                const detail = await api.getUserKeys(u.id);
                                const firstDevice = detail.devices?.[0];
                                if (!firstDevice) throw new Error("No active device found for this user.");
                                await api.revokeDevice(firstDevice.device_id);
                                fetchData();
                              } catch (err: any) {
                                setPanelError(err.message || "Failed to revoke device.");
                              }
                            }}
                          ><XCircle size={11} /> REVOKE</button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </>
          )}

          {/* LOGS */}
          {tab === "LOGS" && (
            <>
              <div className="section-header">
                <ClipboardList size={14} color="var(--accent-teal)" />
                <span className="section-header-title">AUDIT LOG</span>
              </div>
              {data.length === 0 ? (
                <div className="admin-empty">NO AUDIT EVENTS RECORDED</div>
              ) : (
                <div className="log-list">{data.map(l => (
                  <div key={l.id} className="log-entry">
                    <div className="log-entry-header">
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--accent-primary)" }}>{l.action}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "var(--text-muted)" }}>{new Date(l.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                      ACTOR: <span style={{ color: "var(--text-primary)" }}>{l.actor_email || "SYSTEM"}</span>
                    </div>
                    <pre className="log-pre">{JSON.stringify(l.details, null, 2)}</pre>
                  </div>
                ))}</div>
              )}
            </>
          )}

          {/* SETTINGS */}
          {tab === "SETTINGS" && (
            <>
              <div className="section-header">
                <Settings size={14} color="var(--text-secondary)" />
                <span className="section-header-title">OPERATIONAL POLICIES</span>
              </div>
              <div className="settings-grid">
                <div className="settings-card">
                  <div className="settings-card-label">DATA RETENTION POLICY</div>
                  <select className="settings-select">
                    <option>Forever</option>
                    <option>30 Days (Standard)</option>
                    <option>7 Days (Strict)</option>
                    <option>24 Hours (Ephemeral)</option>
                  </select>
                  <div className="settings-card-hint">AUTOMATED PURGE OF ENCRYPTED METADATA FROM SERVER STORAGE</div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-label">IDENTITY REGISTRATION</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input type="checkbox" defaultChecked id="reg-toggle" style={{ accentColor: "var(--accent-primary)", width: 14, height: 14 }} />
                    <label htmlFor="reg-toggle" style={{ fontSize: "0.85rem" }}>Allow new identity access requests</label>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-label">NATS JETSTREAM STATUS</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="status-dot warn" />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--accent-warn)" }}>NOT CONNECTED</span>
                  </div>
                  <div className="settings-card-hint">HORIZONTAL SCALING DISABLED — START DOCKER COMPOSE TO ENABLE</div>
                </div>
              </div>

              <div className="hud-divider" style={{ margin: "16px 0" }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button id="wipe-vault-btn" className="btn btn-danger" onClick={async () => {
                  if (confirm("⚠ WIPE LOCAL VAULT? This destroys all local keys and message history. Cannot be undone.")) {
                    try { const v = await vault.initVault(); await v.execute("DELETE FROM local_keys"); await v.execute("DELETE FROM messages"); } catch {}
                    window.location.reload();
                  }
                }}>
                  <ShieldOff size={13} /> WIPE LOCAL VAULT
                </button>
                <button id="save-policies-btn" className="btn btn-teal">
                  <CheckCircle size={13} /> SAVE POLICIES
                </button>
              </div>
            </>
          )}

          {/* IDENTITY DETAILS MODAL-ISH VIEW */}
          {selectedUser && (
            <div className="admin-detail-overlay">
              <div className="admin-detail-card">
                <header className="admin-detail-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="avatar" style={{ width: 30, height: 30 }}>{(selectedUser.username || selectedUser.email)[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{selectedUser.username || selectedUser.email}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-muted)" }}>{selectedUser.email}</div>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUser(null)}><XCircle size={14} /></button>
                </header>

                <div className="admin-detail-body">
                  <div className="section-title">CRYPTOGRAPHIC IDENTITIES</div>
                  {userDevices.length === 0 ? (
                    <div className="admin-empty" style={{ padding: 20 }}>NO DEVICES REGISTERED</div>
                  ) : (
                    <div className="device-list">
                      {userDevices.map(d => (
                        <div key={d.device_id} className="device-item">
                          <div className="device-item-header">
                            <span className="device-name">{d.device_name}</span>
                            <span className="status-badge approved" style={{ fontSize: "0.55rem", padding: "1px 5px" }}>ACTIVE</span>
                          </div>
                          <div className="device-meta">
                            <div>DEVICE ID: <span className="mono">{d.device_id}</span></div>
                            <div>IDENTITY KEY: <span className="mono">{d.identity_key}</span></div>
                            <div>LAST SEEN: <span className="mono">{new Date(d.last_seen).toLocaleString()}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="hud-divider" style={{ margin: "20px 0" }} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn btn-teal btn-full"><CheckCircle size={12} /> VERIFY IDENTITY</button>
                    <button className="btn btn-danger btn-full"><ShieldOff size={12} /> SUSPEND ACCOUNT</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export default AdminPanel;
