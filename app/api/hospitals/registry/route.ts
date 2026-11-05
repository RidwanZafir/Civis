import { districtsFor, registrySearch, registrySummary, upazilasFor } from "@/lib/hospitals/registry";

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

  const result = registrySearch({
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

  return Response.json(
    {
      ...result,
      summary: registrySummary(),
      districts: districtsFor(division || undefined),
      upazilas: district ? upazilasFor(district) : [],
      message:
        mode === "nearby" && !hasPoint
          ? "Share your location to search by distance, or browse the full Bangladesh directory."
          : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
