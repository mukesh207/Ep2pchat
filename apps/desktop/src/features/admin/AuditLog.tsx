import { Activity, Download, Play } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import type { AuditLogRow } from "./useAdmin";
import * as api from "../../api";

function actionColor(action: string) {
  const upper = action.toUpperCase();
  if (upper.includes("APPROV")) return "var(--accent-success)";
  if (upper.includes("REVOK")) return "var(--accent-danger)";
  if (upper.includes("NUKE")) return "var(--accent-danger)";
  if (upper.includes("FAILED")) return "var(--accent-danger)";
  if (upper.includes("SETTINGS")) return "var(--accent-teal)";
  return "var(--text-primary)";
}

function Yo(r: any) {
  return `"${(typeof r == "string" ? r : JSON.stringify(r ?? "")).replace(/"/g, '""')}"`;
}

export default function AuditLog({
  fetchAuditLog,
}: {
  fetchAuditLog: (page: number, filters?: api.AuditFilters) => Promise<{ logs: AuditLogRow[]; total: number; page: number; page_size: number }>;
}) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [searchEmail, setSearchEmail] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [isLive, setIsLive] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const refresh = async (nextPage: number, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const filters: api.AuditFilters = {
        email: searchEmail,
        action: filterAction,
        start_date: startDate ? new Date(startDate).toISOString() : undefined,
        end_date: endDate ? new Date(endDate).toISOString() : undefined,
      };
      const response = await fetchAuditLog(nextPage, filters);
      if (quiet) {
        setLogs((prev) => {
          const existingIds = new Set(prev.map(l => l.id));
          const fresh = response.logs.filter(l => !existingIds.has(l.id));
          if (fresh.length === 0) return prev;
          return [...fresh, ...prev].slice(0, 100);
        });
      } else {
        setLogs(response.logs);
        setTotal(response.total);
        setPage(response.page);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(1);
  }, [searchEmail, filterAction, startDate, endDate]);

  useEffect(() => {
    if (isLive) {
      intervalRef.current = window.setInterval(() => {
        void refresh(1, true);
      }, 5000);
    } else {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [isLive]);

  const canGoPrev = page > 1;
  const canGoNext = logs.length === 25; // Assuming page size is 25

  const exportCsv = () => {
    void api.logSecurityEvent("AUDIT_LOG_EXPORT", { page, row_count: logs.length });
    const header = ["timestamp", "actor", "action", "details"].join(",");
    const rows = logs.map((row) =>
      [
        Yo(row.created_at),
        Yo(row.actor_email ?? "SYSTEM"),
        Yo(row.action),
        Yo(row.details),
      ].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trustline-audit-${new Date().toISOString()}.csv`;
    a.click();
  };

  const commonActions = [
    "LOGIN_COMPLETE", "LOGIN_BEGIN", "USER_APPROVED", "USER_DENIED", 
    "DEVICE_REVOKED", "DEVICE_SELF_REVOKED", "ORG_SETTINGS_UPDATE", 
    "DATA_EXPORT", "VAULT_RESTORE", "OTPK_REPLENISHED"
  ];

  return (
    <>
      <div className="section-header" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="section-header-title">AUDIT LOG</span>
          <span className="section-header-count">{isLive ? 'LIVE' : `Total: ${total}`}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={logs.length === 0}>
          <Download size={12} /> Export Current Page
        </button>
      </div>

      <div className="audit-filters" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
          <input
            className="input input-sm"
            placeholder="Search by user email..."
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
          />
        </div>
        <select
          className="input input-sm"
          style={{ flex: 1, minWidth: 150 }}
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        >
          <option value="">All Actions</option>
          {commonActions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input 
            type="date" 
            className="input input-sm" 
            style={{ width: 130 }} 
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <span className="text-muted" style={{ fontSize: '0.7rem' }}>to</span>
          <input 
            type="date" 
            className="input input-sm" 
            style={{ width: 130 }}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
        
        <button 
          className={`btn ${isLive ? 'btn-teal' : 'btn-ghost'} btn-sm`}
          style={{ gap: 6 }}
          onClick={() => setIsLive(!isLive)}
        >
          {isLive ? <Activity size={12} className="spin-slow" /> : <Play size={12} />}
          {isLive ? 'LIVE' : 'LIVE TAIL'}
        </button>
      </div>

      {loading ? (
        <div className="admin-empty">Loading audit events...</div>
      ) : logs.length === 0 ? (
        <div className="admin-empty">No audit events found for selected filters.</div>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td>{row.actor_email ?? "SYSTEM"}</td>
                  <td style={{ fontWeight: 600, color: actionColor(row.action) }}>
                    {row.action}
                  </td>
                  <td style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)" }}>
                    {JSON.stringify(row.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-pagination" style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
        <button 
          className="btn btn-ghost btn-sm" 
          disabled={!canGoPrev || loading || isLive} 
          onClick={() => void refresh(page - 1)}
        >
          Previous
        </button>
        <span className="text-muted" style={{ fontSize: '0.7rem' }}>Page {page}</span>
        <button 
          className="btn btn-ghost btn-sm" 
          disabled={!canGoNext || loading || isLive} 
          onClick={() => void refresh(page + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
