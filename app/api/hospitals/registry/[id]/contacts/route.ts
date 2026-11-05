import { authorize } from "@/lib/auth";
import { deleteContact, registryFacility, upsertContact } from "@/lib/hospitals/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contact management. Only a platform administrator or an approved authority
 * account may publish a hospital contact. Everything written here is attributed
 * and carries its own verification state.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(["admin", "authority"]);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  const { id } = await context.params;
  if (!registryFacility(id)) {
    return Response.json({ error: "No facility with that identifier." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const departmentCode = String(body.departmentCode ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const source = String(body.source ?? "").trim();
  if (!departmentCode) return Response.json({ error: "Choose a department." }, { status: 422 });
  if (!phone) return Response.json({ error: "Enter a phone number." }, { status: 422 });
  if (source.length < 3) {
    return Response.json(
      { error: "Name the source you checked, for example the hospital's own website." },
      { status: 422 },
    );
  }

  const verification = ["verified", "unverified", "registry"].includes(String(body.verificationStatus))
    ? (String(body.verificationStatus) as "verified" | "unverified" | "registry")
    : "unverified";

  const contactType = ["voice", "ambulance", "emergency", "fax"].includes(String(body.contactType))
    ? (String(body.contactType) as "voice" | "ambulance" | "emergency" | "fax")
    : "voice";

  const result = upsertContact({
    facilityId: id,
    departmentCode,
    phone,
    operatingHours: body.operatingHours ? String(body.operatingHours).slice(0, 120) : null,
    contactType,
    source,
    sourceUrl: body.sourceUrl ? String(body.sourceUrl).slice(0, 400) : null,
    verificationStatus: verification,
    updatedBy: auth.user.id,
  });

  if (!result.ok) return Response.json({ error: result.message }, { status: 422 });
  return Response.json({ ok: true, facility: registryFacility(id) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(["admin", "authority"]);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  const { id } = await context.params;
  const department = new URL(request.url).searchParams.get("department") ?? "";
  if (!department) return Response.json({ error: "Name the department to remove." }, { status: 422 });

  deleteContact(id, department);
  return Response.json({ ok: true, facility: registryFacility(id) });
}
