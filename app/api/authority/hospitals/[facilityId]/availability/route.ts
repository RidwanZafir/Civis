import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import {
  departmentAvailability,
  hasApprovedHospitalLink,
  HospitalAvailabilityError,
  hospitalAvailabilityHistory,
  publishHospitalAvailability,
  requireHealthOrganisation,
} from "@/lib/hospitals/repo";

export const runtime = "nodejs";

const wardSchema = z.object({
  code: z.string().trim().min(1).max(60),
  totalBeds: z.number().int().min(0).max(100_000).nullable(),
  availableBeds: z.number().int().min(0).max(100_000).nullable(),
  admissionStatus: z.enum(["open", "limited", "full", "closed", "unknown"]),
});

const serviceSchema = z.object({
  code: z.string().trim().min(1).max(60),
  exists: z.boolean(),
  availabilityStatus: z.enum(["available", "restricted", "unavailable", "closed", "unknown"]),
  operatingHours: z.string().trim().max(120).nullable().optional(),
  emergencyAvailable: z.boolean().nullable().optional(),
  contact: z.string().trim().max(60).nullable().optional(),
});

const publishSchema = z.object({
  expectedVersion: z.number().int().min(0),
  source: z.string().trim().min(3).max(240),
  note: z.string().trim().max(1000).nullable().optional(),
  wards: z.array(wardSchema).max(80),
  services: z.array(serviceSchema).max(80),
});

export async function GET(_request: Request, { params }: { params: Promise<{ facilityId: string }> }) {
  const { facilityId } = await params;
  const auth = await authorize(["authority"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  try {
    requireHealthOrganisation(auth.user.department_id);
    if (!hasApprovedHospitalLink(facilityId, auth.user.department_id!)) {
      return fail("Your organisation is not approved to report availability for this hospital.", 403);
    }
    return Response.json({
      availability: departmentAvailability(facilityId, auth.user.department_id!),
      history: hospitalAvailabilityHistory(facilityId, auth.user.department_id!, 20),
    });
  } catch (problem) {
    if (problem instanceof HospitalAvailabilityError) return fail(problem.message, problem.status);
    return fail("The availability report could not be loaded.", 500);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ facilityId: string }> }) {
  const { facilityId } = await params;
  const auth = await authorize(["authority"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  const parsed = publishSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the availability report.", 422);
  try {
    const availability = publishHospitalAvailability(
      auth.user.id,
      auth.user.department_id!,
      facilityId,
      parsed.data,
    );
    return Response.json({
      availability,
      history: hospitalAvailabilityHistory(facilityId, auth.user.department_id!, 20),
    });
  } catch (problem) {
    if (problem instanceof HospitalAvailabilityError) return fail(problem.message, problem.status);
    return fail("The availability report could not be saved. Try again shortly.", 500);
  }
}
