import { searchPlaces } from "@/lib/portal";

/**
 * Local place search. Everything is answered from the `places` table, so no
 * external geocoding service (Google, Mapbox, Nominatim) is involved.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return Response.json({ results: [], message: "Type at least two characters." });
  }
  const results = searchPlaces(q, 8);
  return Response.json({
    results,
    message: results.length ? null : `No place matching “${q}” in the local dataset.`,
  });
}
