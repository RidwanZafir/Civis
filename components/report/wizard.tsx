"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { MapPicker, type PickedLocation } from "@/components/map/MapPicker";
import { Badge, Button, ButtonLink, DemoNote, Field, Input, Panel, Select, Spinner, Textarea, cx } from "@/components/ui";
import { CATEGORIES, SEVERITIES, category, severityMeta } from "@/lib/constants";
import { EVIDENCE, evidenceReady, evidenceValidation, reportStepErrors, type EvidenceState } from "@/lib/report-evidence";

type Uploaded = EvidenceState & { id: string; preview: string; progress: number; name: string; size: number; type: string; file: File; error?: string };

const STEPS = ["Category", "Evidence", "Location", "Details", "Review"] as const;

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function uploadFile(file: File, onProgress: (p: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Upload cancelled", "AbortError")); return; }
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("files", file);
    xhr.open("POST", "/api/upload");
    xhr.timeout = 120_000;
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    xhr.upload.onprogress = (e) => {
      // Transfer completion is not server acceptance; reserve 100% for a verified response.
      if (e.lengthComputable) onProgress(Math.min(95, Math.round((e.loaded / e.total) * 95)));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          const url = data.urls?.[0];
          if (typeof url !== "string" || !/^\/api\/media\/[a-zA-Z0-9-]+\.(jpg|png|webp|mp4|webm|mov)$/.test(url)) {
            reject(new Error("The upload server returned an invalid file response. Please retry."));
          } else resolve(url);
        } else reject(new Error(data.error ?? "Upload failed. Please retry."));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and retry."));
    xhr.ontimeout = () => reject(new Error("The upload timed out. Check your connection and retry."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.send(form);
  });
}

export function ReportWizard({ anonymousDefault }: { anonymousDefault: boolean }) {
  const [step, setStep] = useState(0);
  const [categoryValue, setCategoryValue] = useState<string>("");
  const [uploads, setUploads] = useState<Uploaded[]>([]);
  const uploadsRef = useRef<Uploaded[]>([]);
  const uploadControllers = useRef(new Map<string, AbortController>());
  const submittingRef = useRef(false);
  const mounted = useRef(true);
  const [dragging, setDragging] = useState(false);
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [extraInfo, setExtraInfo] = useState("");
  const [anonymous, setAnonymous] = useState(anonymousDefault);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; title: string; distanceMeters: number } | null>(null);
  const [result, setResult] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const cat = categoryValue ? category(categoryValue) : null;
  const readyUploads = useMemo(() => uploads.filter((u) => u.status === "success" && u.url), [uploads]);
  const uploadsComplete = evidenceReady(uploads);
  const uploading = uploads.some((u) => u.status === "preparing" || u.status === "uploading");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadControllers.current.forEach((controller) => controller.abort());
      uploadsRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    };
  }, []);

  function updateUploads(update: (current: Uploaded[]) => Uploaded[]) {
    // Reserve slots synchronously so two rapid selections cannot exceed the limit.
    uploadsRef.current = update(uploadsRef.current);
    if (mounted.current) setUploads(uploadsRef.current);
  }

  function validate(target: number): boolean {
    const next = reportStepErrors(target, { category: categoryValue, attachments: uploadsRef.current, location, title, description });
    setErrors((current) => ({ ...current, category: "", location: "", title: "", description: "", ...next }));
    return Object.keys(next).length === 0;
  }

  function go(target: number) {
    if (submittingRef.current) return;
    if (target > step && !validate(target)) return;
    setStep(Math.min(STEPS.length - 1, Math.max(0, target)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function startUpload(item: Uploaded) {
    if (uploadControllers.current.has(item.id)) return;
    const controller = new AbortController();
    uploadControllers.current.set(item.id, controller);
    updateUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "preparing", progress: 0, error: undefined } : entry));
    try {
      const compressed = await compressImage(item.file);
      if (controller.signal.aborted) return;
      updateUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "uploading" } : entry));
      const url = await uploadFile(compressed, (progress) => updateUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, progress } : entry)), controller.signal);
      if (!controller.signal.aborted) {
        updateUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, url, status: "success", progress: 100 } : entry));
        if (evidenceReady(uploadsRef.current)) setErrors((current) => ({ ...current, images: current.images === "Wait for uploads to finish. Retry or remove any failed attachment." ? "" : current.images }));
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const error = err instanceof Error ? err.message : "Upload failed. Please retry.";
        updateUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "error", error } : entry));
      }
    } finally {
      uploadControllers.current.delete(item.id);
    }
  }

  async function handleFiles(files: FileList | File[]) {
    if (submittingRef.current) return;
    const messages: string[] = [];
    const accepted: Uploaded[] = [];
    let remaining = EVIDENCE.maxFiles - uploadsRef.current.length;
    for (const file of Array.from(files)) {
      const validation = evidenceValidation(file);
      if (validation) { messages.push(validation); continue; }
      if (remaining <= 0) { messages.push(`Up to ${EVIDENCE.maxFiles} attachments are allowed. Remove a file before adding another.`); break; }
      remaining -= 1;
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      accepted.push({ id, url: "", preview: URL.createObjectURL(file), progress: 0, name: file.name, size: file.size, type: file.type, file, status: "preparing" });
    }
    setErrors((current) => ({ ...current, images: messages.join(" ") }));
    updateUploads((current) => [...current, ...accepted]);
    await Promise.allSettled(accepted.map(startUpload));
  }

  function removeUpload(id: string) {
    uploadControllers.current.get(id)?.abort();
    const item = uploadsRef.current.find((entry) => entry.id === id);
    if (item) URL.revokeObjectURL(item.preview);
    updateUploads((current) => current.filter((entry) => entry.id !== id));
  }

  function resetUploads() {
    uploadsRef.current.forEach((item) => removeUpload(item.id));
  }

  async function submit(confirmDistinct = false) {
    if (submittingRef.current) return;
    if (!validate(4)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: categoryValue,
          severity,
          lat: location!.lat,
          lng: location!.lng,
          address: location!.address,
          extraInfo: extraInfo.trim() || undefined,
          anonymous,
          images: readyUploads.map((u) => u.url),
          confirmDistinct,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.duplicate) {
        setDuplicate(data.duplicate);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not submit the report");
      setResult({ id: data.id, url: data.url });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit the report");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-xl"
      >
        <Panel className="relative overflow-hidden p-7 text-center">
          <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(67,214,160,0.18),transparent)]" />
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="mx-auto grid size-16 place-items-center rounded-full border border-mint/40 bg-mint/10"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12.5l5 5L20 6.5" stroke="#43D6A0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>
          <h1 className="mt-5 text-2xl font-semibold">Report received</h1>
          <p className="mt-2 text-sm text-muted">
            It is queued for automated checks and moderator review. Nothing is marked verified
            until independent confirmation is recorded.
          </p>

          <div className="mt-6 rounded-xl border border-white/10 bg-[#0b1220] p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Tracking reference</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-wide text-accent">{result.id}</p>
            <button
              onClick={async () => {
                const url = `${window.location.origin}${result.url}`;
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2200);
                } catch {
                  setCopied(false);
                }
              }}
              className="mt-2 text-[11px] text-muted underline-offset-4 hover:text-fg hover:underline"
            >
              {copied ? "Link copied" : "Copy tracking link"}
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <ButtonLink href={result.url}>Open submitted report</ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setStep(0);
                setCategoryValue("");
                resetUploads();
                setLocation(null);
                setTitle("");
                setDescription("");
                setExtraInfo("");
                setSeverity("medium");
              }}
            >
              Report another issue
            </Button>
          </div>
        </Panel>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* stepper */}
      <div className="mb-7">
        <div className="flex items-center justify-between gap-1">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              disabled={submitting}
              onClick={() => go(i)}
              className="group flex flex-1 flex-col items-start gap-2 text-left"
              aria-current={i === step ? "step" : undefined}
            >
              <span className="flex w-full items-center gap-1.5">
                <span
                  className={cx(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold transition-colors",
                    i < step
                      ? "border-mint/50 bg-mint/15 text-mint"
                      : i === step
                        ? "border-accent bg-accent text-ink"
                        : "border-white/12 text-muted",
                  )}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                <span className={cx("h-px flex-1", i < STEPS.length - 1 ? "bg-white/10" : "bg-transparent")} />
              </span>
              <span
                className={cx(
                  "hidden text-[11px] font-medium sm:block",
                  i === step ? "text-fg" : "text-muted",
                )}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Panel className="overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="p-5 sm:p-7"
          >
            {step === 0 && (
              <div>
                <h2 className="text-lg font-semibold">What are you reporting?</h2>
                <p className="mt-1 text-[13px] text-muted">
                  Pick the closest category. Moderators can re-categorise during review.
                </p>
                <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                  {CATEGORIES.map((c) => {
                    const active = categoryValue === c.slug;
                    return (
                      <button
                        key={c.slug}
                        onClick={() => {
                          setCategoryValue(c.slug);
                          setErrors((e) => ({ ...e, category: "" }));
                        }}
                        className={cx(
                          "group rounded-2xl border p-4 text-left transition-all",
                          active
                            ? "border-accent/50 bg-accent/[0.07]"
                            : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className="grid size-9 place-items-center rounded-xl border"
                            style={{
                              borderColor: `${c.color}33`,
                              background: `${c.color}12`,
                            }}
                          >
                            <span className="size-2 rounded-full" style={{ background: c.color }} />
                          </span>
                          {active && (
                            <span className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-ink">
                              ✓
                            </span>
                          )}
                        </div>
                        <p className="mt-2.5 text-[13px] font-semibold">{c.label}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{c.description}</p>
                      </button>
                    );
                  })}
                </div>
                {errors.category && <p className="mt-3 text-xs text-crit">{errors.category}</p>}
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-lg font-semibold">Add photographs or videos</h2>
                <p className="mt-1 text-[13px] text-muted">
                  Up to 6 attachments. Photographs are compressed in your browser before upload and stored
                  privately on this deployment.
                </p>

                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void handleFiles(e.dataTransfer.files);
                  }}
                  className={cx(
                    "mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-colors",
                    dragging ? "border-accent/60 bg-accent/[0.06]" : "border-white/15 hover:border-white/30",
                  )}
                >
                  <input
                    type="file"
                    accept={EVIDENCE.types.join(",")}
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files) void handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-muted" aria-hidden>
                    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <p className="mt-3 text-[13px] font-medium">Drop photographs or videos here</p>
                  <p className="mt-1 text-[11px] text-muted">or click to browse · JPEG, PNG, WebP (8 MB) · MP4, WebM, MOV (25 MB)</p>
                </label>

                {errors.images && <p role="alert" className="mt-2 text-xs text-crit">{errors.images}</p>}

                {uploads.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {uploads.map((u) => (
                      <div key={u.id} className="group relative overflow-hidden rounded-xl border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {u.type.startsWith("video/") ? (
                          <video src={u.preview} controls playsInline preload="metadata" aria-label={`Preview ${u.name}`} className="aspect-[4/3] w-full object-cover" />
                        ) : <img src={u.preview} alt={`Preview ${u.name}`} width={320} height={240} className="aspect-[4/3] w-full object-cover" />}
                        <div className="p-2.5">
                          <p className="truncate text-[11px] font-medium" title={u.name}>{u.name}</p>
                          <p className="mt-0.5 text-[10px] text-muted">{(u.size / (1024 * 1024)).toFixed(2)} MB · {u.status === "success" ? "Uploaded" : u.status === "error" ? "Upload failed" : u.status === "preparing" ? "Preparing" : u.progress === 95 ? "Checking upload" : `${u.progress}%`}</p>
                          {u.status === "error" && <><p role="alert" className="mt-1 text-[10px] text-crit">{u.error}</p><button type="button" onClick={() => void startUpload(u)} className="mt-1 min-h-9 text-[11px] font-semibold text-accent underline">Retry upload</button></>}
                        </div>
                        {(u.status === "preparing" || u.status === "uploading") && (
                          <div className="absolute inset-x-0 top-0 grid aspect-[4/3] place-items-center bg-black/55">
                            <div className="w-3/4">
                              <div className="h-1 overflow-hidden rounded-full bg-white/20">
                                <div role="progressbar" aria-label={`Uploading ${u.name}`} aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100} className="h-full bg-accent transition-[width]" style={{ width: `${u.progress}%` }} />
                              </div>
                              <p className="mt-1.5 text-center text-[10px] text-white/80">{u.status === "preparing" ? "Preparing…" : u.progress === 95 ? "Checking upload…" : `${u.progress}%`}</p>
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeUpload(u.id)}
                          className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full bg-black/75 text-white backdrop-blur transition-colors hover:bg-black/90"
                          aria-label={`Remove ${u.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-4 text-[11px] leading-relaxed text-muted">
                  Evidence is optional but strongly improves verification. Do not photograph people&apos;s
                  faces or number plates.
                </p>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-lg font-semibold">Where is it?</h2>
                <p className="mt-1 text-[13px] text-muted">
                  Place the pin on the exact spot. Only the approximate area is shown publicly when you
                  choose to report anonymously.
                </p>
                <div className="mt-4">
                  <MapPicker value={location} onChange={(v) => {
                    setLocation(v);
                    setErrors((e) => ({ ...e, location: "" }));
                  }} />
                </div>
                {errors.location && <p className="mt-2 text-xs text-crit">{errors.location}</p>}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Field label="Neighbourhood or area" hint="Optional, helps filtering">
                    <Input
                      value={location?.address ?? ""}
                      onChange={(e) => setLocation((l) => (l ? { ...l, address: e.target.value } : l))}
                      placeholder="e.g. Salt Lake, Sector 3"
                    />
                  </Field>
                  <Field label="Landmark detail" hint="Optional">
                    <Input value={extraInfo} onChange={(e) => setExtraInfo(e.target.value)} placeholder="Near the community market gate" />
                  </Field>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-lg font-semibold">Describe the problem</h2>
                <p className="mt-1 text-[13px] text-muted">
                  Be specific: what is damaged, who is at risk, and how long it has been like this.
                </p>
                <div className="mt-4 space-y-4">
                  <Field label="Incident title" required error={errors.title} htmlFor="title" hint="One clear sentence">
                    <Input
                      id="title"
                      value={title}
                      maxLength={140}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Deep pothole at the Ballygunge circular road turn"
                    />
                  </Field>
                  <Field
                    label="Description"
                    required
                    error={errors.description}
                    htmlFor="description"
                    hint={`${description.length}/2000 characters`}
                  >
                    <Textarea
                      id="description"
                      value={description}
                      maxLength={2000}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What exactly is broken? When did you notice it? Is there immediate danger?"
                      className="min-h-32"
                    />
                  </Field>

                  <div>
                    <p className="mb-2 text-[13px] font-medium">Severity</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {SEVERITIES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setSeverity(s.value)}
                          className={cx(
                            "rounded-xl border p-3 text-left transition-all",
                            severity === s.value
                              ? "border-white/25 bg-white/[0.06]"
                              : "border-white/[0.08] hover:border-white/18",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: s.color }} />
                            <span className="text-[12px] font-semibold" style={{ color: s.color }}>
                              {s.label}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted">{s.guidance}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <DemoNote />
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-lg font-semibold">Review and submit</h2>
                <p className="mt-1 text-[13px] text-muted">
                  Check the details. After submitting you receive a tracking reference you can share.
                </p>

                <div className="mt-4 divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/10">
                  {[
                    ["Category", cat?.label ?? "—"],
                    ["Title", title || "—"],
                    ["Severity", severityMeta(severity).label],
                    ["Location", location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : "—"],
                    ["Address", location?.address || "Not provided"],
                    ["Evidence", `${readyUploads.length} attachment${readyUploads.length === 1 ? "" : "s"}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 bg-white/[0.015] px-4 py-2.5">
                      <span className="text-[11px] text-muted">{k}</span>
                      <span className="max-w-[65%] text-right text-[12px]">{v}</span>
                    </div>
                  ))}
                </div>

                <p className="mt-3 line-clamp-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[12px] leading-relaxed text-muted">
                  {description}
                </p>

                <label className="mt-4 flex items-start gap-3 rounded-xl border border-white/[0.08] p-3">
                  <input
                    type="checkbox"
                    checked={anonymous}
                    onChange={(e) => setAnonymous(e.target.checked)}
                    className="mt-0.5 size-4 accent-[#36D9FF]"
                  />
                  <span>
                    <span className="block text-[12px] font-medium">Submit anonymously</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                      Your name is hidden from the public report. Platform moderators and the assigned
                      authority still see it in the restricted audit trail for abuse prevention.
                    </span>
                  </span>
                </label>

                {submitError && (
                  <p className="mt-3 rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-[12px] text-crit">
                    {submitError}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] bg-white/[0.015] px-5 py-3.5 sm:px-7">
          <Button type="button" variant="ghost" size="sm" onClick={() => go(step - 1)} disabled={step === 0 || submitting}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-muted sm:block">
              Step {step + 1} of {STEPS.length}
            </span>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => go(step + 1)} disabled={submitting || (step >= 1 && !uploadsComplete)}>
                {step >= 1 && uploading ? "Uploading…" : "Continue"}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
            ) : (
              <Button type="button" onClick={() => void submit()} disabled={submitting || !uploadsComplete}>
                {submitting ? <Spinner className="size-3.5" /> : null}
                {submitting ? "Submitting…" : "Submit report"}
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <p className="mt-4 text-center text-[11px] text-muted">
        Submitting false reports undermines your community and can lead to account restrictions.
        Read our{" "}
        <Link href="/guidelines" className="text-accent underline-offset-4 hover:underline">
          community guidelines
        </Link>
        .
      </p>

      <AnimatePresence>
        {duplicate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[85] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
          >
            <Panel className="w-full max-w-md p-5">
              <Badge color="#F5B94B">Possible duplicate</Badge>
              <h3 className="mt-3 text-[15px] font-semibold">
                A verified report already exists {duplicate.distanceMeters}m away
              </h3>
              <Link
                href={`/incidents/${duplicate.id}`}
                className="mt-2 block rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[12px] text-fg transition-colors hover:border-accent/40"
              >
                {duplicate.title}
                <span className="mt-1 block font-mono text-[10px] text-muted">{duplicate.id}</span>
              </Link>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                Supporting the existing report is usually more effective. If this is genuinely a
                different problem, you can submit it separately.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" size="sm" onClick={() => setDuplicate(null)}>
                  Go back
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setDuplicate(null);
                    void submit(true);
                  }}
                >
                  It is a different problem
                </Button>
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
