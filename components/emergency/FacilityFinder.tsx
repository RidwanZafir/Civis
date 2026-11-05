"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, Check, ChevronRight, CircleAlert, Compass, List, LocateFixed, MapPin, Navigation, Phone, Search, X } from "lucide-react";
import { Button, EmptyState, Field, Input, Panel, Select, Spinner, cx } from "@/components/ui";
import { FACILITY_COLORS, FACILITY_FILTERS, directionsUrl, matchesFacilityFilter, type Facility, type FacilityFilter, type FacilityLocation, type FacilityResult, type FacilityRoute, type MapGeometry } from "@/lib/emergency/facilities-types";
import type { PublicHospitalAvailability } from "@/lib/hospitals/types";
import { timeAgo } from "@/lib/format";
import "maplibre-gl/dist/maplibre-gl.css";
import "./emergency-map.css";

// View changes are immediate. Hover transitions respect prefers-reduced-motion
// in emergency-map.css, and the optional 3D scene gates marker motion itself.

const FacilityMap = dynamic(() => import("./FacilityMap"), { ssr: false, loading: () => <div className="facility-map-surface grid place-items-center"><Spinner /></div> });
const FacilityScene = dynamic(() => import("./FacilityScene"), { ssr: false, loading: () => <div className="facility-map-surface grid place-items-center"><Spinner /></div> });
const EMPTY_GEOMETRY: MapGeometry = { roads: [], buildings: [] };
type Place = { label: string; lat: number; lng: number; countryCode?: string; region?: string };
type DistrictPlace = {
  id: string;
  name: string;
  name_bn?: string | null;
  kind: string;
  lat: number;
  lng: number;
  district?: string | null;
  division?: string | null;
};

class MapBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <div className="facility-map-surface grid place-items-center p-6 text-center text-sm text-muted">Map renderer unavailable. Switch to the list to see facilities.</div> : this.props.children; }
}

const WARD_STATE_COLOR: Record<string, string> = {
  available: "#43D6A0",
  limited: "#F5B94B",
  full: "#F16D78",
  closed: "#929FB2",
  unknown: "#929FB2",
};

const SERVICE_STATUS_COLOR: Record<string, string> = {
  available: "#43D6A0",
  restricted: "#F5B94B",
  unavailable: "#F16D78",
  closed: "#929FB2",
  unknown: "#929FB2",
};

function availabilityHeadline(
  report: PublicHospitalAvailability | null,
  loading: boolean,
  error: string | null,
) {
  if (report) {
    if (report.stale) return "Availability report is stale";
    const beds = report.summary.confirmedAvailableBeds;
    if (beds !== null) {
      return `${new Intl.NumberFormat().format(beds)} bed${beds === 1 ? "" : "s"} reported available`;
    }
    if (report.summary.availableWards > 0) {
      return `${report.summary.availableWards} ward${report.summary.availableWards === 1 ? "" : "s"} reported open`;
    }
    if (report.summary.operationalServices > 0) {
      return `${report.summary.operationalServices} service${report.summary.operationalServices === 1 ? "" : "s"} reported available`;
    }
    return "Availability reported without confirmed beds";
  }
  if (loading) return "Checking reported availability…";
  return error ? "Availability reports could not be loaded" : "Bed availability not reported";
}

function AvailabilityPanel({
  report,
  loading,
  error,
  compact = false,
}: {
  report: PublicHospitalAvailability | null;
  loading: boolean;
  error: string | null;
  compact?: boolean;
}) {
  const headline = availabilityHeadline(report, loading, error);
  const tone = loading ? "#929FB2" : report && !report.stale ? "#43D6A0" : report || error ? "#F5B94B" : "#929FB2";

  if (compact) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="flex items-center gap-2 text-[11px] font-medium" style={{ color: tone }}>
          <span className="size-1.5 rounded-full" style={{ backgroundColor: tone }} aria-hidden />
          {headline}
        </p>
        {report ? (
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            Reported by {report.organisation.name} · {timeAgo(report.updatedAt)}. Organisation-reported, not live monitoring.
          </p>
        ) : loading ? (
          <p className="mt-1 text-[10px] text-muted">Loading availability published by verified health organisations.</p>
        ) : error ? (
          <p className="mt-1 text-[10px] leading-relaxed text-muted">This does not mean care is unavailable. Call the hospital directly.</p>
        ) : (
          <p className="mt-1 text-[10px] leading-relaxed text-muted">No verified health organisation has published availability for this facility. Call before travelling.</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Reported availability</p>
        {report && <span className="rounded-full border border-accent/25 bg-accent/[0.07] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">Organisation-reported</span>}
      </div>
      <p className="mt-2 text-[13px] font-medium" style={{ color: tone }}>{headline}</p>

      {loading ? (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-muted"><Spinner />Loading availability reports…</p>
      ) : error && !report ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Availability reports could not be loaded. This does not mean beds or services are unavailable. Call the
          hospital directly before travelling.
        </p>
      ) : !report ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          No verified health organisation has published ward, bed or service availability for this facility in CIVIS.
          Call the hospital directly to confirm. A missing report does not mean the hospital is closed or full.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Reported by <span className="text-fg/85">{report.organisation.name}</span> · {timeAgo(report.updatedAt)}.
            {report.note ? ` ${report.note}` : ""}
          </p>
          {report.stale && (
            <p className="mt-2 rounded-lg border border-warn/20 bg-warn/[0.05] p-2 text-[10.5px] leading-relaxed text-warn">
              This report is more than one hour old. CIVIS withholds bed counts and treats ward/service states as
              unconfirmed. Call the hospital before travelling.
            </p>
          )}
          {!report.stale && (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <dt className="text-muted">Beds</dt>
                <dd className="mt-0.5 text-[13px] font-semibold tabular-nums">
                  {report.summary.confirmedAvailableBeds === null ? "Not reported" : new Intl.NumberFormat().format(report.summary.confirmedAvailableBeds)}
                </dd>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <dt className="text-muted">Open wards</dt>
                <dd className="mt-0.5 text-[13px] font-semibold tabular-nums">{report.summary.availableWards}</dd>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <dt className="text-muted">Services</dt>
                <dd className="mt-0.5 text-[13px] font-semibold tabular-nums">{report.summary.operationalServices}</dd>
              </div>
            </dl>
          )}
          {report.wards.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Wards</p>
              <ul className="mt-1.5 space-y-1">
                {report.wards.slice(0, 10).map((ward) => (
                  <li key={ward.code} className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="min-w-0 truncate">{ward.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5" style={{ color: WARD_STATE_COLOR[ward.state] ?? "#929FB2" }}>
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: WARD_STATE_COLOR[ward.state] ?? "#929FB2" }} aria-hidden />
                      {ward.state === "unknown" ? "Unconfirmed" : ward.state}
                      {ward.confirmedAvailableBeds !== null ? ` · ${ward.confirmedAvailableBeds} beds` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.services.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Medical services</p>
              <ul className="mt-1.5 space-y-1">
                {report.services.slice(0, 12).map((service) => (
                  <li key={service.code} className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="min-w-0 truncate">{service.name}</span>
                    <span className="shrink-0 capitalize" style={{ color: SERVICE_STATUS_COLOR[service.status] ?? "#929FB2" }}>
                      {service.status === "unknown" ? "Unconfirmed" : service.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 border-t border-white/[0.06] pt-2 text-[10px] leading-relaxed text-muted">
            Source: {report.source} · version {report.version}. Availability can change at any time; confirm with the
            hospital before travelling. CIVIS does not monitor beds continuously.
          </p>
        </>
      )}
    </div>
  );
}

function FacilityDetails({ facility, location, compact = false, availability = null, availabilityLoading = false, availabilityError = null }: { facility: Facility; location: FacilityLocation | null; compact?: boolean; availability?: PublicHospitalAvailability | null; availabilityLoading?: boolean; availabilityError?: string | null }) {
  const [copied, setCopied] = useState(false);
  return <div className={compact ? "space-y-3" : "space-y-4"}>
    <p className="text-xs leading-relaxed text-muted">{facility.address}</p>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
      <div><dt className="text-muted">Distance</dt><dd className="mt-1 font-medium">{new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(facility.distanceKm)} km, straight line</dd></div>
      <div><dt className="text-muted">Published hours</dt><dd className="mt-1 font-medium">{facility.openingHours ?? "Not published"}</dd></div>
      <div className="col-span-2"><dt className="text-muted">Emergency department</dt><dd className="mt-1">{facility.emergencyDepartment === true ? "Emergency care listed by the source" : facility.emergencyDepartment === false ? "Source lists no emergency department" : "Not confirmed in source data"}{facility.trauma ? "; trauma care listed" : ""}</dd></div>
      {facility.specialties.length > 0 && <div className="col-span-2"><dt className="text-muted">Published specialties</dt><dd className="mt-1 capitalize">{facility.specialties.join(", ").replaceAll("_", " ")}</dd></div>}
    </dl>
    {(facility.kind === "hospital" || facility.kind === "clinic") && (
      <AvailabilityPanel report={availability} loading={availabilityLoading} error={availabilityError} compact={compact} />
    )}
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
      <p className="flex items-center justify-between gap-3 font-medium"><span>{facility.phone ?? "Phone number not published"}</span>{facility.phone && <span className={facility.phoneVerified ? "text-mint" : "text-warn"}>{facility.phoneVerified ? "Verified source" : "Unverified"}</span>}</p>
      {facility.phone && !facility.phoneVerified && <p className="mt-1.5 text-muted">Published by map contributors. Verify this number with the facility before relying on it.</p>}
      {facility.phoneVerified && facility.phoneSource && <a className="mt-1.5 block text-accent underline underline-offset-4" href={facility.phoneSource} target="_blank" rel="noopener noreferrer">Official phone source · checked {facility.phoneCheckedAt}</a>}
      {facility.phone && !facility.phoneVerified && <button type="button" className="mt-2 text-accent underline underline-offset-4" onClick={async () => { try { await navigator.clipboard.writeText(facility.phone!); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Published number copied" : "Copy published phone"}</button>}
    </div>
    <div className="flex flex-wrap gap-2">
      {facility.phoneVerified && facility.phone && <a className="facility-action facility-action-call" href={`tel:${facility.phone.replace(/[ ()-]/g, "")}`}><Phone size={14} aria-hidden /> Call hospital</a>}
      <a className="facility-action" href={directionsUrl(facility, location)} target="_blank" rel="noopener noreferrer"><Navigation size={14} aria-hidden /> Get directions</a>
      {facility.website && <a className="facility-action" href={facility.website} target="_blank" rel="noopener noreferrer">Website <ChevronRight size={13} aria-hidden /></a>}
    </div>
    <div className="text-[10px] leading-relaxed text-muted">
      <a href={facility.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{facility.source}</a> · retrieved {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(facility.updatedAt))}
      {facility.capabilitySource && facility.capabilitySource !== facility.sourceUrl && <a href={facility.capabilitySource} target="_blank" rel="noopener noreferrer" className="ml-2 underline underline-offset-4">Capability source</a>}
    </div>
  </div>;
}

export function FacilityFinder({ location, onLocationChange }: { location: FacilityLocation | null; onLocationChange?: (location: FacilityLocation) => void }) {
  const [ownLocation, setOwnLocation] = useState<FacilityLocation | null>(location);
  const origin = location ?? ownLocation;
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [radius, setRadius] = useState(5);
  const [filter, setFilter] = useState<FacilityFilter>("all");
  const [facilityQuery, setFacilityQuery] = useState("");
  const [view, setView] = useState<"list" | "map" | "3d">("list");
  const [data, setData] = useState<FacilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [route, setRoute] = useState<FacilityRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<MapGeometry>(EMPTY_GEOMETRY);
  const [mapFailure, setMapFailure] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, PublicHospitalAvailability>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityFailedIds, setAvailabilityFailedIds] = useState<Set<string>>(new Set());
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "confirmed" | "unknown">("all");
  const [districtQuery, setDistrictQuery] = useState("");
  const [districtHits, setDistrictHits] = useState<DistrictPlace[]>([]);
  const [districtLoading, setDistrictLoading] = useState(false);
  const searchController = useRef<AbortController | null>(null);
  const locationRequest = useRef(0);
  const [shareStatus, setShareStatus] = useState("");
  const [shareSupported, setShareSupported] = useState(false);

  // District/city selection is answered by the local places table, so finding
  // hospitals never depends on an external geocoder or on GPS permission.
  useEffect(() => {
    const term = districtQuery.trim();
    if (term.length < 2) { setDistrictHits([]); setDistrictLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDistrictLoading(true);
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const result = await response.json();
        if (!controller.signal.aborted) {
          setDistrictHits(Array.isArray(result.results) ? (result.results as DistrictPlace[]).slice(0, 6) : []);
        }
      } catch {
        if (!controller.signal.aborted) setDistrictHits([]);
      } finally {
        if (!controller.signal.aborted) setDistrictLoading(false);
      }
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [districtQuery]);
  useEffect(() => { setShareSupported(typeof navigator.share === "function"); return () => searchController.current?.abort(); }, []);
  useEffect(() => { if (location) setOwnLocation(location); }, [location]);

  function chooseLocation(value: FacilityLocation, requestId?: number) {
    if (requestId !== undefined && requestId !== locationRequest.current) return;
    if (requestId === undefined) { locationRequest.current += 1; setLocating(false); }
    setOwnLocation(value); onLocationChange?.(value); setPlaces([]); setLocationError(null);
  }

  function detectLocation() {
    if (!navigator.geolocation) { setLocationError("GPS is unavailable in this browser. Search for a city or address below."); return; }
    const requestId = ++locationRequest.current;
    setLocating(true); setLocationError(null);
    navigator.geolocation.getCurrentPosition(async (position) => {
      const value: FacilityLocation = { lat: position.coords.latitude, lng: position.coords.longitude, address: "Current GPS location" };
      if (requestId !== locationRequest.current) return;
      chooseLocation(value, requestId);
      try {
        const response = await fetch(`/api/emergency/location?lat=${value.lat}&lng=${value.lng}`);
        if (response.ok) { const result = await response.json(); if (result.location) chooseLocation(result.location, requestId); }
      } catch { if (requestId === locationRequest.current) setLocationError("GPS coordinates found. Address lookup is unavailable; nearby search can still use your coordinates."); }
      finally { if (requestId === locationRequest.current) setLocating(false); }
    }, (problem) => { if (requestId !== locationRequest.current) return; setLocating(false); setLocationError(problem.code === 1 ? "Location permission denied. You can still find hospitals by city, neighborhood or address." : "GPS could not find your position. Search for a location manually."); }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 });
  }

  async function searchLocation() {
    const text = query.trim();
    const coordinates = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (coordinates) {
      const lat = Number(coordinates[1]); const lng = Number(coordinates[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { chooseLocation({ lat, lng, address: `Coordinates ${lat}, ${lng}` }); return; }
      setLocationError("Latitude must be between -90 and 90, and longitude between -180 and 180."); return;
    }
    if (text.length < 3) { setLocationError("Enter at least 3 characters, or latitude, longitude."); return; }
    searchController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    setSearching(true); setLocationError(null); setPlaces([]);
    try {
      const response = await fetch(`/api/emergency/location?q=${encodeURIComponent(text)}`, { signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Address search unavailable. Try again or enter latitude, longitude.");
      setPlaces(result.results ?? []);
      if (!result.results?.length) setLocationError("No location found. Try a nearby city, a fuller address or latitude, longitude.");
    } catch (problem) { if (!controller.signal.aborted) setLocationError(problem instanceof Error ? problem.message : "Address search unavailable."); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }

  useEffect(() => {
    if (!origin) return;
    const controller = new AbortController();
    setLoading(true); setError(null); setData(null); setSelectedId(null); setRoute(null);
    (async () => {
      try {
        const response = await fetch(`/api/emergency/facilities?lat=${origin.lat}&lng=${origin.lng}&radius=${radius}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Hospital search unavailable.");
        if (!controller.signal.aborted) setData(result);
      } catch (problem) { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : "Hospital search unavailable."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [origin?.lat, origin?.lng, radius, retry]);

  // Availability is a separate, voluntary report published by verified health
  // organisations. It is fetched only for the facilities already returned, so a
  // slow availability service never delays the emergency facility list.
  useEffect(() => {
    if (!data) {
      setAvailability({});
      setAvailabilityFailedIds(new Set());
      setAvailabilityLoading(false);
      return;
    }
    const ids = [...new Set(
      data.facilities
        .filter((facility) => facility.kind === "hospital" || facility.kind === "clinic")
        .map((facility) => facility.id),
    )];
    if (!ids.length) {
      setAvailability({});
      setAvailabilityFailedIds(new Set());
      setAvailabilityLoading(false);
      return;
    }
    const controller = new AbortController();
    setAvailability({});
    setAvailabilityFailedIds(new Set());
    setAvailabilityLoading(true);
    (async () => {
      const reports: Record<string, PublicHospitalAvailability> = {};
      const failed = new Set<string>();
      const chunks: string[][] = [];
      for (let index = 0; index < ids.length; index += 60) {
        chunks.push(ids.slice(index, index + 60));
      }
      for (const chunk of chunks) {
        try {
          const response = await fetch(
            `/api/hospitals/availability?ids=${encodeURIComponent(chunk.join(","))}`,
            { signal: controller.signal, cache: "no-store" },
          );
          if (!response.ok) throw new Error("Availability reports could not be loaded.");
          const result = await response.json();
          if (result.availability && typeof result.availability === "object") {
            Object.assign(reports, result.availability);
          }
        } catch {
          if (controller.signal.aborted) return;
          for (const id of chunk) failed.add(id);
        }
      }
      if (controller.signal.aborted) return;
      setAvailability(reports);
      setAvailabilityFailedIds(failed);
      setAvailabilityLoading(false);
    })();
    return () => controller.abort();
  }, [data, availabilityRetry]);

  useEffect(() => {
    setGeometry(EMPTY_GEOMETRY);
    if (!origin || view !== "3d") return;
    const controller = new AbortController();
    fetch(`/api/emergency/facilities?mode=geometry&lat=${origin.lat}&lng=${origin.lng}`, { signal: controller.signal }).then(async (response) => { if (response.ok) { const result = await response.json(); if (!controller.signal.aborted) setGeometry(result.geometry); } }).catch(() => { /* Geographic facility markers still work without optional outlines. */ });
    return () => controller.abort();
  }, [origin?.lat, origin?.lng, view]);

  // Availability is optional data published by a verified health organisation.
  // A hospital without a report is still a nearby hospital — it is grouped as
  // "availability unknown" rather than hidden.
  const availabilityState = useCallback((facilityId: string): "confirmed" | "limited" | "unknown" => {
    const report = availability[facilityId];
    if (!report || report.stale) return "unknown";
    if (report.summary.confirmedAvailableBeds !== null) {
      return report.summary.confirmedAvailableBeds > 0 ? "confirmed" : "limited";
    }
    if (report.summary.availableWards > 0) return "confirmed";
    if (report.summary.operationalServices > 0) return "confirmed";
    if (report.summary.unavailableServices > 0) return "limited";
    return "unknown";
  }, [availability]);

  const hospitals = useMemo(() => (data?.facilities ?? [])
    .filter((facility) => matchesFacilityFilter(facility, filter))
    .filter((facility) => `${facility.name} ${facility.address}`.toLocaleLowerCase().includes(facilityQuery.toLocaleLowerCase()))
    .filter((facility) => availabilityFilter === "all" || (availabilityFilter === "confirmed"
      ? ["confirmed", "limited"].includes(availabilityState(facility.id))
      : availabilityState(facility.id) === "unknown"))
    .sort((a, b) => a.distanceKm - b.distanceKm), [data, filter, facilityQuery, availabilityFilter, availabilityState]);
  const mappedFacilities = useMemo(() => [...hospitals, ...(data?.facilities ?? []).filter((facility) => ["fire", "police", "ambulance"].includes(facility.kind))], [data, hospitals]);
  const selected = data?.facilities.find((facility) => facility.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected || !origin) { setRoute(null); setRouteError(null); setRouteLoading(false); return; }
    const controller = new AbortController(); setRoute(null); setRouteError(null); setRouteLoading(true);
    fetch(`/api/emergency/facilities?mode=route&lat=${origin.lat}&lng=${origin.lng}&toLat=${selected.lat}&toLng=${selected.lng}`, { signal: controller.signal }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!controller.signal.aborted) setRoute(result.route); }).catch((problem) => { if (!controller.signal.aborted) setRouteError(problem instanceof Error ? problem.message : "Route preview unavailable. Use Get Directions."); }).finally(() => { if (!controller.signal.aborted) setRouteLoading(false); });
    return () => controller.abort();
  }, [selected?.id, origin?.lat, origin?.lng]);

  async function shareLocation() {
    if (!origin) return;
    const url = `https://www.google.com/maps?q=${origin.lat},${origin.lng}`;
    try { if (shareSupported) { await navigator.share({ title: "Emergency location", text: origin.address, url }); setShareStatus("Location shared through your device."); } else { await navigator.clipboard.writeText(`${origin.address}\n${url}`); setShareStatus("Location and map link copied."); } }
    catch (problem) { if ((problem as Error).name !== "AbortError") setShareStatus("Sharing unavailable. Copy the coordinates shown here."); }
  }

  const selectedDetails = selected && <><div className="mb-4 flex items-start justify-between gap-4"><div><p className="mb-1 text-[10px] capitalize text-accent">{selected.kind === "fire" ? "Fire station" : selected.kind === "police" ? "Police station" : selected.kind === "ambulance" ? "Ambulance facility" : selected.kind}</p><h3 className="text-lg font-semibold">{selected.name}</h3></div><button type="button" className="rounded-full p-2 text-muted hover:bg-white/5 hover:text-fg" aria-label="Close facility details" onClick={() => setSelectedId(null)}><X size={18} aria-hidden /></button></div><FacilityDetails facility={selected} location={origin} availability={availability[selected.id] ?? null} availabilityLoading={availabilityLoading} availabilityError={availabilityFailedIds.has(selected.id) ? "Availability reports could not be loaded." : null} />{routeLoading ? <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Spinner />Finding a road route…</p> : route ? <p className="mt-3 text-xs text-accent">Route preview: {route.distanceKm.toFixed(1)} km driving · {route.source}. Travel time and road access can change.</p> : routeError ? <p className="mt-3 text-xs text-muted">{routeError}</p> : null}</>;

  return <section id="nearby-hospitals" className="space-y-5 scroll-mt-24" aria-labelledby="facility-finder-heading">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 id="facility-finder-heading" className="flex items-center gap-2 text-xl font-semibold"><Building2 className="text-accent" size={21} aria-hidden /> Nearby hospitals</h2><p className="mt-1 text-xs text-muted">Search real facilities. See published details and open directions.</p></div><Button type="button" variant="secondary" size="sm" disabled={locating} onClick={detectLocation}>{locating ? <Spinner /> : <LocateFixed size={15} aria-hidden />}{locating ? "Finding location" : "Use my location"}</Button></div>
    <Panel className="p-4 sm:p-5">
      <form onSubmit={(event) => { event.preventDefault(); void searchLocation(); }} className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Search city, neighborhood or address" htmlFor="facility-location-search"><Input id="facility-location-search" value={query} onChange={(event) => { searchController.current?.abort(); setSearching(false); setQuery(event.target.value); setPlaces([]); }} placeholder="Dhaka, a street address, or 23.81, 90.41" /></Field></div><Button type="submit" disabled={searching}>{searching ? <Spinner /> : <Search size={15} aria-hidden />}Search location</Button></form>
      <div className="mt-3 border-t border-white/10 pt-3">
        <Field label="Or pick a district or city (no GPS needed)" htmlFor="facility-district-search">
          <Input
            id="facility-district-search"
            value={districtQuery}
            onChange={(event) => setDistrictQuery(event.target.value)}
            placeholder="Sylhet, Dhaka, Chattogram…"
            autoComplete="off"
          />
        </Field>
        {districtLoading && <p className="mt-1.5 flex items-center gap-2 text-[10.5px] text-muted"><Spinner />Looking up districts…</p>}
        {!districtLoading && districtQuery.trim().length >= 2 && districtHits.length === 0 && (
          <p className="mt-1.5 text-[10.5px] text-muted">No district or city matches that name in the CIVIS place list.</p>
        )}
        {districtHits.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {districtHits.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => {
                    chooseLocation({
                      lat: place.lat,
                      lng: place.lng,
                      address: [place.name, place.district, place.division].filter(Boolean).join(", "),
                    });
                    setDistrictHits([]);
                    setDistrictQuery("");
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/30 hover:text-fg"
                >
                  {place.name}{place.kind === "division" ? " division" : place.kind === "district" ? " district" : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {locationError && <p className="mt-3 text-xs leading-relaxed text-warn" role="status">{locationError}</p>}
      {places.length > 0 && <ul className="mt-3 space-y-1 rounded-xl border border-white/10 p-1">{places.map((place, index) => <li key={`${place.lat}:${place.lng}:${index}`}><button type="button" onClick={() => chooseLocation({ lat: place.lat, lng: place.lng, address: place.label })} className="flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-muted transition-colors hover:bg-white/5 hover:text-fg"><MapPin size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />{place.label}</button></li>)}</ul>}
      {origin && <div className="mt-4 flex flex-col justify-between gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="flex items-start gap-2 text-xs"><MapPin size={14} className="shrink-0 text-warn" aria-hidden /><span className="break-words">{origin.address}</span></p><p className="mt-1 pl-5 text-[10px] tabular-nums text-muted">{origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}</p></div><button type="button" className="shrink-0 text-xs text-accent underline underline-offset-4" onClick={() => void shareLocation()}>{shareSupported ? "Share location" : "Copy location"}</button></div>}
      {shareStatus && <p className="mt-2 text-xs text-mint" role="status">{shareStatus}</p>}
    </Panel>
    {!origin ? <EmptyState icon={<Compass size={24} />} title="Choose your location to find hospitals" description="GPS permission is optional. Manual search and coordinates work without it." /> : <>
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Facility category" htmlFor="facility-category"><Select id="facility-category" value={filter} onChange={(event) => { setFilter(event.target.value as FacilityFilter); setSelectedId(null); }}>{FACILITY_FILTERS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</Select></Field><Field label="Distance" htmlFor="facility-radius"><Select id="facility-radius" value={radius} onChange={(event) => setRadius(Number(event.target.value))}>{[2, 5, 10, 25, 50].map((value) => <option value={value} key={value}>Within {value} km</option>)}</Select></Field><Field label="Search hospitals" htmlFor="facility-name-search"><Input id="facility-name-search" value={facilityQuery} onChange={(event) => setFacilityQuery(event.target.value)} placeholder="Hospital name or address" /></Field></div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by reported availability">
        {([
          { value: "all", label: "All nearby", hint: "Every hospital in range" },
          { value: "confirmed", label: "Reported availability", hint: "A verified organisation published a recent report" },
          { value: "unknown", label: "Availability unknown", hint: "No recent report — call before travelling" },
        ] as const).map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            aria-pressed={availabilityFilter === option.value}
            onClick={() => setAvailabilityFilter(option.value)}
            className={cx(
              "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
              availabilityFilter === option.value
                ? "border-accent/35 bg-accent/[0.09] text-fg"
                : "border-white/10 text-muted hover:border-white/20 hover:text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
        {availabilityLoading && <span className="flex items-center gap-1.5 text-[10.5px] text-muted"><Spinner />Checking reports</span>}
        {!availabilityLoading && availabilityFailedIds.size > 0 && (
          <button type="button" onClick={() => setAvailabilityRetry((value) => value + 1)} className="text-[10.5px] text-accent underline underline-offset-4">
            Retry availability ({availabilityFailedIds.size})
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs text-muted">{loading ? <><Spinner />Searching published facility data…</> : <><Check size={13} aria-hidden />{hospitals.length} facilities · nearest first</>}</p><div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1" aria-label="Facility display"><button type="button" className={cx("facility-view-button", view === "list" && "active")} aria-pressed={view === "list"} onClick={() => setView("list")}><List size={13} aria-hidden />List</button><button type="button" className={cx("facility-view-button", view === "map" && "active")} aria-pressed={view === "map"} onClick={() => { setMapFailure(null); setView("map"); }}><MapPin size={13} aria-hidden />2D map</button><button type="button" className={cx("facility-view-button", view === "3d" && "active")} aria-pressed={view === "3d"} onClick={() => { setMapFailure(null); setView("3d"); }}><Building2 size={13} aria-hidden />3D map</button></div></div>
      {error && <Panel className="flex flex-col items-start gap-3 border-crit/25 p-5"><p className="flex gap-2 text-sm text-crit" role="alert"><CircleAlert size={18} className="shrink-0" aria-hidden />{error}</p><Button type="button" size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>Retry hospital search</Button><p className="text-xs text-muted">Try a smaller radius or another location. Emergency contact options remain available above.</p></Panel>}
      {data?.warning && <p className="rounded-xl border border-warn/20 bg-warn/5 p-3 text-xs text-warn" role="status">{data.warning}</p>}
      {data && !availabilityLoading && availabilityFailedIds.size === 0 && Object.keys(availability).length === 0 && hospitals.some((facility) => facility.kind === "hospital") && (
        <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[11.5px] leading-relaxed text-muted" role="status">
          <strong className="font-semibold text-fg/85">Hospital records were found, but current bed and service availability has not been reported.</strong>{" "}
          Verified health organisations publish availability through their CIVIS dashboard; until one does, a hospital is shown as
          availability unknown. That does not mean it is closed or full — call the hospital before travelling.
        </p>
      )}
      {data?.truncated && <p className="text-xs text-warn">Provider result limit reached. Narrow the radius to see a more complete local search.</p>}
      {mapFailure && <p className="rounded-xl border border-warn/20 p-3 text-xs text-warn" role="status">{mapFailure}</p>}
      {data && view !== "list" && <div className="relative overflow-hidden rounded-2xl border border-white/10">
        <MapBoundary key={view} onFailure={() => { setMapFailure("Map rendering failed. Hospital details and directions are available in the list."); setView("list"); }}>{view === "3d" ? <FacilityScene facilities={mappedFacilities} location={origin} selectedId={selectedId} onSelect={(facility) => setSelectedId(facility.id)} geometry={geometry} route={route} onFailure={() => { setMapFailure("3D rendering unavailable. Showing the 2D map; all emergency actions remain accessible."); setView("map"); }} /> : <FacilityMap facilities={mappedFacilities} location={origin} selectedId={selectedId} onSelect={(facility) => setSelectedId(facility.id)} route={route} onFailure={() => { setMapFailure("Map rendering unavailable. Showing the facility list."); setView("list"); }} />}</MapBoundary>
        <div className="absolute left-3 top-3 z-30 flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-ink/90 p-2.5 text-[10px] backdrop-blur">{(["hospital", "ambulance", "fire", "police"] as const).map((kind) => <span className="flex items-center gap-1.5 capitalize" key={kind}><span className="size-2 rounded-full" style={{ backgroundColor: FACILITY_COLORS[kind] }} />{kind === "hospital" ? "Hospitals" : kind}</span>)}<span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warn" />Your location</span></div>
        {selected && <div className="facility-detail-panel facility-floating-panel" role="region" aria-label={`Details for ${selected.name}`}>{selectedDetails}</div>}
      </div>}
      {selected && view === "list" && <div className="facility-detail-panel" role="region" aria-label={`Details for ${selected.name}`}>{selectedDetails}</div>}
      {data && hospitals.length === 0 && <EmptyState icon={<Building2 size={24} />} title="No matching facilities in the published data" description="Try a wider radius, another category or another location. A missing result does not mean there are no hospitals nearby." />}
      {data && (view === "list" || hospitals.length > 0) && <div className="grid gap-4 lg:grid-cols-2">{hospitals.map((facility) => <Panel key={facility.id} className={cx("overflow-hidden p-5", selectedId === facility.id && "border-accent/40")}>
        {facility.photo && <img src={facility.photo} alt={`${facility.name}, photograph from its listed data source`} width={560} height={220} loading="lazy" referrerPolicy="no-referrer" className="mb-4 h-36 w-full rounded-xl object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
        <div className="mb-4 flex items-start justify-between gap-3"><h3 className="text-sm font-semibold leading-relaxed">{facility.name}</h3><span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-[10px] tabular-nums text-accent">{facility.distanceKm.toFixed(1)} km</span></div>
        {(facility.kind === "hospital" || facility.kind === "clinic") && (() => {
          const state = availabilityState(facility.id);
          const tone = state === "confirmed" ? "#43D6A0" : state === "limited" ? "#F5B94B" : "#929FB2";
          const label = state === "confirmed" ? "Reported availability" : state === "limited" ? "Limited availability" : "Availability unknown";
          return (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium" style={{ color: tone, background: `${tone}14` }}>
              <span className="size-1.5 rounded-full" style={{ backgroundColor: tone }} aria-hidden />
              {label}{state === "unknown" ? " · call to confirm" : ""}
            </p>
          );
        })()}
        <FacilityDetails facility={facility} location={origin} compact availability={availability[facility.id] ?? null} availabilityLoading={availabilityLoading} availabilityError={availabilityFailedIds.has(facility.id) ? "Availability reports could not be loaded." : null} />
        <button type="button" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-accent underline underline-offset-4" onClick={() => { setSelectedId(facility.id); setView("map"); }}><MapPin size={13} aria-hidden />View on map</button>
      </Panel>)}</div>}
      <p className="text-[11px] leading-relaxed text-muted">Facility categories reflect explicit published source fields. Bed, ward and service availability is shown only when a verified health organisation has published a report, and is labelled organisation-reported rather than live monitoring. Reports older than one hour have their bed counts withheld. Call emergency services for urgent help; map routes are previews, and local road conditions may differ.</p>
    </>}
  </section>;
}
