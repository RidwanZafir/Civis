import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { BloodRequestForm } from "@/components/blood/request-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request blood" };

export default async function NewBloodRequestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/blood/new");

  return (
    <>
      <div className="mx-auto max-w-[820px] px-5 pt-28 sm:pt-32">
        <p className="eyebrow mb-2">Blood Connect</p>
        <h1 className="text-[clamp(1.6rem,3.6vw,2.2rem)] font-semibold">Request blood</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
          Submit the hospital, the component and the time it is needed. A moderator verifies the request before
          compatible donors nearby are alerted — urgent requests are reviewed first.
        </p>
        <p className="mt-2 text-[11.5px] text-muted">
          Looking for a request to help with? <Link href="/blood" className="text-accent underline underline-offset-4">Browse active requests</Link>.
        </p>
      </div>

      <div className="mx-auto max-w-[820px] px-5 py-8">
        <BloodRequestForm defaultName={user.name} defaultPhone="" />
      </div>

      <Footer />
    </>
  );
}
