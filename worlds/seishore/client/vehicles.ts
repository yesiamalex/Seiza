// Seishore's bus and train: where each is at any moment, from the clock.
// Everyone's browser works it out from the same timetable, so everyone
// sees them in the same place (to within their clocks' difference) with
// nothing sent over the network. The train shuttles along the coast between
// its two stations and the ends of the line; the bus runs north up the
// coast road, stopping at the bus stop, turns at the end of the road, and
// comes back down.
import { BUS_STOP, ROAD, STATIONS, TRACK } from "./plan";

export interface Pose {
  x: number;
  z: number;
  /** Which way its front faces: 0 toward +z, π toward −z (three.js rotation.y). */
  heading: number;
  /** Metres a second, for its sounds and wheels. */
  speed: number;
  /** Stopped with its doors open, at this stop (a station's or the bus stop's id). */
  stop: string | null;
  /** How open its doors are, 0 to 1. */
  doors: number;
  /** Seconds until it next moves (0 while moving). */
  departsIn: number;
}

type Leg =
  | { kind: "wait"; seconds: number; x: number; z: number; heading: number; stop?: string }
  | { kind: "move"; seconds: number; from: [number, number]; to: [number, number]; heading: number }
  /** A U-turn: half an ellipse from one lane to the other (`phi` from `phi0`
   *  to `phi1`), its middle at (x, z), `across` wide and `ahead` deep. */
  | { kind: "turn"; seconds: number; x: number; z: number; across: number; ahead: number; phi0: number; phi1: number };

const smooth = (u: number) => u * u * (3 - 2 * u);
const DOOR_SECONDS = 1.6;

function timeline(legs: Leg[]) {
  const total = legs.reduce((a, l) => a + l.seconds, 0);
  return (seconds: number): Pose => {
    let t = ((seconds % total) + total) % total;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (t > leg.seconds) {
        t -= leg.seconds;
        continue;
      }
      if (leg.kind === "wait") {
        // Doors open once it's stopped, and close before it goes.
        const doors = leg.stop ? Math.min(1, Math.max(0, Math.min(t - 0.8, leg.seconds - 2.2 - t) / DOOR_SECONDS)) : 0;
        return { x: leg.x, z: leg.z, heading: leg.heading, speed: 0, stop: leg.stop && doors > 0.5 ? leg.stop : null, doors, departsIn: leg.seconds - t };
      }
      const u = t / leg.seconds;
      if (leg.kind === "move") {
        const s = smooth(u);
        const length = Math.hypot(leg.to[0] - leg.from[0], leg.to[1] - leg.from[1]);
        // Smoothstep's speed: 6u(1−u) times the average.
        const speed = (length / leg.seconds) * 6 * u * (1 - u);
        return { x: leg.from[0] + (leg.to[0] - leg.from[0]) * s, z: leg.from[1] + (leg.to[1] - leg.from[1]) * s, heading: leg.heading, speed, stop: null, doors: 0, departsIn: 0 };
      }
      // Round the arc at an even pace, facing the way it goes.
      const phi = leg.phi0 + (leg.phi1 - leg.phi0) * u;
      const dir = Math.sign(leg.phi1 - leg.phi0);
      const dx = -leg.across * Math.sin(phi) * dir;
      const dz = leg.ahead * Math.cos(phi) * dir;
      return {
        x: leg.x + leg.across * Math.cos(phi),
        z: leg.z + leg.ahead * Math.sin(phi),
        heading: Math.atan2(dx, dz),
        speed: (Math.PI * (leg.across + leg.ahead)) / 2 / leg.seconds,
        stop: null,
        doors: 0,
        departsIn: 0,
      };
    }
    const last = legs[legs.length - 1];
    return { x: 0, z: 0, heading: 0, speed: 0, stop: null, doors: 0, departsIn: 0, ...(last.kind === "wait" ? { x: last.x, z: last.z } : {}) };
  };
}

// --- the train ---------------------------------------------------------------------------

/** Two cars, coupled: how long the whole train is, and each car. */
export const CAR = { length: 12, width: 2.3, gap: 0.6, floor: 0.5, height: 3.15 };
export const TRAIN_LENGTH = CAR.length * 2 + CAR.gap;
const mid = (i: number) => (STATIONS[i].z0 + STATIONS[i].z1) / 2;
const SOUTH_END = TRACK.z0 + TRAIN_LENGTH / 2 + 0.5;
const NORTH_END = TRACK.z1 - TRAIN_LENGTH / 2 - 1;
const tx = TRACK.x;
const go = (from: number, to: number, seconds: number): Leg => ({ kind: "move", seconds, from: [tx, from], to: [tx, to], heading: to > from ? 0 : Math.PI });
const halt = (z: number, seconds: number, stop?: string, heading = 0): Leg => ({ kind: "wait", seconds, x: tx, z, heading, stop });

/** A train both ways along the coast every three minutes or so, stopping
 *  at both stations each way. It has a cab at each end, so it doesn't turn. */
export const trainAt = timeline([
  halt(SOUTH_END, 14),
  go(SOUTH_END, mid(0), 16),
  halt(mid(0), 26, STATIONS[0].id),
  go(mid(0), mid(1), 9),
  halt(mid(1), 26, STATIONS[1].id),
  go(mid(1), NORTH_END, 8),
  halt(NORTH_END, 14, undefined, Math.PI),
  go(NORTH_END, mid(1), 8),
  halt(mid(1), 26, STATIONS[1].id, Math.PI),
  go(mid(1), mid(0), 9),
  halt(mid(0), 26, STATIONS[0].id, Math.PI),
  go(mid(0), SOUTH_END, 16),
]);

// --- the bus -----------------------------------------------------------------------------

export const BUS = { length: 8.8, width: 2.3, height: 3.0, floor: 0.35 };
/** Keeping left, as Japan does: north in the lane by the sea, south by the town. */
export const BUS_LANES = { north: 28.35, south: 26.25 };
/** Where it stops: its front door by the bus stop's bench. */
const BUS_HALT = BUS_STOP.z + 1.3 - (BUS.length / 2 - 0.9);
const BUS_SOUTH = ROAD.z0 + 4;
const BUS_NORTH = ROAD.z1 - 6;

export const busAt = timeline([
  { kind: "wait", seconds: 8, x: BUS_LANES.north, z: BUS_SOUTH, heading: 0 },
  { kind: "move", seconds: 10, from: [BUS_LANES.north, BUS_SOUTH], to: [BUS_LANES.north, BUS_HALT], heading: 0 },
  { kind: "wait", seconds: 24, x: BUS_LANES.north, z: BUS_HALT, heading: 0, stop: "kaigan-dori" },
  { kind: "move", seconds: 16, from: [BUS_LANES.north, BUS_HALT], to: [BUS_LANES.north, BUS_NORTH], heading: 0 },
  // At the north end: from the sea's lane, round to the right (Japan keeps left), into the town's.
  { kind: "turn", seconds: 7, x: (BUS_LANES.north + BUS_LANES.south) / 2, z: BUS_NORTH, across: (BUS_LANES.north - BUS_LANES.south) / 2, ahead: 4, phi0: 0, phi1: Math.PI },
  { kind: "move", seconds: 22, from: [BUS_LANES.south, BUS_NORTH], to: [BUS_LANES.south, BUS_SOUTH], heading: Math.PI },
  // At the south end: round to the right again, back into the sea's lane.
  { kind: "turn", seconds: 7, x: (BUS_LANES.north + BUS_LANES.south) / 2, z: BUS_SOUTH, across: (BUS_LANES.north - BUS_LANES.south) / 2, ahead: 4, phi0: Math.PI, phi1: Math.PI * 2 },
]);

/** The timetable's clock: seconds, the same in every browser (as their clocks are). */
export const clock = () => Date.now() / 1000;
