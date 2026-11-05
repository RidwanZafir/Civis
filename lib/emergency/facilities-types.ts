export type FacilityLocation = { lat: number; lng: number; address: string };
export type FacilityKind = "hospital" | "clinic" | "fire" | "police" | "ambulance";
export type FacilityFilter = "all" | "emergency" | "trauma" | "public" | "private" | "clinic" | "children" | "specialized";
export type Facility = {
  id: string;
  name: string;
  kind: FacilityKind;
  lat: number;
  lng: number;
  address: string;
  distanceKm: number;
  phone: string | null;
  phoneVerified: boolean;
  phoneSource: string | null;
  phoneCheckedAt: string | null;
  website: string | null;
  photo: string | null;
  openingHours: string | null;
  emergencyDepartment: boolean | null;
  trauma: boolean;
  ownership: "public" | "private" | null;
  children: boolean;
  specialties: string[];
  capabilitySource: string | null;
  source: string;
  sourceUrl: string;
  updatedAt: string;
};
export type MapGeometry = {
  roads: { id: string; points: { lat: number; lng: number }[] }[];
  buildings: { id: string; points: { lat: number; lng: number }[]; height: number | null }[];
};
export type FacilityResult = {
  facilities: Facility[];
  geometry: MapGeometry;
  source: string;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  truncated: boolean;
  warning?: string;
};
export type FacilityRoute = { points: { lat: number; lng: number }[]; distanceKm: number; durationMinutes: number; source: string };
export const FACILITY_COLORS: Record<FacilityKind, string> = {
  hospital: "#5a9cff", clinic: "#5a9cff", ambulance: "#36d9ff", fire: "#f16d78", police: "#d4eaff",
};
export const FACILITY_FILTERS: { value: FacilityFilter; label: string }[] = [
  { value: "all", label: "All hospitals" }, { value: "emergency", label: "Emergency departments" },
  { value: "trauma", label: "Trauma centers" }, { value: "public", label: "Public hospitals" },
  { value: "private", label: "Private hospitals" }, { value: "clinic", label: "Clinics" },
  { value: "children", label: "Children's hospitals" }, { value: "specialized", label: "Specialized facilities" },
];
export function matchesFacilityFilter(facility: Facility, filter: FacilityFilter): boolean {
  if (filter === "clinic") return facility.kind === "clinic";
  if (facility.kind !== "hospital") return false;
  if (filter === "emergency") return facility.emergencyDepartment === true;
  if (filter === "trauma") return facility.trauma;
  if (filter === "public" || filter === "private") return facility.ownership === filter;
  if (filter === "children") return facility.children;
  if (filter === "specialized") return facility.specialties.length > 0;
  return true;
}
export function directionsUrl(facility: Facility, location?: FacilityLocation | null) {
  const params = new URLSearchParams({ api: "1", destination: `${facility.lat},${facility.lng}`, travelmode: "driving" });
  if (location) params.set("origin", `${location.lat},${location.lng}`);
  return `https://www.google.com/maps/dir/?${params}`;
}
