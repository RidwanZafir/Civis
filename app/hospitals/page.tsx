import type { Metadata } from "next";
import { HospitalDirectory } from "@/components/hospitals/hospital-directory";
import { getCurrentUser } from "@/lib/auth";
import {
  DEPARTMENT_OPTIONS,
  FACILITY_CATEGORIES,
  registrySearch,
  registrySummary,
} from "@/lib/hospitals/registry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sylhet Division hospital directory",
  description:
    "Browse every facility in the official Sylhet Division hospital registry, filter by district, upazila and type, and call departments directly.",
};

export default async function HospitalsPage() {
  const user = await getCurrentUser();
  const initial = registrySearch({ mode: "region", pageSize: 24 });
  const summary = registrySummary();

  const canManage =
    user?.role === "admin" || (user?.role === "authority" && user.org_status === "approved");

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-20 pt-28 sm:px-6">
      <HospitalDirectory
        initial={{ items: initial.items, total: initial.total, page: initial.page, asOf: initial.asOf }}
        summary={summary}
        categories={FACILITY_CATEGORIES}
        departments={DEPARTMENT_OPTIONS}
        canManage={canManage}
      />
    </div>
  );
}
