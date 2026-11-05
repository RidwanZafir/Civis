-- Emergency directory: independent voice/SMS verification and source provenance.
CREATE TABLE IF NOT EXISTS official_data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL CHECK (url LIKE 'https://%'),
  kind TEXT NOT NULL,
  checked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_countries (
  code TEXT PRIMARY KEY CHECK (length(code) = 2),
  name TEXT NOT NULL,
  flag TEXT NOT NULL,
  dial_code TEXT NOT NULL,
  regions_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS emergency_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL REFERENCES emergency_countries(code),
  region_code TEXT,
  service_id TEXT NOT NULL REFERENCES emergency_services(id),
  phone_number TEXT NOT NULL,
  voice_supported INTEGER NOT NULL CHECK (voice_supported IN (0,1)),
  coverage TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified','unverified')),
  source_id TEXT NOT NULL REFERENCES official_data_sources(id),
  last_verified_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_emergency_country_region ON emergency_contacts(country_code,region_code,service_id);
CREATE TABLE IF NOT EXISTS emergency_sms_contacts (
  contact_id TEXT PRIMARY KEY REFERENCES emergency_contacts(id) ON DELETE CASCADE,
  supported INTEGER NOT NULL DEFAULT 0 CHECK (supported IN (0,1)),
  sms_number TEXT,
  eligibility_requirements TEXT NOT NULL,
  regional_restrictions TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified','unverified')),
  source_id TEXT REFERENCES official_data_sources(id),
  verified_at TEXT,
  CHECK (supported = 0 OR (sms_number IS NOT NULL AND source_id IS NOT NULL AND verified_at IS NOT NULL AND verification_status = 'verified'))
);
CREATE TABLE IF NOT EXISTS emergency_contact_verifications (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES emergency_contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('voice','sms')),
  status TEXT NOT NULL CHECK (status IN ('verified','unverified')),
  source_id TEXT NOT NULL REFERENCES official_data_sources(id),
  reviewed_at TEXT NOT NULL,
  note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_incident_categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category_group TEXT NOT NULL,
  service_ids_json TEXT NOT NULL,
  guidance_json TEXT NOT NULL
);
