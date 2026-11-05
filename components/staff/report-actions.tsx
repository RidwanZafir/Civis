"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";

export function ReportActions({
  reportId,
  variant,
  currentStatus,
  departments,
  canAssign,
  disabled,
}: {
  reportId: string;
  variant: "moderator" | "authority";
  currentStatus: string;
  departments?: { id: string; name: string }[];
  canAssign?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(35);
  const [eta, setEta] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() || undefined, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function uploadResolution(files: FileList | null) {
    if (!files?.length) return;
    setBusy("resolve");
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const up = await fetch("/api/upload", { method: "POST", body: form });
      const upData = await up.json();
      if (!up.ok) throw new Error(upData.error ?? "Upload failed");
      const res = await fetch(`/api/reports/${reportId}/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", note: note.trim(), images: upData.urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not resolve");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>
        {variant === "moderator" ? "Review" : "Update"}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={variant === "moderator" ? "Moderation review" : "Authority update"}
        description={`${reportId} · current status: ${currentStatus.replace(/_/g, " ")}`}
        wide
        footer={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-5">
          <Field
            label="Note"
            hint="Recorded in the status history and the audit log with your name and timestamp."
          >
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                variant === "moderator"
                  ? "What did you verify? Where did you check?"
                  : "What work has been carried out, or is scheduled?"
              }
              className="min-h-20"
            />
          </Field>

          {variant === "moderator" && (
            <>
              <div className="rounded-xl border border-white/[0.08] p-3">
                <p className="text-[12px] font-medium">Verification decision</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                  Community verification is separate from official confirmation. Approving here marks
                  the report community verified and starts the public statistics count.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => call("verify", { decision: "approve" })} disabled={busy !== null}>
                    {busy === "verify" ? <Spinner className="size-3" /> : null}
                    Approve as verified
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => call("verify", { decision: "reject" })}
                    disabled={busy !== null}
                  >
                    Reject report
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] p-3">
                <p className="text-[12px] font-medium">Change status</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["under_review", "community_verified", "authority_notified"].map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="secondary"
                      onClick={() => call("status", { status: s })}
                      disabled={busy !== null}
                    >
                      {s.replace(/_/g, " ")}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          {variant === "authority" && (
            <>
              <div className="rounded-xl border border-white/[0.08] p-3">
                <p className="text-[12px] font-medium">Accept incident</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                  Acceptance marks the incident officially confirmed. It is only possible for the
                  department this incident is assigned to.
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => call("accept")}
                  disabled={busy !== null}
                >
                  {busy === "accept" ? <Spinner className="size-3" /> : null}
                  Accept incident
                </Button>
              </div>

              <div className="rounded-xl border border-white/[0.08] p-3">
                <p className="text-[12px] font-medium">Publish official response</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Work progress (%)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={progress}
                      onChange={(e) => setProgress(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Estimated completion">
                    <Input
                      value={eta}
                      onChange={(e) => setEta(e.target.value)}
                      placeholder="e.g. 3 working days"
                    />
                  </Field>
                </div>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    call("respond", {
                      body: note.trim(),
                      progress,
                      eta: eta.trim() || undefined,
                    })
                  }
                  disabled={busy !== null || note.trim().length < 20}
                >
                  {busy === "respond" ? <Spinner className="size-3" /> : null}
                  Publish response
                </Button>
                <p className="mt-2 text-[10px] text-muted">
                  Progress of 100% marks the incident resolved automatically.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.08] p-3">
                <p className="text-[12px] font-medium">Mark resolved with evidence</p>
                <label className="mt-2 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/15 px-3 py-3 text-[11.5px] text-muted transition-colors hover:border-white/30">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(e) => void uploadResolution(e.target.files)}
                  />
                  {busy === "resolve" ? <Spinner className="size-3.5" /> : "Attach resolution photograph(s)"}
                </label>
              </div>

              <div className="rounded-xl border border-white/[0.08] p-3">
                <p className="text-[12px] font-medium">Field status</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["in_progress", "resolved"].map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="secondary"
                      onClick={() => call("status", { status: s })}
                      disabled={busy !== null}
                    >
                      {s.replace(/_/g, " ")}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          {canAssign && departments && (
            <div className="rounded-xl border border-white/[0.08] p-3">
              <p className="text-[12px] font-medium">Assign department</p>
              <div className="mt-2 flex gap-2">
                <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">Select a department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  onClick={() => call("assign", { departmentId })}
                  disabled={!departmentId || busy !== null}
                >
                  Assign
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-[11.5px] text-crit">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
