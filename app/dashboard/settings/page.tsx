import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { SettingsForm } from "@/components/settings-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/dashboard/settings");

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="mx-auto max-w-[760px] px-5">
          <p className="eyebrow mb-2">Settings</p>
          <h1 className="text-[clamp(1.6rem,3.4vw,2.2rem)] font-semibold">Your account and privacy</h1>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">
            Control how you appear, what you are notified about, and what happens to your data.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[760px] px-5 py-8">
        <SettingsForm user={user} />
      </div>

      <Footer />
    </>
  );
}
