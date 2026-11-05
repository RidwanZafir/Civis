"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  History,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Panel, Select, Spinner, Textarea, cx } from "@/components/ui";
import { dateTime, timeAgo } from "@/lib/format";
import { HOSPITAL_DISCLAIMER, SERVICE_TYPES, WARD_TYPES } from "@/lib/hospitals/constants";
import type {
  AdmissionStatus,
  HospitalAvailabilityDetail,
  HospitalAvailabilityHistoryRow,
  HospitalCandidate,
  HospitalLinkRow,
  ServiceStatus,
} from "@/lib/hospitals/types";

type DraftWard = {
  code: string;
  totalBeds: string;
  availableBeds: string;
  admissionStatus: AdmissionStatus;
};

type DraftService = {
  code: string;
  availabilityStatus: ServiceStatus;
  operatingHours: string;
};

type Draft = {
  source: string;
  note: string;
  wards: DraftWard[];
  services: DraftService[];
};

const EMPTY_DRAFT: Draft = { source: "", note: "", wards: [], services: [] };
const ADMISSION_OPTIONS: AdmissionStatus[] = ["open", "limited", "full", "closed", "unknown"];
const SERVICE_STATUS_OPTIONS: { value: ServiceStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "restricted", label: "Restricted" },
  { value: "unavailable", label: "Unavailable" },
  { value: "closed", label: "Closed" },
  { value: "unknown", label: "Unknown" },
];
const LINK_COLORS: Record<HospitalLinkRow["linkStatus"], string> = {
  pending: "#F5B94B",
  approved: "#43D6A0",
  rejected: "#F16D78",
  revoked: "#929FB2",
};

function wardDefinition(code: string) {
  return WARD_TYPES.find(([value]) => value === code);
}

function serviceDefinition(code: string) {
  return SERVICE_TYPES.find(([value]) => value === code);
}

function draftFromDetail(detail: HospitalAvailabilityDetail | null): Draft {
  if (!detail) return EMPTY_DRAFT;
  return {
    source: detail.source,
    note: detail.note ?? "",
    wards: detail.wards.map((ward) => ({
      code: ward.code,
      totalBeds: ward.totalBeds === null ? "" : String(ward.totalBeds),
      availableBeds: ward.availableBeds === null ? "" : String(ward.availableBeds),
      admissionStatus: ward.admissionStatus,
    })),
    services: detail.services.map((service) => ({
      code: service.code,
      availabilityStatus: service.availabilityStatus,
      operatingHours: service.operatingHours ?? "",
    })),
  };
}

function integerOrNull(value: string): number | null {
  if (!value.trim()) return null;
  return Number(value);
}

export function HospitalAvailabilityWorkspace({
  departmentName,
  initialLinks,
}: {
  departmentName: string;
  initialLinks: HospitalLinkRow[];
}) {
  const [links, setLinks] = useState(initialLinks);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialLinks.find((link) => link.linkStatus === "approved")?.facilityId ?? null,
  );
  const [detail, setDetail] = useState<HospitalAvailabilityDetail | null>(null);
  const [history, setHistory] = useState<HospitalAvailabilityHistoryRow[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [claimQuery, setClaimQuery] = useState("");
  const [candidates, setCandidates] = useState<HospitalCandidate[]>([]);
  const [claimWarning, setClaimWarning] = useState<string | null>(null);
  const [claimSource, setClaimSource] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const approved = useMemo(() => links.filter((link) => link.linkStatus === "approved"), [links]);
  const pending = useMemo(() => links.filter((link) => link.linkStatus === "pending"), [links]);
  const rejected = useMemo(
    () => links.filter((link) => link.linkStatus === "rejected" || link.linkStatus === "revoked"),
    [links],
  );
  const selected = approved.find((link) => link.facilityId === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setHistory([]);
      setDraft(EMPTY_DRAFT);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setDetail(null);
    setHistory([]);
    fetch(`/api/authority/hospitals/${encodeURIComponent(selectedId)}/availability`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "The availability report could not be loaded.");
        if (controller.signal.aborted) return;
        setDetail(result.availability ?? null);
        setHistory(Array.isArray(result.history) ? result.history : []);
      })
      .catch((problem) => {
        if (!controller.signal.aborted) {
          setError(problem instanceof Error ? problem.message : "The availability report could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    setDraft(draftFromDetail(detail));
  }, [detail]);

  async function refreshLinks() {
    const response = await fetch("/api/authority/hospitals/claims", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    if (Array.isArray(result.links)) setLinks(result.links);
  }

  async function searchDirectory() {
    const query = claimQuery.trim();
    if (query.length < 2) {
      setClaimError("Enter at least two characters of the hospital name or city.");
      return;
    }
    setSearching(true);
    setClaimError(null);
    setClaimWarning(null);
    setCandidates([]);
    setClaimSource(null);
    try {
      const response = await fetch(`/api/authority/hospitals/search?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The hospital directory could not be searched.");
      setCandidates(Array.isArray(result.candidates) ? result.candidates : []);
      setClaimWarning(result.warning ?? null);
      setClaimSource(result.source ?? null);
    } catch (problem) {
      setClaimError(problem instanceof Error ? problem.message : "The hospital directory could not be searched.");
    } finally {
      setSearching(false);
    }
  }

  async function claim(facilityId: string) {
    setClaimingId(facilityId);
    setClaimError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/authority/hospitals/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facilityId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The hospital link request could not be sent.");
      setCandidates((rows) =>
        rows.map((row) => row.id === facilityId ? { ...row, linkStatus: "pending" } : row),
      );
      setSuccess(
        result.already
          ? "A link request for this hospital is already awaiting administrator review."
          : "Link request sent. A CIVIS administrator must approve it before your organisation can publish availability.",
      );
      await refreshLinks();
    } catch (problem) {
      setClaimError(problem instanceof Error ? problem.message : "The hospital link request could not be sent.");
    } finally {
      setClaimingId(null);
    }
  }

  function addWard(code: string) {
    if (!code || draft.wards.some((ward) => ward.code === code)) return;
    setDraft((current) => ({
      ...current,
      wards: [...current.wards, { code, totalBeds: "", availableBeds: "", admissionStatus: "unknown" }],
    }));
  }

  function updateWard(code: string, patch: Partial<DraftWard>) {
    setDraft((current) => ({
      ...current,
      wards: current.wards.map((ward) => ward.code === code ? { ...ward, ...patch } : ward),
    }));
  }

  function addService(code: string) {
    if (!code || draft.services.some((service) => service.code === code)) return;
    setDraft((current) => ({
      ...current,
      services: [...current.services, { code, availabilityStatus: "unknown", operatingHours: "" }],
    }));
  }

  function updateService(code: string, patch: Partial<DraftService>) {
    setDraft((current) => ({
      ...current,
      services: current.services.map((service) => service.code === code ? { ...service, ...patch } : service),
    }));
  }

  async function publish() {
    if (!selectedId) return;
    setError(null);
    setSuccess(null);
    if (draft.source.trim().length < 3) {
      setError("Describe how this report was collected before publishing.");
      return;
    }
    if (!draft.wards.length && !draft.services.length) {
      setError("Add at least one ward or medical service before publishing.");
      return;
    }
    for (const ward of draft.wards) {
      const total = integerOrNull(ward.totalBeds);
      const available = integerOrNull(ward.availableBeds);
      const label = wardDefinition(ward.code)?.[1] ?? ward.code;
      if (total !== null && (!Number.isInteger(total) || total < 0)) {
        setError(`${label}: total beds must be a whole number of zero or more.`);
        return;
      }
      if (available !== null && (!Number.isInteger(available) || available < 0)) {
        setError(`${label}: available beds must be a whole number of zero or more.`);
        return;
      }
      if (total !== null && available !== null && available > total) {
        setError(`${label}: available beds cannot exceed total beds.`);
        return;
      }
    }

    setPublishing(true);
    try {
      const response = await fetch(
        `/api/authority/hospitals/${encodeURIComponent(selectedId)}/availability`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: detail?.version ?? 0,
            source: draft.source.trim(),
            note: draft.note.trim() || null,
            wards: draft.wards.map((ward) => ({
              code: ward.code,
              totalBeds: integerOrNull(ward.totalBeds),
              availableBeds: integerOrNull(ward.availableBeds),
              admissionStatus: ward.admissionStatus,
            })),
            services: draft.services.map((service) => ({
              code: service.code,
              exists: true,
              availabilityStatus: service.availabilityStatus,
              operatingHours: service.operatingHours.trim() || null,
            })),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The availability report could not be published.");
      setDetail(result.availability);
      setHistory(Array.isArray(result.history) ? result.history : []);
      setDraft(draftFromDetail(result.availability));
      setSuccess(
        `Version ${result.availability.version} published. The facility finder now shows this report as organisation-reported, not live monitoring.`,
      );
      await refreshLinks();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The availability report could not be published.");
    } finally {
      setPublishing(false);
    }
  }

  const publicationHistory = history.filter((row) => row.resourceType === "profile").slice(0, 8);
  const availableWardCodes = WARD_TYPES.filter(([code]) => !draft.wards.some((ward) => ward.code === code));
  const availableServiceCodes = SERVICE_TYPES.filter(
    ([code]) => !draft.services.some((service) => service.code === code),
  );

  return (
    <div className="space-y-6">
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Search size={16} className="text-accent" aria-hidden />
              Find your hospital
            </h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-muted">
              Search the OpenStreetMap facility directory by the hospital&apos;s official name or city.
              A CIVIS administrator must approve each link before availability can be published.
            </p>
          </div>
          <Badge color="#36D9FF" dot={false}>Verified health organisations only</Badge>
        </div>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => { event.preventDefault(); void searchDirectory(); }}
        >
          <div className="flex-1">
            <Field label="Hospital name or city" htmlFor="hospital-claim-search">
              <Input
                id="hospital-claim-search"
                value={claimQuery}
                onChange={(event) => setClaimQuery(event.target.value)}
                placeholder="e.g. Kurmitola General Hospital, Dhaka"
              />
            </Field>
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? <Spinner /> : <Search size={15} aria-hidden />}
            Search directory
          </Button>
        </form>
        {claimError && <p role="alert" className="mt-3 text-xs text-crit">{claimError}</p>}
        {claimWarning && (
          <p className="mt-3 rounded-xl border border-warn/20 bg-warn/5 p-3 text-xs leading-relaxed text-warn" role="status">
            {claimWarning}
          </p>
        )}
        {success && (
          <p className="mt-3 rounded-xl border border-mint/20 bg-mint/5 p-3 text-xs leading-relaxed text-mint" role="status">
            {success}
          </p>
        )}
        {claimSource && candidates.length > 0 && (
          <p className="mt-2 text-[10.5px] text-muted">Directory source: {claimSource}. Confirm the address before requesting a link.</p>
        )}
        {candidates.length > 0 && (
          <ul className="mt-3 space-y-2">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="flex flex-col justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12.5px] font-medium">{candidate.name}</p>
                    <span className="text-[10px] capitalize text-muted">{candidate.kind}</span>
                    {candidate.linkStatus && (
                      <Badge color={LINK_COLORS[candidate.linkStatus as HospitalLinkRow["linkStatus"]] ?? "#929FB2"} dot={false}>
                        {candidate.linkStatus === "approved" ? "linked" : candidate.linkStatus}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted">{candidate.address}</p>
                </div>
                {candidate.linkStatus === "approved" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => { setSelectedId(candidate.id); setSuccess(null); }}
                  >
                    Open report
                  </Button>
                ) : candidate.linkStatus === "pending" ? (
                  <span className="shrink-0 text-[11px] text-warn">Awaiting admin review</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="soft"
                    disabled={claimingId === candidate.id}
                    onClick={() => void claim(candidate.id)}
                  >
                    {claimingId === candidate.id ? <Spinner className="size-3" /> : <Plus size={13} aria-hidden />}
                    Request link
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!searching && candidates.length === 0 && claimSource && (
          <p className="mt-3 text-xs text-muted">
            No hospital matched. Try the official name, a shorter search, or the city. You can also open the
            public Nearby Hospitals finder near the facility so its OpenStreetMap record is stored in CIVIS.
          </p>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 size={16} className="text-accent" aria-hidden />
              Linked hospitals
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {approved.length === 0
                ? "No hospital is approved for your organisation yet."
                : "Select a hospital to publish or update its availability report."}
            </p>
            {approved.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {approved.map((link) => (
                  <li key={link.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(link.facilityId)}
                      className={cx(
                        "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                        selectedId === link.facilityId
                          ? "border-accent/40 bg-accent/[0.07]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20",
                      )}
                    >
                      <p className="text-[12px] font-medium leading-snug">{link.facilityName}</p>
                      <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-muted">{link.address ?? "Address not published"}</p>
                      <p className="mt-1 text-[10px] text-muted">
                        {link.availabilityVersion
                          ? `Version ${link.availabilityVersion} · ${link.availabilityUpdatedAt ? timeAgo(link.availabilityUpdatedAt) : ""}`
                          : "No availability reported yet"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {pending.length > 0 && (
            <Panel className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Clock3 size={15} className="text-warn" aria-hidden />
                Pending requests
              </h2>
              <ul className="mt-2 space-y-2">
                {pending.map((link) => (
                  <li key={link.id} className="rounded-xl border border-warn/20 bg-warn/[0.04] p-3">
                    <p className="text-[11.5px] font-medium">{link.facilityName}</p>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                      Requested {timeAgo(link.createdAt)}. An administrator must approve the link.
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {rejected.length > 0 && (
            <Panel className="p-4">
              <h2 className="text-sm font-semibold">Closed requests</h2>
              <ul className="mt-2 space-y-2">
                {rejected.map((link) => (
                  <li key={link.id} className="rounded-xl border border-white/10 p-3">
                    <p className="text-[11.5px] font-medium">{link.facilityName}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted">
                      {link.linkStatus} {link.reviewNote ? `· ${link.reviewNote}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          {!selectedId || !selected ? (
            <Panel className="p-6">
              <EmptyState
                icon={<ShieldCheck size={24} />}
                title="No approved hospital selected"
                description="Search for your hospital above and request a link. Availability publishing unlocks after administrator approval."
              />
            </Panel>
          ) : (
            <>
              <Panel className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow mb-1">Availability report</p>
                    <h2 className="text-lg font-semibold">{selected.facilityName}</h2>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{selected.address ?? "Address not published"}</p>
                  </div>
                  <Badge color={detail ? "#43D6A0" : "#929FB2"} dot={false}>
                    {detail ? `Version ${detail.version}` : "No report yet"}
                  </Badge>
                </div>
                {detail && (
                  <p className="mt-3 text-[11px] leading-relaxed text-muted">
                    Last published {dateTime(detail.updatedAt)} by {departmentName}.
                    {detail.stale ? " The report is stale and public bed counts are withheld until a fresh report is published." : ""}
                  </p>
                )}
                {loading && <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Spinner />Loading the latest report…</p>}
                {error && <p role="alert" className="mt-3 rounded-xl border border-crit/25 bg-crit/5 p-3 text-xs text-crit">{error}</p>}
                {success && <p role="status" className="mt-3 rounded-xl border border-mint/20 bg-mint/5 p-3 text-xs text-mint">{success}</p>}
              </Panel>

              {!loading && (
                <Panel className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Source and note</h3>
                    <span className="text-[10.5px] text-muted">Required before publishing</span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field
                      label="How this report was collected"
                      hint="For example: bed coordination desk call at 14:20, or emergency department duty sheet."
                      required
                      htmlFor="availability-source"
                    >
                      <Input
                        id="availability-source"
                        value={draft.source}
                        maxLength={240}
                        onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
                        placeholder="Bed coordination desk call at 14:20"
                      />
                    </Field>
                    <Field label="Internal or public note" hint="Optional. Do not include patient information." htmlFor="availability-note">
                      <Textarea
                        id="availability-note"
                        value={draft.note}
                        maxLength={1000}
                        onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                        placeholder="Optional context for this update"
                        className="min-h-[42px]"
                      />
                    </Field>
                  </div>
                </Panel>
              )}

              {!loading && (
                <Panel className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Wards and beds</h3>
                    <span className="text-[10.5px] text-muted">
                      Confirmed public counts appear only while the report is fresh (under one hour).
                    </span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {draft.wards.length === 0 && (
                      <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[11.5px] text-muted">
                        No ward added. Add only the wards your organisation can verify.
                      </p>
                    )}
                    {draft.wards.map((ward) => {
                      const definition = wardDefinition(ward.code);
                      return (
                        <div key={ward.code} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[12.5px] font-medium">{definition?.[1] ?? ward.code}</p>
                              <p className="text-[10px] capitalize text-muted">{definition?.[2] ?? "ward"}</p>
                            </div>
                            <button
                              type="button"
                              aria-label={`Remove ${definition?.[1] ?? ward.code}`}
                              onClick={() => setDraft((current) => ({ ...current, wards: current.wards.filter((item) => item.code !== ward.code) }))}
                              className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-crit"
                            >
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <Field label="Total beds" htmlFor={`ward-total-${ward.code}`}>
                              <Input
                                id={`ward-total-${ward.code}`}
                                type="number"
                                min={0}
                                step={1}
                                value={ward.totalBeds}
                                onChange={(event) => updateWard(ward.code, { totalBeds: event.target.value })}
                                placeholder="Not reported"
                              />
                            </Field>
                            <Field label="Available beds" htmlFor={`ward-available-${ward.code}`}>
                              <Input
                                id={`ward-available-${ward.code}`}
                                type="number"
                                min={0}
                                step={1}
                                value={ward.availableBeds}
                                onChange={(event) => updateWard(ward.code, { availableBeds: event.target.value })}
                                placeholder="Not reported"
                              />
                            </Field>
                            <Field label="Admission status" htmlFor={`ward-status-${ward.code}`}>
                              <Select
                                id={`ward-status-${ward.code}`}
                                value={ward.admissionStatus}
                                onChange={(event) => updateWard(ward.code, { admissionStatus: event.target.value as AdmissionStatus })}
                              >
                                {ADMISSION_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                              </Select>
                            </Field>
                          </div>
                        </div>
                      );
                    })}
                    {availableWardCodes.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Select
                          aria-label="Add a ward"
                          value=""
                          onChange={(event) => { addWard(event.target.value); event.target.value = ""; }}
                          className="max-w-xs"
                        >
                          <option value="">Add a ward…</option>
                          {availableWardCodes.map(([code, name, group]) => (
                            <option key={code} value={code}>{name} · {group}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </div>
                </Panel>
              )}

              {!loading && (
                <Panel className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Medical services</h3>
                    <span className="text-[10.5px] text-muted">Report only services your organisation operates or coordinates.</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {draft.services.length === 0 && (
                      <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[11.5px] text-muted">
                        No service added. Emergency departments, imaging, blood banks and specialist care can be reported here.
                      </p>
                    )}
                    {draft.services.map((service) => {
                      const definition = serviceDefinition(service.code);
                      return (
                        <div key={service.code} className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)_auto] sm:items-end">
                          <div>
                            <p className="text-[12px] font-medium leading-snug">{definition?.[1] ?? service.code}</p>
                            <p className="text-[10px] capitalize text-muted">{definition?.[2] ?? "service"}</p>
                          </div>
                          <Field label="Status" htmlFor={`service-status-${service.code}`}>
                            <Select
                              id={`service-status-${service.code}`}
                              value={service.availabilityStatus}
                              onChange={(event) => updateService(service.code, { availabilityStatus: event.target.value as ServiceStatus })}
                            >
                              {SERVICE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </Select>
                          </Field>
                          <Field label="Operating hours" htmlFor={`service-hours-${service.code}`}>
                            <Input
                              id={`service-hours-${service.code}`}
                              value={service.operatingHours}
                              maxLength={120}
                              onChange={(event) => updateService(service.code, { operatingHours: event.target.value })}
                              placeholder="24/7 or daytime hours"
                            />
                          </Field>
                          <button
                            type="button"
                            aria-label={`Remove ${definition?.[1] ?? service.code}`}
                            onClick={() => setDraft((current) => ({ ...current, services: current.services.filter((item) => item.code !== service.code) }))}
                            className="mb-1 rounded-full p-2 text-muted transition-colors hover:bg-white/5 hover:text-crit"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>
                      );
                    })}
                    {availableServiceCodes.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Select
                          aria-label="Add a medical service"
                          value=""
                          onChange={(event) => { addService(event.target.value); event.target.value = ""; }}
                          className="max-w-sm"
                        >
                          <option value="">Add a medical service…</option>
                          {availableServiceCodes.map(([code, name, group]) => (
                            <option key={code} value={code}>{name} · {group}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </div>
                </Panel>
              )}

              <Panel className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Publish this report</h3>
                    <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted">
                      Publishing replaces the previous version and keeps it in the audit history. Public pages label
                      these figures as organisation-reported, not live monitoring. Reconfirm with the hospital before
                      travelling.
                    </p>
                  </div>
                  <Button type="button" disabled={publishing || loading} onClick={() => void publish()}>
                    {publishing ? <Spinner /> : <CheckCircle2 size={15} aria-hidden />}
                    {detail ? "Publish new version" : "Publish availability"}
                  </Button>
                </div>
                {!detail && !loading && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-warn/20 bg-warn/[0.04] p-3 text-[11.5px] leading-relaxed text-warn">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    This hospital has no availability report yet. Until your organisation publishes one, the public
                    facility finder will say &quot;Bed availability not reported&quot;.
                  </p>
                )}
              </Panel>

              {publicationHistory.length > 0 && (
                <Panel className="p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <History size={15} className="text-accent" aria-hidden />
                    Publication history
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {publicationHistory.map((row) => {
                      const current = row.current && typeof row.current === "object"
                        ? row.current as { version?: number; source?: string; note?: string | null; wardCount?: number; serviceCount?: number }
                        : null;
                      return (
                        <li key={row.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11.5px] font-medium">
                              {current?.version ? `Version ${current.version}` : "Report withdrawn"}
                              {current?.wardCount !== undefined ? ` · ${current.wardCount} wards · ${current.serviceCount ?? 0} services` : ""}
                            </p>
                            <span className="text-[10px] text-muted">{dateTime(row.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                            {row.actorLabel ?? "Organisation"} · {current?.source ?? row.source ?? "No source recorded"}
                            {row.note ? ` · ${row.note}` : ""}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>

      <p className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 text-[10.5px] leading-relaxed text-muted">
        {HOSPITAL_DISCLAIMER} CIVIS only shows a report when a verified health organisation has published one;
        &quot;not reported&quot; never means that care is unavailable.
      </p>
    </div>
  );
}
