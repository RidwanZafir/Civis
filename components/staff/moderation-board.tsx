"use client";

import { useState } from "react";
import Link from "next/link";
import { ReportActions } from "@/components/staff/report-actions";
import { Badge, EmptyState, cx } from "@/components/ui";
import { severityMeta, verificationMeta } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { ReportListItem } from "@/lib/repo";

type Flag = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
  reporter: string | null;
  title: string | null;
};

export function ModerationBoard({
  pending,
  flags,
  duplicates,
}: {
  pending: ReportListItem[];
  flags: Flag[];
  duplicates: { id: string; title: string; neighborhood: string | null; d: number }[];
}) {
  const [tab, setTab] = useState<"queue" | "duplicates" | "flags">("queue");

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {[
          { key: "queue" as const, label: "Review queue", count: pending.length },
          { key: "duplicates" as const, label: "Duplicate signals", count: duplicates.length },
          { key: "flags" as const, label: "Reported content", count: flags.length },
        ].map((t) => (
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
            <span className="rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-2.5">
        {tab === "queue" &&
          (pending.length === 0 ? (
            <EmptyState
              title="Review queue is clear"
              description="New submissions arrive here for evidence and duplicate checks."
            />
          ) : (
            pending.map((r) => {
              const sev = severityMeta(r.severity);
              const ver = verificationMeta(r.verification);
              return (
                <div key={r.id} className="panel flex flex-wrap items-start justify-between gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge color={sev.color} dot={false}>
                        {sev.label}
                      </Badge>
                      <span className="text-[10.5px]" style={{ color: ver.color }}>
                        {ver.label}
                      </span>
                      {r.credibility < 50 && (
                        <span className="rounded-full bg-crit/12 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-crit">
                          low credibility signal
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
                      <span>{r.supporters} supporters</span>
                      <span>·</span>
                      <span>{timeAgo(r.created_at)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/incidents/${r.id}`}
                      className="rounded-full border border-white/12 px-3 py-1.5 text-[11.5px] text-muted transition-colors hover:text-fg"
                    >
                      Inspect
                    </Link>
                    <ReportActions reportId={r.id} variant="moderator" currentStatus={r.status} />
                  </div>
                </div>
              );
            })
          ))}

        {tab === "duplicates" &&
          (duplicates.length === 0 ? (
            <EmptyState title="No duplicate signals" description="Nearby reports in the same category will surface here." />
          ) : (
            duplicates.map((d) => (
              <div key={d.id} className="panel flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{d.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {d.neighborhood ?? "Unmapped"} · {d.d} nearby report{d.d === 1 ? "" : "s"} in the same category
                  </p>
                </div>
                <Link
                  href={`/incidents/${d.id}`}
                  className="shrink-0 rounded-full border border-white/12 px-3 py-1.5 text-[11.5px] text-muted hover:text-fg"
                >
                  Compare
                </Link>
              </div>
            ))
          ))}

        {tab === "flags" &&
          (flags.length === 0 ? (
            <EmptyState title="No flagged content" description="Community flags for reports and comments appear here." />
          ) : (
            flags.map((f) => (
              <div key={f.id} className="panel p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge color="#F16D78" dot={false}>
                      {f.target_type}
                    </Badge>
                    <span className="font-mono text-[10.5px] text-muted">{f.target_id}</span>
                  </div>
                  <span className="text-[10.5px] text-muted">{timeAgo(f.created_at)}</span>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed">{f.reason}</p>
                <p className="mt-1 text-[10.5px] text-muted">
                  Flagged by {f.reporter ?? "a community member"}
                  {f.title ? ` · ${f.title}` : ""}
                </p>
                {f.target_type === "report" && (
                  <Link
                    href={`/incidents/${f.target_id}`}
                    className="mt-2 inline-block text-[11px] text-accent underline-offset-4 hover:underline"
                  >
                    Open reported incident →
                  </Link>
                )}
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
