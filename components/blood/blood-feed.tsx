"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Droplets, HeartPulse, LocateFixed, MapPin, Search, Users } from "lucide-react";
import { ButtonLink, EmptyState, Field, Input, Panel, Select, Spinner as InlineSpinner, cx } from "@/components/ui";

import { timeAgo } from "@/lib/format";
import { BLOOD_GROUPS, COMPONENTS, URGENCIES, urgencyMeta } from "@/lib/blood/compat";
import "./blood.css";

const BloodMap = dynamic(() => import("./blood-map"), {
  ssr: false,
  loading: () => <div className="blood-map grid place-items-center"><InlineSpinner /></div>,
});

export type BloodRequestCard = {
  id: string;
  code: string;
  bloodGroup: string;
  component: string;
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
  verificationStatus: string;
  status: string;
  createdAt: string;
  distanceKm: number | null;
};

type Place = { id: string; name: string; kind: string; lat: number; lng: number; district?: string | null; division?: string | null };

const STATUS_LABEL: Record<string, string> = {
  verified: "Verified",
  active: "Active",
  partially_fulfilled: "Partially fulfilled",
  pending_verification: "Pending verification",
  expired: "Expired",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

function timeUntil(iso: string): string {
  const diff = Date.parse(iso) - Date.now();
  if (!Number.isFinite(diff)) return "Time not recorded";
  const abs = Math.abs(diff);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const span = hours < 24 ? `${Math.max(1, hours)} hour${hours === 1 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"}`;
  return diff >= 0 ? `Needed within ${span}` : `Needed ${span} ago`;
}

export function BloodFeed({ initialViewer }: { initialViewer: { id: string; role: string } | null }) {
  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [radius, setRadius] = useState(25);
  const [group, setGroup] = useState("");
  const [component, setComponent] = useState("");
  const [urgency, setUrgency] = useState("");
  const [sort, setSort] = useState<"urgency" | "distance" | "recent">("urgency");
  const [requests, setRequests] = useState<BloodRequestCard[]>([]);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [view, setView] = useState<"list" | "map">("list");
  const [mapFailure, setMapFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setHits([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        const data = await response.json();
        if (!controller.signal.aborted) setHits(Array.isArray(data.results) ? data.results.slice(0, 6) : []);
      } catch {
        if (!controller.signal.aborted) setHits([]);
      }
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: "open", limit: "60" });
      if (origin) { params.set("lat", String(origin.lat)); params.set("lng", String(origin.lng)); params.set("radius", String(radius)); }
      if (group) params.set("group", group);
      if (component) params.set("component", component);
      if (urgency) params.set("urgency", urgency);
      const response = await fetch(`/api/blood/requests?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Blood Connect could not load requests.");
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setStats(data.stats ?? null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Blood Connect could not load requests.");
    } finally {
      setLoading(false);
    }
  }, [origin, radius, group, component, urgency]);

  useEffect(() => { void load(); }, [load, retry]);

  function detect() {
    if (!navigator.geolocation) {
      setLocationNote("GPS is unavailable in this browser. Pick a district below.");
      return;
    }
    setLocating(true);
    setLocationNote(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude, label: "Your current location" });
        setLocating(false);
      },
      (problem) => {
        setLocating(false);
        setLocationNote(
          problem.code === 1
            ? "Location permission was not granted. Pick a district below — requests are still searchable."
            : "Your position could not be found. Pick a district below.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
    );
  }

  const ordered = useMemo(() => {
    const list = [...requests].filter((request) =>
      `${request.hospitalName} ${request.district ?? ""} ${request.city ?? ""} ${request.code}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) || hits.length > 0,
    );
    if (sort === "distance" && origin) list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    else if (sort === "recent") list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    else {
      const order: Record<string, number> = { critical: 0, urgent: 1, high: 2, planned: 3 };
      list.sort((a, b) => (order[a.urgency] ?? 9) - (order[b.urgency] ?? 9) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    return list;
  }, [requests, sort, origin, query, hits.length]);

  return (
    <div className="space-y-5">
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Find requests near a district or city" htmlFor="blood-place-search">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <Input
                  id="blood-place-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Sylhet, Dhaka, Chattogram…"
                  autoComplete="off"
                  className="pl-9"
                />
              </div>
            </Field>
          </div>
          <ButtonLink href="/blood/new" variant="secondary" size="sm">
            <Droplets size={14} aria-hidden /> Request blood
          </ButtonLink>
          <button
            type="button"
            onClick={detect}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:text-fg disabled:opacity-60"
          >
            {locating ? <InlineSpinner className="size-3.5" /> : <LocateFixed size={14} aria-hidden />}
            {locating ? "Locating" : "Use my location"}
          </button>
        </div>

        {hits.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {hits.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOrigin({ lat: place.lat, lng: place.lng, label: [place.name, place.district, place.division].filter(Boolean).join(", ") });
                    setHits([]);
                    setQuery("");
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted hover:border-accent/30 hover:text-fg"
                >
                  {place.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {origin && (
          <p className="mt-3 flex items-center gap-2 text-[11.5px] text-muted">
            <MapPin size={13} className="text-warn" aria-hidden />
            {origin.label} · {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}
            <button type="button" onClick={() => setOrigin(null)} className="text-accent underline underline-offset-4">Clear</button>
          </p>
        )}
        {locationNote && <p className="mt-2 text-[11.5px] leading-relaxed text-warn" role="status">{locationNote}</p>}

        <div className="mt-4 grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Blood group" htmlFor="blood-group-filter">
            <Select id="blood-group-filter" value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="">Any group</option>
              {BLOOD_GROUPS.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="Component" htmlFor="blood-component-filter">
            <Select id="blood-component-filter" value={component} onChange={(event) => setComponent(event.target.value)}>
              <option value="">Any component</option>
              {COMPONENTS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </Select>
          </Field>
          <Field label="Urgency" htmlFor="blood-urgency-filter">
            <Select id="blood-urgency-filter" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
              <option value="">Any urgency</option>
              {URGENCIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label.split(" —")[0]}</option>)}
            </Select>
          </Field>
          <Field label="Radius" htmlFor="blood-radius-filter">
            <Select id="blood-radius-filter" value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
              {[5, 10, 25, 50].map((value) => <option key={value} value={value}>Within {value} km</option>)}
            </Select>
          </Field>
          <Field label="Sort by" htmlFor="blood-sort-filter">
            <Select id="blood-sort-filter" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="urgency">Urgency</option>
              <option value="distance" disabled={!origin}>Distance</option>
              <option value="recent">Most recent</option>
            </Select>
          </Field>
        </div>
      </Panel>

      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Active requests", value: stats.open, icon: <Droplets size={14} aria-hidden /> },
            { label: "Critical", value: stats.critical, icon: <CircleAlert size={14} aria-hidden /> },
            { label: "Registered donors", value: stats.donors, icon: <Users size={14} aria-hidden /> },
            { label: "Available donors", value: stats.availableDonors, icon: <HeartPulse size={14} aria-hidden /> },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted">{stat.icon}{stat.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{stat.value ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-muted">
          {loading ? <><InlineSpinner />Loading blood requests…</> : <>{ordered.length} request{ordered.length === 1 ? "" : "s"}{origin ? ` within ${radius} km` : " across CIVIS"}</>}
        </p>
        <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["list", "map"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => { setMapFailure(null); setView(value); }}
              className={cx("rounded-full px-3 py-1 text-[11px] font-medium transition-colors", view === value ? "bg-white/[0.09] text-fg" : "text-muted hover:text-fg")}
            >
              {value === "list" ? "List" : "Map"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Panel className="flex flex-col items-start gap-3 border-crit/25 p-4">
          <p className="flex items-center gap-2 text-sm text-crit" role="alert"><CircleAlert size={16} aria-hidden />{error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="text-xs text-accent underline underline-offset-4">Retry</button>
        </Panel>
      )}

      {mapFailure && <p className="rounded-xl border border-warn/20 p-3 text-xs text-warn" role="status">{mapFailure}</p>}

      {view === "map" && origin && ordered.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <BloodMap
            center={{ lat: origin.lat, lng: origin.lng }}
            requests={ordered.map((request) => ({
              id: request.id,
              code: request.code,
              bloodGroup: request.bloodGroup,
              urgency: request.urgency,
              hospitalName: request.hospitalName,
              latitude: request.latitude,
              longitude: request.longitude,
            }))}
            selectedId={selected}
            onSelect={(marker) => setSelected(marker.id)}
            onFailure={() => { setMapFailure("Map rendering is unavailable on this device. Switch to the list."); setView("list"); }}
          />
          {selected && (() => {
            const request = ordered.find((entry) => entry.id === selected);
            if (!request) return null;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 p-3 text-xs">
                <p><strong className="text-fg">{request.bloodGroup}</strong> · {request.hospitalName} · {urgencyMeta(request.urgency).label}</p>
                <Link href={`/blood/${request.id}`} className="text-accent underline underline-offset-4">View request</Link>
              </div>
            );
          })()}
        </div>
      )}
      {view === "map" && !origin && (
        <EmptyState icon={<MapPin size={22} />} title="Choose a district to place the map" description="The map centres on your search area. Markers only ever show the receiving hospital." />
      )}

      {loading && ordered.length === 0 ? (
        <div className="grid place-items-center py-14"><InlineSpinner /></div>
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={<Droplets size={22} />}
          title="No active blood requests in this view"
          description={origin
            ? "Nothing open inside this radius right now. Widen the radius or clear the filters. You can still register as a donor so future requests reach you."
            : "No open requests match these filters. Choose a district or clear a filter to search a wider area."}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {ordered.map((request) => {
            const urgency = urgencyMeta(request.urgency);
            return (
              <Panel key={request.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid size-10 place-items-center rounded-xl border text-[13px] font-bold" style={{ borderColor: `${urgency.color}40`, color: urgency.color, background: `${urgency.color}12` }}>
                      {request.bloodGroup}
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold">{request.componentLabel}</p>
                      <p className="text-[10.5px] text-muted">{request.unitsRequired} unit{request.unitsRequired === 1 ? "" : "s"} needed</p>
                    </div>
                  </div>
                  <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: urgency.color, background: `${urgency.color}14` }}>
                    {urgency.label.split(" —")[0]}
                  </span>
                </div>

                <p className="mt-3 text-[12.5px] font-medium">{request.hospitalName}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  {[request.hospitalAddress, request.district, request.city].filter(Boolean).join(" · ") || "Location recorded on the map"}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
                  <span>{timeUntil(request.requiredAt)}</span>
                  {request.distanceKm !== null && <span>{request.distanceKm.toFixed(1)} km away</span>}
                  <span>{timeAgo(request.createdAt)}</span>
                  <span className={cx("flex items-center gap-1", request.verificationStatus === "verified" ? "text-mint" : "text-warn")}>
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: request.verificationStatus === "verified" ? "#43D6A0" : "#F5B94B" }} aria-hidden />
                    {request.verificationStatus === "verified" ? "Moderator verified" : "Awaiting verification"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ButtonLink href={`/blood/${request.id}`} size="sm" variant="secondary">View details</ButtonLink>
                  <Link href={`/blood/${request.id}#donate`} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent underline underline-offset-4">
                    <HeartPulse size={13} aria-hidden /> I can donate
                  </Link>
                  <span className="ml-auto text-[10px] text-muted">{request.code} · {STATUS_LABEL[request.status] ?? request.status}</span>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {!initialViewer && (
        <p className="text-[11.5px] leading-relaxed text-muted">
          <Link href="/auth/sign-in?next=/blood" className="text-accent underline underline-offset-4">Sign in</Link>{" "}
          to offer to donate, publish a request, or register as a volunteer donor.
        </p>
      )}
    </div>
  );
}
