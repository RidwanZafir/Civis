import { getEmergencyDirectory } from "@/lib/emergency/directory";
import { fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const countryCode = (params.get("country") ?? "BD").toUpperCase();
  const regionCode = params.get("region") || undefined;
  if (!/^[A-Z]{2}$/.test(countryCode)) return fail("Choose a valid country.");
  try {
    return Response.json(getEmergencyDirectory(countryCode, regionCode), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Emergency directory is unavailable.", 400);
  }
}
