/**
 * Small geographic helpers shared by every map surface in CIVIS.
 *
 * Coordinate order is the single most common source of "my location is in the
 * wrong place" bugs. MapLibre takes [longitude, latitude]; the browser's
 * Geolocation API returns latitude and longitude as separate named fields.
 * Everything here therefore takes named arguments or an explicit [lng, lat]
 * tuple, never a bare pair of numbers.
 */

export type LngLat = [number, number];

export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

export function isValidLat(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLng(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

/** Rejects NaN, Infinity and out-of-range values before they reach the map. */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return isValidLat(lat) && isValidLng(lng);
}

export function bboxParam(bbox: Bbox): string {
  return [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
    .map((n) => Number(n.toFixed(5)))
    .join(",");
}

/** Expands a degenerate viewport so a tight zoom still returns neighbours. */
export function expandBbox(bbox: Bbox, factor = 0.15): Bbox {
  const padLng = Math.max((bbox.maxLng - bbox.minLng) * factor, 0.002);
  const padLat = Math.max((bbox.maxLat - bbox.minLat) * factor, 0.002);
  return {
    minLng: Math.max(-180, bbox.minLng - padLng),
    minLat: Math.max(-90, bbox.minLat - padLat),
    maxLng: Math.min(180, bbox.maxLng + padLng),
    maxLat: Math.min(90, bbox.maxLat + padLat),
  };
}

/**
 * A GPS accuracy radius as a GeoJSON polygon. MapLibre cannot draw a circle in
 * metres, so the ring is approximated; 64 steps is smooth at street zoom and
 * costs almost nothing to recompute.
 */
export function accuracyPolygon(lng: number, lat: number, radiusMeters: number, steps = 64) {
  const radius = Math.max(1, Math.min(radiusMeters, 200_000));
  const earthRadius = 6_378_137;
  const angular = radius / earthRadius;
  const latRad = (lat * Math.PI) / 180;
  const ring: LngLat[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
    );
    const pointLng =
      (lng * Math.PI) / 180 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(pointLat),
      );
    ring.push([(pointLng * 180) / Math.PI, (pointLat * 180) / Math.PI]);
  }

  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [ring] },
  };
}

export function formatDistance(meters: number | null | undefined): string {
  if (typeof meters !== "number" || !Number.isFinite(meters)) return "Accuracy unknown";
  if (meters < 10) return "Accurate to about 10 m";
  if (meters < 1000) return `Accurate to about ${Math.round(meters / 5) * 5} m`;
  return `Accurate to about ${(meters / 1000).toFixed(1)} km`;
}

export function formatCoordinate(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lng).toFixed(5)}° ${ew}`;
}
