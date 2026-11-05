import { CITY } from "@/lib/constants";
import { fail } from "@/lib/http";

type Place = {
  label: string;
  lat: number;
  lng: number;
  type: string;
  bbox?: [number, number, number, number];
};

const cache = new Map<string, { at: number; data: Place[] }>();

/**
 * Server-side proxy for OpenStreetMap Nominatim. Proxying keeps a proper
 * identifying User-Agent on the request and lets us cache repeated searches.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 3) return Response.json({ results: [] });

  const key = `${CITY.name}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) {
    return Response.json({ results: hit.data, cached: true });
  }

  const endpoint = new URL("https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("q", q);
  endpoint.searchParams.set("format", "jsonv2");
  endpoint.searchParams.set("limit", "6");
  endpoint.searchParams.set("addressdetails", "0");
  endpoint.searchParams.set("viewbox", "88.20,22.75,88.55,22.40");
  endpoint.searchParams.set("bounded", "0");

  try {
    const res = await fetch(endpoint, {
      headers: {
        "User-Agent": "CIVIS civic reporting demo (local development)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return fail("Address lookup is unavailable right now.", 502);
    const raw = (await res.json()) as {
      display_name: string;
      lat: string;
      lon: string;
      type: string;
      boundingbox?: string[];
    }[];
    const results: Place[] = raw.map((r) => ({
      label: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      type: r.type,
      bbox: r.boundingbox
        ? [Number(r.boundingbox[1]), Number(r.boundingbox[0]), Number(r.boundingbox[3]), Number(r.boundingbox[2])]
        : undefined,
    }));
    cache.set(key, { at: Date.now(), data: results });
    return Response.json({ results });
  } catch {
    return fail("Address lookup timed out. Drop a pin on the map instead.", 504);
  }
}
