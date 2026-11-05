export type VerificationStatus = "verified" | "unverified";
export type Freshness = "recent" | "aging" | "stale" | "unknown";
export type AdmissionStatus = "open" | "limited" | "full" | "closed" | "unknown";
export type ServiceStatus = "available" | "restricted" | "unavailable" | "closed" | "unknown";
export type WardState = "available" | "limited" | "full" | "closed" | "unknown";
export type HospitalFacilityType = "hospital" | "clinic" | "specialized";
export type Hospital = {
  id: string; name: string; lat: number; lng: number; address: string | null;
  city: string | null; district: string | null; division: string | null; country: string;
  phone: string | null; phoneVerified: boolean; phoneSource: string | null;
  website: string | null; facilityType: HospitalFacilityType; emergencyDepartment: boolean | null;
  openingHours: string | null; ownership: "public" | "private" | null; trauma: boolean | null;
  children: boolean | null; specialties: string[]; source: string; sourceId: string; sourceUrl: string;
  lastImportedAt: string; lastVerifiedAt: string | null; verificationStatus: VerificationStatus;
  photo: string | null; version: number;
};
export type Ward = {
  id: string; hospitalId: string; code: string; name: string; group: "general" | "critical" | "specialized";
  totalBeds: number | null; availableBeds: number | null; occupiedBeds: number | null;
  admissionStatus: AdmissionStatus; lastUpdatedAt: string | null; source: string | null;
  verificationStatus: VerificationStatus; version: number; freshness: Freshness; state: WardState;
  availabilityPercent: number | null; confirmedAvailableBeds: number | null;
};
export type MedicalService = {
  id: string; hospitalId: string; code: string; name: string; group: "emergency" | "diagnostic" | "specialist" | "support";
  exists: boolean; availabilityStatus: ServiceStatus; operatingHours: string | null;
  emergencyAvailable: boolean | null; contact: string | null; contactVerified: boolean;
  lastUpdatedAt: string | null; source: string | null; verificationStatus: VerificationStatus;
  version: number; freshness: Freshness; effectiveStatus: ServiceStatus;
};
export type AvailabilitySummary = {
  availableWards: number; confirmedAvailableBeds: number | null; operationalServices: number;
  restrictedServices: number; unavailableServices: number; latestUpdatedAt: string | null;
  freshness: Freshness; hasReportedData: boolean;
};
export type HospitalProfile = { hospital: Hospital; wards: Ward[]; services: MedicalService[]; summary: AvailabilitySummary };
export type HospitalListItem = Hospital & { distanceKm: number | null; summary: AvailabilitySummary; wards: Ward[]; services: MedicalService[]; matchingRequirements: number };
export type HospitalSearch = {
  lat?: number; lng?: number; radius?: number | "all"; facility?: string; q?: string;
  country?: string; division?: string; district?: string; wards?: string[]; services?: string[];
  sort?: "nearest" | "farthest" | "updated" | "beds" | "matching"; page?: number; pageSize?: number;
};
export type HospitalSearchResult = { hospitals: HospitalListItem[]; total: number; page: number; pageSize: number; coverageAvailable: boolean; asOf: string };
export type AvailabilityHistory = { id: string; hospitalId: string; resourceType: string; resourceId: string; previous: unknown; current: unknown; updatedAt: string; source: string; note: string; actorLabel: string };
export type HospitalAccount = { id: string; hospitalId: string; userId: string; userName: string; userEmail: string; role: "representative" | "manager"; verificationStatus: "pending" | "approved" | "rejected" | "revoked"; evidence: string; createdAt: string; reviewedAt: string | null; reviewNote: string | null };
export type RegistrationRequest = { id: string; userId: string; hospitalId: string | null; proposedHospital: Partial<Hospital> | null; evidence: string; status: "pending" | "approved" | "rejected"; createdAt: string; reviewedAt: string | null; reviewNote: string | null; userName?: string; userEmail?: string };
export type HospitalManagement = { hospitals: HospitalProfile[]; accounts: HospitalAccount[]; requests: RegistrationRequest[]; isAdmin: boolean };
export type WardUpdate = { id?: string; code: string; name: string; group: Ward["group"]; totalBeds: number | null; availableBeds: number | null; occupiedBeds: number | null; admissionStatus: AdmissionStatus; expectedVersion?: number };
export type ServiceUpdate = { id?: string; code: string; name: string; group: MedicalService["group"]; exists: boolean; availabilityStatus: ServiceStatus; operatingHours: string | null; emergencyAvailable: boolean | null; contact?: string | null; expectedVersion?: number };
export type PublishUpdate = { hospitalId: string; source: string; note: string; hospital?: Partial<Pick<Hospital, "name" | "address" | "city" | "district" | "division" | "phone" | "website" | "openingHours">> & { expectedVersion: number }; wards?: WardUpdate[]; services?: ServiceUpdate[] };

/** A full report as returned to the verified organisation that owns it. */
export type HospitalAvailabilityDetail = {
  facilityId: string;
  organisation: { id: string; name: string };
  version: number;
  source: string;
  note: string | null;
  updatedAt: string;
  wards: Ward[];
  services: MedicalService[];
  summary: AvailabilitySummary;
  stale: boolean;
};

export type PublicWardAvailability = {
  code: string;
  name: string;
  group: Ward["group"];
  state: WardState;
  freshness: Freshness;
  totalBeds: number | null;
  confirmedAvailableBeds: number | null;
  lastUpdatedAt: string | null;
};

export type PublicServiceAvailability = {
  code: string;
  name: string;
  group: MedicalService["group"];
  status: ServiceStatus;
  freshness: Freshness;
  operatingHours: string | null;
  emergencyAvailable: boolean | null;
  lastUpdatedAt: string | null;
};

/** Sanitised shape exposed to the public facility finder. Raw stale counts are
 * deliberately excluded; only confirmed bed figures are published. */
export type PublicHospitalAvailability = {
  facilityId: string;
  organisation: { id: string; name: string };
  version: number;
  source: string;
  note: string | null;
  updatedAt: string;
  summary: AvailabilitySummary;
  wards: PublicWardAvailability[];
  services: PublicServiceAvailability[];
  stale: boolean;
};

export type HospitalLinkRow = {
  id: string;
  facilityId: string;
  facilityName: string;
  facilityKind: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  departmentId: string;
  departmentName: string;
  departmentType: string;
  linkStatus: "pending" | "approved" | "rejected" | "revoked";
  requestedBy: string;
  requestedByName: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  availabilityVersion: number | null;
  availabilityUpdatedAt: string | null;
  wardCount: number;
  serviceCount: number;
};

export type HospitalCandidate = {
  id: string;
  name: string;
  address: string;
  kind: string;
  lat: number;
  lng: number;
  linkStatus: string | null;
};

export type HospitalAvailabilityHistoryRow = {
  id: string;
  resourceType: "profile" | "ward" | "service";
  resourceId: string | null;
  previous: unknown;
  current: unknown;
  source: string | null;
  note: string | null;
  actorLabel: string | null;
  createdAt: string;
};

export type PublishHospitalAvailabilityInput = {
  expectedVersion: number;
  source: string;
  note?: string | null;
  wards: {
    code: string;
    totalBeds: number | null;
    availableBeds: number | null;
    admissionStatus: AdmissionStatus;
  }[];
  services: {
    code: string;
    exists: boolean;
    availabilityStatus: ServiceStatus;
    operatingHours?: string | null;
    emergencyAvailable?: boolean | null;
    contact?: string | null;
  }[];
};
