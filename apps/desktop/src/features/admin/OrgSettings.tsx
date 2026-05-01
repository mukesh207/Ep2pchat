import { useEffect, useState } from "react";
import { Loader2, Save, ShieldCheck, Palette, AlertTriangle } from "lucide-react";
import * as api from "../../api";
import { useToast } from "../../components/ui/Toast";

export default function OrgSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<api.OrgSettings>({
    audit_retention_days: 365,
    force_rls: true,
    branding: {
        primary_color: "#6e56cf",
        workspace_name: "",
    },
    is_maintenance_mode: false,
  });
  const { addToast } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getOrgSettings();
        setSettings(res);
      } catch (e) {
        addToast("Failed to load organization settings", "error");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateOrgSettings(settings);
      addToast("Organization settings updated", "success");
    } catch (e) {
      addToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="admin-empty">Loading settings...</div>;
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="section-header">
        <span className="section-header-title">ORGANIZATION SETTINGS</span>
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Palette size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>Workspace Branding</h3>
          </div>
          
          <div style={{ marginBottom: 16 }}>
            <label className="label" style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
              Workspace Display Name
            </label>
            <input
              className="input"
              value={settings.branding.workspace_name}
              placeholder="e.g. Acme Corp Secure Chat"
              onChange={(e) => setSettings({ 
                ...settings, 
                branding: { ...settings.branding, workspace_name: e.target.value } 
              })}
            />
          </div>

          <div>
            <label className="label" style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
              Primary Brand Color
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="color"
                style={{ width: 40, height: 32, padding: 2, background: "var(--bg-void)", border: "1px solid var(--border)" }}
                value={settings.branding.primary_color}
                onChange={(e) => setSettings({ 
                  ...settings, 
                  branding: { ...settings.branding, primary_color: e.target.value } 
                })}
              />
              <input
                className="input"
                style={{ width: 100, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}
                value={settings.branding.primary_color}
                onChange={(e) => setSettings({ 
                  ...settings, 
                  branding: { ...settings.branding, primary_color: e.target.value } 
                })}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 32, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
          <label className="label" style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
            Audit Log Retention
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="number"
              className="input"
              style={{ width: 100 }}
              value={settings.audit_retention_days}
              onChange={(e) => setSettings({ ...settings, audit_retention_days: parseInt(e.target.value) || 0 })}
            />
            <span className="text-muted">days</span>
          </div>
          <p className="text-muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
            Audit logs older than this period will be automatically purged. Set to 0 for indefinite retention.
          </p>
        </div>

        <div style={{ marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ paddingTop: 2 }}>
            <input
              type="checkbox"
              id="force_rls"
              checked={settings.force_rls}
              onChange={(e) => setSettings({ ...settings, force_rls: e.target.checked })}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
          </div>
          <div>
            <label htmlFor="force_rls" className="label" style={{ fontWeight: 600, cursor: "pointer" }}>
              Enforce Row-Level Security (RLS)
            </label>
            <p className="text-muted" style={{ fontSize: "0.8rem", marginTop: 4 }}>
              Strictly isolate data between organizations at the database level. 
              <span style={{ color: "var(--accent-warning)", display: "block", marginTop: 4 }}>
                <ShieldCheck size={12} style={{ display: "inline", marginRight: 4 }} />
                Highly recommended for production environments.
              </span>
            </p>
          </div>
        </div>

        <div style={{ marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start", padding: 16, background: "rgba(255, 85, 85, 0.05)", border: "1px solid rgba(255, 85, 85, 0.2)", borderRadius: "var(--radius-sm)" }}>
          <div style={{ paddingTop: 2 }}>
            <input
              type="checkbox"
              id="is_maintenance_mode"
              checked={settings.is_maintenance_mode}
              onChange={(e) => setSettings({ ...settings, is_maintenance_mode: e.target.checked })}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
          </div>
          <div>
            <label htmlFor="is_maintenance_mode" className="label" style={{ fontWeight: 600, cursor: "pointer", color: "var(--accent-danger)" }}>
              Maintenance Mode
            </label>
            <p style={{ fontSize: "0.8rem", marginTop: 4, color: "var(--text-muted)" }}>
              <AlertTriangle size={12} style={{ display: "inline", marginRight: 4, color: "var(--accent-danger)" }} />
              <strong>Warning:</strong> Enabling this will lock out all non-admin users from the workspace. Use this for server migrations or emergency security lockdowns.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <button className="btn btn-teal" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
