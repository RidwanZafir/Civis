import type { Database } from "node-sqlite3-wasm";
import { nowIso } from "./crypto";

/**
 * Local geographic catalogue.
 *
 * Everything here is real, publicly documented geography: Bangladesh's eight
 * divisions and its district headquarters, plus the neighbourhoods of the
 * demonstration city. District coordinates are approximate centroids, which is
 * all the map needs to centre and zoom; they are not survey data.
 *
 * The point of this table is that search runs entirely against local SQL —
 * no Google Places, no Mapbox, no paid geocoder.
 */

type Place = {
  id: string;
  name: string;
  name_bn?: string;
  kind: "division" | "district" | "neighbourhood" | "city";
  lat: number;
  lng: number;
  division?: string;
  district?: string;
};

const DIVISIONS: Place[] = [
  { id: "bd-dhaka", name: "Dhaka", name_bn: "ঢাকা", kind: "division", lat: 23.8103, lng: 90.4125, division: "Dhaka" },
  { id: "bd-chattogram", name: "Chattogram", name_bn: "চট্টগ্রাম", kind: "division", lat: 22.3569, lng: 91.7832, division: "Chattogram" },
  { id: "bd-khulna", name: "Khulna", name_bn: "খুলনা", kind: "division", lat: 22.8456, lng: 89.5403, division: "Khulna" },
  { id: "bd-rajshahi", name: "Rajshahi", name_bn: "রাজশাহী", kind: "division", lat: 24.3745, lng: 88.6042, division: "Rajshahi" },
  { id: "bd-sylhet", name: "Sylhet", name_bn: "সিলেট", kind: "division", lat: 24.8949, lng: 91.8687, division: "Sylhet" },
  { id: "bd-barishal", name: "Barishal", name_bn: "বরিশাল", kind: "division", lat: 22.701, lng: 90.3535, division: "Barishal" },
  { id: "bd-rangpur", name: "Rangpur", name_bn: "রংপুর", kind: "division", lat: 25.7439, lng: 89.2752, division: "Rangpur" },
  { id: "bd-mymensingh", name: "Mymensingh", name_bn: "ময়মনসিংহ", kind: "division", lat: 24.7471, lng: 90.4203, division: "Mymensingh" },
];

const DISTRICTS: Place[] = [
  ["Gazipur", "গাজীপুর", 23.9999, 90.4203, "Dhaka"],
  ["Narayanganj", "নারায়ণগঞ্জ", 23.6238, 90.5, "Dhaka"],
  ["Tangail", "টাঙ্গাইল", 24.2513, 89.9167, "Dhaka"],
  ["Kishoreganj", "কিশোরগঞ্জ", 24.4449, 90.7766, "Dhaka"],
  ["Faridpur", "ফরিদপুর", 23.607, 89.8429, "Dhaka"],
  ["Cumilla", "কুমিল্লা", 23.4607, 91.1809, "Chattogram"],
  ["Cox's Bazar", "কক্সবাজার", 21.4272, 92.0058, "Chattogram"],
  ["Noakhali", "নোয়াখালী", 22.8696, 91.0995, "Chattogram"],
  ["Feni", "ফেনী", 23.0159, 91.3976, "Chattogram"],
  ["Brahmanbaria", "ব্রাহ্মণবাড়িয়া", 23.9571, 91.1117, "Chattogram"],
  ["Rangamati", "রাঙ্গামাটি", 22.6533, 92.1735, "Chattogram"],
  ["Jashore", "যশোর", 23.1664, 89.2081, "Khulna"],
  ["Satkhira", "সাতক্ষীরা", 22.7185, 89.0705, "Khulna"],
  ["Bagerhat", "বাগেরহাট", 22.6516, 89.7859, "Khulna"],
  ["Kushtia", "কুষ্টিয়া", 23.9013, 89.1206, "Khulna"],
  ["Bogura", "বগুড়া", 24.8465, 89.3773, "Rajshahi"],
  ["Pabna", "পাবনা", 24.0064, 89.2372, "Rajshahi"],
  ["Dinajpur", "দিনাজপুর", 25.6217, 88.6354, "Rangpur"],
  ["Kurigram", "কুড়িগ্রাম", 25.8072, 89.6295, "Rangpur"],
  ["Sunamganj", "সুনামগঞ্জ", 25.0658, 91.395, "Sylhet"],
  ["Habiganj", "হবিগঞ্জ", 24.3745, 91.4155, "Sylhet"],
  ["Patuakhali", "পটুয়াখালী", 22.3596, 90.3298, "Barishal"],
  ["Bhola", "ভোলা", 22.6859, 90.6482, "Barishal"],
].map(([name, bn, lat, lng, division], index) => ({
  id: `bd-district-${index + 1}`,
  name: name as string,
  name_bn: bn as string,
  kind: "district" as const,
  lat: lat as number,
  lng: lng as number,
  division: division as string,
  district: name as string,
}));

const CITY_PLACES: Place[] = [
  { id: "kolkata-city", name: "Kolkata", name_bn: "কলকাতা", kind: "city", lat: 22.5726, lng: 88.3639, division: "West Bengal", district: "Kolkata" },
  { id: "kol-saltlake", name: "Salt Lake", kind: "neighbourhood", lat: 22.5867, lng: 88.4171, division: "West Bengal", district: "Kolkata" },
  { id: "kol-ballygunge", name: "Ballygunge", kind: "neighbourhood", lat: 22.524, lng: 88.365, division: "West Bengal", district: "Kolkata" },
  { id: "kol-garia", name: "Garia", kind: "neighbourhood", lat: 22.4645, lng: 88.387, division: "West Bengal", district: "Kolkata" },
  { id: "kol-behala", name: "Behala", kind: "neighbourhood", lat: 22.4989, lng: 88.31, division: "West Bengal", district: "Kolkata" },
  { id: "kol-howrah", name: "Howrah", kind: "neighbourhood", lat: 22.5958, lng: 88.2636, division: "West Bengal", district: "Howrah" },
  { id: "kol-parkstreet", name: "Park Street", kind: "neighbourhood", lat: 22.5535, lng: 88.351, division: "West Bengal", district: "Kolkata" },
  { id: "kol-shyambazar", name: "Shyambazar", kind: "neighbourhood", lat: 22.601, lng: 88.372, division: "West Bengal", district: "Kolkata" },
  { id: "kol-jadavpur", name: "Jadavpur", kind: "neighbourhood", lat: 22.499, lng: 88.371, division: "West Bengal", district: "Kolkata" },
];

const PLACES = [...DIVISIONS, ...DISTRICTS, ...CITY_PLACES];

/** Demonstration facilities around the mapped city. Every row is flagged demo. */
const FACILITIES: {
  id: string;
  name: string;
  type: "hospital" | "emergency_department" | "police" | "fire" | "ambulance" | "shelter";
  lat: number;
  lng: number;
  address: string;
}[] = [
  { id: "fac-1", name: "City General Hospital", type: "hospital", lat: 22.5726, lng: 88.3639, address: "Central Avenue" },
  { id: "fac-2", name: "Ballygunge Medical Centre", type: "hospital", lat: 22.5241, lng: 88.3652, address: "Ballygunge Circular Rd" },
  { id: "fac-3", name: "Salt Lake District Hospital", type: "hospital", lat: 22.5867, lng: 88.4171, address: "Sector II" },
  { id: "fac-4", name: "Garia Community Hospital", type: "hospital", lat: 22.4645, lng: 88.387, address: "Garia Station Rd" },
  { id: "fac-5", name: "Behala Trauma Unit", type: "emergency_department", lat: 22.4989, lng: 88.31, address: "Diamond Harbour Rd" },
  { id: "fac-6", name: "Howrah Emergency Department", type: "emergency_department", lat: 22.5958, lng: 88.2636, address: "Grand Trunk Rd" },
  { id: "fac-7", name: "Jadavpur Emergency Care", type: "emergency_department", lat: 22.499, lng: 88.371, address: "Raja S.C. Mullick Rd" },
  { id: "fac-8", name: "Park Street Ambulance Base", type: "ambulance", lat: 22.5535, lng: 88.351, address: "Park Street" },
  { id: "fac-9", name: "Salt Lake Ambulance Post", type: "ambulance", lat: 22.58, lng: 88.41, address: "Broadway Rd" },
  { id: "fac-10", name: "Central Police Station", type: "police", lat: 22.5726, lng: 88.36, address: "Lalbazar" },
  { id: "fac-11", name: "Ballygunge Police Station", type: "police", lat: 22.527, lng: 88.366, address: "Ballygunge Place" },
  { id: "fac-12", name: "Garia Police Station", type: "police", lat: 22.466, lng: 88.39, address: "Garia Main Rd" },
  { id: "fac-13", name: "Behala Police Station", type: "police", lat: 22.5, lng: 88.315, address: "Behala Chowrasta" },
  { id: "fac-14", name: "Central Fire Station", type: "fire", lat: 22.5765, lng: 88.3524, address: "Free School St" },
  { id: "fac-15", name: "Salt Lake Fire Station", type: "fire", lat: 22.5901, lng: 88.4054, address: "Sector I" },
  { id: "fac-16", name: "Howrah Fire Station", type: "fire", lat: 22.5901, lng: 88.2699, address: "Strand Rd" },
  { id: "fac-17", name: "Jadavpur Fire Station", type: "fire", lat: 22.4931, lng: 88.3754, address: "Jadavpur" },
  { id: "fac-18", name: "Salt Lake Public Shelter", type: "shelter", lat: 22.5921, lng: 88.4209, address: "Central Park" },
  { id: "fac-19", name: "Behala Cyclone Shelter", type: "shelter", lat: 22.4886, lng: 88.3211, address: "Behala" },
  { id: "fac-20", name: "Garia Community Shelter", type: "shelter", lat: 22.4577, lng: 88.3822, address: "Garia" },
];

/** Columns added after the first release, applied idempotently. */
export const MIGRATIONS = [
  "ALTER TABLE departments ADD COLUMN type TEXT NOT NULL DEFAULT 'municipal'",
  "ALTER TABLE departments ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'approved'",
  "ALTER TABLE departments ADD COLUMN country TEXT",
  "ALTER TABLE departments ADD COLUMN division TEXT",
  "ALTER TABLE departments ADD COLUMN district TEXT",
  "ALTER TABLE departments ADD COLUMN address TEXT",
  "ALTER TABLE departments ADD COLUMN website TEXT",
  "ALTER TABLE departments ADD COLUMN phone TEXT",
  "ALTER TABLE departments ADD COLUMN official_email TEXT",
  "ALTER TABLE departments ADD COLUMN lat REAL",
  "ALTER TABLE departments ADD COLUMN lng REAL",
  "ALTER TABLE departments ADD COLUMN radius_km REAL",
  "ALTER TABLE departments ADD COLUMN categories TEXT",
  "ALTER TABLE reports ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'",
  "ALTER TABLE reports ADD COLUMN routing_state TEXT NOT NULL DEFAULT 'unrouted'",
  "ALTER TABLE reports ADD COLUMN assignee_id TEXT",
  "ALTER TABLE reports ADD COLUMN district TEXT",
  // Notification centre: category routing, priority, deep links and dedupe.
  "ALTER TABLE notifications ADD COLUMN category TEXT",
  "ALTER TABLE notifications ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'",
  "ALTER TABLE notifications ADD COLUMN action_url TEXT",
  "ALTER TABLE notifications ADD COLUMN blood_request_id TEXT",
  "ALTER TABLE notifications ADD COLUMN organisation_id TEXT",
  "ALTER TABLE notifications ADD COLUMN recipient_role TEXT",
  "ALTER TABLE notifications ADD COLUMN dedupe_key TEXT",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(user_id, category, created_at DESC)",
];

export function applyMigrations(db: Database) {
  for (const statement of MIGRATIONS) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists — migrations are intentionally idempotent.
    }
  }
}

export function seedCatalog(db: Database) {
  const stamp = nowIso();
  for (const place of PLACES) {
    db.run(
      `INSERT INTO places (id, name, name_bn, kind, lat, lng, country, division, district)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, name_bn = excluded.name_bn`,
      [
        place.id,
        place.name,
        place.name_bn ?? null,
        place.kind,
        place.lat,
        place.lng,
        "Bangladesh",
        place.division ?? null,
        place.district ?? null,
      ],
    );
  }

  for (const facility of FACILITIES) {
    db.run(
      `INSERT INTO facilities (id, name, type, lat, lng, address, phone, is_demo, created_at)
       VALUES (?,?,?,?,?,?,NULL,1,?)
       ON CONFLICT(id) DO NOTHING`,
      [facility.id, facility.name, facility.type, facility.lat, facility.lng, facility.address, stamp],
    );
  }

  // Give the seeded demonstration departments a real jurisdiction so routing
  // has something geographic to match against. Only fills blanks, so an
  // administrator's later edits are never overwritten.
  const jurisdiction: Record<string, { type: string; lat: number; lng: number; radius: number; categories: string }> = {
    dept_light: { type: "utility", lat: 22.5726, lng: 88.3639, radius: 30, categories: "streetlights,electrical" },
    dept_roads: { type: "roads", lat: 22.5726, lng: 88.3639, radius: 30, categories: "roads,crossings,sidewalks" },
    dept_drain: { type: "municipal", lat: 22.5726, lng: 88.3639, radius: 30, categories: "drainage,facilities" },
    dept_parks: { type: "municipal", lat: 22.5726, lng: 88.3639, radius: 30, categories: "facilities,other" },
  };
  for (const [id, meta] of Object.entries(jurisdiction)) {
    db.run(
      `UPDATE departments SET type = ?, lat = ?, lng = ?, radius_km = ?, categories = ?
       WHERE id = ? AND (lat IS NULL OR radius_km IS NULL)`,
      [meta.type, meta.lat, meta.lng, meta.radius, meta.categories, id],
    );
  }

  // A verified police organisation (so routing has a real target) and one
  // organisation still awaiting verification (so the review queue is not empty).
  const orgs = [
    {
      id: "dept_police",
      name: "Metro Police — Traffic Division",
      type: "police",
      status: "approved",
      jurisdiction: "City-wide",
      categories: "crossings,roads",
    },
    {
      id: "dept_fire",
      name: "Metro Fire & Rescue Service",
      type: "fire",
      status: "pending",
      jurisdiction: "City-wide",
      categories: "other,facilities",
    },
  ];
  for (const org of orgs) {
    db.run(
      `INSERT INTO departments
         (id, name, jurisdiction, email, created_at, type, verification_status, country, division, district,
          address, website, phone, official_email, lat, lng, radius_km, categories)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO NOTHING`,
      [
        org.id,
        org.name,
        org.jurisdiction,
        null,
        stamp,
        org.type,
        org.status,
        "India",
        "West Bengal",
        "Kolkata",
        "Central Avenue, Kolkata",
        null,
        "+91 33 0000 0000",
        `${org.id}@civis.demo`,
        22.5726,
        88.3639,
        30,
        org.categories,
      ],
    );
  }

  db.run(
    `INSERT INTO department_applications
       (id, department_id, applicant_user_id, rep_name, rep_designation, rep_email, rep_phone, rep_role,
        documents, status, review_notes, reviewed_by, submitted_at, reviewed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO NOTHING`,
    [
      "app-seed-fire",
      "dept_fire",
      null,
      "Nadia Rahman",
      "Deputy Chief, Operations",
      "nadia.rahman@fire.example",
      "+91 33 0000 0000",
      "Applicant",
      "Organisation authorisation letter — demonstration document reference.",
      "pending",
      null,
      null,
      stamp,
      null,
    ],
  );
}
