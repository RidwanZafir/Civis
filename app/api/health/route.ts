import { get } from "@/lib/db";
import { tableCount } from "@/lib/db";

export async function GET() {
  const seeded = get<{ value: string }>("SELECT value FROM meta WHERE key = 'seed_version'");
  return Response.json({
    ok: true,
    database: "sqlite (wasm driver, file-backed)",
    seeded: seeded?.value === "1",
    counts: {
      reports: tableCount("reports"),
      verified: get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM reports WHERE verification IN ('community_verified','officially_confirmed')",
      )?.n,
      users: tableCount("users"),
      responses: tableCount("authority_responses"),
    },
    emailDelivery: false,
    note: "Local demonstration deployment. No email provider is connected.",
  });
}
