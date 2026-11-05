"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Droplets } from "lucide-react";
import { Button, EmptyState, Panel, Spinner, Textarea, cx } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { urgencyMeta } from "@/lib/blood/compat";

type QueueItem = {
  id: string;
  code: string;
  bloodGroup: string;
  componentLabel: string;
  unitsRequired: number;
  hospitalName: string;
  district: string | null;
  city: string | null;
  urgency: string;
  status: string;
  verificationStatus: string;
  patientName: string;
  contactName?: string | null;
  contactPhone?: string | null;
  createdAt: string;
  requiredAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending_verification: "Pending verification",
  verified: "Verified",
  active: "Active",
  partially_fulfilled: "Partially fulfilled",
  fulfilled: "Fulfilled",
  expired: "Expired",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export function BloodModeration({ pending, recent }: { pending: QueueItem[]; recent: QueueItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function act(id: string, action: "verify" | "reject" | "request_info" | "flag") {
    setBusy(`${id}:${action}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/blood/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, notes: notes[id] ?? null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The moderation action failed.");
      setNotice(data.message ?? "Moderation action recorded.");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The moderation action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {notice && <p className="flex items-start gap-2 rounded-xl border border-mint/25 bg-mint/5 p-3 text-xs text-mint" role="status"><CircleCheck size={15} className="mt-0.5 shrink-0" aria-hidden />{notice}</p>}
      {error && <p className="flex items-start gap-2 rounded-xl border border-crit/25 bg-crit/5 p-3 text-xs text-crit" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />{error}</p>}

      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Awaiting verification
          <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] text-warn">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <EmptyState icon={<Droplets size={22} />} title="No blood requests awaiting review" description="New submissions appear here with their contact details for verification." />
        ) : (
          <div className="mt-3 space-y-3">
            {pending.map((item) => {
              const urgency = urgencyMeta(item.urgency);
              return (
                <Panel key={item.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold">
                        <span style={{ color: urgency.color }}>{item.bloodGroup}</span> · {item.componentLabel} ×{item.unitsRequired}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">{item.code} · {item.hospitalName}{item.district ? `, ${item.district}` : ""} · submitted {timeAgo(item.createdAt)}</p>
                    </div>
                    <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: urgency.color, background: `${urgency.color}14` }}>
                      {urgency.label.split(" —")[0]}
                    </span>
                  </div>
                  <div className="grid gap-2 text-[11.5px] sm:grid-cols-2">
                    <p><span className="text-muted">Patient: </span>{item.patientName}</p>
                    <p><span className="text-muted">Needed: </span>{new Date(item.requiredAt).toLocaleString()}</p>
                    <p><span className="text-muted">Contact: </span>{item.contactName} · {item.contactPhone}</p>
                    <p><span className="text-muted">Status: </span>{STATUS_LABEL[item.status] ?? item.status}</p>
                  </div>
                  <Textarea
                    rows={2}
                    value={notes[item.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder="Verification note (required to reject, shown to the requester)"
                    maxLength={600}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void act(item.id, "verify")} disabled={busy !== null}>
                      {busy === `${item.id}:verify` ? <Spinner className="size-3" /> : null}Verify &amp; alert donors
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void act(item.id, "request_info")} disabled={busy !== null}>Request information</Button>
                    <Button size="sm" variant="secondary" onClick={() => void act(item.id, "flag")} disabled={busy !== null}>Flag</Button>
                    <Button size="sm" variant="secondary" onClick={() => void act(item.id, "reject")} disabled={busy !== null}>Reject</Button>
                    <Link href={`/blood/${item.id}`} className="ml-auto self-center text-[11px] text-accent underline underline-offset-4">Open request</Link>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold">Recently reviewed</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-[11.5px] text-muted">No reviewed requests yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.06] rounded-xl border border-white/10">
            {recent.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-[11.5px]">
                <span>
                  <Link href={`/blood/${item.id}`} className="font-medium hover:text-accent">{item.code}</Link>
                  <span className="text-muted"> · {item.bloodGroup} · {item.hospitalName}</span>
                </span>
                <span className={cx("text-[10px] uppercase tracking-[0.08em]", item.status === "rejected" ? "text-crit" : "text-muted")}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
