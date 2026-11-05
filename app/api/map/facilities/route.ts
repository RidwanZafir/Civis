import { facilitiesInBbox } from "@/lib/portal";

const ALLOWED = ["hospital", "emergency_department", "police", "fire", "ambulance", "shelter"];

/**
 * Facilities inside the current viewport. The map never asks for the whole
 * table: it sends a bounding box and only the enabled layer types.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const bboxRaw = url.searchParams.get("bbox");
  if (!bboxRaw) {
    return Response.json({ error: "A bbox parameter is required." }, { status: 422 });
  }
  const parts = bboxRaw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return Response.json({ error: "bbox must be minLng,minLat,maxLng,maxLat" }, { status: 422 });
  }
  const [minLng, minLat, maxLng, maxLat] = parts;

  const types = (url.searchParams.get("types") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => ALLOWED.includes(t));

  const facilities = facilitiesInBbox({ minLat, maxLat, minLng, maxLng }, types);
  return Response.json({ facilities, count: facilities.length, types });
}
