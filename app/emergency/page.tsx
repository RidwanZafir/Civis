import type { Metadata } from "next";
import { EmergencyCenter } from "@/components/emergency/EmergencyCenter";
import { getEmergencyDirectory } from "@/lib/emergency/directory";
import "./emergency.css";

export const metadata: Metadata = {
  title: "Emergency Center",
  description: "Verified emergency calls, supported emergency texts, and nearby hospitals with location sharing.",
};
export const dynamic = "force-dynamic";

export default function EmergencyPage() {
  return <EmergencyCenter initial={getEmergencyDirectory("BD")} />;
}
