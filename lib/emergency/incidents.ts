import type { EmergencyService, IncidentCategory, ServiceId } from "./types";

export const EMERGENCY_SERVICES: EmergencyService[] = [
  { id: "general", name: "General Emergency", description: "An emergency operator connects you to the appropriate available service." },
  { id: "police", name: "Police", description: "Immediate threats to safety, serious crime, and traffic incidents." },
  { id: "fire", name: "Fire Service", description: "Fires and urgent fire or rescue assistance." },
  { id: "ambulance", name: "Ambulance", description: "Life-threatening illness or injury and emergency medical assistance." },
  { id: "coast_guard", name: "Coast Guard", description: "Emergencies at sea and along the coast where a verified contact exists." },
  { id: "search_rescue", name: "Search and Rescue", description: "Search and rescue coordination for people in immediate danger." },
  { id: "disaster", name: "Disaster Response", description: "Urgent assistance during flooding, collapse, and major natural hazards." },
  { id: "hazmat", name: "Hazardous Materials Response", description: "Chemical, fuel, gas, and other dangerous material incidents." },
];

// Conservative scene-safety reminders, not medical treatment instructions.
// Emergency operators provide incident-specific advice.
// References: https://www.ready.gov/chemical-emergencies
// https://www.ready.gov/floods and https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/
const guidance = {
  accidents: ["Move to a safe place away from traffic if you can.", "Tell the operator your location and visible hazards. Follow their instructions.", "Avoid moving an injured person unless there is immediate danger."],
  fire: ["Move away from smoke, flames, gas, or spilled chemicals if safe to do so.", "Do not enter a burning building or touch unknown substances.", "Contact emergency services from a safe place and follow the operator's instructions."],
  medical: ["Call emergency services promptly for a life-threatening illness or injury.", "State the exact location and whether the person is conscious and breathing.", "Follow the operator's instructions while help is arranged."],
  other: ["Move to a safe place if you can. Do not enter dangerous water or unstable structures.", "Give the operator the exact location, hazards, and number of people affected.", "Follow official evacuation instructions and emergency operator guidance."],
};

function incident(label: string, group: IncidentCategory["group"], serviceIds: ServiceId[]): IncidentCategory {
  return { id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, group, serviceIds: ["general", ...serviceIds], guidance: guidance[group] };
}
export const INCIDENT_CATEGORIES: IncidentCategory[] = [
  ...["Road Accident", "Car Collision", "Motorcycle Accident", "Pedestrian Accident", "Highway Accident", "Train Accident"].map((label) => incident(label, "accidents", ["ambulance", "police", "fire"])),
  ...["Building Fire", "Vehicle Fire", "Electrical Fire"].map((label) => incident(label, "fire", ["fire", "ambulance"])),
  ...["Oil Spill", "Chemical Spill", "Gas Leak", "Fuel Leakage", "Industrial Accident"].map((label) => incident(label, "fire", ["hazmat", "fire", "ambulance"])),
  ...["Medical Emergency", "Heart Attack", "Stroke", "Severe Injury", "Unconscious Person", "Breathing Emergency", "Severe Bleeding"].map((label) => incident(label, "medical", ["ambulance"])),
  incident("Building Collapse", "other", ["fire", "search_rescue", "ambulance", "disaster"]),
  incident("Flooding", "other", ["disaster", "search_rescue", "fire"]),
  incident("Drowning", "other", ["ambulance", "coast_guard", "search_rescue"]),
  incident("Natural Disaster", "other", ["disaster", "search_rescue", "ambulance"]),
  incident("Missing Person", "other", ["police", "search_rescue"]),
  incident("Personal Safety Threat", "other", ["police"]),
];
