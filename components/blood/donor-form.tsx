"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, LocateFixed } from "lucide-react";
import { Button, Field, Input, Panel, Select, Spinner, Textarea } from "@/components/ui";
import { BLOOD_GROUPS } from "@/lib/blood/compat";

export type DonorProfile = {
  id: string;
  fullName: string;
  bloodGroup: string;
  city: string;
  district: string;
  preferredArea: string | null;
  contactPhone: string | null;
  latitude: number | null;
  longitude: number | null;
  locationPrivacy: string;
  availability: string;
  notificationConsent: boolean;
  contactMethod: string;
  previousDonationDate: string | null;
  note: string | null;
  active: boolean;
} | null;

const AVAILABILITY = [
  { value: "available", label: "Available to donate" },
  { value: "temporarily_unavailable", label: "Temporarily unavailable" },
  { value: "break", label: "Taking a break" },
  { value: "not_eligible", label: "Not currently eligible" },
];

export function DonorForm({ donor, defaultName }: { donor: DonorProfile; defaultName: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(donor?.fullName ?? defaultName);
  const [bloodGroup, setBloodGroup] = useState(donor?.bloodGroup ?? "O+");
  const [city, setCity] = useState(donor?.city ?? "");
  const [district, setDistrict] = useState(donor?.district ?? "");
  const [preferredArea, setPreferredArea] = useState(donor?.preferredArea ?? "");
  const [contactPhone, setContactPhone] = useState(donor?.contactPhone ?? "");
  const [latitude, setLatitude] = useState<number | null>(donor?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(donor?.longitude ?? null);
  const [locationPrivacy, setLocationPrivacy] = useState<"area" | "exact">((donor?.locationPrivacy as "area" | "exact") ?? "area");
  const [availability, setAvailability] = useState(donor?.availability ?? "available");
  const [consent, setConsent] = useState(donor?.notificationConsent ?? true);
  const [contactMethod, setContactMethod] = useState<"in_app" | "phone">((donor?.contactMethod as "in_app" | "phone") ?? "in_app");
  const [previousDonation, setPreviousDonation] = useState(donor?.previousDonationDate ?? "");
  const [note, setNote] = useState(donor?.note ?? "");
  const [active, setActive] = useState(donor?.active ?? true);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function detect() {
    if (!navigator.geolocation) { setError("GPS is unavailable in this browser. Your area is still enough for matching."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Your position could not be read. Choose your district — matching still works from the district centre.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    setSaving(true);
    try {
      const response = await fetch("/api/blood/donor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          bloodGroup,
          city,
          district,
          preferredArea: preferredArea || null,
          contactPhone: contactPhone || null,
          latitude,
          longitude,
          locationPrivacy,
          availability,
          notificationConsent: consent,
          contactMethod,
          previousDonationDate: previousDonation || null,
          note: note || null,
          active,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your donor profile could not be saved.");
      setSaved(data.message ?? "Saved.");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Your donor profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Panel className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Donor details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="d-name">
            <Input id="d-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={120} />
          </Field>
          <Field label="Blood group" htmlFor="d-group">
            <Select id="d-group" value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)}>
              {BLOOD_GROUPS.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="City" htmlFor="d-city">
            <Input id="d-city" value={city} onChange={(event) => setCity(event.target.value)} required maxLength={80} placeholder="Sylhet" />
          </Field>
          <Field label="District" htmlFor="d-district">
            <Input id="d-district" value={district} onChange={(event) => setDistrict(event.target.value)} required maxLength={80} placeholder="Sylhet" />
          </Field>
          <Field label="Preferred donation area" htmlFor="d-area" hint="Used to match requests near you.">
            <Input id="d-area" value={preferredArea} onChange={(event) => setPreferredArea(event.target.value)} maxLength={120} placeholder="Amberkhana, Sylhet" />
          </Field>
          <Field label="Previous donation date" htmlFor="d-last">
            <Input id="d-last" type="date" value={previousDonation ?? ""} onChange={(event) => setPreviousDonation(event.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Contact and privacy</h2>
          <button type="button" onClick={detect} disabled={locating} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent disabled:opacity-60">
            {locating ? <Spinner className="size-3.5" /> : <LocateFixed size={14} aria-hidden />}
            {locating ? "Locating" : latitude !== null ? "Update my area point" : "Add my area point"}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact number" htmlFor="d-phone" hint="Only shared with a requester whose offer you accept.">
            <Input id="d-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={20} placeholder="+8801XXXXXXXXX" />
          </Field>
          <Field label="Preferred contact method" htmlFor="d-method">
            <Select id="d-method" value={contactMethod} onChange={(event) => setContactMethod(event.target.value as "in_app" | "phone")}>
              <option value="in_app">Through CIVIS</option>
              <option value="phone">Phone (shared only after you accept)</option>
            </Select>
          </Field>
          <Field label="Availability" htmlFor="d-availability">
            <Select id="d-availability" value={availability} onChange={(event) => setAvailability(event.target.value)}>
              {AVAILABILITY.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </Select>
          </Field>
          <Field label="Location privacy" htmlFor="d-privacy" hint="CIVIS never shows your exact point to the public.">
            <Select id="d-privacy" value={locationPrivacy} onChange={(event) => setLocationPrivacy(event.target.value as "area" | "exact")}>
              <option value="area">Area only</option>
              <option value="exact">Exact point for matching (still not public)</option>
            </Select>
          </Field>
        </div>
        <p className="text-[11px] text-muted">
          {latitude !== null && longitude !== null
            ? `Area point: ${latitude.toFixed(3)}, ${longitude.toFixed(3)} — used only to compute distance for matching.`
            : "No area point set. Matching falls back to your district centre."}
        </p>
        <Field label="Notes for the coordinator (optional)" htmlFor="d-note">
          <Textarea id="d-note" rows={2} value={note ?? ""} onChange={(event) => setNote(event.target.value)} maxLength={400} placeholder="Days or times you can usually donate." />
        </Field>
      </Panel>

      <Panel className="space-y-3 p-5">
        <label className="flex items-start gap-3 text-[12px] leading-relaxed">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-4 accent-[#36D9FF]" />
          <span>Alert me about compatible requests in my area. Without this, your profile stays registered but you receive no donation alerts.</span>
        </label>
        <label className="flex items-start gap-3 text-[12px] leading-relaxed">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="mt-0.5 size-4 accent-[#36D9FF]" />
          <span>Keep my donor profile active. Turning this off hides you from matching and deactivates your profile without deleting it.</span>
        </label>
        <p className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[10.5px] leading-relaxed text-muted">
          CIVIS never decides whether you are eligible to donate. Eligibility, screening and compatibility are confirmed by the
          hospital or licensed blood bank, and you can withdraw at any time.
        </p>
      </Panel>

      {error && <p className="flex items-start gap-2 rounded-xl border border-crit/25 bg-crit/5 p-3 text-xs text-crit" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />{error}</p>}
      {saved && <p className="flex items-start gap-2 rounded-xl border border-mint/25 bg-mint/5 p-3 text-xs text-mint" role="status"><CircleCheck size={15} className="mt-0.5 shrink-0" aria-hidden />{saved}</p>}

      <Button type="submit" disabled={saving}>
        {saving ? <Spinner className="size-3.5" /> : null}
        {saving ? "Saving" : donor ? "Update donor profile" : "Register as a blood donor"}
      </Button>
    </form>
  );
}
