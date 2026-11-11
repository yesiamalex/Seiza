// Where Seisugbo's places are, on Seiza's meadow (FIELD in
// src/scene/layout.ts: x −24 to 24, z 38 to 72, its floor at FIELD_Y).
// Visitors wake at the tent on the meadow's west side, facing east down
// the lane:
//
//      z 72 ┌──────────────────────────────────────────────┐
//           │            houses (north row)                │
//      z 62 │ tent  fire ARCH ═══════ the lane ═══════════ │
//      z 58 │            house │path│store  rack           │
//           │                  │    │   ┌──────────────┐   │
//           │                  │    │   │ covered court│   │
//      z 42 │                  │    │   └──────────────┘   │
//      z 38 └────────────── garden steps ──────────────────┘
//          x −24             x 0     x 6          x 20   x 24
import { FIELD_Y } from "../../../src/scene/layout";

export const Y = FIELD_Y;

/** The lane's paving, running east from the arch. */
export const LANE = { x0: -7.2, x1: 20.6, z0: 58, z1: 62 };
/** The path up from the garden steps to the lane. */
export const PATH = { x0: -1.4, x1: 1.4, z0: 40.8, z1: 58 };
export const ARCH_X = -6.4;

export const COURT = { x0: 6, x1: 20, z0: 42, z1: 53 };
export const COURT_CENTRE: [number, number] = [(COURT.x0 + COURT.x1) / 2, (COURT.z0 + COURT.z1) / 2];
export const LANE_CENTRE: [number, number] = [(LANE.x0 + LANE.x1) / 2, (LANE.z0 + LANE.z1) / 2];

export interface House {
  x0: number;
  x1: number;
  /** z of the front wall, the one on the lane. */
  front: number;
  depth: number;
  /** Which way the front faces along z: −1 for the north row, +1 south. */
  out: 1 | -1;
  floors: 1 | 2;
  paint: string;
  /** The upper floor's cladding: wood, or galvanized sheet. */
  upper?: string;
  roof: string;
  /** Where the door is along the front: 0 left … 1 right, as seen from the lane. */
  door: number;
  curtain: string;
  tarp?: boolean;
  laundry?: boolean;
}

const N = { front: 62, depth: 4.4, out: -1 as const };
const S = { front: 58, depth: 3.8, out: 1 as const };

export const HOUSES: House[] = [
  { ...N, x0: -5.6, x1: -2.3, floors: 2, paint: "#9fd3c7", upper: "#b98a5a", roof: "#9c5a3c", door: 0.25, curtain: "#d94f6a", laundry: true },
  { ...N, x0: -2.1, x1: 1.5, floors: 1, paint: "#f2b5c4", roof: "#7d8a91", door: 0.7, curtain: "#3f7fd0", tarp: true },
  { ...N, x0: 1.7, x1: 5.0, floors: 2, paint: "#a9c8ea", upper: "#8a98a3", roof: "#a8683f", door: 0.3, curtain: "#f2c14e" },
  { ...N, x0: 5.2, x1: 8.8, floors: 2, paint: "#f3d98b", upper: "#b07b4f", roof: "#8f4f36", door: 0.7, curtain: "#4caf7a", laundry: true },
  { ...N, x0: 9.0, x1: 12.1, floors: 1, paint: "#e8a87c", roof: "#6f7c84", door: 0.3, curtain: "#7a4fc8" },
  { ...N, x0: 12.3, x1: 15.9, floors: 2, paint: "#cfd8a8", upper: "#93a1ab", roof: "#9c5a3c", door: 0.6, curtain: "#e2574c", tarp: true },
  { ...N, x0: 16.1, x1: 19.6, floors: 2, paint: "#d9c2e9", upper: "#b98a5a", roof: "#a26240", door: 0.35, curtain: "#2fa3a8", laundry: true },
  { ...S, x0: -5.0, x1: -1.8, floors: 2, paint: "#f6c6a0", upper: "#8a98a3", roof: "#7d8a91", door: 0.65, curtain: "#3f7fd0", laundry: true },
];

/** The sari-sari store, on the corner of the path and the lane. */
export const STORE = { x0: 1.8, x1: 5.4, front: 58, depth: 3.4 };

/** Poles for the power lines, along the north side of the lane. */
export const POLES: [number, number][] = [
  [-4.2, 61.7],
  [3.4, 61.7],
  [10.9, 61.7],
  [18.4, 61.7],
];
/** Bamboo poles for bunting on the open south side. */
export const BAMBOO: [number, number][] = [
  [8.9, 58.35],
  [14.6, 58.35],
  [20.3, 58.35],
];

/** The bulad (dried fish) rack, between the lane and the court. */
export const RACK = { x0: 6.4, x1: 8.8, z0: 55.9, z1: 57.1 };

/** Walking tour stops: [piece, x, side of the lane]. */
export const TOUR: { id: string; x: number; side: "north" | "south" }[] = [
  { id: "a1", x: -4.4, side: "north" },
  { id: "a4", x: -2.9, side: "south" },
  { id: "b4", x: -0.2, side: "north" },
  { id: "b5", x: 4.2, side: "north" },
  { id: "b3", x: 6.0, side: "south" },
  { id: "a2", x: 8.6, side: "north" },
  { id: "c3", x: 10.2, side: "south" },
  { id: "c5", x: 12.4, side: "south" },
  { id: "c1", x: 13.4, side: "north" },
  { id: "a3", x: 16.6, side: "south" },
  { id: "b6", x: 17.8, side: "north" },
];
export const TOUR_Z = { north: 61.45, south: 58.55 };

export const PALMS: [number, number][] = [
  [-3.6, 69],
  [4.6, 41.6],
  [21, 55.6],
];

/** Small, seeded randomness, so every visitor sees the same lane. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
