import type { Database } from "node-sqlite3-wasm";
import { CATEGORIES, NEIGHBORHOODS } from "./constants";
import { daysAgoIso, hashPassword, newId, nowIso, reportRef } from "./crypto";

/**
 * Seeds a complete demonstration dataset.
 *
 * Every row created here carries is_demo = 1 and is labelled as demonstration
 * data throughout the UI. Nothing in this file is presented as a real incident,
 * and no authority response is attributed to a real department account.
 */

type SeedReport = {
  title: string;
  description: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "submitted" | "under_review" | "community_verified" | "authority_notified" | "in_progress" | "resolved" | "rejected";
  verification: "unverified" | "pending_review" | "community_verified" | "officially_confirmed" | "rejected";
  lat: number;
  lng: number;
  address: string;
  neighborhood: string;
  days: number;
  department: string | null;
  supporters: number;
  comments: string[];
  progress?: number;
  eta?: string;
  response?: string;
  resolvedAfter?: number;
  credibility: number;
};

const DEPARTMENTS = [
  { id: "dept_light", name: "Public Lighting & Electrical", jurisdiction: "City-wide" },
  { id: "dept_roads", name: "Roads & Traffic Engineering", jurisdiction: "City-wide" },
  { id: "dept_drain", name: "Drainage & Sanitation", jurisdiction: "City-wide" },
  { id: "dept_parks", name: "Parks & Public Facilities", jurisdiction: "City-wide" },
];

const USERS = [
  { id: "usr_ananya", email: "citizen@civis.demo", name: "Ananya Ghosh", role: "citizen", dept: null },
  { id: "usr_rahul", email: "citizen2@civis.demo", name: "Rahul Sen", role: "citizen", dept: null },
  { id: "usr_meera", email: "moderator@civis.demo", name: "Meera Iyer", role: "moderator", dept: null },
  { id: "usr_arup", email: "authority@civis.demo", name: "Arup Das", role: "authority", dept: "dept_roads" },
  { id: "usr_kavya", email: "admin@civis.demo", name: "Kavya Rao", role: "admin", dept: null },
];

const SEED_REPORTS: SeedReport[] = [
  {
    title: "Three streetlights dark for two weeks on Sector 3 lane",
    description:
      "The entire stretch between the community market and the primary school has been unlit since the storm. Women walking home after 7pm are using phone torches. Two of the poles also lean noticeably.",
    category: "streetlights",
    severity: "high",
    status: "in_progress",
    verification: "officially_confirmed",
    lat: 22.5869,
    lng: 88.4174,
    address: "Sector 3, near Community Market",
    neighborhood: "Salt Lake",
    days: 16,
    department: "dept_light",
    supporters: 34,
    comments: [
      "Can confirm — it is completely dark from the crossing onwards.",
      "My daughter walks this route daily. Please prioritise.",
    ],
    progress: 40,
    eta: "Within 5 days",
    response:
      "A crew has been scheduled to replace three failed luminaires and re-secure the leaning poles. Material has been collected from the central store.",
    credibility: 82,
  },
  {
    title: "Deep pothole at Ballygunge circular road turn",
    description:
      "A pothole roughly a metre wide has opened at the turn where buses cut the corner. Two-wheelers swerve into the opposite lane to avoid it. It has already filled with water twice this week.",
    category: "roads",
    severity: "critical",
    status: "authority_notified",
    verification: "officially_confirmed",
    lat: 22.5241,
    lng: 88.3652,
    address: "Ballygunge Circular Road, eastbound turn",
    neighborhood: "Ballygunge",
    days: 9,
    department: "dept_roads",
    supporters: 57,
    comments: [
      "A scooter rider fell here yesterday evening.",
      "Same spot was patched in July and failed within a month.",
      "Reported to the ward office too, no action yet.",
    ],
    progress: 15,
    eta: "10–14 days",
    response:
      "The location has been recorded for cold-mix patching this week. Because of the underground cable crossing the repair team is assessing whether a full-depth repair is required.",
    credibility: 91,
  },
  {
    title: "Faded pedestrian crossing outside Garia station",
    description:
      "The zebra crossing has almost completely worn away. Commuters cross between moving buses with no visible marking, and the signal pole has no working pedestrian light.",
    category: "crossings",
    severity: "high",
    status: "community_verified",
    verification: "community_verified",
    lat: 22.4638,
    lng: 88.3805,
    address: "Station Road, outside Garia metro",
    neighborhood: "Garia",
    days: 21,
    department: null,
    supporters: 41,
    comments: [
      "Crossed here today, the paint is gone for at least 15 metres.",
      "The pedestrian signal has been dead for months.",
    ],
    credibility: 76,
  },
  {
    title: "Storm drain choked, lane floods after every shower",
    description:
      "The drain outside house numbers 41–57 is blocked with silt and plastic. Water stands 20cm deep for hours after rain, and the sewage smells badly. Mosquito breeding is obvious.",
    category: "drainage",
    severity: "medium",
    status: "in_progress",
    verification: "officially_confirmed",
    lat: 22.4982,
    lng: 88.3138,
    address: "Behala, Ward 12 lane 4",
    neighborhood: "Behala",
    days: 27,
    department: "dept_drain",
    supporters: 28,
    comments: [
      "Cleaning was promised before monsoon and never happened.",
      "Standing water is still there three days after the rain stopped.",
    ],
    progress: 60,
    eta: "3 days",
    response:
      "Desilting of this stretch is underway. Approximately 18 metres of the covered drain has been cleared and the culvert cover will be replaced after inspection.",
    credibility: 84,
  },
  {
    title: "Exposed live wire hanging at nutan bazar pole",
    description:
      "An aluminium conductor has come loose from a distribution box and hangs at head height across the footpath. It sparks when a bus passes. Children walk under it daily.",
    category: "electrical",
    severity: "critical",
    status: "authority_notified",
    verification: "officially_confirmed",
    lat: 22.5997,
    lng: 88.3701,
    address: "Shyambazar, nutan bazar approach",
    neighborhood: "Shyambazar",
    days: 2,
    department: "dept_light",
    supporters: 63,
    comments: [
      "Extremely dangerous. Someone will be killed.",
      "ALREADY flagged to the CESC helpline number yesterday.",
    ],
    progress: 10,
    eta: "24 hours",
    response:
      "Flagged as an immediate-safety call. The feeder has been isolated and an emergency crew is dispatched to re-terminate the conductor.",
    credibility: 95,
  },
  {
    title: "Broken pavement slabs on Jadavpur footpath",
    description:
      "Six paving slabs are missing outside the tea stalls, leaving a trench 30cm deep. Two elderly residents have tripped here this month.",
    category: "sidewalks",
    severity: "medium",
    status: "resolved",
    verification: "community_verified",
    lat: 22.4994,
    lng: 88.3716,
    address: "Jadavpur, near Raja SC Mullick Road",
    neighborhood: "Jadavpur",
    days: 62,
    department: "dept_roads",
    supporters: 19,
    comments: [
      "The trench filled with rainwater and you cannot see it at night.",
      "Now repaired — see the after photo. Quick work once it was escalated.",
    ],
    progress: 100,
    response:
      "Slabs replaced and the kerb edge re-secured. The footpath was reopened after a joint inspection with the ward committee.",
    resolvedAfter: 34,
    credibility: 71,
  },
  {
    title: "Park swing chain broken, sharp edge exposed",
    description:
      "The chain on the right-hand swing snapped and left a jagged metal plate at child height. Children still play there because no one has closed the equipment.",
    category: "facilities",
    severity: "high",
    status: "resolved",
    verification: "officially_confirmed",
    lat: 22.5529,
    lng: 88.3524,
    address: "Park Street, children's corner",
    neighborhood: "Park Street",
    days: 48,
    department: "dept_parks",
    supporters: 22,
    comments: [
      "Please close the swing until it is fixed.",
      "Fixed on Sunday, the whole frame was repainted too.",
    ],
    progress: 100,
    response:
      "The swing assembly was replaced and the equipment barricaded until a post-repair safety check was completed.",
    resolvedAfter: 21,
    credibility: 78,
  },
  {
    title: "Waterlogging at Howrah station approach after 20 min rain",
    description:
      "The approach lane to the taxi rank holds water up to ankle depth and hides the kerb edges. Auto drivers refuse to enter after rain.",
    category: "drainage",
    severity: "medium",
    status: "submitted",
    verification: "unverified",
    lat: 22.5948,
    lng: 88.3104,
    address: "Howrah station taxi approach",
    neighborhood: "Howrah",
    days: 1,
    department: null,
    supporters: 4,
    comments: [],
    credibility: 40,
  },
  {
    title: "Illegal iron gate blocks half the pavement near school",
    description:
      "A private compound has installed a gate that opens outwards across the footpath. During pickup hours hundreds of schoolchildren are forced onto the road.",
    category: "sidewalks",
    severity: "high",
    status: "under_review",
    verification: "pending_review",
    lat: 22.5225,
    lng: 88.3641,
    address: "Ballygunge Place lane, near school gate",
    neighborhood: "Ballygunge",
    days: 5,
    department: null,
    supporters: 17,
    comments: ["This has been a problem for two years.", "Moderators, please check the building plan."],
    credibility: 58,
  },
  {
    title: "No signal at the Beleghata crossing for the third week",
    description:
      "The traffic signal has been dark since the cable cut during road works. Speed on the arterial road has not reduced and there is no manual controller.",
    category: "crossings",
    severity: "critical",
    status: "community_verified",
    verification: "community_verified",
    lat: 22.5593,
    lng: 88.4008,
    address: "Beleghata crossing",
    neighborhood: "Salt Lake",
    days: 19,
    department: null,
    supporters: 72,
    comments: [
      "Three near collisions in one hour this morning.",
      "Traffic police were manually directing on Friday only.",
    ],
    credibility: 88,
  },
  {
    title: "Sunken utility cut causing tyre damage on Garia main road",
    description:
      "A cable trench was refilled and has settled 10cm below the road surface. Cars hit it at speed and one auto rickshaw lost a wheel here last week.",
    category: "roads",
    severity: "high",
    status: "authority_notified",
    verification: "officially_confirmed",
    lat: 22.4665,
    lng: 88.3792,
    address: "Garia main road, opposite bus depot",
    neighborhood: "Garia",
    days: 13,
    department: "dept_roads",
    supporters: 31,
    comments: ["It is invisible in the dark.", "The contractor should be made to redo it properly."],
    progress: 25,
    eta: "1 week",
    response:
      "The utility agency has been asked to re-compact and re-surface the cut. A temporary warning board was placed at the location on the day it was received.",
    credibility: 80,
  },
  {
    title: "Broken streetlight pole leaning over bus stop",
    description:
      "The pole at the bus shelter has cracked at the base and is leaning about 15 degrees over the seating area. It is still carrying the lamp.",
    category: "streetlights",
    severity: "critical",
    status: "resolved",
    verification: "officially_confirmed",
    lat: 22.4976,
    lng: 88.3221,
    address: "Behala chowrasta bus stop",
    neighborhood: "Behala",
    days: 40,
    department: "dept_light",
    supporters: 26,
    comments: ["It moved visibly in the wind yesterday.", "Pole replaced today, thank you."],
    progress: 100,
    response:
      "The damaged pole was replaced with a new octagonal section and the luminaire re-energised. The old pole was removed the same day.",
    resolvedAfter: 12,
    credibility: 86,
  },
  {
    title: "Unsafe open manhole without marking",
    description:
      "The cast iron cover has been stolen and the shaft is open on a footpath used by evening walkers. There is no barrier, cone or warning sign.",
    category: "drainage",
    severity: "critical",
    status: "in_progress",
    verification: "community_verified",
    lat: 22.5541,
    lng: 88.3722,
    address: "Shyambazar, near five-point crossing",
    neighborhood: "Shyambazar",
    days: 7,
    department: "dept_drain",
    supporters: 45,
    comments: ["Please put a barricade at least.", "Cone placed today but still no cover."],
    progress: 50,
    eta: "2 days",
    response:
      "The location has been barricaded and a replacement cover has been indented from the ward store.",
    credibility: 89,
  },
  {
    title: "Dustbins removed, waste dumped beside the park wall",
    description:
      "The two community bins were removed during road work and never returned. Waste is now dumped along the park boundary and dogs scatter it nightly.",
    category: "facilities",
    severity: "low",
    status: "community_verified",
    verification: "community_verified",
    lat: 22.5011,
    lng: 88.3702,
    address: "Jadavpur, beside Central Park wall",
    neighborhood: "Jadavpur",
    days: 33,
    department: null,
    supporters: 12,
    comments: ["Smell is bad in the mornings."],
    credibility: 62,
  },
  {
    title: "Sparking junction box near school entrance",
    description:
      "The junction box beside the school gate sparkles visibly when it rains and there is a burnt smell. The gate is used by more than 600 children.",
    category: "electrical",
    severity: "critical",
    status: "resolved",
    verification: "officially_confirmed",
    lat: 22.5138,
    lng: 88.3412,
    address: "Alipore, school gate lane",
    neighborhood: "Park Street",
    days: 70,
    department: "dept_light",
    supporters: 38,
    comments: ["The school has written three letters.", "Box replaced and the feeder re-insulated."],
    progress: 100,
    response:
      "The junction box was replaced, the incoming feeder re-insulated and an earth continuity test recorded on site.",
    resolvedAfter: 9,
    credibility: 93,
  },
  {
    title: "Missing stop line and signage at Salt Lake bus terminus",
    description:
      "The stop line paint at the terminus exit is gone, so buses pull out across the pedestrian route. There is no sign indicating the exit.",
    category: "crossings",
    severity: "low",
    status: "submitted",
    verification: "unverified",
    lat: 22.5855,
    lng: 88.4048,
    address: "Salt Lake bus terminus exit",
    neighborhood: "Salt Lake",
    days: 3,
    department: null,
    supporters: 6,
    comments: [],
    credibility: 35,
  },
  {
    title: "Duplicate report: same dark stretch filed twice",
    description:
      "Filed before checking the existing report for Sector 3 lighting. Marking this as a duplicate so the original stays authoritative.",
    category: "streetlights",
    severity: "medium",
    status: "rejected",
    verification: "rejected",
    lat: 22.5872,
    lng: 88.4168,
    address: "Sector 3, near Community Market",
    neighborhood: "Salt Lake",
    days: 14,
    department: null,
    supporters: 1,
    comments: ["Closed as duplicate of the earlier sector 3 report."],
    credibility: 20,
  },
];

function placeholder(category: string, seed: number, kind: "evidence" | "resolution") {
  return `/api/media/placeholder?c=${category}&s=${seed}&k=${kind}`;
}

export function ensureSeeded(handle: { db: Database }) {
  const { db } = handle;
  const existing = db.get("SELECT value FROM meta WHERE key = 'seed_version'") as
    | { value: string }
    | undefined;
  if (existing?.value === "1") return;

  const now = nowIso();
  for (const [i, c] of CATEGORIES.entries()) {
    db.run(
      "INSERT OR REPLACE INTO categories (slug, label, description, color, sort) VALUES (?,?,?,?,?)",
      [c.slug, c.label, c.description, c.color, i],
    );
  }

  for (const d of DEPARTMENTS) {
    db.run(
      "INSERT OR REPLACE INTO departments (id, name, jurisdiction, email, created_at) VALUES (?,?,?,?,?)",
      [d.id, d.name, d.jurisdiction, "demo@civis.local", now],
    );
  }

  const passwordHash = hashPassword("CivisDemo!23");
  for (const u of USERS) {
    db.run(
      `INSERT OR REPLACE INTO users
       (id, email, password_hash, name, role, department_id, email_verified, notify_email,
        notify_inapp, public_name, anonymous_default, suspended, is_demo, created_at)
       VALUES (?,?,?,?,?,?,1,1,1,1,0,0,1,?)`,
      [u.id, u.email, passwordHash, u.name, u.role, u.dept, daysAgoIso(120)],
    );
  }

  const reportIds: string[] = [];

  SEED_REPORTS.forEach((r, index) => {
    const id = reportRef();
    reportIds.push(id);
    const createdAt = daysAgoIso(r.days);
    const reporter = index % 3 === 0 ? "usr_rahul" : "usr_ananya";
    const updatedAt = r.resolvedAfter ? daysAgoIso(r.days - r.resolvedAfter) : createdAt;

    db.run(
      `INSERT INTO reports
       (id, title, description, category_slug, severity, status, verification, lat, lng,
        address, neighborhood, extra_info, user_id, anonymous, department_id, duplicate_of,
        credibility, is_demo, created_at, updated_at, resolved_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,1,?,?,?)`,
      [
        id,
        r.title,
        r.description,
        r.category,
        r.severity,
        r.status,
        r.verification,
        r.lat,
        r.lng,
        r.address,
        r.neighborhood,
        null,
        reporter,
        index % 5 === 0 ? 1 : 0,
        r.department,
        r.credibility,
        createdAt,
        updatedAt,
        r.status === "resolved" ? daysAgoIso(r.days - (r.resolvedAfter ?? 5)) : null,
      ],
    );

    db.run(
      "INSERT INTO report_images (id, report_id, url, kind, caption, created_at) VALUES (?,?,?,?,?,?)",
      [newId("img"), id, placeholder(r.category, index, "evidence"), "evidence", "Community photograph", createdAt],
    );
    if (r.status === "resolved") {
      db.run(
        "INSERT INTO report_images (id, report_id, url, kind, caption, created_at) VALUES (?,?,?,?,?,?)",
        [newId("img"), id, placeholder(r.category, index + 100, "resolution"), "resolution", "Resolution evidence", updatedAt],
      );
    }

    // Status history records only stages that actually happened.
    const stages: { status: string; at: string; note: string }[] = [
      { status: "submitted", at: createdAt, note: "Report submitted with photographic evidence." },
    ];
    const span = r.days;
    if (r.status !== "submitted" && r.status !== "rejected") {
      stages.push({
        status: "under_review",
        at: daysAgoIso(Math.max(span - 1, 0.2)),
        note: "Automated checks passed. Queued for moderator review.",
      });
    }
    if (["community_verified", "authority_notified", "in_progress", "resolved"].includes(r.status)) {
      stages.push({
        status: "community_verified",
        at: daysAgoIso(Math.max(span - 2, 0.1)),
        note: "Four independent neighbours confirmed the issue on site.",
      });
    }
    if (["authority_notified", "in_progress", "resolved"].includes(r.status)) {
      stages.push({
        status: "authority_notified",
        at: daysAgoIso(Math.max(span - 3, 0.05)),
        note: "Referred to the responsible department.",
      });
    }
    if (["in_progress", "resolved"].includes(r.status)) {
      stages.push({
        status: "in_progress",
        at: daysAgoIso(Math.max(span - 4, 0.02)),
        note: "Field work started at the reported location.",
      });
    }
    if (r.status === "resolved") {
      stages.push({
        status: "resolved",
        at: daysAgoIso(Math.max(span - (r.resolvedAfter ?? 5), 0)),
        note: "Work completed and verified on site.",
      });
    }
    if (r.status === "rejected") {
      stages.push({
        status: "rejected",
        at: daysAgoIso(Math.max(span - 2, 0)),
        note: "Closed as a duplicate of an existing report.",
      });
    }

    stages.forEach((s, i) => {
      const prev = i === 0 ? null : stages[i - 1].status;
      db.run(
        `INSERT INTO report_status_history
         (id, report_id, from_status, to_status, note, actor_id, actor_role, actor_label, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          newId("hist"),
          id,
          prev,
          s.status,
          s.note,
          i === 0 ? reporter : "usr_meera",
          i === 0 ? "citizen" : "moderator",
          i === 0 ? "Citizen" : "Meera Iyer",
          s.at,
        ],
      );
    });

    if (r.verification !== "unverified") {
      db.run(
        `INSERT INTO report_verifications (id, report_id, stage, decision, note, actor_id, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [
          newId("ver"),
          id,
          "moderator_review",
          r.verification === "rejected" ? "reject" : "approve",
          r.verification === "rejected"
            ? "Duplicate of an existing report."
            : "Evidence matches location and the described infrastructure.",
          "usr_meera",
          daysAgoIso(Math.max(r.days - 2, 0.1)),
        ],
      );
    }

    const supporterPool = ["usr_ananya", "usr_rahul", "usr_meera", "usr_kavya", "usr_arup"];
    r.supporters &&
      supporterPool.slice(0, Math.min(4, r.supporters)).forEach((uid, si) => {
        if (uid === reporter) return;
        db.run(
          "INSERT OR IGNORE INTO report_support (report_id, user_id, created_at) VALUES (?,?,?)",
          [id, uid, daysAgoIso(Math.max(r.days - 1 - si * 0.3, 0))],
        );
      });

    r.comments.forEach((body, ci) => {
      const author = ci % 2 === 0 ? "usr_rahul" : "usr_ananya";
      db.run(
        "INSERT INTO report_comments (id, report_id, user_id, body, hidden, created_at) VALUES (?,?,?,?,0,?)",
        [newId("cmt"), id, author, body, daysAgoIso(Math.max(r.days - 0.5 - ci * 0.4, 0))],
      );
    });

    if (r.department) {
      db.run(
        "INSERT INTO authority_assignments (id, report_id, department_id, assigned_by, created_at) VALUES (?,?,?,?,?)",
        [newId("asg"), id, r.department, "usr_kavya", daysAgoIso(Math.max(r.days - 3, 0.05))],
      );
    }

    if (r.response && r.department && r.verification === "officially_confirmed") {
      db.run(
        `INSERT INTO authority_responses
         (id, report_id, department_id, user_id, body, progress, eta, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          newId("rsp"),
          id,
          r.department,
          "usr_arup",
          r.response,
          r.progress ?? 10,
          r.eta ?? null,
          daysAgoIso(Math.max(r.days - 4, 0.02)),
        ],
      );
    }
  });

  // The citizen demo account follows two live incidents.
  ["usr_ananya"].forEach((uid) => {
    [reportIds[1], reportIds[4]].forEach((rid) => {
      db.run(
        "INSERT OR IGNORE INTO user_follows (user_id, report_id, created_at) VALUES (?,?,?)",
        [uid, rid, daysAgoIso(3)],
      );
    });
  });

  db.run(
    `INSERT INTO notifications (id, user_id, type, title, body, report_id, read_at, created_at)
     VALUES (?,?,?,?,?,?,NULL,?)`,
    [
      newId("ntf"),
      "usr_ananya",
      "authority_response",
      "Roads & Traffic Engineering responded",
      "A progress update was published on the Ballygunge circular road pothole.",
      reportIds[1],
      daysAgoIso(1),
    ],
  );
  db.run(
    `INSERT INTO notifications (id, user_id, type, title, body, report_id, read_at, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      newId("ntf"),
      "usr_ananya",
      "verification",
      "Report community verified",
      "Neighbours confirmed your Sector 3 streetlight report.",
      reportIds[0],
      daysAgoIso(6),
      daysAgoIso(7),
    ],
  );

  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_version', '1')");
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_at', ?)", [now]);
}
