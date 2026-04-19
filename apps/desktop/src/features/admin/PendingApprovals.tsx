import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
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
  onRefresh,
}: {
  users: PendingUser[];
  onApprove: (id: string) => Promise<void>;
  onDeny: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [rows, setRows] = useState<PendingUser[]>(users);
  const [busyById, setBusyById] = useState<Record<string, "approve" | "deny" | null>>({});
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRows(users);
  }, [users]);

  const count = useMemo(() => rows.length, [rows.length]);

  const runAction = async (id: string, action: "approve" | "deny") => {
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

      {rows.length === 0 ? (
        <div className="admin-empty">No pending access requests.</div>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Requested</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const busy = busyById[user.id];
                return (
                  <tr
                    key={user.id}
                    style={{
                      opacity: removingIds.has(user.id) ? 0 : 1,
                      transform: removingIds.has(user.id) ? "translateX(14px)" : "translateX(0)",
                      transition: "all 220ms ease",
                    }}
                  >
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
