import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Loader2, XCircle, UserCheck, UserX } from "lucide-react";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import type { PendingUser } from "./useAdmin";

function relativeTime(value?: string) {
  if (!value) return "just now";
  const date = new Date(value);
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function PendingApprovals({
  users,
  onApprove,
  onDeny,
  onApproveBulk,
  onDenyBulk,
  onRefresh,
}: {
  users: PendingUser[];
  onApprove: (id: string) => Promise<void>;
  onDeny: (id: string) => Promise<void>;
  onApproveBulk: (ids: string[]) => Promise<void>;
  onDenyBulk: (ids: string[]) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [rows, setRows] = useState<PendingUser[]>(users);
  const [search, setSearch] = useState("");
  const [busyById, setBusyById] = useState<Record<string, "approve" | "deny" | null>>({});
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"approve" | "deny" | null>(null);
  const { confirm } = useConfirm();

  useEffect(() => {
    setRows(users);
  }, [users]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => u.email.toLowerCase().includes(q));
  }, [rows, search]);

  const count = useMemo(() => filteredRows.length, [filteredRows.length]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRows.length && filteredRows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const runBulkAction = async (action: "approve" | "deny") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const confirmed = await confirm({
      title: action === "approve" ? "Bulk Approval" : "Bulk Deny",
      message: `Are you sure you want to ${action} ${ids.length} selected requests?`,
      confirmLabel: action === "approve" ? "Approve All" : "Deny All",
      variant: action === "approve" ? "info" : "danger",
    });
    if (!confirmed) return;

    setBulkBusy(action);
    try {
      if (action === "approve") {
        await onApproveBulk(ids);
      } else {
        await onDenyBulk(ids);
      }
      setSelectedIds(new Set());
      await onRefresh();
    } finally {
      setBulkBusy(null);
    }
  };

  const runAction = async (id: string, action: "approve" | "deny") => {
    const user = rows.find(u => u.id === id);
    const confirmed = await confirm({
      title: action === "approve" ? "Approve User" : "Deny Request",
      message: action === "approve" 
        ? `Are you sure you want to grant ${user?.email} access to the workspace?`
        : `Are you sure you want to reject the access request from ${user?.email}?`,
      confirmLabel: action === "approve" ? "Approve" : "Reject",
      variant: action === "approve" ? "info" : "danger",
    });
    if (!confirmed) return;

    try {
      setBusyById((prev) => ({ ...prev, [id]: action }));
      if (action === "approve") {
        await onApprove(id);
      } else {
        await onDeny(id);
      }
      setRemovingIds((prev) => new Set([...prev, id]));
      window.setTimeout(() => {
        setRows((prev) => prev.filter((u) => u.id !== id));
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 220);
      await onRefresh();
    } finally {
      setBusyById((prev) => ({ ...prev, [id]: null }));
    }
  };

  return (
    <>
      <div className="section-header">
        <span className="section-header-title">PENDING APPROVALS</span>
        {count > 0 && <span className="section-header-count">{count}</span>}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <div className="search-wrap" style={{ flex: 1 }}>
          <input
            className="input"
            placeholder="Search request by email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 8, animation: "fadeSlideIn 0.2s ease" }}>
            <button 
              className="btn btn-teal btn-sm" 
              onClick={() => runBulkAction("approve")}
              disabled={!!bulkBusy}
            >
              {bulkBusy === "approve" ? <Loader2 size={12} className="spin" /> : <UserCheck size={12} />}
              Approve ({selectedIds.size})
            </button>
            <button 
              className="btn btn-danger btn-sm" 
              onClick={() => runBulkAction("deny")}
              disabled={!!bulkBusy}
            >
              {bulkBusy === "deny" ? <Loader2 size={12} className="spin" /> : <UserX size={12} />}
              Deny ({selectedIds.size})
            </button>
          </div>
        )}
      </div>

      {filteredRows.length === 0 ? (
        <div className="admin-empty">No pending access requests.</div>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.size > 0 && selectedIds.size === filteredRows.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th>Email</th>
                <th>Requested</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((user) => {
                const busy = busyById[user.id];
                return (
                  <tr
                    key={user.id}
                    style={{
                      opacity: removingIds.has(user.id) ? 0 : 1,
                      transform: removingIds.has(user.id) ? "translateX(14px)" : "translateX(0)",
                      transition: "all 220ms ease",
                      background: selectedIds.has(user.id) ? "rgba(240, 165, 0, 0.05)" : undefined,
                    }}
                  >
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(user.id)}
                        onChange={() => toggleSelect(user.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td>{user.email}</td>
                    <td>{relativeTime(user.requested_at)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          id={`approve-${user.id}`}
                          className="btn btn-teal btn-sm"
                          onClick={() => runAction(user.id, "approve")}
                          disabled={Boolean(busy)}
                        >
                          {busy === "approve" ? <Loader2 size={12} className="spin" /> : <CheckCircle size={12} />}
                          Approve
                        </button>
                        <button
                          id={`deny-${user.id}`}
                          className="btn btn-danger btn-sm"
                          onClick={() => runAction(user.id, "deny")}
                          disabled={Boolean(busy)}
                        >
                          {busy === "deny" ? <Loader2 size={12} className="spin" /> : <XCircle size={12} />}
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
