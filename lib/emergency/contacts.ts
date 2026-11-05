import type { EmergencyContact, OfficialSource, ServiceId } from "./types";

// Review date records when the cited official page was checked for this release,
// not a claim that the service was contacted or that the number was test-called.
export const DIRECTORY_REVIEW_DATE = "2026-11-04";
const source = (name: string, url: string): OfficialSource => ({ name, url });
const sources = {
  bd: source("Bangladesh Police Telecommunications", "https://telecom-police.portal.gov.bd/pages/static-pages/695e3b0cc4774958d7b72321"),
  gb: source("UK Government: 999 and 112", "https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers"),
  gbSms: source("East Midlands Ambulance Service NHS: emergencySMS", "https://www.emas.nhs.uk/your-service/accessibility/emergencysms-service"),
  gbCoast: source("HM Coastguard rescue coordination", "https://www.gov.uk/guidance/hm-coastguard-rescue-coordination-centre-contact-details"),
  nz: source("New Zealand Government: 111 emergency service", "https://www.govt.nz/browse/law-crime-and-justice/crimes-and-emergencies/111-emergency-service/"),
  nzSms: source("New Zealand Police: 111 TXT", "https://www.police.govt.nz/welcome-111-txt"),
  au: source("Australian Government: Triple Zero", "https://www.infrastructure.gov.au/media-communications/phone/triple-zero"),
  us: source("US National 911 Program", "https://www.911.gov/calling-911/frequently-asked-questions/"),
  nyc: source("New York City: Text-to-911", "https://www.nyc.gov/site/text911/index.page"),
  ca: source("Royal Canadian Mounted Police: emergency services", "https://rcmp.ca/en/bc/safety-tips/emergency-services/rcmp-cautions-against-using-text-messaging-emergencies"),
  india: source("India Ministry of Home Affairs: ERSS", "https://www.mha.gov.in/emergency-response-support-system-erss"),
  eu: source("European Commission: single emergency number", "https://europa.eu/youreurope/citizens/travel/security-and-emergencies/emergency/faq/index_en.htm"),
  fr: source("France Service Public: emergency contacts", "https://www.service-public.gouv.fr/particuliers/vosdroits/F33954"),
  jpPolice: source("Japan National Police Agency", "https://www.npa.go.jp/goiken_index.html"),
  jpFire: source("Japan Fire and Disaster Management Agency", "https://www.fdma.go.jp/mission/enrichment/kyukyumusen_kinkyutuhou/119.html"),
  sgPolice: source("Singapore Police Force: emergency SMS 70999", "https://www.police.gov.sg/sms-70999"),
  sgFire: source("Singapore Ministry of Home Affairs: emergency hotlines", "https://www.mha.gov.sg/media-room/newsroom/written-reply-to-pq-on-alternative-telco-backup-for-emergency-services-landline-hotlines/"),
  sgSmsFire: source("Singapore Civil Defence Force: 2025 emergency handbook", "https://www.scdf.gov.sg/docs/default-source/comm.---volunteers-%28docs%29/%282025-update%29-2024-scdf-emergency-handbook%28eng%29.pdf?sfvrsn=e89b084c_1"),
};

type Sms = EmergencyContact["sms"];
const unavailable: Sms = { supported: false, number: null, eligibility: "No officially verified direct SMS contact is recorded for this service.", restrictions: "Use the voice contact. Other accessibility services may have separate registration and call requirements.", source: null, verifiedAt: null };
const sms = (number: string, eligibility: string, restrictions: string, officialSource: OfficialSource): Sms => ({ supported: true, number, eligibility, restrictions, source: officialSource, verifiedAt: DIRECTORY_REVIEW_DATE });
const gbSms = sms("999", "For people who are deaf, hard of hearing, or have a speech impairment. Your mobile must already be registered with emergencySMS.", "United Kingdom only. Complete registration before an emergency; wait for a reply and do not assume receipt.", sources.gbSms);
const nzSms = sms("111", "For deaf, hard-of-hearing, or speech-impaired people whose mobile number is already registered for 111 TXT.", "New Zealand only, with mobile coverage. If there is no reply within two minutes, contact 111 another way.", sources.nzSms);
const nycSms = sms("911", "Use when you cannot speak or cannot safely make a voice call. Requires a cellular text or data plan.", "New York City five boroughs only; English and Spanish. Send only text, without media or group recipients. Call when you can.", sources.nyc);
const franceSms = sms("114", "For deaf, deafblind, hard-of-hearing, or speech-impaired people. Include your name and precise address.", "France only. Text goes to Urgence 114, which coordinates police, medical, and fire assistance.", sources.fr);
const sgPoliceSms = sms("70999", "For people requiring emergency police assistance who cannot speak or cannot safely call 999.", "Singapore only. Explain the emergency and exact location. This is a police contact, not the ambulance or fire SMS service.", sources.sgPolice);
const sgFireSms = sms("70995", "Specially provided for deaf, hard-of-hearing, or speech-impaired people needing fire or emergency ambulance assistance.", "Singapore only. This is the SCDF contact for fire and emergency ambulance assistance.", sources.sgSmsFire);

function contact(countryCode: string, serviceId: ServiceId, number: string, officialSource: OfficialSource, coverage: string, text: Sms = unavailable, regionCode: string | null = null): EmergencyContact {
  return { id: `${countryCode}-${regionCode ?? "national"}-${serviceId}`, countryCode, regionCode, serviceId, phoneNumber: number, voiceSupported: true, verificationStatus: "verified", coverage, source: officialSource, lastVerifiedAt: DIRECTORY_REVIEW_DATE, sms: text };
}
function shared(country: string, number: string, officialSource: OfficialSource, coverage: string, text: Sms = unavailable, region: string | null = null): EmergencyContact[] {
  return (["general", "police", "fire", "ambulance"] as ServiceId[]).map((service) => contact(country, service, number, officialSource, coverage, text, region));
}

export const REVIEWED_CONTACTS: EmergencyContact[] = [
  ...shared("BD", "999", sources.bd, "Bangladesh nationwide; police, fire, and ambulance"),
  ...shared("GB", "999", sources.gb, "United Kingdom nationwide", gbSms),
  contact("GB", "coast_guard", "999", sources.gbCoast, "UK coast and coastal emergencies; ask for the Coastguard", gbSms),
  ...shared("NZ", "111", sources.nz, "New Zealand nationwide", nzSms),
  ...shared("AU", "000", sources.au, "Australia nationwide; direct SMS to 000 is not supported"),
  ...shared("US", "911", sources.us, "United States; contact the local emergency operator. Direct SMS availability varies by locality."),
  ...shared("US", "911", sources.us, "New York City: five boroughs", nycSms, "NYC"),
  ...shared("CA", "911", sources.ca, "Canada; local 911 service coverage. Text-with-911 requires registration and an initial voice call, so no direct SMS composer is offered."),
  ...shared("IN", "112", sources.india, "India nationwide Emergency Response Support System"),
  ..."AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" ").flatMap((code) => shared(code, "112", sources.eu, "European Union; 112 routes to appropriate emergency services")),
  contact("FR", "general", "112", sources.fr, "France nationwide", franceSms),
  contact("FR", "police", "17", sources.fr, "France nationwide", franceSms),
  contact("FR", "fire", "18", sources.fr, "France nationwide", franceSms),
  contact("FR", "ambulance", "15", sources.fr, "France nationwide: SAMU medical emergencies", franceSms),
  contact("FR", "coast_guard", "196", sources.fr, "France coastal maritime rescue; use VHF channel 16 at sea"),
  contact("JP", "police", "110", sources.jpPolice, "Japan nationwide"),
  contact("JP", "fire", "119", sources.jpFire, "Japan nationwide"),
  contact("JP", "ambulance", "119", sources.jpFire, "Japan nationwide"),
  contact("SG", "police", "999", sources.sgPolice, "Singapore nationwide", sgPoliceSms),
  contact("SG", "fire", "995", sources.sgFire, "Singapore nationwide", sgFireSms),
  contact("SG", "ambulance", "995", sources.sgFire, "Singapore nationwide", sgFireSms),
];
