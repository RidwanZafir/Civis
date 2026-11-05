-- CIVIS relational schema (SQLite dialect).
-- Geography is stored as lat/lng with a bounding-box index; exact distance is
-- computed in the query layer so the app can move to PostGIS + geography()
-- with a single adapter swap.

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT,
  email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'citizen'
    CHECK (role IN ('citizen','moderator','authority','admin')),
  department_id TEXT REFERENCES departments(id),
  email_verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  reset_token TEXT,
  reset_expires TEXT,
  notify_email INTEGER NOT NULL DEFAULT 1,
  notify_inapp INTEGER NOT NULL DEFAULT 1,
  public_name INTEGER NOT NULL DEFAULT 1,
  anonymous_default INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_slug TEXT NOT NULL REFERENCES categories(slug),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL CHECK (status IN ('submitted','under_review','community_verified','authority_notified','in_progress','resolved','rejected')),
  verification TEXT NOT NULL CHECK (verification IN ('unverified','pending_review','community_verified','officially_confirmed','rejected')),
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  address TEXT,
  neighborhood TEXT,
  extra_info TEXT,
  user_id TEXT REFERENCES users(id),
  anonymous INTEGER NOT NULL DEFAULT 0,
  department_id TEXT REFERENCES departments(id),
  duplicate_of TEXT REFERENCES reports(id),
  credibility INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_geo ON reports(lat, lng);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category_slug);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_department ON reports(department_id);

CREATE TABLE IF NOT EXISTS report_images (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'evidence' CHECK (kind IN ('evidence','resolution')),
  caption TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_report ON report_images(report_id);

CREATE TABLE IF NOT EXISTS report_comments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  body TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_report ON report_comments(report_id, created_at);

CREATE TABLE IF NOT EXISTS report_support (
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (report_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, report_id)
);

CREATE TABLE IF NOT EXISTS report_status_history (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  actor_id TEXT,
  actor_role TEXT,
  actor_label TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_report ON report_status_history(report_id, created_at);

CREATE TABLE IF NOT EXISTS report_verifications (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  decision TEXT NOT NULL,
  note TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verif_report ON report_verifications(report_id, created_at);

CREATE TABLE IF NOT EXISTS authority_assignments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id),
  assigned_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authority_responses (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  eta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_responses_report ON authority_responses(report_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  report_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  action_url TEXT,
  blood_request_id TEXT,
  organisation_id TEXT,
  recipient_role TEXT,
  dedupe_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
-- The unread, category and dedupe indexes are created by applyMigrations(),
-- after the added columns exist on an older database.

CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  comment_id TEXT,
  moderator_id TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS abuse_flags (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('report','comment')),
  target_id TEXT NOT NULL,
  reporter_id TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_role TEXT,
  actor_label TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- Public safety statistics are only ever computed from rows in this view.
DROP VIEW IF EXISTS verified_reports;
CREATE VIEW verified_reports AS
  SELECT * FROM reports
  WHERE verification IN ('community_verified','officially_confirmed');

-- ---------------------------------------------------------------------------
-- Dual-portal extension: organisations, verification, members, places.
-- `departments` is the organisation table; these tables hang off it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS department_applications (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  applicant_user_id TEXT REFERENCES users(id),
  rep_name TEXT NOT NULL,
  rep_designation TEXT,
  rep_email TEXT NOT NULL,
  rep_phone TEXT,
  rep_role TEXT,
  documents TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','under_review','info_required','approved','rejected','suspended')),
  review_notes TEXT,
  reviewed_by TEXT,
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON department_applications(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS department_members (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'officer'
    CHECK (member_role IN ('org_admin','officer','reviewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','removed')),
  created_at TEXT NOT NULL,
  UNIQUE (department_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_department ON department_members(department_id, member_role);

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_bn TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('division','district','upazila','neighbourhood','city','landmark')),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  country TEXT NOT NULL DEFAULT 'Bangladesh',
  division TEXT,
  district TEXT
);
CREATE INDEX IF NOT EXISTS idx_places_name ON places(name);
CREATE INDEX IF NOT EXISTS idx_places_kind ON places(kind);

CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hospital','emergency_department','police','fire','ambulance','shelter')),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT,
  phone TEXT,
  is_demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facilities_geo ON facilities(lat, lng);
CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);

-- ---------------------------------------------------------------------------
-- CIVIS Blood Connect. Requesters publish real, moderated requests; donors
-- opt in with a location and availability of their own. Contact details are
-- never returned to anonymous browsers.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blood_donors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  blood_group TEXT NOT NULL
    CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  preferred_area TEXT,
  contact_phone TEXT,
  latitude REAL,
  longitude REAL,
  location_privacy TEXT NOT NULL DEFAULT 'area' CHECK (location_privacy IN ('area','exact')),
  availability TEXT NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available','temporarily_unavailable','break','not_eligible')),
  notification_consent INTEGER NOT NULL DEFAULT 1,
  contact_method TEXT NOT NULL DEFAULT 'in_app' CHECK (contact_method IN ('in_app','phone')),
  previous_donation_date TEXT,
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blood_donors_geo ON blood_donors(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_blood_donors_group ON blood_donors(blood_group, availability, active);

CREATE TABLE IF NOT EXISTS blood_requests (
  id TEXT PRIMARY KEY,
  request_code TEXT NOT NULL UNIQUE,
  requester_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  blood_group TEXT NOT NULL
    CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  component TEXT NOT NULL
    CHECK (component IN ('whole_blood','red_cells','platelets','plasma','other')),
  component_note TEXT,
  units_required INTEGER NOT NULL CHECK (units_required BETWEEN 1 AND 20),
  hospital_name TEXT NOT NULL,
  hospital_address TEXT,
  district TEXT,
  city TEXT,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  required_date TEXT NOT NULL,
  required_time TEXT NOT NULL,
  required_at TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('critical','urgent','high','planned')),
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_method TEXT NOT NULL DEFAULT 'in_app' CHECK (contact_method IN ('in_app','phone')),
  notes TEXT,
  proof_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','rejected')),
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification','verified','active','partially_fulfilled','fulfilled','expired','cancelled','rejected')),
  units_fulfilled INTEGER NOT NULL DEFAULT 0,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_blood_requests_geo ON blood_requests(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_blood_requests_status ON blood_requests(status, urgency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blood_requests_requester ON blood_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blood_requests_expiry ON blood_requests(status, expires_at);

CREATE TABLE IF NOT EXISTS blood_interests (
  id TEXT PRIMARY KEY,
  blood_request_id TEXT NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  donor_id TEXT NOT NULL REFERENCES blood_donors(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered','accepted','declined','donated','withdrawn')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (blood_request_id, donor_id)
);
CREATE INDEX IF NOT EXISTS idx_blood_interests_request ON blood_interests(blood_request_id, created_at);

CREATE TABLE IF NOT EXISTS blood_request_history (
  id TEXT PRIMARY KEY,
  blood_request_id TEXT NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  performed_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blood_history_request ON blood_request_history(blood_request_id, created_at);

CREATE TABLE IF NOT EXISTS blood_request_verification (
  id TEXT PRIMARY KEY,
  blood_request_id TEXT NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  reviewer_id TEXT,
  verification_status TEXT NOT NULL,
  review_notes TEXT,
  reviewed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blood_request_notifications (
  id TEXT PRIMARY KEY,
  blood_request_id TEXT NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_channel TEXT NOT NULL DEFAULT 'in_app',
  delivery_status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL,
  UNIQUE (blood_request_id, recipient_user_id, notification_channel)
);

CREATE TABLE IF NOT EXISTS blood_abuse_reports (
  id TEXT PRIMARY KEY,
  blood_request_id TEXT NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  reporter_id TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blood_abuse_request ON blood_abuse_reports(blood_request_id);
