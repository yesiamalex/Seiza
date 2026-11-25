import { createStore } from "../store";
import { oneOf, sendAddonEvent, type AddonEvent } from "../bus";
import { noiseHit, toneHit, voice } from "../sound";
import { drive } from "../../player/drive";
import { logRide } from "../sport/strava";
import { VEHICLE_SPECS, VEHICLES, type Vehicle } from "./vehicles";

/**
 * ExerSeiza's state: what this visitor rides, and how the ride is going.
 * The room only hears which ride someone is on and their bell; how fast
 * they go is their movement, which everyone already sees.
 */
export interface LocalRider {
  vehicle: Vehicle | null;
  /** Metres a second, eased. */
  speed: number;
  /** The slope ahead, rise over run (0.1 is 10%). */
  gradient: number;
  /** This ride so far, metres along the ground and metres climbed. */
  distance: number;
  climb: number;
  /** Date.now() when this ride began. */
  startedAt: number;
}

export const ride = createStore<LocalRider>({ vehicle: null, speed: 0, gradient: 0, distance: 0, climb: 0, startedAt: 0 });

export interface RemoteRider {
  vehicle: Vehicle | null;
}
export const remoteRiders = new Map<string, RemoteRider>();

export function announceRide() {
  sendAddonEvent("exer", { k: "lo", v: ride.get().vehicle ?? "" });
}

export function setVehicle(vehicle: Vehicle | null) {
  const before = ride.get();
  if (before.vehicle === vehicle) return;
  // The ride that just ended, kept on this device (SportSeiza's log).
  if (before.vehicle)
    logRide({ vehicle: before.vehicle, distance: Math.round(before.distance), climb: Math.round(before.climb), seconds: Math.round((Date.now() - before.startedAt) / 1000), startedAt: before.startedAt, world: typeof location === "undefined" ? "" : location.hostname });
  ride.set((s) => ({ ...s, vehicle, speed: 0, gradient: 0, distance: 0, climb: 0, startedAt: Date.now() }));
  if (!vehicle) {
    drive.scale = 1;
    drive.cruise = 0;
  }
  announceRide();
}

let lastBell = -Infinity;
/** Rings this ride's bell (or sounds its horn), here and for the room. */
export function ringBell() {
  const { vehicle } = ride.get();
  if (!vehicle || !VEHICLE_SPECS[vehicle].bell) return;
  const now = performance.now();
  if (now - lastBell < 400) return;
  lastBell = now;
  playBell(VEHICLE_SPECS[vehicle].bell!);
  sendAddonEvent("exer", { k: "bell" });
}

/** A Japanese bicycle bell's two bright rings, or a moped's double beep. */
export function playBell(kind: "bell" | "horn", distance?: number) {
  const v = voice(0.8, distance, 40, 2);
  if (!v) return;
  if (kind === "bell") {
    for (const delay of [0, 0.14]) {
      toneHit(v, { frequency: 2350, duration: 0.7, gain: 0.22, delay });
      toneHit(v, { frequency: 3540, duration: 0.45, gain: 0.1, delay });
      noiseHit(v, { frequency: 6000, duration: 0.02, gain: 0.05, delay, q: 2 });
    }
  } else {
    for (const delay of [0, 0.22]) {
      toneHit(v, { frequency: 420, duration: 0.16, gain: 0.18, type: "square", delay });
      toneHit(v, { frequency: 525, duration: 0.16, gain: 0.12, type: "square", delay });
    }
  }
}

export function resetRide() {
  ride.set({ vehicle: null, speed: 0, gradient: 0, distance: 0, climb: 0, startedAt: 0 });
  remoteRiders.clear();
  drive.scale = 1;
  drive.cruise = 0;
}

/** Riding now: a rider's legs pedal or stand on the board, so their
 *  animation shouldn't walk (App and RemotePlayers ask). */
export function ridingNow(id: string | null): boolean {
  if (id === null) return ride.get().vehicle !== null;
  return !!remoteRiders.get(id)?.vehicle;
}

export type ExerEvent = { k: "hi" } | { k: "lo"; vehicle: Vehicle | null } | { k: "bell" };

export function parseExerEvent(data: AddonEvent): ExerEvent | null {
  if (data.k === "hi" || data.k === "bell") return { k: data.k };
  if (data.k === "lo") {
    if (data.v === "") return { k: "lo", vehicle: null };
    const vehicle = oneOf(data.v, VEHICLES);
    return vehicle ? { k: "lo", vehicle } : null;
  }
  return null;
}
