"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Panel, Spinner, cx } from "@/components/ui";
import { dateTime, timeAgo } from "@/lib/format";
import type { HospitalLinkRow } from "@/lib/hospitals/types";

const STATUS_COLOR: Record<HospitalLinkRow["linkStatus"], string> = {
  pending: "#F5B94B",
  approved: "#43D6A0",
  rejected: "#F16D78",
  revoked: "#929FB2",
};

const FILTERS = ["all", "pending", "approved", "rejected", "revoked"] as const;

export function HospitalLinkReview({ links }: { links: HospitalLinkRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const visible = filter === "all" ? links : links.filter((link) => link.linkStatus === filter);

  async function review(id: string, action: "approve" | "reject" | "revoke") {
    if (action === "revoke" && confirmRevoke !== id) {
      setConfirmRevoke(id);
      return;
    }
    setBusyId(id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/hospital-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, note: notes[id]?.trim() || undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The decision could not be saved.");
      setSuccess(
        action === "approve"
          ? "Hospital link approved. The organisation can now publish availability."
          : action === "reject"
            ? "Hospital link rejected. The organisation has been notified."
            : "Hospital link revoked. The current availability report is no longer public.",
      );
      setConfirmRevoke(null);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The decision could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((value) => {
          const count = value === "all" ? links.length : links.filter((link) => link.linkStatus === value).length;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cx(
                "rounded-full border px-3 py-1.5 text-[11.5px] capitalize transition-colors",
                filter === value
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "border-white/10 text-muted hover:text-fg",
              )}
            >
              {value} ({count})
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-crit/25 bg-crit/5 px-3 py-2 text-[12px] text-crit">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mb-3 rounded-xl border border-mint/20 bg-mint/5 px-3 py-2 text-[12px] text-mint">
          {success}
        </p>
      )}

      {visible.length === 0 ? (
        <Panel className="p-6 text-center text-[12.5px] text-muted">
          No hospital link requests in this state.
        </Panel>
      ) : (
        <div className="space-y-3">
          {visible.map((link) => (
            <Panel key={link.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold">{link.facilityName}</h3>
                    <Badge color={STATUS_COLOR[link.linkStatus]} dot={false}>{link.linkStatus}</Badge>
                    <span className="text-[10.5px] capitalize text-muted">{link.facilityKind}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{link.address ?? "Address not published"}</p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    Requested by <span className="text-fg/85">{link.departmentName}</span>
                    {link.requestedByName ? ` · ${link.requestedByName}` : ""} {timeAgo(link.createdAt)}
                  </p>
                </div>
                <div className="text-right text-[10.5px] text-muted">
                  <p>{link.availabilityVersion ? `Availability v${link.availabilityVersion}` : "No availability report"}</p>
                  <p className="mt-0.5">{link.wardCount} wards · {link.serviceCount} services</p>
                  {link.availabilityUpdatedAt && <p className="mt-0.5">Updated {dateTime(link.availabilityUpdatedAt)}</p>}
                </div>
              </div>

              {link.reviewNote && <p className="mt-2 text-[11px] text-warn">Review note: {link.reviewNote}</p>}
              {link.reviewedAt && (
                <p className="mt-1 text-[10.5px] text-muted">
                  Reviewed {dateTime(link.reviewedAt)}{link.reviewedByName ? ` by ${link.reviewedByName}` : ""}
                </p>
              )}

              {(link.linkStatus === "pending" || link.linkStatus === "approved") && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={notes[link.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [link.id]: event.target.value }))}
                    placeholder={link.linkStatus === "approved" ? "Reason for revoking this link…" : "Review note shared with the organisation…"}
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] outline-none focus:border-accent/50"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {link.linkStatus === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busyId === link.id}
                          onClick={() => void review(link.id, "approve")}
                        >
                          {busyId === link.id ? <Spinner className="size-3" /> : null}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === link.id}
                          onClick={() => void review(link.id, "reject")}
                        >
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant={confirmRevoke === link.id ? "danger" : "secondary"}
                        disabled={busyId === link.id}
                        onClick={() => void review(link.id, "revoke")}
                      >
                        {busyId === link.id ? <Spinner className="size-3" /> : null}
                        {confirmRevoke === link.id ? "Confirm revoke" : "Revoke link"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {link.linkStatus === "approved" && (
                <p className="mt-2 text-[10px] leading-relaxed text-muted">
                  Revoking removes the organisation&apos;s current availability report from public view. The audit
                  history is kept.
                </p>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
