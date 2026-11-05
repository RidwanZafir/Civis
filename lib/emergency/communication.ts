export type AlertLocation = { lat: number; lng: number; address: string };

export function telephoneUri(number: string): string {
  const normalized = number.replace(/[\s()-]/g, "");
  if (!/^\+?\d{2,15}$/.test(normalized)) throw new Error("Invalid telephone contact");
  return `tel:${normalized}`;
}

export function smsUri(number: string, message: string, userAgent = ""): string {
  const normalized = telephoneUri(number).slice(4);
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent) || /Macintosh.*Mobile/i.test(userAgent);
  return `sms:${normalized}${appleMobile ? "&" : "?"}body=${encodeURIComponent(message)}`;
}

export function mapsLocationUrl(location: Pick<AlertLocation, "lat" | "lng">): string {
  return `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
}

export function prepareEmergencyMessage({ incident, description, location, manualLocation, people, additional }: {
  incident: string; description: string; location: AlertLocation | null;
  manualLocation: string; people: string; additional: string;
}): string {
  return [
    "EMERGENCY ALERT",
    `Incident: ${incident || "Emergency"}`,
    `Location: ${manualLocation.trim() || location?.address || "Location not provided"}`,
    ...(location ? [`Coordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`, `Map: ${mapsLocationUrl(location)}`] : []),
    ...(description.trim() ? [`Description: ${description.trim()}`] : []),
    ...(people.trim() ? [`People affected: ${people.trim()}`] : []),
    ...(additional.trim() ? [`Additional information: ${additional.trim()}`] : []),
  ].join("\n");
}
