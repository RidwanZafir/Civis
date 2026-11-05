"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { RegistryContact, RegistryFacility, RegistrySummary } from "@/lib/hospitals/registry";
import { useGeolocation } from "@/lib/map/geolocation";
import { Spinner, cx } from "@/components/ui";
import HospitalMap from "./hospital-map";

type Category = { value: string; label: string };
type Department = { code: string; name: string; group: RegistryContact["contactGroup"] };

type Result = {
  items: RegistryFacility[];
  total: number;
  page: number;
  asOf: string | null;
  upazilas: string[];
  message: string | null;
};

const RADII = [2, 5, 10, 25, 50];

const DISCLAIMER =
  "Current bed availability has not been confirmed through CIVIS. Please contact the hospital directly to confirm availability before travelling.";

const GROUP_LABELS: Record<RegistryContact["contactGroup"], string> = {
  general: "General hospital contacts",
  emergency: "Emergency medical contacts",
  department: "Medical departments",
  diagnostic: "Diagnostic and support services",
  support: "Support services",
};

/** Phone link is only produced from a number that resolves to a dial target. */
function telHref(contact: { phone: string; phoneE164: string | null }): string | null {
  if (contact.phoneE164 && contact.phoneE164.startsWith("+880")) return `tel:${contact.phoneE164}`;
  const digits = contact.phone.replace(/\D/g, "");
  if (/^01\d{9}$/.test(digits)) return `tel:+88${digits}`;
  if (/^8801\d{9}$/.test(digits)) return `tel:+${digits}`;
  if (/^0\d{8,9}$/.test(digits)) return `tel:+880${digits.slice(1)}`;
  return null;
}

export function HospitalDirectory({
  initial,
  summary,
  categories,
  departments,
  canManage,
}: {
  initial: { items: RegistryFacility[]; total: number; page: number; asOf: string | null };
  summary: RegistrySummary;
  categories: Category[];
  departments: Department[];
  canManage: boolean;
}) {
  const geo = useGeolocation();

  const [mode, setMode] = useState<"region" | "nearby">("region");
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [upazila, setUpazila] = useState("");
  const [category, setCategory] = useState("");
  const [ownership, setOwnership] = useState("");
  const [radius, setRadius] = useState(10);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "map">("list");

  const [result, setResult] = useState<Result>({
    items: initial.items,
    total: initial.total,
    page: initial.page,
    asOf: initial.asOf,
    upazilas: [],
    message: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ facility: RegistryFacility; contacts: RegistryContact[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [form, setForm] = useState({ departmentCode: "", phone: "", operatingHours: "", source: "", verified: false });
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const labelFor = useMemo(() => {
    const map = new Map(categories.map((entry) => [entry.value, entry.label]));
    return (value: string) => map.get(value) ?? value;
  }, [categories]);

  const fix = geo.fix;

  // Search whenever the mode, filters, page or the user's fix changes.
  useEffect(() => {
    if (mode === "nearby" && !fix) {
      setResult((current) => ({
        ...current,
        items: [],
        total: 0,
        message: "Share your location to search by distance, or switch to the full Sylhet Division directory.",
      }));
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ mode, page: String(page), pageSize: "24" });
        if (q.trim()) params.set("q", q.trim());
        if (district) params.set("district", district);
        if (upazila) params.set("upazila", upazila);
        if (category) params.set("category", category);
        if (ownership) params.set("ownership", ownership);
        if (mode === "nearby" && fix) {
          params.set("lat", String(fix.lat));
          params.set("lng", String(fix.lng));
          params.set("radius", String(radius));
        }
        const response = await fetch(`/api/hospitals/registry?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("The hospital directory could not be loaded.");
        const data = (await response.json()) as Result;
        setResult(data);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError(caught instanceof Error ? caught.message : "The hospital directory could not be loaded.");
        }
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mode, q, district, upazila, category, ownership, radius, page, fix]);

  // Detail fetch, with the user's distance when one is known.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    const query = fix ? `?lat=${fix.lat}&lng=${fix.lng}` : "";
    fetch(`/api/hospitals/registry/${selectedId}${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load this facility."))))
      .then((data: { facility: RegistryFacility; contacts: RegistryContact[] }) => setDetail(data))
      .catch((caught: Error) => {
        if (caught.name !== "AbortError") setError(caught.message);
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedId, fix]);

  const copyNumber = useCallback(async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(phone);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }, []);

  async function saveContact(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setFormMessage(null);
    try {
      const response = await fetch(`/api/hospitals/registry/${selectedId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentCode: form.departmentCode,
          phone: form.phone,
          operatingHours: form.operatingHours || null,
          source: form.source,
          verificationStatus: form.verified ? "verified" : "unverified",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The contact could not be saved.");
      setDetail(data.facility);
      setForm({ departmentCode: "", phone: "", operatingHours: "", source: "", verified: false });
      setFormMessage("Contact saved.");
    } catch (caught) {
      setFormMessage(caught instanceof Error ? caught.message : "The contact could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const pages = Math.max(1, Math.ceil(result.total / 24));
  const placedCount = result.items.filter((item) => item.lat !== null && item.lng !== null).length;

  return (
    <div>
      <header className="border-b border-white/10 pb-5">
        <h1 className="text-[clamp(1.7rem,3.4vw,2.5rem)] font-semibold leading-tight">
          Sylhet Division hospital directory
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Every facility in the official DGHS registry for Sylhet Division, with nearby search and direct calling for
          published numbers.
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[11.5px] text-muted">
          <div>
            <dt className="inline">Records: </dt>
            <dd className="inline font-semibold text-fg">{summary.total.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="inline">With a verified coordinate: </dt>
            <dd className="inline font-semibold text-fg">{summary.withCoordinates.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="inline">Listing only: </dt>
            <dd className="inline font-semibold text-fg">{summary.withoutCoordinates.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="inline">Last import: </dt>
            <dd className="inline text-fg">
              {summary.lastImportAt ? new Date(summary.lastImportAt).toLocaleDateString() : "never"}
            </dd>
          </div>
          <div>
            <dt className="inline">Source: </dt>
            <dd className="inline text-fg">DGHS Health Facility Registry</dd>
          </div>
        </dl>
      </header>

      {/* mode */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-white/10 p-0.5">
          {([
            ["nearby", "Nearby hospitals"],
            ["region", "All Sylhet Division"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setPage(1);
              }}
              aria-pressed={mode === value}
              className={cx(
                "rounded-full px-3.5 py-1.5 text-[12px] font-medium",
                mode === value ? "bg-white/10 text-fg" : "text-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "nearby" && (
          <button
            type="button"
            onClick={() => void geo.locate()}
            disabled={geo.state === "detecting"}
            className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-[12px] font-semibold text-accent disabled:opacity-60"
          >
            {geo.state === "detecting" ? <Spinner className="size-3.5" /> : null}
            {fix ? "Update my location" : "Use my location"}
          </button>
        )}

        <div className="ml-auto flex rounded-full border border-white/10 p-0.5">
          {(["list", "map"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={cx(
                "rounded-full px-3 py-1.5 text-[12px] font-medium capitalize",
                view === value ? "bg-white/10 text-fg" : "text-muted hover:text-fg",
              )}
            >
              {value === "list" ? "List view" : "Map view"}
            </button>
          ))}
        </div>
      </div>

      {mode === "nearby" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
          <span>Within</span>
          {RADII.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setRadius(value);
                setPage(1);
              }}
              aria-pressed={radius === value}
              className={cx(
                "rounded-full border px-2.5 py-1",
                radius === value ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 hover:text-fg",
              )}
            >
              {value} km
            </button>
          ))}
          {geo.state !== "idle" && (
            <span className={geo.state === "found" ? "text-mint" : "text-warn"}>
              {geo.state === "found" && fix
                ? `Using ${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}${fix.accuracy ? ` · ±${Math.round(fix.accuracy)} m` : ""}`
                : geo.state === "detecting"
                  ? "Finding your location…"
                  : "Location unavailable — switch to All Sylhet Division."}
            </span>
          )}
        </div>
      )}

      {/* filters */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder="Search hospital, upazila or type…"
          aria-label="Search hospitals"
          className="h-10 rounded-xl border border-white/10 bg-ink-soft px-3 text-[12.5px] text-fg placeholder:text-muted focus:border-accent/50 focus:outline-none lg:col-span-2"
        />
        <select
          value={district}
          onChange={(event) => {
            setDistrict(event.target.value);
            setUpazila("");
            setPage(1);
          }}
          aria-label="Filter by district"
          className="h-10 rounded-xl border border-white/10 bg-ink-soft px-2 text-[12.5px] text-fg"
        >
          <option value="">All districts</option>
          {summary.districts.map((entry) => (
            <option key={entry.district} value={entry.district}>
              {entry.district} ({entry.count})
            </option>
          ))}
        </select>
        <select
          value={upazila}
          onChange={(event) => {
            setUpazila(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by upazila"
          disabled={!district}
          className="h-10 rounded-xl border border-white/10 bg-ink-soft px-2 text-[12.5px] text-fg disabled:opacity-50"
        >
          <option value="">All upazilas</option>
          {result.upazilas.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by facility type"
          className="h-10 rounded-xl border border-white/10 bg-ink-soft px-2 text-[12.5px] text-fg"
        >
          <option value="">All facility types</option>
          {categories.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
        <select
          value={ownership}
          onChange={(event) => {
            setOwnership(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by ownership"
          className="h-10 rounded-xl border border-white/10 bg-ink-soft px-2 text-[12.5px] text-fg"
        >
          <option value="">Government and private</option>
          <option value="public">Government</option>
          <option value="private">Private</option>
        </select>
      </div>

      {/* result meta */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1">
          {loading ? "Searching…" : `${result.total.toLocaleString()} matching record${result.total === 1 ? "" : "s"}`}
        </span>
        {view === "map" && <span className="rounded-full bg-white/[0.06] px-2.5 py-1">{placedCount} with a location</span>}
        {result.asOf && (
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1">
            Data as of {new Date(result.asOf).toLocaleDateString()}
          </span>
        )}
        {result.message && <span className="text-warn">{result.message}</span>}
        {error && <span className="text-crit">{error}</span>}
      </div>

      {view === "map" && (
        <div className="mt-4">
          <HospitalMap
            hospitals={result.items.map((item) => ({
              id: item.id,
              name: item.name,
              lat: item.lat,
              lng: item.lng,
              category: item.category,
            }))}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setView("list");
            }}
            fix={fix}
          />
        </div>
      )}

      {/* selected facility */}
      {selectedId && (
        <section className="mt-5 rounded-2xl border border-accent/25 bg-accent/[0.04] p-4 sm:p-5" aria-live="polite">
          {detailLoading && !detail ? (
            <div className="grid h-24 place-items-center">
              <Spinner />
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-semibold leading-snug">{detail.facility.name}</h2>
                  {detail.facility.nameBn && <p className="text-[13px] text-muted">{detail.facility.nameBn}</p>}
                  <p className="mt-1 text-[11.5px] text-muted">
                    {labelFor(detail.facility.category)}
                    {detail.facility.ownership ? ` · ${detail.facility.ownership === "private" ? "Private" : "Government"}` : ""}
                    {detail.facility.agency ? ` · ${detail.facility.agency}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-muted hover:text-fg"
                >
                  Close
                </button>
              </div>

              <dl className="grid gap-x-4 gap-y-1.5 text-[11.5px] sm:grid-cols-2">
                {[
                  ["District", detail.facility.district],
                  ["Upazila", detail.facility.upazila],
                  ["City corporation", detail.facility.cityCorporation],
                  ["Facility type", detail.facility.facilityType],
                  ["Status in registry", detail.facility.active],
                  ["Distance", detail.facility.distanceKm !== null ? `${detail.facility.distanceKm} km` : "Unknown (no verified coordinate)"],
                ].map(([key, value]) => (
                  <div key={key as string} className="flex justify-between gap-3 border-b border-white/[0.05] py-1">
                    <dt className="text-muted">{key}</dt>
                    <dd className="text-right text-fg">{value ?? "Not recorded"}</dd>
                  </div>
                ))}
              </dl>

              <p className="text-[11px] leading-relaxed text-muted">
                Coordinate:{" "}
                {detail.facility.lat !== null && detail.facility.lng !== null
                  ? `${detail.facility.lat.toFixed(5)}, ${detail.facility.lng.toFixed(5)} (${detail.facility.locationStatus})`
                  : "not published by the registry and not yet verified by CIVIS"}
                . Source:{" "}
                <a href={detail.facility.sourceUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                  {detail.facility.source}
                </a>
                .
              </p>

              <div className="rounded-xl border border-warn/25 bg-warn/[0.05] p-3 text-[11.5px] leading-relaxed text-warn">
                {DISCLAIMER}
              </div>

              {detail.contacts.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11.5px] text-muted">
                  No published contact number is available for this facility. CIVIS does not display a number it cannot
                  attribute to a source.
                </p>
              ) : (
                <div className="space-y-3">
                  {(["emergency", "general", "department", "diagnostic", "support"] as const).map((group) => {
                    const rows = detail.contacts.filter((contact) => contact.contactGroup === group);
                    if (!rows.length) return null;
                    return (
                      <div key={group}>
                        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">
                          {GROUP_LABELS[group]}
                        </h3>
                        <ul className="space-y-1.5">
                          {rows.map((contact) => {
                            const href = telHref(contact);
                            return (
                              <li
                                key={contact.id}
                                className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-ink/60 px-3 py-2"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[12px] text-fg">{contact.departmentName}</span>
                                  <span className="block font-mono text-[11.5px] text-muted">{contact.phone}</span>
                                  <span className="block text-[10px] text-muted">
                                    {contact.verificationStatus === "verified"
                                      ? `Verified${contact.lastVerifiedAt ? ` ${new Date(contact.lastVerifiedAt).toLocaleDateString()}` : ""}`
                                      : contact.verificationStatus === "registry"
                                        ? "Official registry number — not independently verified by CIVIS"
                                        : "Reported — not verified"}
                                    {contact.operatingHours ? ` · ${contact.operatingHours}` : ""}
                                  </span>
                                </span>
                                {href ? (
                                  <a
                                    href={href}
                                    className="rounded-full bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-ink"
                                  >
                                    Call now
                                  </a>
                                ) : (
                                  <span className="text-[10.5px] text-warn">No dialable number</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void copyNumber(contact.phone)}
                                  className="rounded-full border border-white/15 px-2.5 py-1.5 text-[11px] text-muted hover:text-fg"
                                >
                                  {copied === contact.phone ? "Copied" : "Copy"}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Link
                  href={{ pathname: "/emergency", hash: "nearby-hospitals" }}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-[11.5px] text-muted hover:text-fg"
                >
                  Nearby hospitals
                </Link>
                {detail.facility.lat !== null && detail.facility.lng !== null && (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${detail.facility.lat}&mlon=${detail.facility.lng}#map=16/${detail.facility.lat}/${detail.facility.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/15 px-3 py-1.5 text-[11.5px] text-muted hover:text-fg"
                  >
                    Open in OpenStreetMap
                  </a>
                )}
                <a
                  href="https://hris.mohfw.gov.bd/public/facility-registry/"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 px-3 py-1.5 text-[11.5px] text-muted hover:text-fg"
                >
                  Report incorrect information
                </a>
              </div>

              {canManage && (
                <form onSubmit={saveContact} className="space-y-2 rounded-xl border border-white/10 bg-ink/60 p-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted">
                    Publish a department contact
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={form.departmentCode}
                      onChange={(event) => setForm((current) => ({ ...current, departmentCode: event.target.value }))}
                      aria-label="Department"
                      className="h-9 rounded-lg border border-white/10 bg-ink-soft px-2 text-[12px] text-fg"
                    >
                      <option value="">Choose a department</option>
                      {departments.map((entry) => (
                        <option key={entry.code} value={entry.code}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={form.phone}
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="Phone, e.g. 01712 345678"
                      aria-label="Phone number"
                      className="h-9 rounded-lg border border-white/10 bg-ink-soft px-2 text-[12px] text-fg"
                    />
                    <input
                      value={form.operatingHours}
                      onChange={(event) => setForm((current) => ({ ...current, operatingHours: event.target.value }))}
                      placeholder="Operating hours (optional)"
                      aria-label="Operating hours"
                      className="h-9 rounded-lg border border-white/10 bg-ink-soft px-2 text-[12px] text-fg"
                    />
                    <input
                      value={form.source}
                      onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}
                      placeholder="Source checked"
                      aria-label="Source"
                      className="h-9 rounded-lg border border-white/10 bg-ink-soft px-2 text-[12px] text-fg"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[11.5px] text-muted">
                    <input
                      type="checkbox"
                      checked={form.verified}
                      onChange={(event) => setForm((current) => ({ ...current, verified: event.target.checked }))}
                      className="size-4 accent-accent"
                    />
                    I confirmed this number with the facility
                  </label>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save contact"}
                  </button>
                  {formMessage && <p className="text-[11px] text-muted">{formMessage}</p>}
                </form>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-muted">This facility could not be loaded.</p>
          )}
        </section>
      )}

      {/* list */}
      <ul className="mt-5 space-y-2">
        {result.items.map((item) => {
          const hasLocation = item.lat !== null && item.lng !== null;
          return (
            <li key={item.id}>
              <div
                className={cx(
                  "rounded-xl border p-3.5 transition-colors",
                  selectedId === item.id ? "border-accent/40 bg-accent/[0.05]" : "border-white/10 bg-ink-soft/60",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-[13.5px] font-medium leading-snug">{item.name}</h2>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {[labelFor(item.category), item.upazila, item.district].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-muted">
                      {item.ownership === "private" ? "Private" : item.ownership === "public" ? "Government" : "Ownership not recorded"}
                      {item.distanceKm !== null ? ` · ${item.distanceKm} km away` : ""}
                      {hasLocation ? "" : " · location unavailable"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-muted hover:text-fg"
                    >
                      View details
                    </button>
                    {item.phone && (
                      <a
                        href={`tel:${item.phone.replace(/\D/g, "").replace(/^01/, "+8801")}`}
                        className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-ink"
                      >
                        Call
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {result.items.length === 0 && !loading && (
        <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-[12.5px] text-muted">
          No facility matches these filters. Clear a filter, or switch to All Sylhet Division.
        </p>
      )}

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-[12px] text-muted">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-full border border-white/15 px-3 py-1.5 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
            className="rounded-full border border-white/15 px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-muted">
        Imported from the DGHS Health Facility Registry. A registry listing does not confirm that a facility is
        operating, that a number still works, or that a bed is free. CIVIS publishes no availability figure it has not
        received from a verified source.
      </p>
    </div>
  );
}
