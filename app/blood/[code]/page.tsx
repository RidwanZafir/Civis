import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { Footer } from "@/components/footer";
import { BloodRequestDetail } from "@/components/blood/request-detail";
import { getCurrentUser } from "@/lib/auth";
import { BloodError, donorProfile, getBloodRequest, interestsForRequest } from "@/lib/blood/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blood request" };

export default async function BloodRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { code } = await params;
  const { created } = await searchParams;
  const user = await getCurrentUser();

  let data;
  try {
    data = getBloodRequest(code, user);
  } catch (error) {
    if (error instanceof BloodError && error.status === 404) notFound();
    throw error;
  }

  const { row, shape } = data;
  const canManage = !!user && (row.requester_id === user.id || user.role === "admin" || user.role === "moderator");
  const interests = user && canManage ? interestsForRequest(row.id, user) : [];
  const donor = user ? donorProfile(user.id) : null;

  return (
    <>
      <div className="mx-auto max-w-[860px] px-5 pt-28 sm:pt-32">
        <Link href="/blood" className="text-[11.5px] text-muted underline underline-offset-4 hover:text-fg">← Blood Connect</Link>
        {created === "1" && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-mint/25 bg-mint/5 p-3 text-xs text-mint" role="status">
            <CircleCheck size={15} className="mt-0.5 shrink-0" aria-hidden />
            Request received. A moderator verifies it before donors are alerted. You will be notified here when that happens.
          </p>
        )}
      </div>

      <div className="mx-auto max-w-[860px] px-5 py-6">
        <BloodRequestDetail
          request={shape as never}
          interests={interests}
          canManage={canManage}
          viewerRole={user?.role ?? null}
          hasDonorProfile={!!donor && donor.active}
        />
      </div>

      <Footer />
    </>
  );
}
