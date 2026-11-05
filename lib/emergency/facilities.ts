import { all, exec, get, run, transaction } from "@/lib/db";
import { nominatimFetch } from "@/lib/nominatim";
import type { Facility, FacilityKind, FacilityResult, FacilityRoute, MapGeometry } from "./facilities-types";

/**
 * Facility discovery.
 *
 * Overpass is excellent for arbitrary OSM queries but its public instances are
 * frequently saturated; a 25 second timeout used to leave the hospital finder
 * blank. Photon (the OpenStreetMap search index) answers the same geographic
 * question in well under a second, so it is the primary provider here.
 *
 * Results are still persisted locally. If the provider is unreachable, the
 * finder first serves its exact-request cache and then any previously stored
 * facilities that fall inside the requested radius. Nothing is invented when
 * neither source has data.
 */

type PhotonProperties = Record<string, unknown>;
type PhotonFeature = { geometry?: { type?: string; coordinates?: unknown }; properties?: PhotonProperties };
type PhotonResponse = { features?: PhotonFeature[] };
type NominatimPlace = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  category?: string;
  type?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
};

const TTL = 10 * 60_000;
const LIMIT = 350;
const PROVIDER_LIMIT = 50;
const PROVIDER_TIMEOUT = 3_000;
const NOMINATIM_TIMEOUT = 6_000;
const pending = new Map<string, Promise<FacilityResult>>();
let schemaReady = false;

const TAG_QUERIES = [
  { q: "hospital", tag: "amenity:hospital" },
  { q: "clinic", tag: "amenity:clinic" },
  { q: "fire station", tag: "amenity:fire_station" },
  { q: "police station", tag: "amenity:police" },
  { q: "ambulance", tag: "emergency:ambulance_station" },
] as const;

export function ensureFacilitySchema() {
  if (schemaReady) return;
  exec(`CREATE TABLE IF NOT EXISTS emergency_facilities (id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,source_url TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS facility_locations (facility_id TEXT PRIMARY KEY REFERENCES emergency_facilities(id) ON DELETE CASCADE,lat REAL NOT NULL,lng REAL NOT NULL,address TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_facility_coordinates ON facility_locations(lat,lng);
    CREATE TABLE IF NOT EXISTS hospital_details (facility_id TEXT PRIMARY KEY REFERENCES emergency_facilities(id) ON DELETE CASCADE,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS facility_contacts (facility_id TEXT PRIMARY KEY REFERENCES emergency_facilities(id) ON DELETE CASCADE,phone TEXT,verified INTEGER NOT NULL DEFAULT 0,source_url TEXT,checked_at TEXT);
    CREATE TABLE IF NOT EXISTS emergency_facility_cache (key TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at INTEGER NOT NULL);`);
  schemaReady = true;
}

export function geographicDistance(lat: number, lng: number, otherLat: number, otherLng: number) {
  const radians = Math.PI / 180;
  const a = Math.sin((otherLat - lat) * radians / 2) ** 2 + Math.cos(lat * radians) * Math.cos(otherLat * radians) * Math.sin((otherLng - lng) * radians / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/** A latitude/longitude box that fully contains the requested radius. */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  return { minLat: lat - latDelta, maxLat: lat + latDelta, minLng: lng - lngDelta, maxLng: lng + lngDelta };
}

function safeUrl(value?: string): string | null {
  if (!value) return null;
  try { const url = new URL(value.startsWith("www.") ? `https://${value}` : value); return ["https:", "http:"].includes(url.protocol) ? url.toString() : null; } catch { return null; }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function officialOverlay(facility: Facility): Facility {
  // Contacts checked directly against the facility's own publication. Geographic
  // and identity checks keep similarly named facilities in other cities separate.
  if (facility.lat < 23.65 || facility.lat > 23.9 || facility.lng < 90.25 || facility.lng > 90.5) return facility;
  let host = "";
  try { host = new URL(facility.website ?? "").hostname.replace(/^www\./, ""); } catch { /* No official identity match. */ }
  if (host === "evercarebd.com" && /evercare|apollo/i.test(facility.name)) {
    return { ...facility, phone: "10678", phoneVerified: true, phoneSource: "https://www.evercarebd.com/en/dhaka/query", phoneCheckedAt: "2026-11-04", emergencyDepartment: true, trauma: true, ownership: "private", capabilitySource: "https://www.evercarebd.com/en/dhaka/specialities/accident-emergency" };
  }
  if (host === "squarehospital.com" && /square/i.test(facility.name)) {
    return { ...facility, phone: "+8809610010616", phoneVerified: true, phoneSource: "https://squarehospital.com/index.php/departments", phoneCheckedAt: "2026-11-04", ownership: "private", capabilitySource: "https://squarehospital.com/index.php/about-us" };
  }
  return facility;
}

function facilityKind(properties: PhotonProperties): FacilityKind | null {
  const key = text(properties.osm_key);
  const value = text(properties.osm_value);
  if ((key === "amenity" || key === "healthcare") && value === "hospital") return "hospital";
  if ((key === "amenity" || key === "healthcare") && value === "clinic") return "clinic";
  if (key === "amenity" && value === "fire_station") return "fire";
  if (key === "amenity" && value === "police") return "police";
  if (key === "emergency" && value === "ambulance_station") return "ambulance";
  return null;
}

const OSM_PATH: Record<string, string> = { N: "node", W: "way", R: "relation" };

export function parseFacilities(features: PhotonFeature[], lat: number, lng: number, radius: number, updatedAt: string, source = "OpenStreetMap contributors via Photon"): Facility[] {
  const parsed = features.flatMap((feature): Facility[] => {
    const properties = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    const point = { lng: Number(coordinates[0]), lat: Number(coordinates[1]) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return [];

    const kind = facilityKind(properties);
    if (!kind) return [];
    const osmType = text(properties.osm_type)?.toUpperCase();
    const osmId = Number(properties.osm_id);
    const path = osmType ? OSM_PATH[osmType] : undefined;
    if (!path || !Number.isInteger(osmId)) return [];

    const distanceKm = geographicDistance(lat, lng, point.lat, point.lng);
    if (distanceKm > radius) return [];

    const name = text(properties.name) ?? text(properties["name:en"]) ?? `Unnamed ${kind}`;
    const specialties = (text(properties["healthcare:speciality"]) ?? "").split(";").map((value) => value.trim()).filter((value) => value && value !== "general");
    const address = [
      text(properties.housenumber), text(properties.street), text(properties.locality),
      text(properties.district), text(properties.city), text(properties.postcode), text(properties.country),
    ].filter(Boolean).join(", ");
    const sourceUrl = `https://www.openstreetmap.org/${path}/${osmId}`;
    const rawPhone = text(properties["contact:phone"]) ?? text(properties.phone) ?? text(properties.telephone);
    const phone = rawPhone && /^[+\d][\d ()-]{2,30}$/.test(rawPhone.split(";")[0].trim()) ? rawPhone.split(";")[0].trim() : null;
    const operatorType = text(properties["operator:type"]) ?? text(properties.ownership) ?? text(properties.operator);
    const ownership = operatorType && ["government", "public"].includes(operatorType) ? "public" : operatorType && operatorType === "private" ? "private" : null;
    const emergency = text(properties.emergency);
    const facility: Facility = {
      id: `osm:${path}:${osmId}`,
      name,
      kind,
      ...point,
      address: text(properties["addr:full"]) ?? (address || "Full address not published in source data"),
      distanceKm,
      phone,
      phoneVerified: false,
      phoneSource: phone ? sourceUrl : null,
      phoneCheckedAt: null,
      website: safeUrl(text(properties["contact:website"]) ?? text(properties.website) ?? undefined),
      photo: safeUrl(text(properties.image) ?? undefined),
      openingHours: text(properties.opening_hours),
      emergencyDepartment: kind === "hospital" && emergency === "yes" ? true : kind === "hospital" && emergency === "no" ? false : null,
      trauma: specialties.includes("trauma") || text(properties["healthcare:trauma_center"]) === "yes",
      ownership,
      children: specialties.length === 1 && (specialties[0] === "paediatrics" || specialties[0] === "pediatrics"),
      specialties,
      capabilitySource: sourceUrl,
      source,
      sourceUrl,
      updatedAt,
    };
    return [officialOverlay(facility)];
  });

  // OSM can map the same site as both a node and a surrounding area.
  const deduped: Facility[] = [];
  for (const facility of parsed.sort((a, b) => a.distanceKm - b.distanceKm)) {
    const duplicate = deduped.find((item) => item.kind === facility.kind && item.name.toLocaleLowerCase() === facility.name.toLocaleLowerCase() && geographicDistance(item.lat, item.lng, facility.lat, facility.lng) < 0.15);
    if (!duplicate) deduped.push(facility);
  }
  return deduped.slice(0, LIMIT);
}

function storeFacilityRows(facilities: Facility[]) {
  for (const facility of facilities) {
    run("INSERT INTO emergency_facilities(id,name,kind,source_url,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,source_url=excluded.source_url,updated_at=excluded.updated_at", [facility.id, facility.name, facility.kind, facility.sourceUrl, facility.updatedAt]);
    run("INSERT INTO facility_locations(facility_id,lat,lng,address) VALUES(?,?,?,?) ON CONFLICT(facility_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,address=excluded.address", [facility.id, facility.lat, facility.lng, facility.address]);
    run("INSERT INTO hospital_details(facility_id,payload) VALUES(?,?) ON CONFLICT(facility_id) DO UPDATE SET payload=excluded.payload", [facility.id, JSON.stringify(facility)]);
    // An import of independently verified contact data survives OSM refreshes.
    run("INSERT INTO facility_contacts(facility_id,phone,verified,source_url,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(facility_id) DO UPDATE SET phone=CASE WHEN excluded.verified=1 OR facility_contacts.verified=0 THEN excluded.phone ELSE facility_contacts.phone END,verified=MAX(excluded.verified,facility_contacts.verified),source_url=CASE WHEN excluded.verified=1 OR facility_contacts.verified=0 THEN excluded.source_url ELSE facility_contacts.source_url END,checked_at=CASE WHEN excluded.verified=1 THEN excluded.checked_at ELSE facility_contacts.checked_at END", [facility.id, facility.phone, facility.phoneVerified ? 1 : 0, facility.phoneSource, facility.phoneCheckedAt]);
  }
}

/** Persist facilities discovered outside the nearby-search endpoint, such as a
 * health organisation finding its own hospital while requesting a link. */
export function storeFacilities(facilities: Facility[]) {
  if (!facilities.length) return;
  ensureFacilitySchema();
  transaction(() => storeFacilityRows(facilities));
}

function persist(result: FacilityResult, key: string, cacheable: boolean) {
  transaction(() => {
    storeFacilityRows(result.facilities);
    if (cacheable) {
      run("INSERT INTO emergency_facility_cache(key,payload,fetched_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at", [key, JSON.stringify(result), Date.now()]);
    }
    run("DELETE FROM emergency_facility_cache WHERE fetched_at < ?", [Date.now() - 7 * 24 * 60 * 60_000]);
  });
}

function verifiedContacts(result: FacilityResult): FacilityResult {
  if (!result.facilities.length) return result;
  const contacts = all<{ facility_id: string; phone: string; source_url: string; checked_at: string }>(`SELECT facility_id,phone,source_url,checked_at FROM facility_contacts WHERE verified=1 AND source_url IS NOT NULL AND checked_at IS NOT NULL AND facility_id IN (${result.facilities.map(() => "?").join(",")})`, result.facilities.map((facility) => facility.id));
  const byId = new Map(contacts.map((contact) => [contact.facility_id, contact]));
  return { ...result, facilities: result.facilities.map((facility) => { const contact = byId.get(facility.id); return contact ? { ...facility, phone: contact.phone, phoneVerified: true, phoneSource: contact.source_url, phoneCheckedAt: contact.checked_at } : facility; }) };
}

async function fetchTag(query: typeof TAG_QUERIES[number], box: ReturnType<typeof boundingBox>): Promise<PhotonFeature[]> {
  const endpoint = process.env.CIVIS_PHOTON_URL ?? "https://photon.komoot.io/api/";
  const url = new URL(endpoint);
  url.searchParams.set("q", query.q);
  url.searchParams.set("limit", String(PROVIDER_LIMIT));
  url.searchParams.set("bbox", [box.minLng, box.minLat, box.maxLng, box.maxLat].map((value) => value.toFixed(5)).join(","));
  url.searchParams.set("osm_tag", query.tag);
  url.searchParams.set("lang", "en");
  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "CIVIS/1.0 emergency facility discovery", Accept: "application/json" },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Facility provider returned ${response.status}.`);
  const data = await response.json() as PhotonResponse;
  if (!Array.isArray(data.features)) throw new Error("Facility provider returned an unexpected response.");
  return data.features;
}

function nominatimFeature(place: NominatimPlace): PhotonFeature | null {
  const prefix = place.osm_type === "node" ? "N" : place.osm_type === "way" ? "W" : place.osm_type === "relation" ? "R" : null;
  const id = Number(place.osm_id);
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!prefix || !Number.isInteger(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = place.address ?? {};
  const extra = place.extratags ?? {};
  return {
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      osm_type: prefix,
      osm_id: id,
      osm_key: place.category,
      osm_value: place.type,
      name: place.name ?? place.display_name?.split(",")[0]?.trim(),
      housenumber: address.house_number,
      street: address.road,
      locality: address.neighbourhood ?? address.suburb ?? address.quarter,
      district: address.city_district ?? address.county,
      city: address.city ?? address.town ?? address.village ?? address.municipality,
      postcode: address.postcode,
      country: address.country,
      phone: extra.phone,
      "contact:phone": extra["contact:phone"],
      website: extra.website,
      "contact:website": extra["contact:website"],
      opening_hours: extra.opening_hours,
      emergency: extra.emergency,
      "healthcare:speciality": extra["healthcare:speciality"],
      "operator:type": extra["operator:type"],
      ownership: extra.ownership,
      image: extra.image,
    },
  };
}

async function nominatimSearch(amenity: string, box: ReturnType<typeof boundingBox>): Promise<PhotonFeature[]> {
  return nominatimFetch(async () => {
    const endpoint = process.env.CIVIS_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org/search";
    const url = new URL(endpoint);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(PROVIDER_LIMIT));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("bounded", "1");
    url.searchParams.set("viewbox", [box.minLng, box.maxLat, box.maxLng, box.minLat].map((value) => value.toFixed(5)).join(","));
    url.searchParams.set("amenity", amenity);
    url.searchParams.set("accept-language", "en");
    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "CIVIS/1.0 emergency facility discovery", Accept: "application/json" },
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Facility search returned ${response.status}.`);
    const data = await response.json() as NominatimPlace[];
    if (!Array.isArray(data)) throw new Error("Facility search returned an unexpected response.");
    return data.map(nominatimFeature).filter((feature): feature is PhotonFeature => feature !== null);
  });
}

/** Previously stored facilities inside the radius, used only when live data fails. */
function storedFacilities(lat: number, lng: number, radius: number): FacilityResult | null {
  const box = boundingBox(lat, lng, radius);
  let rows: { payload: string }[];
  try {
    rows = all<{ payload: string }>(
      `SELECT h.payload FROM facility_locations l
       JOIN hospital_details h ON h.facility_id = l.facility_id
       WHERE l.lat BETWEEN ? AND ? AND l.lng BETWEEN ? AND ?
       LIMIT 700`,
      [box.minLat, box.maxLat, box.minLng, box.maxLng],
    );
  } catch { return null; }

  const seen = new Set<string>();
  const facilities: Facility[] = [];
  let newest = 0;
  for (const row of rows) {
    try {
      const facility = JSON.parse(row.payload) as Facility;
      if (!facility?.id || seen.has(facility.id)) continue;
      const distanceKm = geographicDistance(lat, lng, facility.lat, facility.lng);
      if (!Number.isFinite(distanceKm) || distanceKm > radius) continue;
      seen.add(facility.id);
      facilities.push({ ...facility, distanceKm });
      const updated = Date.parse(facility.updatedAt);
      if (Number.isFinite(updated) && updated > newest) newest = updated;
    } catch { /* Ignore a damaged stored row; never guess a facility. */ }
  }
  if (!facilities.length) return null;
  facilities.sort((a, b) => a.distanceKm - b.distanceKm);
  return {
    facilities: facilities.slice(0, LIMIT),
    geometry: { roads: [], buildings: [] },
    source: "Stored OpenStreetMap records",
    fetchedAt: newest ? new Date(newest).toISOString() : new Date(0).toISOString(),
    cached: true,
    stale: true,
    truncated: facilities.length > LIMIT,
    warning: `Live facility lookup is unavailable. Showing ${Math.min(facilities.length, LIMIT)} previously stored facilities; check the source date before relying on them.`,
  };
}

export async function findFacilities(lat: number, lng: number, radius: number): Promise<FacilityResult> {
  ensureFacilitySchema();
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}:${radius}`;
  const cache = get<{ payload: string; fetched_at: number }>("SELECT payload,fetched_at FROM emergency_facility_cache WHERE key=?", [key]);
  const forLocation = (result: FacilityResult): FacilityResult => ({ ...result, facilities: result.facilities.map((facility) => ({ ...facility, distanceKm: geographicDistance(lat, lng, facility.lat, facility.lng) })).filter((facility) => facility.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm) });
  if (cache && Date.now() - cache.fetched_at < TTL) return forLocation(verifiedContacts({ ...JSON.parse(cache.payload), cached: true }));
  const existing = pending.get(key);
  if (existing) return forLocation(await existing);

  const operation = (async () => {
    const box = boundingBox(lat, lng, radius);
    // Photon is the fast provider. Nominatim is queried at the same time as a
    // dependable hospital fallback because a single public index can throttle
    // or go offline without warning.
    const photonTask = Promise.allSettled(TAG_QUERIES.map((query) => fetchTag(query, box)));
    const hospitalTask = nominatimSearch("hospital", box).catch(() => null);
    const [settled, hospitalFeatures] = await Promise.all([photonTask, hospitalTask]);

    const features: PhotonFeature[] = [];
    let photonFailures = 0;
    let capped = false;
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        features.push(...outcome.value);
        if (outcome.value.length >= PROVIDER_LIMIT) capped = true;
      } else {
        photonFailures += 1;
      }
    }

    const photonFailed = photonFailures === TAG_QUERIES.length;
    const nominatimUsed = Array.isArray(hospitalFeatures);
    if (hospitalFeatures) {
      features.push(...hospitalFeatures);
      if (hospitalFeatures.length >= PROVIDER_LIMIT) capped = true;
    }

    if (photonFailed && !nominatimUsed) {
      if (cache) return forLocation(verifiedContacts({ ...JSON.parse(cache.payload), cached: true, stale: true, warning: "Live facility lookup is unavailable. Showing previously retrieved facility data; check its date." }));
      const stored = storedFacilities(lat, lng, radius);
      if (stored) return forLocation(verifiedContacts(stored));
      throw new Error("Live facility data is temporarily unavailable, and no stored records cover this area yet. Try again shortly or use the emergency contacts above.");
    }

    let warning: string | undefined;
    if (photonFailed) {
      let clinicMissing = false;
      try {
        const clinics = await nominatimSearch("clinic", box);
        features.push(...clinics);
        if (clinics.length >= PROVIDER_LIMIT) capped = true;
      } catch {
        clinicMissing = true;
      }
      warning = `The fast map index is unavailable. Showing hospital${clinicMissing ? "" : " and clinic"} records from OpenStreetMap's Nominatim search; fire, police and ambulance stations may be missing.`;
    } else if (photonFailures) {
      warning = "Some facility categories could not be refreshed. The facilities shown are complete for the categories that responded.";
    }

    const providers = [...(photonFailed ? [] : ["Photon"]), ...(nominatimUsed ? ["Nominatim"] : [])];
    const resultSource = `OpenStreetMap contributors via ${providers.join(" and ")}`;
    const fetchedAt = new Date().toISOString();
    const result: FacilityResult = {
      facilities: parseFacilities(features, lat, lng, radius, fetchedAt, resultSource),
      geometry: { roads: [], buildings: [] },
      source: resultSource,
      fetchedAt,
      cached: false,
      stale: false,
      truncated: capped,
      warning,
    };
    persist(result, key, photonFailures === 0);
    return forLocation(verifiedContacts(result));
  })().finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}

export async function findMapGeometry(lat: number, lng: number): Promise<MapGeometry> {
  const query = `[out:json][timeout:15];(way(around:700,${lat},${lng})[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|service)$"];way(around:700,${lat},${lng})[building];);out tags geom 160;`;
  const response = await fetch(process.env.CIVIS_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "CIVIS emergency facility discovery" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error("Map outlines are currently unavailable.");
  const data = await response.json() as { elements?: { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] };
  const geometry: MapGeometry = { roads: [], buildings: [] };
  for (const element of data.elements ?? []) {
    if (!element.geometry?.length) continue;
    const points = element.geometry.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)).map((point) => ({ lat: point.lat, lng: point.lon }));
    if (element.tags?.highway) geometry.roads.push({ id: String(element.id), points });
    else if (element.tags?.building && points.length > 3) {
      const rawHeight = Number.parseFloat(element.tags.height ?? "");
      const levels = Number.parseFloat(element.tags["building:levels"] ?? "");
      geometry.buildings.push({ id: String(element.id), points, height: Number.isFinite(rawHeight) ? rawHeight : Number.isFinite(levels) ? levels * 3 : null });
    }
  }
  return geometry;
}

export async function findFacilityRoute(lat: number, lng: number, destinationLat: number, destinationLng: number): Promise<FacilityRoute> {
  const base = process.env.CIVIS_ROUTING_URL ?? "https://router.project-osrm.org";
  const response = await fetch(`${base}/route/v1/driving/${lng},${lat};${destinationLng},${destinationLat}?overview=full&geometries=geojson`, { headers: { "User-Agent": "CIVIS emergency facility discovery" }, signal: AbortSignal.timeout(9_000), cache: "no-store" });
  if (!response.ok) throw new Error("Route preview unavailable. Use Get Directions for navigation.");
  const data = await response.json() as { code: string; routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] };
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route) throw new Error("No driving route found. Use Get Directions to choose another route.");
  return { points: route.geometry.coordinates.map(([longitude, latitude]) => ({ lat: latitude, lng: longitude })), distanceKm: route.distance / 1000, durationMinutes: route.duration / 60, source: "OSRM / OpenStreetMap, estimated driving route" };
}
