import { findFacilities, findFacilityRoute, findMapGeometry } from "@/lib/emergency/facilities";
import { clientKey, fail, rateLimit, tooMany } from "@/lib/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!params.has("lat") || !params.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail("Enter a valid location to search for facilities.");
  const limit = rateLimit(clientKey(request, "emergency-facilities"), 40, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);
  try {
    if (params.get("mode") === "geometry") return Response.json({ geometry: await findMapGeometry(lat, lng) });
    if (params.get("mode") === "route") {
      const toLat = Number(params.get("toLat")); const toLng = Number(params.get("toLng"));
      if (!params.has("toLat") || !params.has("toLng") || !Number.isFinite(toLat) || !Number.isFinite(toLng) || Math.abs(toLat) > 90 || Math.abs(toLng) > 180) return fail("Choose a valid hospital destination.");
      return Response.json({ route: await findFacilityRoute(lat, lng, toLat, toLng) });
    }
    const radius = Number(params.get("radius") ?? "5");
    if (![2, 5, 10, 25, 50].includes(radius)) return fail("Choose a search radius of 2, 5, 10, 25 or 50 km.");
    return Response.json(await findFacilities(lat, lng, radius));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Hospital lookup unavailable. Please try again.", 502);
  }
}
