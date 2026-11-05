"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ReportActions } from "@/components/staff/report-actions";
import { Badge, EmptyState, cx } from "@/components/ui";
import { severityMeta, statusMeta, verificationMeta } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { ReportListItem } from "@/lib/repo";

const TABS = [
  { key: "assigned", label: "Assigned" },
  { key: "unassigned", label: "Unassigned" },
  { key: "critical", label: "Critical hazards" },
  { key: "overdue", label: "Overdue" },
  { key: "investigating", label: "Under investigation" },
  { key: "resolved", label: "Resolved" },
] as const;

export function AuthorityBoard({
  rows,
  departments,
  isAdmin,
  departmentName,
}: {
  rows: ReportListItem[];
  departments: { id: string; name: string }[];
  isAdmin: boolean;
  departmentName: string | null;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("assigned");

  const filtered = useMemo(() => {
    switch (tab) {
      case "assigned":
        return rows.filter((r) => r.department_id);
      case "unassigned":
        return rows.filter((r) => !r.department_id);
      case "critical":
        return rows.filter((r) => r.severity === "critical" && r.status !== "resolved");
      case "overdue":
        return rows.filter(
          (r) =>
            r.response_count === 0 &&
            r.status !== "resolved" &&
            Date.now() - new Date(r.created_at).getTime() > 7 * 86_400_000,
        );
      case "investigating":
        return rows.filter((r) => r.status === "under_review");
      case "resolved":
        return rows.filter((r) => r.status === "resolved");
      default:
        return rows;
    }
  }, [rows, tab]);

  const counts = useMemo(
    () => ({
      assigned: rows.filter((r) => r.department_id).length,
      unassigned: rows.filter((r) => !r.department_id).length,
      critical: rows.filter((r) => r.severity === "critical" && r.status !== "resolved").length,
      overdue: rows.filter(
        (r) =>
          r.response_count === 0 &&
          r.status !== "resolved" &&
          Date.now() - new Date(r.created_at).getTime() > 7 * 86_400_000,
      ).length,
      investigating: rows.filter((r) => r.status === "under_review").length,
      resolved: rows.filter((r) => r.status === "resolved").length,
    }),
    [rows],
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all",
              tab === t.key
                ? "border-accent/45 bg-accent/12 text-accent"
                : "border-white/10 text-muted hover:border-white/20 hover:text-fg",
            )}
          >
            {t.label}
            <span className="rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums">
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-muted">
        {isAdmin
          ? "Administrator view: every department's incidents."
          : `Showing incidents handled by ${departmentName ?? "your department"}.`}
      </p>

      <div className="mt-4 space-y-2.5">
        {filtered.length === 0 ? (
          <EmptyState
            title="Nothing in this queue"
            description="When an incident enters this state it will appear here with its recorded history."
          />
        ) : (
          filtered.map((r) => {
            const sev = severityMeta(r.severity);
            const stat = statusMeta(r.status);
            const ver = verificationMeta(r.verification);
            return (
              <div key={r.id} className="panel p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge color={sev.color} dot={false}>
                        {sev.label}
                      </Badge>
                      <span className="text-[10.5px]" style={{ color: stat.color }}>
                        {stat.label}
                      </span>
                      <span className="text-[10.5px] text-muted">· {ver.label}</span>
                      {r.response_count === 0 && r.status !== "resolved" && (
                        <span className="rounded-full bg-warn/12 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-warn">
                          no response yet
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/incidents/${r.id}`}
                      className="mt-1 block truncate text-[13.5px] font-medium hover:text-accent"
                    >
                      {r.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <span className="font-mono text-[10.5px]">{r.id}</span>
                      <span>·</span>
                      <span>{r.neighborhood ?? "Unmapped"}</span>
                      <span>·</span>
                      <span>{timeAgo(r.created_at)}</span>
                      <span>·</span>
                      <span>{r.department_name ?? "Unassigned"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/incidents/${r.id}`}
                      className="rounded-full border border-white/12 px-3 py-1.5 text-[11.5px] text-muted transition-colors hover:text-fg"
                    >
                      Open
                    </Link>
                    <ReportActions
                      reportId={r.id}
                      variant="authority"
                      currentStatus={r.status}
                      departments={departments}
                      canAssign={isAdmin}
                      disabled={r.status === "resolved"}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
