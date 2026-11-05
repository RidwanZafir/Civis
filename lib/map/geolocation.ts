"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isValidCoordinate } from "./geo";

/**
 * One place where the browser's location is read, so every surface reports the
 * same states and no screen invents coordinates it did not receive.
 *
 * Two rules this hook enforces, because they were the actual bug:
 *  - `getCurrentPosition` is a one-shot fix; continuous updates need
 *    `watchPosition`, and its handle must be released with `clearWatch`.
 *  - A fix is only published when the numbers are real and in range. A denial
 *    never becomes "we couldn't find you, here is the city centre instead".
 */

export type GeoState =
  | "idle"
  | "detecting"
  | "found"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported"
  | "insecure";

export type GeoFix = {
  lat: number;
  lng: number;
  /** Metres, from the device. `null` when the browser omits it. */
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  at: number;
};

export const GEO_MESSAGES: Record<GeoState, string> = {
  idle: "",
  detecting: "Finding your current location…",
  found: "Your current location has been detected.",
  denied:
    "Location permission was denied. Enable location access in your browser settings, or select a location manually.",
  unavailable:
    "Unable to determine your current location. Check that device location is turned on.",
  timeout: "Location detection timed out. Please retry.",
  unsupported: "Your browser does not support location detection.",
  insecure:
    "Location needs a secure connection. Open CIVIS over HTTPS or on localhost to use your current location.",
};

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 30_000,
};

function toFix(position: GeolocationPosition): GeoFix | null {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  if (!isValidCoordinate(latitude, longitude)) return null;
  return {
    lat: latitude,
    lng: longitude,
    accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : null,
    heading: typeof heading === "number" && Number.isFinite(heading) ? heading : null,
    speed: typeof speed === "number" && Number.isFinite(speed) ? speed : null,
    at: position.timestamp || Date.now(),
  };
}

function stateForError(error: GeolocationPositionError): GeoState {
  if (error.code === error.PERMISSION_DENIED) return "denied";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unavailable";
}

export type UseGeolocation = {
  state: GeoState;
  fix: GeoFix | null;
  following: boolean;
  /** One-shot fix. Resolves with the fix, or null when it could not be read. */
  locate: () => Promise<GeoFix | null>;
  startFollow: () => void;
  stopFollow: () => void;
  reset: () => void;
};

export function useGeolocation(): UseGeolocation {
  const [state, setState] = useState<GeoState>("idle");
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [following, setFollowing] = useState(false);
  const watchId = useRef<number | null>(null);
  const mounted = useRef(true);
  /** Guards against a slow one-shot fix overwriting a newer continuous one. */
  const generation = useRef(0);

  const clearWatchRef = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearWatchRef();
    };
  }, [clearWatchRef]);

  const preflight = useCallback((): GeoState | null => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return "unsupported";
    // localhost is treated as a secure context by browsers, so dev still works.
    if (window.isSecureContext === false) return "insecure";
    return null;
  }, []);

  const locate = useCallback(async (): Promise<GeoFix | null> => {
    const blocked = preflight();
    if (blocked) {
      setState(blocked);
      return null;
    }

    const ticket = ++generation.current;
    setState("detecting");

    return await new Promise<GeoFix | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = toFix(position);
          if (!mounted.current || ticket !== generation.current) return resolve(next);
          if (!next) {
            // Coordinates arrived but were unusable; do not show them.
            setState("unavailable");
            resolve(null);
            return;
          }
          setFix(next);
          setState("found");
          resolve(next);
        },
        (error) => {
          if (!mounted.current || ticket !== generation.current) return resolve(null);
          setState(stateForError(error));
          resolve(null);
        },
        OPTIONS,
      );
    });
  }, [preflight]);

  const startFollow = useCallback(() => {
    const blocked = preflight();
    if (blocked) {
      setState(blocked);
      return;
    }

    clearWatchRef();
    const ticket = ++generation.current;
    setState("detecting");

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!mounted.current || ticket !== generation.current) return;
        const next = toFix(position);
        if (!next) {
          setState("unavailable");
          return;
        }
        setFix(next);
        setState("found");
      },
      (error) => {
        if (!mounted.current || ticket !== generation.current) return;
        setState(stateForError(error));
        setFollowing(false);
        clearWatchRef();
      },
      OPTIONS,
    );
    setFollowing(true);
  }, [clearWatchRef, preflight]);

  const stopFollow = useCallback(() => {
    generation.current += 1;
    clearWatchRef();
    setFollowing(false);
    // The last known fix stays on the map for this session, by design.
    setState((current) => (current === "detecting" && fix ? "found" : current));
  }, [clearWatchRef, fix]);

  const reset = useCallback(() => {
    generation.current += 1;
    clearWatchRef();
    setFollowing(false);
    setFix(null);
    setState("idle");
  }, [clearWatchRef]);

  return { state, fix, following, locate, startFollow, stopFollow, reset };
}
