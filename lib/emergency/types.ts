export type ServiceId = "general" | "police" | "fire" | "ambulance" | "coast_guard" | "search_rescue" | "disaster" | "hazmat";

export type OfficialSource = { name: string; url: string };
export type EmergencyCountry = {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  regions: { code: string; name: string }[];
};
export type EmergencyService = { id: ServiceId; name: string; description: string };
export type EmergencyContact = {
  id: string;
  countryCode: string;
  regionCode: string | null;
  serviceId: ServiceId;
  phoneNumber: string;
  voiceSupported: boolean;
  verificationStatus: "verified" | "unverified";
  coverage: string;
  source: OfficialSource;
  lastVerifiedAt: string;
  sms: {
    supported: boolean;
    number: string | null;
    eligibility: string;
    restrictions: string;
    source: OfficialSource | null;
    verifiedAt: string | null;
  };
};
export type IncidentCategory = {
  id: string;
  label: string;
  group: "accidents" | "fire" | "medical" | "other";
  serviceIds: ServiceId[];
  guidance: string[];
};
export type EmergencyDirectory = {
  countries: EmergencyCountry[];
  services: EmergencyService[];
  incidents: IncidentCategory[];
  country: EmergencyCountry;
  contacts: EmergencyContact[];
  coverageNote: string;
};
