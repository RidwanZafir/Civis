import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthorityRegisterForm } from "@/components/authority/register-form";
import { Footer } from "@/components/footer";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register your organisation" };

export default async function RegisterAuthorityPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(55%_100%_at_40%_0%,rgba(67,214,160,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[820px] px-5">
          <p className="eyebrow mb-2">Authority access</p>
          <h1 className="text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold">
            Register your organisation
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Authorisations are reviewed by CIVIS administrators before access is granted. Submitting
            this form does not create an active authority account.
          </p>
          <p className="mt-2 text-[11.5px] text-muted">
            Already verified?{" "}
            <Link href="/auth/sign-in?portal=authority" className="text-accent hover:underline">
              Authority sign in
            </Link>
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[820px] px-5 py-8">
        <AuthorityRegisterForm />
      </div>
      <Footer />
    </>
  );
}
