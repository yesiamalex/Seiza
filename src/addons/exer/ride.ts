import { createStore } from "../store";
import { oneOf, sendAddonEvent, type AddonEvent } from "../bus";
import { noiseBuffer, noiseHit, toneHit, voice } from "../sound";
import { sfxOutput } from "../../audio/sfx";
import { drive } from "../../player/drive";
import { logRide } from "../sport/strava";
import { VEHICLE_SPECS, VEHICLES, type Vehicle } from "./vehicles";
import { addonSeats, getAddonAvatar } from "../avatars";
import type { Seat } from "../../scene/layout";

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
  releaseBell();
  // The ride that just ended, kept on this device (SportSeiza's log).
  if (before.vehicle)
    logRide({ vehicle: before.vehicle, distance: Math.round(before.distance), climb: Math.round(before.climb), seconds: Math.round((Date.now() - before.startedAt) / 1000), startedAt: before.startedAt, world: typeof location === "undefined" ? "" : location.hostname });
  ride.set((s) => ({ ...s, vehicle, speed: 0, gradient: 0, distance: 0, climb: 0, startedAt: Date.now() }));
  if (!vehicle) {
    drive.scale = 1;
    drive.ease = 0;
    drive.cruise = 0;
  }
  announceRide();
}

let lastBell = -Infinity;
let localHorn: (() => void) | null = null;
/** Rings this ride's bell, here and for the room; a horn sounds while held
 *  (until releaseBell). */
export function ringBell() {
  const { vehicle } = ride.get();
  const kind = vehicle ? VEHICLE_SPECS[vehicle].bell : null;
  if (!kind) return;
  if (kind === "horn") {
    if (localHorn) return;
    localHorn = startHorn();
    sendAddonEvent("exer", { k: "bell" });
    return;
  }
  const now = performance.now();
  if (now - lastBell < 400) return;
  lastBell = now;
  playBell();
  sendAddonEvent("exer", { k: "bell" });
}

/** Lets go of the horn (the bell rings out on its own). */
export function releaseBell() {
  if (!localHorn) return;
  localHorn();
  localHorn = null;
  sendAddonEvent("exer", { k: "hu" });
}

/** The longest a horn sounds without a let-go heard (a dropped message). */
const HORN_MAX = 3;

/** A moped's horn, two square tones a third apart, sounding until the
 *  returned function is called (or HORN_MAX). */
export function startHorn(distance?: number): () => void {
  const output = sfxOutput();
  const level = 0.8 * (distance === undefined ? 1 : Math.max(0, 1 - distance / 40));
  if (!output || output.ctx.state !== "running" || level <= 0.01) return () => {};
  const { ctx } = output;
  const t = ctx.currentTime;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  // Level with the bike's bell and the room's other sounds.
  env.gain.linearRampToValueAtTime(level * 0.11, t + 0.012);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  filter.connect(env).connect(output.out);
  const oscs = [420, 525].map((f) => {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = f;
    o.connect(filter);
    o.start(t);
    return o;
  });
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    clearTimeout(cap);
    // At least a short beep, however quick the press.
    const end = Math.max(ctx.currentTime, t + 0.12);
    env.gain.setTargetAtTime(0, end, 0.015);
    for (const o of oscs) o.stop(end + 0.1);
    setTimeout(() => env.disconnect(), (end - ctx.currentTime + 0.2) * 1000);
  };
  const cap = setTimeout(stop, HORN_MAX * 1000);
  return stop;
}

/** A hard stop: rubber dragged on the road, a screech falling as it slows
 *  with the grind under it, longer the faster it was going; a moped's
 *  engine dropping with it; a board's wheels scraping. */
export function skidSound(kind: Vehicle, speed: number, distance?: number) {
  const v = voice(0.9, distance, 30, 2);
  if (!v) return;
  const length = Math.min(0.9, 0.25 + speed * 0.07);
  if (kind === "skateboard") {
    noiseHit(v, { frequency: 3200, sweepTo: 1800, duration: length * 0.6, gain: 0.12, q: 1.5 });
    return;
  }
  noiseHit(v, { frequency: kind === "moped" ? 2100 : 2700, sweepTo: kind === "moped" ? 1300 : 1700, duration: length, gain: 0.13, q: 6 });
  noiseHit(v, { frequency: 600, duration: length * 0.8, gain: 0.09, q: 0.8 });
  if (kind === "moped") toneHit(v, { frequency: 95, sweepTo: 55, duration: length, gain: 0.1, type: "sawtooth" });
}

export interface Engine {
  /** Metres a second, and how loud (0 to 1, the distance's falloff in it). */
  set(speed: number, level: number): void;
  stop(): void;
}

/** A moped's engine: a low sawtooth and its sub, throbbing at the firing
 *  rate through a low-pass, all rising with the speed. A few nodes, no samples. */
export function startEngine(): Engine | null {
  const output = sfxOutput();
  if (!output || output.ctx.state !== "running") return null;
  const { ctx } = output;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(output.out);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 2;
  filter.frequency.value = 380;
  const throb = ctx.createGain();
  throb.gain.value = 0.6;
  filter.connect(throb).connect(out);
  const saw = ctx.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.value = 42;
  saw.connect(filter);
  const sub = ctx.createOscillator();
  sub.type = "square";
  sub.frequency.value = 21;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.45;
  sub.connect(subGain).connect(filter);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 11;
  const depth = ctx.createGain();
  depth.gain.value = 0.4;
  lfo.connect(depth).connect(throb.gain);
  for (const o of [saw, sub, lfo]) o.start();
  return {
    set(speed, level) {
      const t = ctx.currentTime;
      const rev = Math.min(1, speed / 9.6);
      saw.frequency.setTargetAtTime(42 + 52 * rev, t, 0.2);
      sub.frequency.setTargetAtTime(21 + 26 * rev, t, 0.2);
      lfo.frequency.setTargetAtTime(11 + 15 * rev, t, 0.2);
      filter.frequency.setTargetAtTime(380 + 520 * rev, t, 0.2);
      // Three-quarters of what it first was: heard, without carrying over everything else.
      out.gain.setTargetAtTime(level * (0.075 + 0.06 * rev), t, 0.1);
    },
    stop() {
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => {
        for (const o of [saw, sub, lfo]) o.stop();
        out.disconnect();
      }, 400);
    },
  };
}

/**
 * Wheels on the ground, as long as they roll. A bike: the tyres' hiss on
 * the road and its low hum, and the chain's soft whir while the pedals go
 * round, pulsing with them. A skateboard: the hard wheels' rumble, rougher
 * the faster, and a little grit. One looped noise through a few filters,
 * each part's level set by the speed; nothing while it's in the air (set a
 * level of 0).
 */
export function startRoll(kind: "bike" | "skateboard"): Engine | null {
  const output = sfxOutput();
  if (!output || output.ctx.state !== "running") return null;
  const { ctx } = output;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(output.out);
  const band = (type: BiquadFilterType, frequency: number, q: number, gain: number) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    source.connect(f).connect(g).connect(out);
    return { f, g };
  };
  const nodes: AudioScheduledSourceNode[] = [source];
  let set: (speed: number, level: number) => void;
  if (kind === "bike") {
    const hiss = band("bandpass", 1400, 0.7, 0.5);
    const hum = band("lowpass", 180, 0.8, 0.9);
    const chain = band("bandpass", 3600, 4, 0);
    // The chain pulses with the pedal strokes: two a turn of the cranks.
    const stroke = ctx.createOscillator();
    stroke.frequency.value = 2;
    const strokeDepth = ctx.createGain();
    strokeDepth.gain.value = 0;
    stroke.connect(strokeDepth).connect(chain.g.gain);
    nodes.push(stroke);
    set = (speed, level) => {
      const t = ctx.currentTime;
      const go = Math.min(1, speed / 6);
      hiss.f.frequency.setTargetAtTime(900 + 1200 * go, t, 0.2);
      hum.f.frequency.setTargetAtTime(120 + 160 * go, t, 0.2);
      // A crank turn every 4.4 m (vehicles.ts): two pulses a turn.
      stroke.frequency.setTargetAtTime(Math.max(0.5, (speed / 4.4) * 2), t, 0.2);
      chain.g.gain.setTargetAtTime(speed > 0.5 ? 0.12 : 0, t, 0.2);
      strokeDepth.gain.setTargetAtTime(speed > 0.5 ? 0.1 : 0, t, 0.2);
      out.gain.setTargetAtTime(level * Math.min(1, speed / 1.2) * (0.05 + 0.07 * go), t, 0.12);
    };
  } else {
    const rumble = band("lowpass", 320, 1.2, 1);
    const wheels = band("bandpass", 850, 1.5, 0.45);
    const grit = band("highpass", 4200, 0.7, 0.08);
    // Roughness: the rumble's level wobbling, as the ground goes by.
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 9;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 0.25;
    wobble.connect(wobbleDepth).connect(rumble.g.gain);
    nodes.push(wobble);
    set = (speed, level) => {
      const t = ctx.currentTime;
      const go = Math.min(1, speed / 7);
      rumble.f.frequency.setTargetAtTime(240 + 260 * go, t, 0.2);
      wheels.f.frequency.setTargetAtTime(650 + 600 * go, t, 0.2);
      wobble.frequency.setTargetAtTime(6 + 14 * go, t, 0.2);
      grit.g.gain.setTargetAtTime(0.04 + 0.1 * go, t, 0.2);
      out.gain.setTargetAtTime(level * Math.min(1, speed / 0.8) * (0.08 + 0.1 * go), t, 0.06);
    };
  }
  for (const n of nodes) n.start();
  return {
    set,
    stop() {
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => {
        for (const n of nodes) n.stop();
        out.disconnect();
      }, 400);
    },
  };
}

/**
 * A ride leaving the ground and coming back to it. A skateboard's jump:
 * the pop, the tail snapping on the ground and the wood knocking; its
 * landing, four wheels slapping down and the deck's clack, harder after
 * longer in the air. A bike landing: the tyres' thump and a rattle.
 * And a board rolling over a crack in the paving: a small click.
 */
export function rideHitSound(kind: Vehicle, hit: "pop" | "land" | "crack", strength: number, distance?: number) {
  const v = voice(0.8, distance, 24, 1);
  if (!v) return;
  const s = Math.min(1, Math.max(0.3, strength));
  if (kind === "skateboard") {
    if (hit === "pop") {
      noiseHit(v, { frequency: 2600, duration: 0.035, gain: 0.3, q: 2 });
      toneHit(v, { frequency: 260, sweepTo: 180, duration: 0.07, gain: 0.22, type: "triangle" });
    } else if (hit === "land") {
      noiseHit(v, { frequency: 1500, duration: 0.05, gain: 0.32 * s, q: 1.4 });
      toneHit(v, { frequency: 120, sweepTo: 70, duration: 0.12, gain: 0.3 * s, type: "sine" });
      noiseHit(v, { frequency: 3000, duration: 0.03, gain: 0.12 * s, q: 3, delay: 0.035 });
    } else {
      noiseHit(v, { frequency: 1900, duration: 0.025, gain: 0.07, q: 2.5 });
      noiseHit(v, { frequency: 1700, duration: 0.025, gain: 0.05, q: 2.5, delay: 0.09 });
    }
    return;
  }
  if (hit === "land") {
    toneHit(v, { frequency: 95, sweepTo: 55, duration: 0.14, gain: 0.3 * s, type: "sine" });
    noiseHit(v, { frequency: 700, duration: 0.08, gain: 0.12 * s, q: 1 });
    // The rattle: the chain and the mudguards.
    for (let i = 0; i < 3; i++) noiseHit(v, { frequency: 3800, duration: 0.02, gain: 0.05 * s, q: 5, delay: 0.04 + i * 0.045 });
  }
}

/** A Japanese mamachari's dome bell, chirin chirin: two quick strikes, high
 *  and bright, ringing out for a second and a half. A second tone a few
 *  hertz off the first beats against it, the shimmer a real dome has, over
 *  a higher partial and the click of the striker. (A horn is startHorn's.) */
export function playBell(distance?: number) {
  const v = voice(0.8, distance, 40, 3);
  if (!v) return;
  for (const [delay, gain] of [
    [0, 1],
    [0.13, 0.8],
  ]) {
    toneHit(v, { frequency: 3620, duration: 1.6, gain: 0.15 * gain, delay });
    toneHit(v, { frequency: 3631, duration: 1.4, gain: 0.1 * gain, delay });
    toneHit(v, { frequency: 5390, duration: 0.8, gain: 0.05 * gain, delay });
    toneHit(v, { frequency: 8650, duration: 0.25, gain: 0.025 * gain, delay });
    noiseHit(v, { frequency: 7000, duration: 0.015, gain: 0.05 * gain, delay, q: 2 });
  }
}

export function resetRide() {
  releaseBell();
  ride.set({ vehicle: null, speed: 0, gradient: 0, distance: 0, climb: 0, startedAt: 0 });
  remoteRiders.clear();
  drive.scale = 1;
  drive.cruise = 0;
  drive.ease = 0;
}

/** Riding now: a rider's legs pedal or stand on the board, so their
 *  animation shouldn't walk (App and RemotePlayers ask). */
export function ridingNow(id: string | null): boolean {
  if (id === null) return ride.get().vehicle !== null;
  return !!remoteRiders.get(id)?.vehicle;
}

// --- riding behind someone -------------------------------------------------------

/** Who this visitor rides behind (their id), on what, and the seat that
 *  goes with them (ExerLayer moves it with the ride every frame). */
export const passenger = createStore<{ driver: string | null; kind: Vehicle | null; seat: Seat | null }>({ driver: null, kind: null, seat: null });
/** Who rides behind whom in the room: passenger id to driver id. */
export const passengers = new Map<string, string>();
/** A ride near enough to get on behind, with nobody behind already. */
export const nearRide = createStore<{ driver: string | null; name: string; kind: Vehicle | null }>({ driver: null, name: "", kind: null });
/** Whoever is behind this visitor now, if anyone. */
export const myPassenger = createStore<{ id: string | null; name: string }>({ id: null, name: "" });

/** Gets on behind a rider: a moving seat (side-saddle on a bike's carrier,
 *  astride behind on a moped), App's own sit, and the room told. */
export function rideBehind(driver: string, kind: Vehicle) {
  if (ride.get().vehicle) setVehicle(null);
  // Where they are now; ExerLayer puts it on the ride from the next frame.
  const m = getAddonAvatar(driver)?.scene.matrixWorld.elements;
  const seat: Seat = { id: `ride-${driver}`, position: m ? [m[12], m[13], m[14]] : [0, 0, 0], rotationY: 0, label: "Ride", pose: "sit", moving: true };
  passenger.set({ driver, kind, seat });
  addonSeats.sit(seat);
  sendAddonEvent("exer", { k: "pa", v: driver });
}

/** Gets off a ride you're behind (or are let off it). */
export function getOffBehind() {
  if (!passenger.get().driver) return;
  passenger.set({ driver: null, kind: null, seat: null });
  addonSeats.stand();
  sendAddonEvent("exer", { k: "pa", v: "" });
}

/** A rider letting their passenger off. */
export function letOff(id: string) {
  sendAddonEvent("exer", { k: "off", v: id });
}

export type ExerEvent = { k: "hi" } | { k: "lo"; vehicle: Vehicle | null } | { k: "bell" } | { k: "hu" } | { k: "pa"; driver: string | null } | { k: "off"; id: string };

export function parseExerEvent(data: AddonEvent): ExerEvent | null {
  if (data.k === "hi" || data.k === "bell" || data.k === "hu") return { k: data.k };
  if (data.k === "lo") {
    if (data.v === "") return { k: "lo", vehicle: null };
    const vehicle = oneOf(data.v, VEHICLES);
    return vehicle ? { k: "lo", vehicle } : null;
  }
  if ((data.k === "pa" || data.k === "off") && typeof data.v === "string" && data.v.length <= 64) return data.k === "pa" ? { k: "pa", driver: data.v || null } : { k: "off", id: data.v };
  return null;
}
