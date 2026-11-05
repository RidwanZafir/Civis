import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { DonorForm } from "@/components/blood/donor-form";
import { getCurrentUser } from "@/lib/auth";
import { donorProfile } from "@/lib/blood/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Become a blood donor" };

export default async function DonorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/blood/donor");
  if (user.role === "authority") {
    return (
      <>
        <div className="mx-auto max-w-[720px] px-5 pt-32 text-center">
          <h1 className="text-xl font-semibold">Donor profiles use personal accounts</h1>
          <p className="mt-2 text-sm text-muted">
            This account represents an organisation. Sign in with a personal account to register as a voluntary donor.
          </p>
          <Link href="/blood" className="mt-4 inline-block text-sm text-accent underline underline-offset-4">Back to Blood Connect</Link>
        </div>
        <Footer />
      </>
    );
  }

  const donor = donorProfile(user.id);

  return (
    <>
      <div className="mx-auto max-w-[820px] px-5 pt-28 sm:pt-32">
        <p className="eyebrow mb-2">Blood Connect</p>
        <h1 className="text-[clamp(1.6rem,3.6vw,2.2rem)] font-semibold">{donor ? "Your donor profile" : "Become a blood donor"}</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
          Registering puts you on the list of voluntary donors in your area. You choose your availability, the radius
          of alerts and whether CIVIS may contact you at all — and you can withdraw everything at any time.
        </p>
        <p className="mt-2 text-[11.5px] text-muted">
          Requesters never see your exact location. <Link href="/blood" className="text-accent underline underline-offset-4">Browse active requests</Link>.
        </p>
      </div>

      <div className="mx-auto max-w-[820px] px-5 py-8">
        <DonorForm donor={donor} defaultName={user.name} />
      </div>

      <Footer />
    </>
  );
}
