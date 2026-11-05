import { getCurrentUser } from "@/lib/auth";
import { fail } from "@/lib/http";
import { reportDetail, supportState } from "@/lib/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = reportDetail(id);
  if (!detail) return fail("Report not found.", 404);
  const user = await getCurrentUser();
  const state = supportState(user?.id ?? null, id);
  return Response.json({ ...detail, ...state, viewer: user ? { id: user.id, role: user.role } : null });
}

export async function HEAD(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exists = reportDetail(id);
  return new Response(null, { status: exists ? 200 : 404 });
}
