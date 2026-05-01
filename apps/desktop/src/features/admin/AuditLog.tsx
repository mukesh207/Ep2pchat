import { Activity, Download, Play } from "lucide-react";
import { useEffect, useMemo, useState, useRef } from "react";
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
  fetchAuditLog: (page: number) => Promise<{ logs: AuditLogRow[]; page: number; page_size: number }>;
}) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [isLive, setIsLive] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const refresh = async (nextPage: number, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetchAuditLog(nextPage);
      if (quiet) {
        setLogs((prev) => {
          const existingIds = new Set(prev.map(l => l.id));
          const fresh = response.logs.filter(l => !existingIds.has(l.id));
          if (fresh.length === 0) return prev;
          return [...fresh, ...prev].slice(0, 100);
        });
      } else {
        setLogs(response.logs);
        setPage(response.page);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(1);
  }, []);

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
  const canGoNext = logs.length > 0;

  const visibleRows = useMemo(() => {
    let result = logs;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.actor_email?.toLowerCase().includes(q) ||
          r.action.toLowerCase().includes(q) ||
          JSON.stringify(r.details).toLowerCase().includes(q),
      );
    }
    if (filterAction) {
      result = result.filter((r) => r.action === filterAction);
    }
    return result;
  }, [logs, search, filterAction]);

  const uniqueActions = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => s.add(l.action));
    return Array.from(s).sort();
  }, [logs]);

  const exportCsv = () => {
    void api.logSecurityEvent("AUDIT_LOG_EXPORT", { page, row_count: visibleRows.length });
    const header = ["timestamp", "actor", "action", "target", "details"].join(",");
    const rows = visibleRows.map((row) =>
      [
        Yo(row.created_at),
        Yo(row.actor_email ?? "SYSTEM"),
        Yo(row.action),
        Yo(row.target ?? ""),
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

  return (
    <>
      <div className="section-header" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="section-header-title">AUDIT LOG</span>
          <span className="section-header-count">{isLive ? 'LIVE' : `Page ${page}`}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={visibleRows.length === 0}>
          <Download size={12} /> Export CSV
        </button>
      </div>

      <div className="sidebar-search" style={{ display: "flex", gap: 8, maxWidth: "100%", marginBottom: 14 }}>
        <div className="search-wrap" style={{ flex: 2 }}>
          <input
            className="input"
            placeholder="Search by actor, action or details"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          style={{ flex: 1, padding: "0 8px" }}
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        >
          <option value="">All Actions</option>
          {uniqueActions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        
        <button 
          className={`btn ${isLive ? 'btn-teal' : 'btn-ghost'} btn-sm`}
          style={{ gap: 6, minWidth: 100 }}
          onClick={() => setIsLive(!isLive)}
        >
          {isLive ? <Activity size={12} className="spin-slow" /> : <Play size={12} />}
          {isLive ? 'LIVE' : 'LIVE TAIL'}
        </button>
      </div>

      {loading ? (
        <div className="admin-empty">Loading audit events...</div>
      ) : visibleRows.length === 0 ? (
        <div className="admin-empty">No audit events recorded.</div>
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
              {visibleRows.map((row) => (
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

      <div className="admin-pagination" style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center" }}>
        <button 
          className="btn btn-ghost btn-sm" 
          disabled={!canGoPrev || loading || isLive} 
          onClick={() => void refresh(page - 1)}
        >
          Previous
        </button>
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
