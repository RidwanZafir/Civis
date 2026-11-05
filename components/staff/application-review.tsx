"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Panel, Spinner } from "@/components/ui";
import { dateTime } from "@/lib/format";

type Application = {
  id: string;
  department_id: string;
  organisation_name: string;
  organisation_type: string;
  official_email: string | null;
  phone: string | null;
  address: string | null;
  division: string | null;
  district: string | null;
  website: string | null;
  rep_name: string;
  rep_designation: string | null;
  rep_email: string;
  rep_phone: string | null;
  rep_role: string | null;
  documents: string | null;
  status: string;
  review_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  verification_status: string;
};

const STATUS_COLOR: Record<string, string> = {
  pending: "#F5B94B",
  under_review: "#36D9FF",
  info_required: "#F5B94B",
  approved: "#43D6A0",
  rejected: "#F16D78",
  suspended: "#F16D78",
};

export function ApplicationReview({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  async function review(id: string, action: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, notes: notes[id] || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the review");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusyId(null);
  }

  const visible = filter === "all" ? applications : applications.filter((a) => a.status === filter);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {["all", "pending", "under_review", "info_required", "approved", "rejected", "suspended"].map(
          (value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1.5 text-[11.5px] transition-colors ${
                filter === value
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "border-white/10 text-muted hover:text-fg"
              }`}
            >
              {value === "all" ? "All" : value.replace("_", " ")}
              {value === "all" ? ` (${applications.length})` : ""}
            </button>
          ),
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-[12px] text-crit">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <Panel className="p-6 text-center text-[12.5px] text-muted">
          No applications in this state.
        </Panel>
      ) : (
        <div className="space-y-3">
          {visible.map((application) => (
            <Panel key={application.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold">{application.organisation_name}</h3>
                    <Badge color={STATUS_COLOR[application.status] ?? "#929FB2"} dot={false}>
                      {application.status.replace("_", " ")}
                    </Badge>
                    <span className="text-[10.5px] capitalize text-muted">
                      {application.organisation_type.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted">
                    Submitted {dateTime(application.submitted_at)}
                    {application.reviewed_at ? ` · reviewed ${dateTime(application.reviewed_at)}` : ""}
                  </p>
                </div>
                <span className="font-mono text-[10px] text-muted">{application.id}</span>
              </div>

              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[11.5px] sm:grid-cols-2">
                {[
                  ["Representative", `${application.rep_name}${application.rep_designation ? ` · ${application.rep_designation}` : ""}`],
                  ["Representative email", application.rep_email],
                  ["Official email", application.official_email ?? "—"],
                  ["Phone", application.phone ?? "—"],
                  ["Location", [application.division, application.district].filter(Boolean).join(", ") || "—"],
                  ["Office", application.address ?? "—"],
                  ["Website", application.website ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted">{label}</dt>
                    <dd className="truncate text-right">{value}</dd>
                  </div>
                ))}
              </dl>

              {application.documents && (
                <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2 text-[11px] leading-relaxed text-muted">
                  <span className="text-fg/80">Documents: </span>
                  {application.documents}
                </p>
              )}

              {application.review_notes && (
                <p className="mt-2 text-[11px] text-warn">Review note: {application.review_notes}</p>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={notes[application.id] ?? ""}
                  onChange={(event) => setNotes((n) => ({ ...n, [application.id]: event.target.value }))}
                  placeholder="Review note shared with the applicant…"
                  className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] outline-none focus:border-accent/50"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["under_review", "Review"],
                    ["info_required", "Request info"],
                    ["approve", "Approve"],
                    ["reject", "Reject"],
                    ["suspend", "Suspend"],
                  ].map(([action, label]) => (
                    <Button
                      key={action}
                      size="sm"
                      variant={action === "approve" ? "primary" : action === "reject" || action === "suspend" ? "ghost" : "secondary"}
                      disabled={busyId === application.id}
                      onClick={() => review(application.id, action)}
                    >
                      {busyId === application.id ? <Spinner className="size-3" /> : null}
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
