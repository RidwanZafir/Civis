import { all } from "@/lib/db";
import { haversineKm } from "@/lib/format";
import { nominatimFetch } from "@/lib/nominatim";
import { clientKey, fail, rateLimit, tooMany } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Turn a GPS fix into a place name using free data only.
 *
 * Primary: OpenStreetMap via Nominatim reverse geocoding (free, no key, rate
 * limited through the shared queue the rest of CIVIS already uses).
 * Fallback: the nearest row in the local `places` table, which reliably gives a
 * division and sometimes a district. The fallback is always reported as
 * approximate — it is a nearest-known-place heuristic, not a boundary lookup,
 * and the client labels it that way.
 */

type NominatimAddress = Record<string, string | undefined>;

type Place = {
  country: string | null;
  division: string | null;
  district: string | null;
  upazila: string | null;
  locality: string | null;
  road: string | null;
  label: string | null;
};

const cache = new Map<string, { at: number; data: unknown }>();

function pick(address: NominatimAddress, keys: string[]): string | null {
  for (const key of keys) {
    const value = address[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function buildLabel(place: Place): string | null {
  const parts = [place.locality, place.upazila, place.district, place.division, place.country].filter(
    (part): part is string => Boolean(part),
  );
  // Remove immediate duplicates such as "Sylhet, Sylhet".
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length ? unique.join(", ") : null;
}

/** Nearest local place. Explicitly a heuristic, never presented as exact. */
function nearestLocal(lat: number, lng: number) {
  const rows = all<{
    name: string;
    kind: string;
    division: string | null;
    district: string | null;
    lat: number;
    lng: number;
  }>("SELECT name, kind, division, district, lat, lng FROM places");

  let best: (typeof rows)[number] | null = null;
  let bestKm = Infinity;
  for (const row of rows) {
    const km = haversineKm({ lat, lng }, { lat: row.lat, lng: row.lng });
    if (km < bestKm) {
      bestKm = km;
      best = row;
    }
  }
  if (!best) return null;

  const divisionPlace = rows
    .filter((row) => row.kind === "division" && row.division)
    .sort((a, b) => haversineKm({ lat, lng }, { lat: a.lat, lng: a.lng }) - haversineKm({ lat, lng }, { lat: b.lat, lng: b.lng }))[0];

  return {
    division: divisionPlace?.division ?? best.division ?? null,
    district: best.kind === "district" || best.kind === "city" ? best.name : best.district ?? null,
    nearestName: best.name,
    nearestKind: best.kind,
    distanceKm: Math.round(bestKm * 10) / 10,
  };
}

export async function GET(request: Request) {
  const limit = rateLimit(clientKey(request, "reverse-location"), 30, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (
    !params.get("lat")?.trim() ||
    !params.get("lng")?.trim() ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return fail("Valid GPS coordinates are required.", 422);
  }

  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) {
    return Response.json(hit.data, { headers: { "Cache-Control": "private, no-store" } });
  }

  const local = nearestLocal(lat, lng);
  const provider = process.env.CIVIS_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
  const endpoint = new URL("/reverse", provider);
  endpoint.searchParams.set("format", "jsonv2");
  endpoint.searchParams.set("addressdetails", "1");
  endpoint.searchParams.set("zoom", "18");
  endpoint.searchParams.set("lat", String(lat));
  endpoint.searchParams.set("lon", String(lng));

  try {
    const raw = (await nominatimFetch(async () => {
      const response = await fetch(endpoint, {
        headers: { "User-Agent": "CIVIS/1.0 reverse location lookup", Accept: "application/json" },
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error("Location provider unavailable");
      return response.json();
    })) as { display_name?: string; address?: NominatimAddress };

    const address = raw.address ?? {};
    const place: Place = {
      country: pick(address, ["country"]) ?? "Bangladesh",
      division: pick(address, ["state", "region"]),
      district: pick(address, ["state_district", "county"]),
      upazila: pick(address, ["city_district", "municipality", "town", "village", "city"]),
      locality: pick(address, ["suburb", "neighbourhood", "quarter", "hamlet"]),
      road: pick(address, ["road", "pedestrian", "footway", "residential"]) ?? null,
      label: null,
    };
    place.label = buildLabel(place) ?? raw.display_name ?? null;

    const data = {
      ok: true,
      source: "OpenStreetMap / Nominatim",
      degraded: false,
      place: { ...place, label: raw.display_name ?? place.label },
      coordinates: { lat, lng },
    };
    if (cache.size >= 500) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), data });
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // Coordinates are still real; only the name lookup failed.
    const data = {
      ok: true,
      source: local ? "CIVIS local places" : "none",
      degraded: true,
      place: {
        country: "Bangladesh",
        division: local?.division ?? null,
        district: local?.district ?? null,
        upazila: null,
        locality: local?.nearestName ?? null,
        road: null,
        label: local
          ? `${local.nearestName} area (nearest known place, about ${local.distanceKm} km away)`
          : null,
      },
      coordinates: { lat, lng },
      note: "Detailed place name unavailable. Showing the nearest known administrative location.",
    };
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  }
}
