import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { AuditLogRow } from "./useAdmin";

function actionColor(action: string) {
  const upper = action.toUpperCase();
  if (upper.includes("APPROV")) return "var(--accent-success)";
  if (upper.includes("REVOK")) return "var(--accent-danger)";
  return "var(--text-primary)";
}

function toCsvValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function AuditLog({
  fetchAuditLog,
}: {
  fetchAuditLog: (page: number) => Promise<{ logs: AuditLogRow[]; page: number; page_size: number }>;
}) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const refresh = async (nextPage: number) => {
    setLoading(true);
    try {
      const response = await fetchAuditLog(nextPage);
      setLogs(response.logs);
      setPage(response.page);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(page);
  }, []);

  const canGoPrev = page > 1;
  const canGoNext = logs.length > 0;

  const visibleRows = useMemo(() => logs, [logs]);

  const exportCsv = () => {
    const header = ["timestamp", "actor", "action", "target", "details"].join(",");
    const rows = visibleRows.map((row) =>
      [
        toCsvValue(row.created_at),
        toCsvValue(row.actor_email ?? "SYSTEM"),
        toCsvValue(row.action),
        toCsvValue(row.target ?? ""),
        toCsvValue(row.details),
      ].join(","),
    );

    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-page-${page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="section-header" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="section-header-title">AUDIT LOG</span>
          <span className="section-header-count">Page {page}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={visibleRows.length === 0}>
          <Download size={12} /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="admin-empty">Loading audit events...</div>
      ) : visibleRows.length === 0 ? (
        <div className="admin-empty">No audit events recorded.</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.created_at).toLocaleString()}</td>
                <td>{row.actor_email ?? "SYSTEM"}</td>
                <td>
                  <span style={{ color: actionColor(row.action), fontWeight: 600 }}>{row.action}</span>
                </td>
                <td>{String((row.details as any)?.target_user_id ?? (row.details as any)?.device_id ?? "-")}</td>
                <td>
                  <code style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {JSON.stringify(row.details)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost btn-sm" disabled={!canGoPrev || loading} onClick={() => void refresh(page - 1)}>
          Previous
        </button>
        <button className="btn btn-ghost btn-sm" disabled={!canGoNext || loading} onClick={() => void refresh(page + 1)}>
          Next
        </button>
      </div>
    </>
  );
}
