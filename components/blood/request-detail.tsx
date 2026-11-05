"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, HeartPulse, MapPin, Phone, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, ButtonLink, Panel, Spinner, Textarea, cx } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { BLOOD_SAFETY_NOTICE, STATUS_COLOR, STATUS_LABEL, componentLabel, urgencyMeta } from "@/lib/blood/compat";

type RequestShape = {
  id: string;
  code: string;
  bloodGroup: string;
  component: string;
  componentNote: string | null;
  componentLabel: string;
  unitsRequired: number;
  unitsFulfilled: number;
  hospitalName: string;
  hospitalAddress: string | null;
  district: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  requiredAt: string;
  urgency: string;
  urgencyLabel: string;
  status: string;
  verificationStatus: string;
  notes: string | null;
  patientName: string;
  contactName?: string | null;
  contactPhone?: string | null;
  createdAt: string;
  redacted: boolean;
  isOwner: boolean;
};

type Interest = {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  donor_name: string;
  blood_group: string;
  city: string;
  district: string;
  availability: string;
  contact_method: string;
  contact_phone: string | null;
};

export function BloodRequestDetail({
  request,
  interests,
  canManage,
  viewerRole,
  hasDonorProfile,
}: {
  request: RequestShape;
  interests: Interest[];
  canManage: boolean;
  viewerRole: string | null;
  hasDonorProfile: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(request.status);
  const [units, setUnits] = useState(request.unitsFulfilled);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [offered, setOffered] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  const urgency = urgencyMeta(request.urgency);
  const closed = ["fulfilled", "cancelled", "rejected", "expired"].includes(status);
  const canOffer = !!viewerRole && !request.isOwner && !canManage && !closed;

  async function patchStatus(next: string, extra?: { unitsFulfilled?: number }) {
    setBusy(next);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/blood/requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, unitsFulfilled: extra?.unitsFulfilled, notes: null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The request could not be updated.");
      setStatus(next);
      if (extra?.unitsFulfilled !== undefined) setUnits(extra.unitsFulfilled);
      setNotice(`Request marked ${(STATUS_LABEL as Record<string, string>)[next] ?? next}. Matching alerts stop once a request is closed.`);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The request could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  async function offer() {
    setBusy("offer");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/blood/requests/${request.id}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your offer could not be recorded.");
      setOffered(true);
      setNotice(data.message ?? "Your offer is recorded.");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Your offer could not be recorded.");
    } finally {
      setBusy(null);
    }
  }

  async function respond(interestId: string, next: "accepted" | "declined" | "donated") {
    setBusy(interestId);
    setError(null);
    try {
      const response = await fetch(`/api/blood/requests/${request.id}/interest`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interestId, status: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The donor response could not be updated.");
      setNotice(next === "accepted" ? "Offer accepted. The donor can now be contacted." : "Donor response updated.");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The donor response could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  async function flag() {
    setBusy("flag");
    setError(null);
    try {
      const response = await fetch("/api/blood/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, reason: flagReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The report could not be recorded.");
      setNotice(data.message ?? "Reported to the moderation team.");
      setFlagOpen(false);
      setFlagReason("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The report could not be recorded.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-2xl border text-lg font-bold" style={{ borderColor: `${urgency.color}40`, color: urgency.color, background: `${urgency.color}12` }}>
              {request.bloodGroup}
            </span>
            <div>
              <h1 className="text-lg font-semibold">{request.componentLabel} · {request.unitsRequired} unit{request.unitsRequired === 1 ? "" : "s"}</h1>
              <p className="mt-0.5 text-[11.5px] text-muted">{request.code} · requested {timeAgo(request.createdAt)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: urgency.color, background: `${urgency.color}14` }}>
              {urgency.label}
            </span>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: STATUS_COLOR[status as keyof typeof STATUS_COLOR] ?? "#929FB2" }}>
              {STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
          <div>
            <dt className="text-muted">Hospital</dt>
            <dd className="mt-0.5 font-medium">{request.hospitalName}</dd>
            <dd className="text-[11px] text-muted">{[request.hospitalAddress, request.district, request.city].filter(Boolean).join(" · ")}</dd>
          </div>
          <div>
            <dt className="text-muted">Needed by</dt>
            <dd className="mt-0.5 font-medium">{new Date(request.requiredAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted">Patient</dt>
            <dd className="mt-0.5 font-medium">{request.patientName}{request.redacted ? <span className="ml-1 text-[10px] text-muted">(name hidden publicly)</span> : null}</dd>
          </div>
          <div>
            <dt className="text-muted">Verification</dt>
            <dd className={cx("mt-0.5 flex items-center gap-1.5 font-medium", request.verificationStatus === "verified" ? "text-mint" : "text-warn")}>
              <ShieldCheck size={13} aria-hidden />
              {request.verificationStatus === "verified" ? "Verified by a CIVIS moderator" : "Awaiting moderator verification"}
            </dd>
          </div>
          {request.unitsFulfilled > 0 && (
            <div>
              <dt className="text-muted">Units arranged</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{units} of {request.unitsRequired}</dd>
            </div>
          )}
        </dl>

        {request.notes && (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11.5px] leading-relaxed text-muted">{request.notes}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-muted hover:text-fg" href={`https://www.google.com/maps/dir/?api=1&destination=${request.latitude},${request.longitude}`} target="_blank" rel="noopener noreferrer">
            <MapPin size={13} aria-hidden /> Get directions
          </a>
          {request.contactPhone && (
            <a className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-muted hover:text-fg" href={`tel:${request.contactPhone.replace(/[ ()-]/g, "")}`}>
              <Phone size={13} aria-hidden /> Call {request.contactName}
            </a>
          )}
          {viewerRole && !request.isOwner && (
            <button type="button" onClick={() => setFlagOpen((value) => !value)} className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted underline underline-offset-4 hover:text-fg">
              <TriangleAlert size={13} aria-hidden /> Report this request
            </button>
          )}
        </div>
      </Panel>

      {notice && <p className="flex items-start gap-2 rounded-xl border border-mint/25 bg-mint/5 p-3 text-xs text-mint" role="status"><CircleCheck size={15} className="mt-0.5 shrink-0" aria-hidden />{notice}</p>}
      {error && <p className="flex items-start gap-2 rounded-xl border border-crit/25 bg-crit/5 p-3 text-xs text-crit" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />{error}</p>}

      {flagOpen && (
        <Panel className="space-y-3 border-warn/25 p-4">
          <p className="text-[12px] font-medium">Report this request</p>
          <Textarea rows={2} value={flagReason} onChange={(event) => setFlagReason(event.target.value)} maxLength={300} placeholder="Why does this request look suspicious?" />
          <div className="flex gap-2">
            <Button size="sm" onClick={flag} disabled={busy === "flag" || flagReason.trim().length < 4}>
              {busy === "flag" ? <Spinner className="size-3" /> : null}Send report
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFlagOpen(false)}>Cancel</Button>
          </div>
        </Panel>
      )}

      {canOffer && (
        <Panel id="donate" className="space-y-3 p-5">
          <h2 className="text-sm font-semibold">I can donate</h2>
          {offered ? (
            <p className="text-[11.5px] leading-relaxed text-muted">Your offer is on file. The requester sees your blood group and can accept it; only then is your contact method shared.</p>
          ) : !viewerRole ? (
            <p className="text-[11.5px] leading-relaxed text-muted">
              <Link href={`/auth/sign-in?next=/blood/${request.id}`} className="text-accent underline underline-offset-4">Sign in</Link> to offer to donate.
            </p>
          ) : !hasDonorProfile ? (
            <div className="space-y-2">
              <p className="text-[11.5px] leading-relaxed text-muted">Register as a voluntary donor before offering. It takes one form and can be withdrawn at any time.</p>
              <ButtonLink href="/blood/donor" size="sm" variant="secondary">Become a blood donor</ButtonLink>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[10.5px] leading-relaxed text-muted">
                <HeartPulse size={14} className="mt-0.5 shrink-0 text-crit" aria-hidden />
                This records an offer to help — it does not confirm you as a donor or that your blood is compatible. The hospital or blood bank confirms eligibility.
              </div>
              <Textarea rows={2} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="Optional message: when you can reach the hospital." />
              <Button size="sm" onClick={offer} disabled={busy === "offer"}>
                {busy === "offer" ? <Spinner className="size-3" /> : null}I&apos;m interested in donating
              </Button>
            </>
          )}
        </Panel>
      )}

      {canManage && (
        <Panel className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Manage this request</h2>
            <span className="text-[10.5px] text-muted">{STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!closed && (
              <>
                <Button size="sm" variant="secondary" onClick={() => void patchStatus("partially_fulfilled", { unitsFulfilled: Math.max(1, Math.min(request.unitsRequired - 1, units + 1)) })} disabled={busy !== null}>
                  Record a unit arranged
                </Button>
                <Button size="sm" onClick={() => void patchStatus("fulfilled")} disabled={busy !== null}>
                  {busy === "fulfilled" ? <Spinner className="size-3" /> : null}Mark fulfilled
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void patchStatus("cancelled")} disabled={busy !== null}>
                  Cancel request
                </Button>
              </>
            )}
            {closed && <p className="text-[11.5px] text-muted">This request is closed. No further matching alerts are sent, and the record is kept for audit.</p>}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Donor offers ({interests.length})</p>
            {interests.length === 0 ? (
              <p className="mt-2 text-[11.5px] text-muted">No offers yet. Matching donors are alerted when the request is verified.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {interests.map((interest) => (
                  <li key={interest.id} className="rounded-xl border border-white/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] font-medium">{interest.donor_name} · <span className="text-accent">{interest.blood_group}</span></p>
                      <span className="text-[10px] uppercase tracking-[0.08em] text-muted">{interest.status}</span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-muted">{interest.city}, {interest.district} · offered {timeAgo(interest.created_at)}</p>
                    {interest.message && <p className="mt-1 text-[11px] leading-relaxed text-muted">{interest.message}</p>}
                    {interest.contact_phone && <p className="mt-1 text-[11px] text-mint">Contact: {interest.contact_phone} ({interest.contact_method === "phone" ? "phone preferred" : "in-app first"})</p>}
                    {interest.status === "offered" && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => void respond(interest.id, "accepted")} disabled={busy !== null}>Accept offer</Button>
                        <Button size="sm" variant="secondary" onClick={() => void respond(interest.id, "declined")} disabled={busy !== null}>Decline</Button>
                      </div>
                    )}
                    {interest.status === "accepted" && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => void respond(interest.id, "donated")} disabled={busy !== null}>Mark donation completed</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      )}

      <p className="rounded-xl border border-warn/20 bg-warn/[0.04] p-3 text-[10.5px] leading-relaxed text-warn">{BLOOD_SAFETY_NOTICE}</p>
    </div>
  );
}
