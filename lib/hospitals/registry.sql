-- Regional hospital registry.
--
-- These tables hold *directory* records imported from an official source (the
-- DGHS Health Facility Registry). They are deliberately separate from
-- `hospital_wards` / `hospital_services`, which only ever contain availability
-- reported by a verified organisation.
--
-- Rules this schema enforces:
--   * A registry record is not a claim that the facility is operating, has beds,
--     or that a phone number works. Those are separate columns with separate
--     provenance.
--   * Coordinates are nullable. A facility without a verified location keeps
--     its official listing and is shown in list view as "location unavailable".
--     Nothing is ever placed at an invented coordinate.
--   * Contact numbers carry their own verification state and source. A number
--     from the registry is labelled as a registry number, not a CIVIS-verified
--     one.

CREATE TABLE IF NOT EXISTS registry_facilities (
  id TEXT PRIMARY KEY,
  -- Provenance
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  -- Identity
  name TEXT NOT NULL,
  name_bn TEXT,
  facility_code TEXT,
  -- `facility_type` keeps the source's own wording; `facility_category` is our
  -- normalized filter category, so filters never depend on source phrasing.
  facility_type TEXT,
  facility_category TEXT NOT NULL DEFAULT 'other',
  agency TEXT,
  ownership TEXT,
  -- Administrative location
  division TEXT,
  district TEXT,
  city_corporation TEXT,
  upazila TEXT,
  address TEXT,
  -- Geography. NULL means "no verified coordinate", never a placeholder.
  lat REAL,
  lng REAL,
  location_status TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (location_status IN ('verified','approximate','unavailable')),
  -- Contact published by the source
  phone TEXT,
  email TEXT,
  -- Lifecycle
  active TEXT,
  imported_at TEXT NOT NULL,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_registry_division ON registry_facilities(division, district, upazila);
CREATE INDEX IF NOT EXISTS idx_registry_geo ON registry_facilities(lat, lng);
CREATE INDEX IF NOT EXISTS idx_registry_name ON registry_facilities(name);
CREATE INDEX IF NOT EXISTS idx_registry_type ON registry_facilities(facility_type);
CREATE INDEX IF NOT EXISTS idx_registry_category ON registry_facilities(facility_category, division);

-- Department-wise contacts. A row here is the only thing that authorises a
-- "CALL" button for that department.
CREATE TABLE IF NOT EXISTS registry_contacts (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES registry_facilities(id) ON DELETE CASCADE,
  department_code TEXT NOT NULL,
  department_name TEXT NOT NULL,
  contact_group TEXT NOT NULL
    CHECK (contact_group IN ('general','emergency','department','diagnostic','support')),
  phone TEXT NOT NULL,
  phone_e164 TEXT,
  operating_hours TEXT,
  contact_type TEXT NOT NULL DEFAULT 'voice'
    CHECK (contact_type IN ('voice','ambulance','emergency','fax')),
  source TEXT NOT NULL,
  source_url TEXT,
  -- 'registry' means published by the official registry; 'verified' means a
  -- CIVIS reviewer or the facility itself confirmed it.
  verification_status TEXT NOT NULL DEFAULT 'registry'
    CHECK (verification_status IN ('verified','registry','unverified')),
  last_verified_at TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (facility_id, department_code)
);
CREATE INDEX IF NOT EXISTS idx_registry_contacts_facility ON registry_contacts(facility_id, contact_group);

-- One row per import run, so the UI can state exactly how old the data is.
CREATE TABLE IF NOT EXISTS registry_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  scope TEXT NOT NULL,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  ran_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registry_imports_time ON registry_imports(ran_at DESC);
