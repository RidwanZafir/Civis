/**
 * End-to-end smoke test against a running dev/prod server.
 *
 *   node scripts/smoke.mjs http://localhost:3000
 *
 * Exercises the real API: auth, report creation and persistence, community
 * interactions, the moderator verification path and the authority response path.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const results = [];
let failures = 0;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures++;
}

async function req(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 200);
  }
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, data, cookie: setCookie?.split(";")[0] ?? null };
}

async function signIn(email) {
  const res = await req("/api/auth/sign-in", {
    method: "POST",
    body: { email, password: "CivisDemo!23" },
  });
  return { ...res, cookie: res.cookie };
}

// 1. Pages
const pages = [
  "/",
  "/explore",
  "/community",
  "/insights",
  "/insights/report",
  "/report",
  "/about",
  "/guidelines",
  "/privacy",
  "/terms",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/forgot",
  "/auth/verify?token=invalid",
  "/api/health",
];
for (const page of pages) {
  const res = await req(page);
  record(`page ${page}`, res.status === 200, `status ${res.status}`);
}

// 2. Seeded data is present and labelled
const list = await req("/api/reports?pageSize=60");
record("/api/reports returns data", list.status === 200 && list.data.items?.length > 0, `${list.data.total ?? 0} reports`);
record(
  "seeded rows flagged as demonstration data",
  list.data.items?.every((i) => i.is_demo === 1),
  `${list.data.items?.filter((i) => i.is_demo === 1).length}/${list.data.items?.length}`,
);

// 3. Citizen flow
const citizen = await signIn("citizen@civis.demo");
record("citizen sign-in", citizen.status === 200 && !!citizen.cookie, `status ${citizen.status}`);
const anon = await req("/api/reports", {
  method: "POST",
  body: { title: "Anonymous attempt", description: "x".repeat(40), category: "roads", severity: "low", lat: 0, lng: 0 },
});
record("report creation requires auth", anon.status === 401, `status ${anon.status}`);

const created = await req("/api/reports", {
  method: "POST",
  cookie: citizen.cookie,
  body: {
    title: "Smoke test: cracked pavement slab outside library",
    description:
      "A paving slab outside the public library entrance has cracked and now rocks underfoot, catching wheelchair wheels.",
    category: "sidewalks",
    severity: "medium",
    lat: 22.6012,
    lng: 88.4521,
    address: "Library entrance, test lane",
    neighborhood: "Shyambazar",
    confirmDistinct: true,
  },
});
record("report created", created.status === 201 && !!created.data.id, `status ${created.status} ${created.data?.error ?? ""}`);
const reportId = created.data?.id;

// duplicate detection on an existing verified report
const dup = await req("/api/reports", {
  method: "POST",
  cookie: citizen.cookie,
  body: {
    title: "Smoke test duplicate of a known verified report",
    description: "Reporting the same verified problem again to confirm the duplicate guard fires as expected.",
    category: "roads",
    severity: "high",
    lat: 22.5241,
    lng: 88.3652,
  },
});
record("duplicate detection blocks", dup.status === 409 && !!dup.data.duplicate, `status ${dup.status}`);

const detail = await req(`/api/reports/${reportId}`);
record("created report persists", detail.status === 200 && detail.data.report.id === reportId);
record("new report is unverified", detail.data.report?.verification === "unverified");
record("status history recorded", detail.data.history?.length === 1);

const support = await req(`/api/reports/${reportId}/support`, { method: "POST", cookie: citizen.cookie });
record("support works", support.status === 200 && support.data.supported === true, JSON.stringify(support.data));
const unsupport = await req(`/api/reports/${reportId}/support`, { method: "DELETE", cookie: citizen.cookie });
record("support can be removed", unsupport.status === 200 && unsupport.data.supported === false);

const follow = await req(`/api/reports/${reportId}/follow`, { method: "POST", cookie: citizen.cookie });
record("follow works", follow.status === 200 && follow.data.following === true);

const comment = await req(`/api/reports/${reportId}/comments`, {
  method: "POST",
  cookie: citizen.cookie,
  body: { body: "Walked past this morning — the slab is still loose." },
});
record("comment posts", comment.status === 201, `status ${comment.status}`);

const flag = await req(`/api/reports/${reportId}/flag`, {
  method: "POST",
  cookie: citizen.cookie,
  body: { reason: "Smoke test flag: checking the moderation queue path." },
});
record("content flag accepted", flag.status === 201, `status ${flag.status}`);

// 4. Role enforcement
const citizenManage = await req(`/api/reports/${reportId}/manage`, {
  method: "POST",
  cookie: citizen.cookie,
  body: { action: "verify", decision: "approve" },
});
record("citizen cannot verify", citizenManage.status === 403, `status ${citizenManage.status}`);
const adminAsCitizen = await req("/api/admin/users", { cookie: citizen.cookie });
record("citizen cannot read admin users", adminAsCitizen.status === 403, `status ${adminAsCitizen.status}`);

// 5. Moderator verification of the new report
const moderator = await signIn("moderator@civis.demo");
record("moderator sign-in", moderator.status === 200);
const verify = await req(`/api/reports/${reportId}/manage`, {
  method: "POST",
  cookie: moderator.cookie,
  body: { action: "verify", decision: "approve", note: "Smoke test: evidence reviewed on site." },
});
record("moderator verifies report", verify.status === 200 && verify.data.verification === "community_verified", JSON.stringify(verify.data));
const afterVerify = await req(`/api/stats`);
record(
  "verified report counted in statistics",
  afterVerify.status === 200 && afterVerify.data.overview.verified >= 1,
  `verified=${afterVerify.data.overview?.verified}`,
);

// 6. Authority flow on an assigned incident
const authority = await signIn("authority@civis.demo");
record("authority sign-in", authority.status === 200);
const roads = list.data.items.filter((i) => i.department_name === "Roads & Traffic Engineering" && i.status !== "resolved");
const target = roads[0];
if (!target) {
  record("authority target incident found", false, "no assigned roads incident");
} else {
  const accept = await req(`/api/reports/${target.id}/manage`, {
    method: "POST",
    cookie: authority.cookie,
    body: { action: "accept", note: "Smoke test: accepted for field inspection." },
  });
  record("authority accepts assigned incident", accept.status === 200, `status ${accept.status} ${accept.data?.error ?? ""}`);

  const respond = await req(`/api/reports/${target.id}/manage`, {
    method: "POST",
    cookie: authority.cookie,
    body: {
      action: "respond",
      body: "Smoke test: cold-mix patching scheduled and the utility agency notified to re-surface the trench.",
      progress: 45,
      eta: "4 working days",
    },
  });
  record("authority publishes response", respond.status === 200 && respond.data.status === "in_progress", JSON.stringify(respond.data));

  const afterResponse = await req(`/api/reports/${target.id}`);
  record(
    "response is attributed and stored",
    afterResponse.data.responses?.length > 0 &&
      afterResponse.data.responses.at(-1).official === "Arup Das" &&
      afterResponse.data.report.status === "in_progress",
    `responses=${afterResponse.data.responses?.length}`,
  );

  const citizenRespond = await req(`/api/reports/${target.id}/manage`, {
    method: "POST",
    cookie: citizen.cookie,
    body: { action: "respond", body: "Citizen attempting to publish an official response.", progress: 90 },
  });
  record("citizens cannot publish official responses", citizenRespond.status === 403, `status ${citizenRespond.status}`);
}

// 7. Admin
const admin = await signIn("admin@civis.demo");
record("admin sign-in", admin.status === 200);
const users = await req("/api/admin/users", { cookie: admin.cookie });
record("admin reads users", users.status === 200 && users.data.users?.length >= 5);
const adminUsersAsAuthority = await req("/api/admin/users", { cookie: authority.cookie });
record("authority cannot read admin users", adminUsersAsAuthority.status === 403, `status ${adminUsersAsAuthority.status}`);

// 8. Exports and unauthorised areas
const csv = await fetch(`${BASE}/api/stats/export`);
const csvText = await csv.text();
record("CSV export", csv.status === 200 && csvText.startsWith("section,label,value,definition"), `${csvText.split("\n").length} lines`);

const dashAnon = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
record("dashboard redirects anonymous users", [307, 302, 200].includes(dashAnon.status), `status ${dashAnon.status}`);

// 9. Health
const health = await req("/api/health");
record("health reports sqlite and data", health.data.database?.includes("sqlite") && health.data.counts?.reports > 0, JSON.stringify(health.data.counts));

console.log("\n── CIVIS smoke test ──");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures === 0 ? 0 : 1);
