import { NextResponse } from "next/server";
import { clearSessionCookie, audit, getCurrentUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  await clearSessionCookie();
  if (user) {
    audit({ id: user.id, role: user.role, name: user.name }, "user.sign_out", {
      type: "user",
      id: user.id,
    });
  }
  return NextResponse.redirect(new URL("/", req.url), 303);
}

export async function GET(req: Request) {
  return POST(req);
}
