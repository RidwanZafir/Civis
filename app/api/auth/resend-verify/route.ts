import { run } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { authorize } from "@/lib/auth";
import { fail } from "@/lib/http";

export async function POST() {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  if (auth.user.email_verified) return Response.json({ ok: true, alreadyVerified: true });

  const token = randomToken(24);
  run("UPDATE users SET verify_token = ? WHERE id = ?", [token, auth.user.id]);

  return Response.json({
    ok: true,
    delivery: "not-configured",
    note: "No email provider is connected, so the confirmation link is returned here.",
    url: `/auth/verify?token=${token}`,
  });
}
