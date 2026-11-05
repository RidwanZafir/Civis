"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { Activity, Ambulance, ArrowDown, Check, Copy, Flame, Globe2, HeartPulse, MapPin, MessageSquare, Navigation, Phone, Search, Shield, Siren, TriangleAlert, Waves, Car, TrainFront, Zap, Building2, Droplets, UserSearch } from "lucide-react";
import { Button, Field, Input, Panel, Select, Spinner, Textarea, cx } from "@/components/ui";
import { FacilityFinder } from "./FacilityFinder";
import type { EmergencyContact, EmergencyCountry, EmergencyService, IncidentCategory } from "@/lib/emergency/types";
import { mapsLocationUrl, prepareEmergencyMessage, smsUri, telephoneUri, type AlertLocation } from "@/lib/emergency/communication";

export type DirectoryData = {
  countries: EmergencyCountry[]; services: EmergencyService[]; incidents: IncidentCategory[];
  country: EmergencyCountry; contacts: EmergencyContact[]; coverageNote: string;
};

const GROUPS = [{ id: "accidents", label: "Accidents", icon: Car }, { id: "fire", label: "Fire & hazards", icon: Flame }, { id: "medical", label: "Medical", icon: HeartPulse }, { id: "other", label: "Other emergencies", icon: TriangleAlert }] as const;
const SERVICE_ICONS: Record<string, typeof Phone> = { general: Siren, police: Shield, fire: Flame, ambulance: Ambulance, coast_guard: Waves, search_rescue: UserSearch, disaster: TriangleAlert, hazmat: Droplets };

function incidentIcon(incident: IncidentCategory) {
  if (/train/i.test(incident.label)) return TrainFront;
  if (/electrical|gas|fuel/i.test(incident.label)) return Zap;
  if (/building/i.test(incident.label)) return Building2;
  if (/flood|drowning/i.test(incident.label)) return Waves;
  if (/missing/i.test(incident.label)) return UserSearch;
  return GROUPS.find((group) => group.id === incident.group)?.icon ?? TriangleAlert;
}

export function EmergencyCenter({ initial }: { initial: DirectoryData }) {
  const [data, setData] = useState(initial);
  const [countryCode, setCountryCode] = useState(initial.country.code);
  const [regionCode, setRegionCode] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [group, setGroup] = useState<IncidentCategory["group"]>("accidents");
  const [incidentId, setIncidentId] = useState(initial.incidents.find((item) => /road accident/i.test(item.label))?.id ?? initial.incidents[0]?.id ?? "");
  const [contactId, setContactId] = useState("");
  const [loading, setLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [reload, setReload] = useState(0);
  const [location, setLocation] = useState<AlertLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [description, setDescription] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [people, setPeople] = useState("");
  const [additional, setAdditional] = useState("");
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [smsEligible, setSmsEligible] = useState(false);
  const [status, setStatus] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const detectionStarted = useRef(false);
  const locationGeneration = useRef(0);
  const [hydrated, setHydrated] = useState(false);

  const incident = data.incidents.find((item) => item.id === incidentId) ?? data.incidents[0];
  const selectedCountry = data.countries.find((item) => item.code === countryCode) ?? data.country;
  const currentCountryData = data.country.code === countryCode;
  const contacts = useMemo(() => currentCountryData && !loading && !directoryError ? data.contacts.filter((contact) => contact.verificationStatus === "verified" && contact.voiceSupported && (!incident || incident.serviceIds.includes(contact.serviceId))) : [], [data, currentCountryData, loading, directoryError, incident]);
  const selectedContact = contacts.find((contact) => contact.id === contactId) ?? contacts.find((contact) => contact.sms.supported) ?? contacts[0];
  const message = editedMessage ?? prepareEmergencyMessage({ incident: incident?.label ?? "Emergency", description, location, manualLocation, people, additional });
  const smsAvailable = selectedContact?.verificationStatus === "verified" && selectedContact.sms.supported && !!selectedContact.sms.number && !!selectedContact.sms.source && !!selectedContact.sms.verifiedAt;
  const countries = data.countries.filter((item) => `${item.name} ${item.code} ${item.dialCode}`.toLowerCase().includes(countrySearch.toLowerCase()));

  useEffect(() => {
    setUserAgent(/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1 ? `${navigator.userAgent} iPad` : navigator.userAgent);
    try {
      const preference = sessionStorage.getItem("civis-emergency-country");
      const localeCode = navigator.language.match(/-([A-Z]{2})$/i)?.[1]?.toUpperCase();
      const candidate = preference ?? localeCode;
      if (candidate && initial.countries.some((item) => item.code === candidate)) setCountryCode(candidate);
    } catch { /* Manual selection always remains available. */ }
    setHydrated(true);
  }, [initial.countries]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    setLoading(true);
    setDirectoryError("");
    setSmsEligible(false);
    try { sessionStorage.setItem("civis-emergency-country", countryCode); } catch { /* Optional preference. */ }
    fetch(`/api/emergency/directory?country=${encodeURIComponent(countryCode)}&region=${encodeURIComponent(regionCode)}`, { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not load emergency contacts."); return result; })
      .then((result: DirectoryData) => { if (!controller.signal.aborted) { setData(result); setContactId(""); } })
      .catch((error: Error) => { if (error.name !== "AbortError") setDirectoryError("Could not load this country's contacts. Check your connection and retry."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [countryCode, regionCode, hydrated, reload]);

  async function locate() {
    if (locating) return;
    if (!navigator.geolocation) { setLocationStatus("GPS is unavailable. Search a city or address in Nearby Hospitals."); return; }
    const generation = ++locationGeneration.current;
    setLocating(true);
    setLocationStatus("Requesting location permission…");
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const fallback = { lat: coords.latitude, lng: coords.longitude, address: `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` };
      if (generation !== locationGeneration.current) return;
      setLocation(fallback);
      setLocationStatus("GPS location ready. Detecting country…");
      try {
        const response = await fetch(`/api/emergency/location?lat=${coords.latitude}&lng=${coords.longitude}`);
        const result = await response.json();
        if (!response.ok) throw new Error();
        if (generation !== locationGeneration.current) return;
        setLocation(result.location);
        setLocationStatus("Location ready. Confirm the selected country before calling.");
        if (result.countryCode && data.countries.some((item) => item.code === result.countryCode)) {
          const detected = data.countries.find((item) => item.code === result.countryCode);
          const region = detected?.regions.find((item) => item.name.toLowerCase() === String(result.region).toLowerCase());
          if (result.countryCode !== countryCode || (region?.code ?? "") !== regionCode) setLoading(true);
          setCountryCode(result.countryCode);
          setRegionCode(region?.code ?? "");
        }
      } catch { if (generation === locationGeneration.current) setLocationStatus("GPS coordinates ready. Select your country manually; address lookup is unavailable."); }
      finally { if (generation === locationGeneration.current) setLocating(false); }
    }, (error) => {
      if (generation !== locationGeneration.current) return;
      setLocating(false);
      setLocationStatus(error.code === 1 ? "Location permission denied. You can still choose a country and search hospitals manually." : "Could not get GPS location. Search a city or address in Nearby Hospitals.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  useEffect(() => {
    if (detectionStarted.current) return;
    detectionStarted.current = true;
    // Reuse existing permission; the visible button requests new permission.
    navigator.permissions?.query({ name: "geolocation" }).then((permission) => { if (permission.state === "granted") void locate(); }).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function copy(text: string, success: string) {
    try { await navigator.clipboard.writeText(text); setStatus(success); }
    catch { setStatus("Copy is unavailable in this browser. Select and copy the message below."); }
  }

  async function shareLocation() {
    if (!location) return;
    const text = `${location.address}\n${mapsLocationUrl(location)}`;
    try {
      if (navigator.share) { await navigator.share({ title: "Emergency location", text }); setStatus("Location shared using your device."); }
      else await copy(text, "Location link copied.");
    } catch (error) { if ((error as Error).name !== "AbortError") await copy(text, "Location link copied."); }
  }

  return <MotionConfig reducedMotion="user"><div className="emergency-center mx-auto max-w-[1240px] px-4 pb-20 pt-28 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
      <div className="flex items-center gap-2.5 text-sm font-semibold"><span className="grid size-8 place-items-center rounded-xl bg-crit/10 text-crit"><Siren size={18} aria-hidden /></span>Emergency Center</div>
      <a href="#nearby-hospitals" className="flex min-h-11 items-center gap-2 rounded-full border border-accent/30 px-4 text-xs font-semibold text-accent hover:bg-accent/10"><Building2 size={15} aria-hidden />Nearby Hospitals<ArrowDown size={13} aria-hidden /></a>
      <a href="/hospitals" className="flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-semibold text-muted hover:text-fg"><Building2 size={15} aria-hidden />Sylhet hospital directory</a>
    </div>

    <div className="my-7 grid gap-6 lg:grid-cols-[1fr_390px]">
      <div><p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-crit"><Activity size={14} aria-hidden />Emergency help, connected</p><h1 className="max-w-xl text-[clamp(2rem,4.5vw,3.2rem)] font-semibold leading-[1.1]">Find the right help.<br /><span className="text-accent">Make the connection.</span></h1><p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">Choose your country and incident to reach verified emergency services. Calls and supported texts open in your device&apos;s apps.</p></div>
      <Panel className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold"><Globe2 size={17} className="text-accent" aria-hidden />Your country</span><span className="text-[11px] text-muted">Confirm before calling</span></div>
        <div className="relative mb-2"><Search size={14} className="pointer-events-none absolute left-3 top-3.5 text-muted" aria-hidden /><Input aria-label="Search countries or dialing codes" placeholder="Search country or dialing code…" value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} className="pl-9" /></div>
        <Select aria-label="Country" value={countryCode} onChange={(event) => { locationGeneration.current++; setLocating(false); setCountryCode(event.target.value); setRegionCode(""); setContactId(""); setStatus(""); }}>
          {!countries.some((item) => item.code === countryCode) && <option value={countryCode}>{selectedCountry.flag} {selectedCountry.name} ({selectedCountry.dialCode})</option>}
          {countries.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name} ({country.dialCode || "Dial code unavailable"})</option>)}
        </Select>
        {countrySearch && countries.length === 0 && <p className="mt-2 text-xs text-muted" role="status">No matching countries. Try another name or code.</p>}
        {selectedCountry.regions.length > 0 && <Select aria-label="Region or state" className="mt-2" value={regionCode} onChange={(event) => { setLoading(true); setSmsEligible(false); setRegionCode(event.target.value); }}><option value="">Select region or state</option>{selectedCountry.regions.map((region) => <option key={region.code} value={region.code}>{region.name}</option>)}</Select>}
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => void locate()} disabled={locating}>{locating ? <Spinner /> : <Navigation size={14} aria-hidden />}{locating ? "Finding location…" : "Detect country & location"}</Button>
        {locationStatus && <p role="status" className="mt-2 text-xs leading-relaxed text-muted">{locationStatus}</p>}
      </Panel>
    </div>

    <div className="grid items-start gap-6 lg:grid-cols-[1fr_390px]">
      <div>
        <div className="mb-4 flex items-end justify-between gap-3"><h2 className="text-xl font-semibold">What&apos;s happening?</h2><span className="text-xs text-muted">Choose an incident</span></div>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Incident categories">{GROUPS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={group === id} className={cx("emergency-tab flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-semibold", group === id ? "border-accent bg-accent/10 text-accent" : "border-white/10 text-muted hover:text-fg")} onClick={() => setGroup(id)}><Icon size={15} aria-hidden />{label}</button>)}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{data.incidents.filter((item) => item.group === group).map((item) => { const Icon = incidentIcon(item); const active = incidentId === item.id; return <motion.button key={item.id} type="button" aria-pressed={active} onClick={() => { setIncidentId(item.id); setSmsEligible(false); setStatus(""); }} whileTap={{ scale: .98 }} className={cx("incident-card relative flex min-h-[118px] flex-col items-start rounded-2xl border p-4 text-left", active ? "border-accent bg-accent/[.08]" : "border-white/10 bg-ink-soft hover:border-accent/50")}><span className={cx("mb-4 grid size-9 place-items-center rounded-xl", item.group === "fire" ? "bg-crit/10 text-crit" : "bg-accent/10 text-accent")}><Icon size={21} strokeWidth={1.5} aria-hidden /></span><span className="text-[13px] font-semibold">{item.label}</span>{active && <Check size={15} className="absolute right-3 top-3 text-accent" aria-hidden />}</motion.button>; })}</div>
        {incident && <div className="mt-5 rounded-2xl border border-warn/25 bg-warn/[.04] p-5"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-warn"><TriangleAlert size={16} aria-hidden />Stay safe: {incident.label}</h3><ul className="space-y-2 pl-4 text-xs leading-relaxed text-fg/85">{incident.guidance.map((line) => <li key={line} className="list-disc">{line}</li>)}</ul><p className="mt-3 text-[11px] text-muted">Follow the emergency dispatcher&apos;s instructions.</p></div>}
      </div>

      <Panel className="overflow-hidden lg:sticky lg:top-24" id="emergency-contacts">
        <div className="border-b border-white/10 bg-crit/[.06] p-5"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-crit"><Siren size={14} aria-hidden />DIRECT EMERGENCY CONTACTS</div><h2 className="text-lg font-semibold">{incident?.label ?? "Emergency"}</h2><p className="mt-1 text-xs text-muted">{selectedCountry.flag} {selectedCountry.name}{regionCode ? ` · ${selectedCountry.regions.find((region) => region.code === regionCode)?.name ?? regionCode}` : ""}</p></div>
        <div className="space-y-3 p-4" aria-live="polite" aria-busy={loading}>
          {loading && <p className="flex items-center gap-2 p-3 text-sm text-muted"><Spinner />Loading verified contacts…</p>}
          {directoryError && <div role="alert"><p className="text-sm text-crit">{directoryError}</p><Button variant="secondary" size="sm" className="mt-2" onClick={() => setReload((value) => value + 1)}>Retry directory</Button></div>}
          {!loading && !directoryError && contacts.length === 0 && <p className="rounded-xl bg-white/[.03] p-4 text-sm leading-relaxed text-muted">No verified contacts are recorded for this selection. Check official local emergency information. You can still find nearby facilities below.</p>}
          {contacts.map((contact) => { const service = data.services.find((item) => item.id === contact.serviceId); const Icon = SERVICE_ICONS[contact.serviceId] ?? Phone; return <article key={contact.id} className="rounded-xl border border-white/10 bg-ink/50 p-4"><div className="flex items-center gap-2 text-xs text-muted"><Icon size={15} aria-hidden /><h3 className="font-medium text-fg">{service?.name ?? contact.serviceId}</h3><span className="ml-auto flex items-center gap-1 text-[10px] text-mint"><Check size={11} aria-hidden />Verified</span></div><div className="my-3 flex items-center justify-between gap-3"><p className="font-mono text-3xl font-semibold tracking-wide">{contact.phoneNumber}</p><a href={telephoneUri(contact.phoneNumber)} className="flex min-h-11 items-center gap-2 rounded-full bg-crit px-4 text-xs font-bold text-ink hover:brightness-110"><Phone size={14} aria-hidden />CALL NOW<span className="sr-only"> {service?.name} {contact.phoneNumber}</span></a></div><p className="text-[11px] leading-relaxed text-muted">{service?.description}</p><p className="mt-1 text-[11px] text-muted">Coverage: {contact.coverage}</p><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted"><a href={contact.source.url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">{contact.source.name}</a><span>Checked {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(contact.lastVerifiedAt))}</span></div>{contact.sms.supported && contact.sms.number && contact.sms.source && contact.sms.verifiedAt ? <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-accent/40 bg-accent/10 text-xs font-bold text-accent hover:bg-accent/15" onClick={() => { setContactId(contact.id); setSmsEligible(false); document.getElementById("emergency-text")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }}><MessageSquare size={14} aria-hidden />SEND EMERGENCY TEXT</button> : <p className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-muted">Emergency SMS is not officially supported for this service. Please use the direct call option.</p>}</article>; })}
          <p className="px-1 text-[11px] leading-relaxed text-muted">Your device prepares the call. Calling is completed through your phone app. {currentCountryData ? data.coverageNote : ""}</p>
        </div>
      </Panel>
    </div>

    <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_390px]" id="emergency-text">
      <Panel className="p-5 sm:p-6"><h2 className="flex items-center gap-2 text-xl font-semibold"><MessageSquare size={20} className="text-accent" aria-hidden />Prepare an emergency text</h2><p className="mt-2 text-xs leading-relaxed text-muted">Optional details help the dispatcher. You can edit the entire message before opening your messaging app.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Brief incident description" htmlFor="alert-description"><Textarea id="alert-description" name="description" rows={2} className="min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what happened and the help needed…" maxLength={1500} /></Field></div><Field label="Location or nearby landmark" htmlFor="alert-location"><Input id="alert-location" name="location" value={manualLocation} onChange={(event) => setManualLocation(event.target.value)} placeholder={location?.address ?? "Street, city or landmark…"} maxLength={300} /></Field><Field label="People affected (optional)" htmlFor="alert-people"><Input id="alert-people" name="people" type="number" inputMode="numeric" min="1" max="1000000" value={people} onChange={(event) => setPeople(event.target.value)} /></Field><div className="sm:col-span-2"><Field label="Additional information (optional)" htmlFor="alert-extra"><Input id="alert-extra" name="additional" value={additional} onChange={(event) => setAdditional(event.target.value)} maxLength={1000} /></Field></div></div><div className="mt-4 flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" onClick={() => void locate()} disabled={locating}><MapPin size={14} aria-hidden />{location ? "Update GPS location" : "Add GPS location"}</Button>{location && <Button variant="ghost" size="sm" onClick={() => void shareLocation()}><Navigation size={14} aria-hidden />Share location</Button>}</div>{location && <p className="mt-3 break-words text-xs text-muted">GPS: {location.lat.toFixed(6)}, {location.lng.toFixed(6)} · <a href={mapsLocationUrl(location)} target="_blank" rel="noreferrer" className="text-accent underline">Open location map</a></p>}</Panel>
      <Panel className="p-5"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Your message</h3>{editedMessage !== null && <button type="button" className="text-xs text-accent underline" onClick={() => setEditedMessage(null)}>Refresh from details</button>}</div><Textarea aria-label="Editable emergency message" name="emergencyMessage" value={message} onChange={(event) => setEditedMessage(event.target.value)} rows={9} className="font-mono text-xs leading-relaxed" maxLength={6000} /><p className="mt-2 text-[10px] text-muted">{message.length} characters. Long messages may be split by your carrier.</p>
        {smsAvailable && selectedContact ? <div className="mt-4"><p className="text-xs font-semibold text-accent">Text {selectedContact.sms.number} · {selectedCountry.name}</p><p className="mt-2 text-xs leading-relaxed text-muted">{selectedContact.sms.eligibility} {selectedContact.sms.restrictions}</p><a href={selectedContact.sms.source!.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] text-accent underline">Official SMS eligibility information</a><label className="my-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed"><input type="checkbox" checked={smsEligible} onChange={(event) => setSmsEligible(event.target.checked)} className="mt-0.5 size-4 accent-accent" />I meet the eligibility requirements listed above.</label>{smsEligible && message.trim() ? <a href={smsUri(selectedContact.sms.number!, message, userAgent)} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-3 text-xs font-bold text-ink" onClick={() => setStatus("Messaging app requested. Review the message and press Send there; CIVIS cannot confirm delivery.")}><MessageSquare size={14} aria-hidden />SEND EMERGENCY TEXT</a> : <Button className="w-full text-xs" disabled><MessageSquare size={14} aria-hidden />SEND EMERGENCY TEXT</Button>}<p className="mt-2 text-[11px] leading-relaxed text-muted">Press Send in your messaging app. CIVIS does not send the text or confirm delivery.</p></div> : <p className="mt-4 text-xs leading-relaxed text-muted">Emergency SMS is not officially supported for this service. Please use the direct call option.</p>}
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => void copy(message, "Emergency message copied.")}><Copy size={14} aria-hidden />Copy emergency message</Button>
      </Panel>
    </section>
    {status && <p role="status" aria-live="polite" className="mt-3 rounded-xl border border-accent/25 bg-accent/[.05] p-3 text-xs text-accent">{status}</p>}
    <section id="nearby-hospitals" className="mt-10"><FacilityFinder location={location} onLocationChange={(value) => { locationGeneration.current++; setLocating(false); setLocation(value); }} /></section>
  </div></MotionConfig>;
}
