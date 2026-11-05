/**
 * Dual-portal smoke test: local place search, viewport facility loading,
 * authority registration -> admin verification -> access gate, and routing on
 * report creation. Run against a live dev/prod server:
 *
 *   node scripts/portal-smoke.mjs http://localhost:3100
 */

const base = process.argv[2] ?? "http://localhost:3100";
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

async function json(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    redirect: "manual",
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 120);
  }
  return { status: res.status, body, cookies: res.headers.getSetCookie?.() ?? [] };
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function main() {
  // --- local geographic search -------------------------------------------------
  const places = await json("/api/places?q=dhaka");
  check(
    "place search returns Bangladesh divisions/districts",
    places.status === 200 && places.body.results?.some((r) => r.name === "Dhaka"),
    `${places.body.results?.length ?? 0} result(s)`,
  );
  check(
    "place search reports misses honestly",
    (await json("/api/places?q=zzzzzz")).body.message?.includes("No place"),
  );

  // --- viewport facilities -----------------------------------------------------
  const facilities = await json("/api/map/facilities?bbox=88.2,22.4,88.5,22.7&types=hospital,fire");
  check(
    "facilities load inside a bounding box only",
    facilities.status === 200 && facilities.body.facilities?.length > 0,
    `${facilities.body.count} row(s)`,
  );
  const policeOnly = await json("/api/map/facilities?bbox=88.2,22.4,88.5,22.7&types=police");
  check(
    "facility type filter is honoured",
    policeOnly.body.facilities?.every((f) => f.type === "police"),
  );

  // --- authority registration (public, no session) -----------------------------
  const email = `org${Date.now()}@authority.example`;
  const register = await json("/api/authorities/register", {
    method: "POST",
    body: JSON.stringify({
      organisationName: "Riverside Fire & Rescue",
      organisationType: "fire",
      country: "Bangladesh",
      division: "Dhaka",
      district: "Dhaka",
      officeAddress: "12 Riverside Road, Dhaka",
      contactNumber: "+880 1700 000000",
      officialEmail: "office@riverside.example",
      repName: "Test Representative",
      repDesignation: "Operations Lead",
      repEmail: email,
      repPhone: "+880 1700 000001",
      repRole: "Head of response",
      documents: "Notification reference DEMO-001",
      password: "Author!ty2026",
    }),
  });
  check("authority registration is accepted as pending", register.status === 201 && register.body.status === "pending");
  const applicationId = register.body.applicationId;
  check("registration returns a pending message", String(register.body.message).includes("pending verification"));

  // --- the unverified organisation cannot reach authority features -------------
  const signIn = await json("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ email, password: "Author!ty2026" }),
  });
  const jar = Object.fromEntries(
    (signIn.cookies ?? []).map((c) => {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      return [k, v];
    }),
  );
  const auth = { Cookie: cookieHeader(jar) };
  const blocked = await json("/api/authority/assign", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ reportId: "CIV-000000" }),
  });
  check("unverified authority is blocked server-side", blocked.status === 403, `status ${blocked.status}`);
  check(
    "block reason mentions pending verification",
    String(blocked.body?.error ?? "").toLowerCase().includes("pending verification"),
  );
  const adminProbe = await json("/api/admin/applications", { headers: auth });
  check("authority cannot read the admin application queue", adminProbe.status === 403);

  // --- super admin review ------------------------------------------------------
  const adminSignIn = await json("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ email: "admin@civis.demo", password: "CivisDemo!23" }),
  });
  const adminJar = Object.fromEntries(
    (adminSignIn.cookies ?? []).map((c) => {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      return [k, v];
    }),
  );
  const adminAuth = { Cookie: cookieHeader(adminJar) };

  const queue = await json("/api/admin/applications", { headers: adminAuth });
  check(
    "super admin sees the application queue",
    queue.status === 200 && queue.body.applications?.some((a) => a.id === applicationId),
  );

  const approve = await json("/api/admin/applications", {
    method: "PATCH",
    headers: adminAuth,
    body: JSON.stringify({ id: applicationId, action: "approve", notes: "Documents verified." }),
  });
  check("super admin approves the organisation", approve.status === 200 && approve.body.organisationStatus === "approved");

  const after = await json("/api/authority/assign", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ reportId: "CIV-000000" }),
  });
  check(
    "approval unlocks authority actions (no longer a pending-verification block)",
    after.status !== 403 || !String(after.body?.error ?? "").toLowerCase().includes("pending verification"),
    `status ${after.status}`,
  );

  // --- routing on report creation ---------------------------------------------
  const citizen = await json("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ email: "citizen@civis.demo", password: "CivisDemo!23" }),
  });
  const citizenJar = Object.fromEntries(
    (citizen.cookies ?? []).map((c) => {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      return [k, v];
    }),
  );
  const created = await json("/api/reports", {
    method: "POST",
    headers: { Cookie: cookieHeader(citizenJar) },
    body: JSON.stringify({
      title: "Routing smoke test incident report",
      description:
        "A sufficiently long description so the report validates: broken asphalt across the junction near the market gate, hazardous after dark.",
      category: "roads",
      severity: "high",
      lat: 22.5726,
      lng: 88.3639,
      address: "Test junction",
      neighborhood: "Park Street",
      confirmDistinct: true,
    }),
  });
  check("report creation succeeds", created.status === 201, `status ${created.status}`);
  check("report returns a routing outcome", typeof created.body.routing?.routed === "boolean");
  check(
    "routing is described with a real destination or an honest queue message",
    Boolean(created.body.routing?.organisation) || /central queue|no verified/i.test(created.body.routing?.message ?? ""),
  );

  const health = await json("/api/health");
  check("health reports seeded database", health.status === 200 && health.body.ok === true);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Smoke run failed:", error);
  process.exit(1);
});
