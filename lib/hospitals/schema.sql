-- Hospital availability reported by verified health organisations.
--
-- Every row is attributable to an approved organisation and a named actor.
-- There are deliberately no inferred, scraped or demonstration bed counts in
-- these tables: if an organisation has not published a report, the public API
-- returns no availability record and the interface says "not reported".

CREATE TABLE IF NOT EXISTS hospital_org_links (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES emergency_facilities(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','revoked')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  review_note TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE (facility_id, department_id)
);
CREATE INDEX IF NOT EXISTS idx_hospital_links_department ON hospital_org_links(department_id, status);
CREATE INDEX IF NOT EXISTS idx_hospital_links_status ON hospital_org_links(status, created_at DESC);

CREATE TABLE IF NOT EXISTS hospital_availability_profiles (
  facility_id TEXT PRIMARY KEY REFERENCES emergency_facilities(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id),
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  note TEXT,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hospital_wards (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES emergency_facilities(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  ward_group TEXT NOT NULL CHECK (ward_group IN ('general','critical','specialized')),
  total_beds INTEGER CHECK (total_beds IS NULL OR total_beds >= 0),
  available_beds INTEGER CHECK (available_beds IS NULL OR available_beds >= 0),
  occupied_beds INTEGER CHECK (occupied_beds IS NULL OR occupied_beds >= 0),
  admission_status TEXT NOT NULL
    CHECK (admission_status IN ('open','limited','full','closed','unknown')),
  source TEXT,
  verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('verified','unverified')),
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL,
  UNIQUE (facility_id, code)
);
CREATE INDEX IF NOT EXISTS idx_hospital_wards_facility ON hospital_wards(facility_id, ward_group);

CREATE TABLE IF NOT EXISTS hospital_services (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES emergency_facilities(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  service_group TEXT NOT NULL
    CHECK (service_group IN ('emergency','diagnostic','specialist','support')),
  exists_flag INTEGER NOT NULL DEFAULT 1 CHECK (exists_flag IN (0,1)),
  availability_status TEXT NOT NULL
    CHECK (availability_status IN ('available','restricted','unavailable','closed','unknown')),
  operating_hours TEXT,
  emergency_available INTEGER CHECK (emergency_available IS NULL OR emergency_available IN (0,1)),
  contact TEXT,
  contact_verified INTEGER NOT NULL DEFAULT 0 CHECK (contact_verified IN (0,1)),
  source TEXT,
  verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('verified','unverified')),
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL,
  UNIQUE (facility_id, code)
);
CREATE INDEX IF NOT EXISTS idx_hospital_services_facility ON hospital_services(facility_id, service_group);

CREATE TABLE IF NOT EXISTS hospital_availability_history (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  department_id TEXT,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('profile','ward','service')),
  resource_id TEXT,
  previous_payload TEXT,
  current_payload TEXT,
  source TEXT,
  note TEXT,
  actor_id TEXT,
  actor_label TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hospital_history_facility
  ON hospital_availability_history(facility_id, created_at DESC);
