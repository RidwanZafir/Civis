import { clientKey, fail, rateLimit, tooMany } from "@/lib/http";
import { nominatimFetch } from "@/lib/nominatim";

type RawPlace = { display_name: string; lat: string; lon: string; address?: { country_code?: string; state?: string; [key: string]: unknown } };
const cache = new Map<string, { at: number; data: unknown }>();

// Nominatim's public service permits at most one request per second. The shared
// queue also covers hospital fallback searches in the same server process.
async function lookup(endpoint: URL): Promise<unknown> {
  return nominatimFetch(async () => {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "CIVIS/1.0 emergency facility lookup", Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error("Location provider unavailable");
    return response.json();
  });
}

function place(raw: RawPlace) {
  return { label: raw.display_name, lat: Number(raw.lat), lng: Number(raw.lon), countryCode: raw.address?.country_code?.toUpperCase() ?? null, region: raw.address?.state ?? null };
}

export async function GET(request: Request) {
  const limit = rateLimit(clientKey(request, "emergency-location"), 20, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const reverse = url.searchParams.has("lat") && url.searchParams.has("lng");
  if (!reverse && (!query || query.length < 3 || query.length > 200)) return fail("Enter a city or address with 3 to 200 characters.", 400);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (reverse && (!url.searchParams.get("lat")?.trim() || !url.searchParams.get("lng")?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) return fail("Enter valid GPS coordinates.", 400);
  const key = reverse ? `reverse:${lat.toFixed(4)},${lng.toFixed(4)}` : `search:${query!.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) {
    if (reverse) {
      const cached = hit.data as { location: { lat: number; lng: number; address: string }; countryCode: string | null; region: string | null };
      return Response.json({ ...cached, location: { ...cached.location, lat, lng } });
    }
    return Response.json(hit.data);
  }
  const provider = process.env.CIVIS_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
  const endpoint = new URL(reverse ? "/reverse" : "/search", provider);
  endpoint.searchParams.set("format", "jsonv2");
  endpoint.searchParams.set("addressdetails", "1");
  if (reverse) {
    endpoint.searchParams.set("lat", String(lat));
    endpoint.searchParams.set("lon", String(lng));
    endpoint.searchParams.set("zoom", "18");
  } else {
    endpoint.searchParams.set("q", query!);
    endpoint.searchParams.set("limit", "6");
  }
  try {
    const raw = await lookup(endpoint);
    if (reverse ? !(raw as RawPlace)?.display_name : !Array.isArray(raw)) throw new Error("Location provider returned invalid data");
    const data = reverse ? (() => {
      const result = place(raw as RawPlace);
      return { location: { lat, lng, address: result.label }, countryCode: result.countryCode, region: result.region, source: "OpenStreetMap / Nominatim" };
    })() : { results: (raw as RawPlace[]).map(place), source: "OpenStreetMap / Nominatim" };
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), data });
    return Response.json(data);
  } catch {
    return fail("Location search is unavailable. Try again or enter GPS coordinates in Nearby Hospitals.", 502);
  }
}
