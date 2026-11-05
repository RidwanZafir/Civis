"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleAlert, LocateFixed, MapPin } from "lucide-react";
import { Button, Field, Input, Panel, Select, Spinner, Textarea } from "@/components/ui";
import { BLOOD_GROUPS, BLOOD_SAFETY_NOTICE, COMPONENTS, URGENCIES } from "@/lib/blood/compat";

type Place = { id: string; name: string; kind: string; lat: number; lng: number; district?: string | null; city?: string | null; division?: string | null };

function todayPlus(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export function BloodRequestForm({ defaultName, defaultPhone }: { defaultName: string; defaultPhone: string }) {
  const router = useRouter();
  const [patientName, setPatientName] = useState("");
  const [bloodGroup, setBloodGroup] = useState("B+");
  const [component, setComponent] = useState("whole_blood");
  const [componentNote, setComponentNote] = useState("");
  const [units, setUnits] = useState(2);
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [requiredDate, setRequiredDate] = useState(todayPlus(0));
  const [requiredTime, setRequiredTime] = useState("18:00");
  const [urgency, setUrgency] = useState("urgent");
  const [contactName, setContactName] = useState(defaultName);
  const [contactPhone, setContactPhone] = useState(defaultPhone);
  const [contactMethod, setContactMethod] = useState<"in_app" | "phone">("in_app");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setHits([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        const data = await response.json();
        if (!controller.signal.aborted) setHits(Array.isArray(data.results) ? data.results.slice(0, 6) : []);
      } catch {
        if (!controller.signal.aborted) setHits([]);
      }
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  function detect() {
    if (!navigator.geolocation) {
      setError("GPS is unavailable in this browser. Pick the hospital district below and enter coordinates if you have them.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocationLabel("Pinned to your current location");
        setLocating(false);
      },
      (problem) => {
        setLocating(false);
        setError(
          problem.code === 1
            ? "Location permission was not granted. Choose the district below to place the hospital instead."
            : "Your position could not be found. Choose the district below.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (latitude === null || longitude === null) {
      setError("Set the hospital location with GPS or by choosing its district.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/blood/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName,
          bloodGroup,
          component,
          componentNote: component === "other" ? componentNote : null,
          unitsRequired: Number(units),
          hospitalName,
          hospitalAddress: hospitalAddress || null,
          district: district || null,
          city: city || null,
          latitude,
          longitude,
          requiredDate,
          requiredTime,
          urgency,
          contactName,
          contactPhone,
          contactMethod,
          notes: notes || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The request could not be submitted.");
      router.push(`/blood/${data.id}?created=1`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The request could not be submitted.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Panel className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Who needs blood</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Patient name" htmlFor="b-patient">
            <Input id="b-patient" value={patientName} onChange={(event) => setPatientName(event.target.value)} required maxLength={120} placeholder="Name the hospital will recognise" />
          </Field>
          <Field label="Blood group" htmlFor="b-group">
            <Select id="b-group" value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)}>
              {BLOOD_GROUPS.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="Component" htmlFor="b-component">
            <Select id="b-component" value={component} onChange={(event) => setComponent(event.target.value)}>
              {COMPONENTS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </Select>
          </Field>
          <Field label="Units required" htmlFor="b-units">
            <Input id="b-units" type="number" min={1} max={20} value={units} onChange={(event) => setUnits(Number(event.target.value))} required />
          </Field>
          {component === "other" && (
            <div className="sm:col-span-2">
              <Field label="Specify the component" htmlFor="b-component-note">
                <Input id="b-component-note" value={componentNote} onChange={(event) => setComponentNote(event.target.value)} maxLength={160} placeholder="e.g. cryoprecipitate" />
              </Field>
            </div>
          )}
        </div>
      </Panel>

      <Panel className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Hospital and location</h2>
          <button type="button" onClick={detect} disabled={locating} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent disabled:opacity-60">
            {locating ? <Spinner className="size-3.5" /> : <LocateFixed size={14} aria-hidden />}
            {locating ? "Locating" : "Use my location"}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hospital name" htmlFor="b-hospital">
            <Input id="b-hospital" value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} required maxLength={160} placeholder="City Hospital, Sylhet" />
          </Field>
          <Field label="Hospital address" htmlFor="b-address">
            <Input id="b-address" value={hospitalAddress} onChange={(event) => setHospitalAddress(event.target.value)} maxLength={300} placeholder="Street, area" />
          </Field>
          <Field label="District or city" htmlFor="b-district-search">
            <Input id="b-district-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a district" autoComplete="off" />
          </Field>
          <Field label="District" htmlFor="b-district">
            <Input id="b-district" value={district} onChange={(event) => setDistrict(event.target.value)} maxLength={80} />
          </Field>
          <Field label="City or town" htmlFor="b-city">
            <Input id="b-city" value={city} onChange={(event) => setCity(event.target.value)} maxLength={80} />
          </Field>
        </div>

        {hits.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {hits.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => {
                    setLatitude(place.lat);
                    setLongitude(place.lng);
                    setDistrict(place.district ?? place.name);
                    setCity(place.city ?? place.name);
                    setLocationLabel(`${place.name} — pin placed at the district centre. Drag or adjust below if you know the exact site.`);
                    setHits([]);
                    setQuery("");
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted hover:border-accent/30 hover:text-fg"
                >
                  {place.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Latitude" htmlFor="b-lat">
            <Input
              id="b-lat"
              type="number"
              step="any"
              value={latitude ?? ""}
              onChange={(event) => setLatitude(event.target.value === "" ? null : Number(event.target.value))}
              placeholder="24.8949"
              required
            />
          </Field>
          <Field label="Longitude" htmlFor="b-lng">
            <Input
              id="b-lng"
              type="number"
              step="any"
              value={longitude ?? ""}
              onChange={(event) => setLongitude(event.target.value === "" ? null : Number(event.target.value))}
              placeholder="91.8687"
              required
            />
          </Field>
        </div>
        {locationLabel ? (
          <p className="flex items-start gap-2 rounded-lg border border-mint/20 bg-mint/[0.04] p-2.5 text-[11px] leading-relaxed text-mint">
            <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden />{locationLabel}
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted">The public map only ever shows this hospital location, never your home or the patient&apos;s address.</p>
        )}
      </Panel>

      <Panel className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">When and how urgent</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Required date" htmlFor="b-date">
            <Input id="b-date" type="date" value={requiredDate} min={todayPlus(0)} onChange={(event) => setRequiredDate(event.target.value)} required />
          </Field>
          <Field label="Required time" htmlFor="b-time">
            <Input id="b-time" type="time" value={requiredTime} onChange={(event) => setRequiredTime(event.target.value)} required />
          </Field>
          <Field label="Urgency" htmlFor="b-urgency">
            <Select id="b-urgency" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
              {URGENCIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Additional instructions" htmlFor="b-notes">
          <Textarea id="b-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={800} placeholder="Ward, doctor, or how the donor should identify themselves at reception. Do not include medical records." />
        </Field>
      </Panel>

      <Panel className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Contact for donors</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="b-contact">
            <Input id="b-contact" value={contactName} onChange={(event) => setContactName(event.target.value)} required maxLength={120} />
          </Field>
          <Field label="Contact number" htmlFor="b-phone">
            <Input id="b-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} required maxLength={20} placeholder="+8801XXXXXXXXX" />
          </Field>
          <Field label="Preferred contact" htmlFor="b-method">
            <Select id="b-method" value={contactMethod} onChange={(event) => setContactMethod(event.target.value as "in_app" | "phone")}>
              <option value="in_app">Through CIVIS (number shown only once you accept a donor)</option>
              <option value="phone">Phone, once you accept a donor</option>
            </Select>
          </Field>
        </div>
        <p className="rounded-lg border border-warn/20 bg-warn/[0.04] p-2.5 text-[10.5px] leading-relaxed text-warn">{BLOOD_SAFETY_NOTICE}</p>
      </Panel>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-crit/25 bg-crit/5 p-3 text-xs text-crit" role="alert">
          <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />{error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner className="size-3.5" /> : null}
          {submitting ? "Submitting" : "Submit blood request"}
        </Button>
        <Link href="/blood" className="text-xs text-muted underline underline-offset-4 hover:text-fg">Cancel</Link>
        <p className="text-[10.5px] leading-relaxed text-muted">Submissions are reviewed by a moderator before donors are alerted. You will be notified of the decision.</p>
      </div>
    </form>
  );
}
