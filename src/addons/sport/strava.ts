/**
 * A ride, summed up when it ends, for sports services such as Strava.
 * ExerSeiza records these on this device (rideLog below). Sending one to
 * Strava is left for the SportSeiza integration to build, and it has to be
 * built on the server: Strava's OAuth client secret and each athlete's
 * refresh token must never reach the browser (the same rule as the TURN
 * token). A Worker route, say POST /api/sport/strava/upload, holds them in
 * the deployment's secrets and KV, and the page only ever calls that route.
 */
export interface RideSummary {
  vehicle: string;
  /** Metres along the ground, and metres climbed. */
  distance: number;
  climb: number;
  seconds: number;
  /** Date.now() when it started. */
  startedAt: number;
  /** Which world it was ridden in. */
  world: string;
}

const KEY = "seiza-ride-log";
const MAX_RIDES = 50;

/** The last few rides on this device, newest first. */
export function rideLog(): RideSummary[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as RideSummary[]) : [];
  } catch {
    return [];
  }
}

export function logRide(ride: RideSummary) {
  // A few seconds on a bike isn't a ride.
  if (ride.seconds < 20 || ride.distance < 20) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([ride, ...rideLog()].slice(0, MAX_RIDES)));
  } catch {
    // Private windows and blocked storage: not kept.
  }
}

/** Placeholder for the SportSeiza integration: see the note above. */
export async function uploadToStrava(_ride: RideSummary): Promise<never> {
  throw new Error("Strava upload isn't built yet: it belongs on the server (see src/addons/sport/strava.ts).");
}
