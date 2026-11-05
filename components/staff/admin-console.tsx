"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Select, Spinner, cx } from "@/components/ui";
import { timeAgo } from "@/lib/format";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department_name: string | null;
  suspended: number;
  email_verified: number;
  created_at: string;
  report_count: number;
  is_demo: number;
};

export function AdminConsole({
  initialUsers,
  departments,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  departments: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()) ||
      u.role.includes(query.toLowerCase()),
  );

  async function patch(userId: string, payload: Record<string, unknown>) {
    setBusy(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setUsers(data.users);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
            Users ({users.length})
          </h2>
          {busy && <Spinner className="size-3.5 text-accent" />}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, email or role"
          aria-label="Filter users"
          className="h-9 w-full max-w-xs rounded-xl border border-white/10 bg-[#0b1220] px-3 text-[12px] placeholder:text-muted/70 focus:border-accent/50 focus:outline-none"
        />
      </div>

      {error && <p className="mt-2 text-[11.5px] text-crit">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08]">
        <div className="hidden grid-cols-[1.6fr_0.9fr_1fr_0.7fr_auto] gap-3 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid">
          <span>Account</span>
          <span>Role</span>
          <span>Department</span>
          <span>Reports</span>
          <span className="text-right">Actions</span>
        </div>
        {filtered.map((u) => (
          <div
            key={u.id}
            className={cx(
              "grid gap-2 border-b border-white/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[1.6fr_0.9fr_1fr_0.7fr_auto] md:items-center md:gap-3",
              u.suspended === 1 && "bg-crit/[0.04]",
            )}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-[12.5px] font-medium">
                {u.name}
                {u.id === currentUserId && (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-accent">
                    you
                  </span>
                )}
                {u.suspended === 1 && (
                  <span className="rounded bg-crit/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-crit">
                    suspended
                  </span>
                )}
              </p>
              <p className="truncate text-[10.5px] text-muted">{u.email}</p>
              <p className="mt-0.5 text-[10px] text-muted/70">
                joined {timeAgo(u.created_at)} · {u.email_verified ? "email confirmed" : "unconfirmed"}
              </p>
            </div>

            <div>
              <Select
                value={u.role}
                onChange={(e) => void patch(u.id, { role: e.target.value })}
                className="py-1.5 text-[11.5px]"
                aria-label={`Role for ${u.name}`}
                disabled={busy === u.id}
              >
                {["citizen", "moderator", "authority", "admin"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              {u.role === "authority" ? (
                <Select
                  value={departments.find((d) => d.name === u.department_name)?.id ?? ""}
                  onChange={(e) => void patch(u.id, { departmentId: e.target.value })}
                  className="py-1.5 text-[11.5px]"
                  aria-label={`Department for ${u.name}`}
                  disabled={busy === u.id}
                >
                  <option value="">Select…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="text-[11px] text-muted">—</span>
              )}
            </div>

            <div>
              <Badge color="#929FB2" dot={false}>
                {u.report_count}
              </Badge>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant={u.suspended ? "secondary" : "ghost"}
                onClick={() => void patch(u.id, { suspended: !u.suspended })}
                disabled={busy === u.id || u.id === currentUserId}
              >
                {u.suspended ? "Restore" : "Suspend"}
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-[12px] text-muted">No accounts match that filter.</p>
        )}
      </div>
    </div>
  );
}
