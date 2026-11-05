import { registryFacility } from "@/lib/hospitals/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const from =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : undefined;

  const record = registryFacility(id, from);
  if (!record) {
    return Response.json({ error: "No facility with that identifier." }, { status: 404 });
  }
  return Response.json(record, { headers: { "Cache-Control": "private, no-store" } });
}
