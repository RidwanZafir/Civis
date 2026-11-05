import {
  districtsFor,
  registrySearch,
  registrySummary,
  upazilasFor,
  type RegistryFacility,
} from "@/lib/hospitals/registry";
import { findFacilities } from "@/lib/emergency/facilities";
import type { Facility } from "@/lib/emergency/facilities-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RADII = [2, 5, 10, 25, 50];

/**
 * Nationwide hospital directory search.
 *
 * `mode=nearby` needs a real coordinate and sorts by distance; without one it
 * returns an empty set and says why, rather than guessing a location.
 * `mode=region` is the directory, optionally scoped by division/district.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const mode = params.get("mode") === "nearby" ? "nearby" : "region";
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const hasPoint =
    params.has("lat") &&
    params.has("lng") &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  const radiusRaw = Number(params.get("radius") ?? "10");
  const radiusKm = RADII.includes(radiusRaw) ? radiusRaw : 10;

  const division = (params.get("division") ?? "").trim();
  const district = (params.get("district") ?? "").trim();

  const filters = {
    q: (params.get("q") ?? "").trim() || undefined,
    category: (params.get("category") ?? "").trim() || undefined,
    ownership: (params.get("ownership") ?? "").trim() || undefined,
  };
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(params.get("pageSize") ?? 24) || 24));

  let result = registrySearch({
    mode,
    division: division || undefined,
    q: (params.get("q") ?? "").trim() || undefined,
    district: district || undefined,
    upazila: (params.get("upazila") ?? "").trim() || undefined,
    category: (params.get("category") ?? "").trim() || undefined,
    ownership: (params.get("ownership") ?? "").trim() || undefined,
    lat: hasPoint ? lat : undefined,
    lng: hasPoint ? lng : undefined,
    radiusKm,
    page: Number(params.get("page") ?? 1),
    pageSize: Number(params.get("pageSize") ?? 24),
  });

  // The official registry publishes no coordinates, so a distance search over
  // it is usually empty. Fall back to live OpenStreetMap hospitals and clinics,
  // which do carry real coordinates.
  let source: "registry" | "openstreetmap" = "registry";
  let notice: string | null = null;
  if (mode === "nearby" && hasPoint && result.total === 0) {
    try {
      const live = await findFacilities(lat, lng, radiusKm);
      const items = live.facilities
        .filter((facility) => facility.kind === "hospital" || facility.kind === "clinic")
        .map(fromOsm)
        .filter((item) => matches(item, filters));
      const start = (page - 1) * pageSize;
      result = {
        items: items.slice(start, start + pageSize),
        total: items.length,
        page,
        pageSize,
        asOf: live.fetchedAt,
        mode: "nearby",
      };
      source = "openstreetmap";
      notice = live.warning ?? null;
    } catch (error) {
      notice = error instanceof Error ? error.message : "Live hospital data is temporarily unavailable.";
    }
  }

  return Response.json(
    {
      ...result,
      source,
      summary: registrySummary(),
      districts: districtsFor(division || undefined),
      upazilas: district ? upazilasFor(district) : [],
      message:
        mode === "nearby" && !hasPoint
          ? "Share your location to search by distance, or browse the full directory."
          : notice,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

function fromOsm(facility: Facility): RegistryFacility {
  return {
    id: facility.id,
    name: facility.name,
    nameBn: null,
    category: facility.kind === "clinic" ? "clinic" : facility.specialties.length ? "specialized" : "hospital",
    facilityType: facility.emergencyDepartment ? "Hospital with emergency department" : null,
    ownership: facility.ownership,
    agency: null,
    division: null,
    district: null,
    upazila: null,
    cityCorporation: null,
    address: facility.address,
    lat: facility.lat,
    lng: facility.lng,
    locationStatus: "verified",
    phone: facility.phone,
    email: null,
    active: null,
    source: "OpenStreetMap",
    sourceId: facility.id,
    sourceUrl: facility.sourceUrl,
    importedAt: facility.updatedAt,
    distanceKm: Math.round(facility.distanceKm * 10) / 10,
  };
}

function matches(item: RegistryFacility, filters: { q?: string; category?: string; ownership?: string }) {
  if (filters.q && !`${item.name} ${item.address ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
  if (filters.category && item.category !== filters.category) return false;
  if (filters.ownership && item.ownership !== filters.ownership) return false;
  return true;
}
