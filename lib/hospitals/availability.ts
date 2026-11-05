import type { AvailabilitySummary, Freshness, MedicalService, ServiceStatus, Ward, WardState } from "./types";
export function freshness(timestamp: string | null, now = Date.now()): Freshness {
  if (!timestamp) return "unknown";
  const age = now - Date.parse(timestamp);
  if (!Number.isFinite(age) || age < 0) return "unknown";
  return age <= 15 * 60_000 ? "recent" : age <= 60 * 60_000 ? "aging" : "stale";
}
export function freshVerified(timestamp: string | null, status: string, now = Date.now()): boolean {
  return status === "verified" && ["recent", "aging"].includes(freshness(timestamp, now));
}
export function wardAvailability(ward: Omit<Ward, "freshness" | "state" | "availabilityPercent" | "confirmedAvailableBeds">, now = Date.now()): Ward {
  const isConfirmed = freshVerified(ward.lastUpdatedAt, ward.verificationStatus, now);
  let state: WardState = "unknown";
  if (isConfirmed) {
    if (ward.admissionStatus === "closed") state = "closed";
    else if (ward.availableBeds === 0 && ward.admissionStatus === "full") state = "full";
    else if (ward.availableBeds !== null && ward.availableBeds > 0 && ["open", "limited"].includes(ward.admissionStatus)) state = ward.admissionStatus === "limited" ? "limited" : "available";
  }
  return { ...ward, freshness: freshness(ward.lastUpdatedAt, now), state, availabilityPercent: isConfirmed && ward.totalBeds !== null && ward.totalBeds > 0 && ward.availableBeds !== null ? Math.round(ward.availableBeds / ward.totalBeds * 1000) / 10 : null, confirmedAvailableBeds: ["available", "limited"].includes(state) ? ward.availableBeds : state === "full" ? 0 : null };
}
export function serviceAvailability(service: Omit<MedicalService, "freshness" | "effectiveStatus">, now = Date.now()): MedicalService {
  const effectiveStatus: ServiceStatus = service.exists && freshVerified(service.lastUpdatedAt, service.verificationStatus, now) ? service.availabilityStatus : "unknown";
  return { ...service, freshness: freshness(service.lastUpdatedAt, now), effectiveStatus };
}
export function summarizeAvailability(wards: Ward[], services: MedicalService[], now = Date.now()): AvailabilitySummary {
  const confirmed = wards.filter((ward) => ward.confirmedAvailableBeds !== null);
  const dates = [...wards, ...services].map((record) => record.lastUpdatedAt).filter((value): value is string => !!value && Date.parse(value) <= now).sort();
  const latestUpdatedAt = dates.at(-1) ?? null;
  return { availableWards: wards.filter((ward) => ["available", "limited"].includes(ward.state)).length, confirmedAvailableBeds: confirmed.length ? confirmed.reduce((sum, ward) => sum + (ward.confirmedAvailableBeds ?? 0), 0) : null, operationalServices: services.filter((service) => service.effectiveStatus === "available").length, restrictedServices: services.filter((service) => service.effectiveStatus === "restricted").length, unavailableServices: services.filter((service) => ["unavailable", "closed"].includes(service.effectiveStatus)).length, latestUpdatedAt, freshness: freshness(latestUpdatedAt, now), hasReportedData: !!latestUpdatedAt };
}
