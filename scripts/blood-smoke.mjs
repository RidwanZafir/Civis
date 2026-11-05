/**
 * Blood Connect + notification smoke test.
 *
 * Exercises the real HTTP surface against a running server on a real database:
 * donor registration, request creation, moderation, matching alerts, donor
 * interest, contact protection, fulfilment and the notification centre.
 *
 *   node scripts/blood-smoke.mjs http://localhost:3100
 */

const base = process.argv[2] ?? "http://localhost:3100";
const PASSWORD = "CivisDemo!23";
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

function cookieHeader(jar) {
  return Object.entries(jar).map(([key, value]) => `${key}=${value}`).join("; ");
}

function storeCookies(jar, response) {
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
}

async function request(path, { method = "GET", body, jar } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(jar ? { Cookie: cookieHeader(jar) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  if (jar) storeCookies(jar, response);
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 160); }
  return { status: response.status, data, headers: response.headers };
}

async function signIn(email) {
  const jar = {};
  const result = await request("/api/auth/sign-in", {
    method: "POST",
    body: { email, password: PASSWORD },
    jar,
  });
  return { jar, status: result.status, user: result.data?.user };
}

const health = await request("/api/health");
check("server healthy", health.status === 200, `reports=${health.data?.counts?.reports}`);
if (health.status !== 200) {
  console.log("\nCannot continue without a running server.");
  process.exit(1);
}

const publicList = await request("/api/blood/requests?status=open");
check("public request feed responds", publicList.status === 200 && Array.isArray(publicList.data?.requests));
check("safety notice present", typeof publicList.data?.safety === "string" && publicList.data.safety.includes("blood bank"));

const citizen = await signIn("citizen@civis.demo");
check("citizen sign-in", citizen.status === 200, citizen.user?.email);

const moderator = await signIn("moderator@civis.demo");
check("moderator sign-in", moderator.status === 200, moderator.user?.role);

// ── Donor registration (moderator acts as a volunteer donor) ────────────────
const donorSave = await request("/api/blood/donor", {
  method: "PUT",
  jar: moderator.jar,
  body: {
    fullName: "Moderator Donor",
    bloodGroup: "B+",
    city: "Sylhet",
    district: "Sylhet",
    preferredArea: "Amberkhana",
    contactPhone: "+8801700000001",
    latitude: 24.8999,
    longitude: 91.8701,
    locationPrivacy: "area",
    availability: "available",
    notificationConsent: true,
    contactMethod: "in_app",
  },
});
check("donor registration saves", donorSave.status === 200 && donorSave.data?.donor?.bloodGroup === "B+");

const donorRead = await request("/api/blood/donor", { jar: moderator.jar });
check("donor profile reads back", donorRead.status === 200 && donorRead.data?.donor?.district === "Sylhet");

// ── Request creation ───────────────────────────────────────────────────────
const stamp = Date.now();
const requiredDate = new Date(Date.now() + 6 * 3_600_000);
const created = await request("/api/blood/requests", {
  method: "POST",
  jar: citizen.jar,
  body: {
    patientName: `Smoke Patient ${stamp}`,
    bloodGroup: "B+",
    component: "whole_blood",
    unitsRequired: 2,
    hospitalName: "Sylhet MAG Osmani Medical College Hospital",
    hospitalAddress: "Medical Road",
    district: "Sylhet",
    city: "Sylhet",
    latitude: 24.8949,
    longitude: 91.8687,
    requiredDate: requiredDate.toISOString().slice(0, 10),
    requiredTime: requiredDate.toISOString().slice(11, 16),
    urgency: "urgent",
    contactName: "Citizen Requester",
    contactPhone: `+88018${String(stamp).slice(-8)}`,
    contactMethod: "in_app",
    notes: "Smoke test request.",
  },
});
check("blood request created", created.status === 201, `code=${created.data?.code}`);
check("request code format", /^CIVIS-BLOOD-\d{4}-\d{5}$/.test(created.data?.code ?? ""), created.data?.code);
check("new request is not auto-verified", created.data?.status === "pending_verification");
const requestId = created.data?.id;

const duplicate = await request("/api/blood/requests", { method: "POST", jar: citizen.jar, body: {
  patientName: `Smoke Patient ${stamp}`,
  bloodGroup: "B+",
  component: "whole_blood",
  unitsRequired: 2,
  hospitalName: "Sylhet MAG Osmani Medical College Hospital",
  latitude: 24.8949,
  longitude: 91.8687,
  requiredDate: requiredDate.toISOString().slice(0, 10),
  requiredTime: requiredDate.toISOString().slice(11, 16),
  urgency: "urgent",
  contactName: "Citizen Requester",
  contactPhone: `+88018${String(stamp).slice(-8)}`,
  notes: "Duplicate attempt.",
} });
check("duplicate submission rejected", duplicate.status === 409, `status=${duplicate.status}`);

// ── Privacy of the public shape ────────────────────────────────────────────
const anonDetail = await request(`/api/blood/requests/${requestId}`);
check("anonymous detail hides contact", anonDetail.status === 200 && anonDetail.data?.request?.contactPhone === null);
check("anonymous detail masks patient", /•/.test(anonDetail.data?.request?.patientName ?? "") || anonDetail.data?.request?.redacted === true);
check("anonymous cannot manage", anonDetail.data?.canManage === false);

const outsiderModeration = await request("/api/blood/moderation", { jar: citizen.jar });
check("citizen blocked from moderation queue", outsiderModeration.status === 403, `status=${outsiderModeration.status}`);

// ── Moderator notification + verification ──────────────────────────────────
const moderatorInbox = await request("/api/notifications?filter=blood", { jar: moderator.jar });
const bloodAlerts = moderatorInbox.data?.notifications ?? [];
check(
  "moderator notified of new request",
  bloodAlerts.some((item) => item.blood_request_id === requestId && item.action_url === `/blood/${requestId}`),
  `${bloodAlerts.length} blood alerts`,
);

const verify = await request("/api/blood/moderation", {
  method: "POST",
  jar: moderator.jar,
  body: { id: requestId, action: "verify", notes: "Contact confirmed during smoke test." },
});
check("moderator verifies request", verify.status === 200 && verify.data?.status === "verified");
check("matching donors alerted on verification", (verify.data?.donorsNotified ?? 0) >= 1, `donors=${verify.data?.donorsNotified}`);

const donorMatch = await request("/api/notifications?filter=blood", { jar: moderator.jar });
check(
  "donor receives compatible match alert",
  (donorMatch.data?.notifications ?? []).some((item) => item.type === "blood_donor_match" || item.type === "blood_request_urgent"),
);

// ── Donor interest → requester ─────────────────────────────────────────────
const interest = await request(`/api/blood/requests/${requestId}/interest`, {
  method: "POST",
  jar: moderator.jar,
  body: { message: "I can reach the hospital within two hours." },
});
check("donor can offer to donate", interest.status === 200 && interest.data?.status === "offered");

const requesterInbox = await request("/api/notifications?filter=blood", { jar: citizen.jar });
check(
  "requester notified of donor offer",
  (requesterInbox.data?.notifications ?? []).some((item) => item.type === "blood_donor_interest" && item.blood_request_id === requestId),
);

const ownerView = await request(`/api/blood/requests/${requestId}`, { jar: citizen.jar });
const offer = ownerView.data?.interests?.[0];
check("requester sees the offer", ownerView.data?.canManage === true && !!offer);
check("unaccepted offer hides donor contact", offer?.contact_phone === null);
check(
  "unaccepted offer hides donor identity",
  !!offer?.donor_name && offer.donor_name !== "Moderator Donor" && offer.donor_name.length <= 8,
  offer?.donor_name,
);

const accept = await request(`/api/blood/requests/${requestId}/interest`, {
  method: "PATCH",
  jar: citizen.jar,
  body: { interestId: offer?.id, status: "accepted" },
});
check("requester accepts offer", accept.status === 200 && accept.data?.status === "accepted");

const acceptedView = await request(`/api/blood/requests/${requestId}`, { jar: citizen.jar });
check("accepted offer shares contact", !!acceptedView.data?.interests?.[0]?.contact_phone);

// ── Fulfilment stops matching ──────────────────────────────────────────────
const fulfil = await request(`/api/blood/requests/${requestId}`, {
  method: "PATCH",
  jar: citizen.jar,
  body: { status: "fulfilled" },
});
check("requester marks request fulfilled", fulfil.status === 200 && fulfil.data?.status === "fulfilled");

const openAfter = await request("/api/blood/requests?status=open&limit=100");
check("fulfilled request leaves the open feed", !(openAfter.data?.requests ?? []).some((item) => item.id === requestId));

const lateInterest = await request(`/api/blood/requests/${requestId}/interest`, {
  method: "POST",
  jar: moderator.jar,
  body: {},
});
check("closed request stops accepting donors", lateInterest.status === 409, `status=${lateInterest.status}`);

const reVerify = await request("/api/blood/moderation", {
  method: "POST",
  jar: moderator.jar,
  body: { id: requestId, action: "verify", notes: "Should be refused." },
});
check("closed request cannot be re-verified", reVerify.status === 409, `status=${reVerify.status}`);

// ── Notification centre ────────────────────────────────────────────────────
const unreadBefore = await request("/api/notifications", { jar: citizen.jar });
check("notification centre returns items", unreadBefore.status === 200 && Array.isArray(unreadBefore.data?.notifications));
check("category counts are exposed", typeof unreadBefore.data?.byCategory === "object");

const markAll = await request("/api/notifications", { method: "POST", jar: citizen.jar, body: { all: true } });
check("mark all as read clears unread", markAll.status === 200 && markAll.data?.unread === 0);

const filtered = await request("/api/notifications?filter=blood", { jar: citizen.jar });
check(
  "category filter returns only blood alerts",
  (filtered.data?.notifications ?? []).every((item) => (item.category ?? "") === "blood"),
);

// ── Realtime stream ────────────────────────────────────────────────────────
{
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  let contentType = "";
  let firstFrame = "";
  try {
    const stream = await fetch(`${base}/api/notifications/stream`, {
      headers: { Cookie: cookieHeader(citizen.jar) },
      signal: controller.signal,
    });
    contentType = stream.headers.get("content-type") ?? "";
    const reader = stream.body.getReader();
    const chunk = await reader.read();
    firstFrame = new TextDecoder().decode(chunk.value ?? new Uint8Array());
    await reader.cancel();
  } catch {
    // Aborting after the first frame is expected.
  } finally {
    clearTimeout(timer);
  }
  check("notification stream is event-stream", contentType.includes("text/event-stream"), contentType);
  check("stream sends an initial frame", firstFrame.includes("event: ready"), firstFrame.slice(0, 40));
}

const signedOutStream = await fetch(`${base}/api/notifications/stream`);
check("stream rejects anonymous callers", signedOutStream.status === 401, `status=${signedOutStream.status}`);

console.log(`\n${pass}/${pass + fail} blood + notification checks passed`);
if (fail > 0) process.exit(1);
