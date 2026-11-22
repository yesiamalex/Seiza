// Seinag's imagined campus: four "what if" layers over UPOU as it is, each
// one something you can feel on a real walk across the campus. A shaded
// walkway over the open lawn between the Academic Residences and the
// WCMPB, solar lampposts that light it after dark, more shade trees, and
// the FMDS Perma G.A.R.D.E.N. behind the Teaching and Learning Hub, built
// out. None of them is UPOU's plan. Each can be switched off at the
// station's "Imagined campus" board, for everyone in the room, to compare
// with the campus as it is.
//
// Positions are on the campus model (worlds/seiou/world/models/campus.glb),
// in metres; its lawn is at y 0.1.
import type { WorldStateValue } from "../../../src/multiplayer/types";
import type { Obstacle } from "../../../src/scene/layout";

export const GROUND_Y = 0.1;

export const LAYERS = ["walkway", "lamps", "trees", "garden"] as const;
export type Layer = (typeof LAYERS)[number];
export const LAYER_KEY: Record<Layer, string> = {
  walkway: "futures.walkway",
  lamps: "futures.lamps",
  trees: "futures.trees",
  garden: "futures.garden",
};
/** On unless someone switched it off. */
export const layerOn = (state: Record<string, WorldStateValue>, layer: Layer) => state[LAYER_KEY[layer]] !== false;

// --- the walkway ---------------------------------------------------------------------

/**
 * The covered walkway's centre line, from the Academic Residences' south
 * door to the WCMPB's north corner: the line people cut across the lawn
 * between them today, in the open (the navmesh's own route between the two,
 * straightened at the lawn's two bends).
 */
export const WALKWAY: [number, number][] = [
  [328, -84],
  [306, -44],
  [270, 40],
  [220.5, 118.5],
];
export const WALKWAY_WIDTH = 2.6;
/** Roof height over the walk, to its underside. */
export const WALKWAY_HEIGHT = 2.9;
/** How far apart the posts are along each side. */
export const POST_SPACING = 4;

export interface Segment {
  from: [number, number];
  to: [number, number];
  length: number;
  /** Rotation about y that turns local +x along the segment. */
  angle: number;
  mid: [number, number];
}

export function segments(line: [number, number][]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    out.push({ from: line[i], to: line[i + 1], length: Math.hypot(dx, dz), angle: -Math.atan2(dz, dx), mid: [(ax + bx) / 2, (az + bz) / 2] });
  }
  return out;
}

export const WALKWAY_SEGMENTS = segments(WALKWAY);
export const WALKWAY_LENGTH = WALKWAY_SEGMENTS.reduce((n, s) => n + s.length, 0);

/** Post positions: both sides, every POST_SPACING along each segment, with
 *  one at every bend. */
export function walkwayPosts(): [number, number][] {
  const posts: [number, number][] = [];
  for (const s of WALKWAY_SEGMENTS) {
    const ux = (s.to[0] - s.from[0]) / s.length;
    const uz = (s.to[1] - s.from[1]) / s.length;
    const n = Math.max(1, Math.round(s.length / POST_SPACING));
    for (let i = 0; i <= n; i++) {
      if (i === n && s !== WALKWAY_SEGMENTS[WALKWAY_SEGMENTS.length - 1]) continue;
      const t = (i / n) * s.length;
      for (const side of [-1, 1]) {
        const off = (side * (WALKWAY_WIDTH - 0.3)) / 2;
        posts.push([s.from[0] + ux * t - uz * off, s.from[1] + uz * t + ux * off]);
      }
    }
  }
  return posts;
}

// --- the lampposts --------------------------------------------------------------------

/** Pedestrian lampposts, their heads just under the walkway's roofline so
 *  their light reaches in under it rather than onto its top. */
export const LAMP_HEIGHT = 3.2;

export interface Lamp {
  at: [number, number];
  /** Which way the arm reaches, flat and unit length: toward what it lights. */
  toward: [number, number];
}

/** Lampposts: along one side of the walkway every 25 m or so, a little
 *  out from its roof (the trees are on the other side), each reaching
 *  toward the walk; and two at the garden's gate, toward the path in. */
export function lampPositions(): Lamp[] {
  const lamps: Lamp[] = [];
  let carried = 6;
  for (const s of WALKWAY_SEGMENTS) {
    const ux = (s.to[0] - s.from[0]) / s.length;
    const uz = (s.to[1] - s.from[1]) / s.length;
    const off = WALKWAY_WIDTH / 2 + 1.8;
    let t = carried;
    for (; t < s.length; t += 25) lamps.push({ at: [s.from[0] + ux * t + uz * off, s.from[1] + uz * t - ux * off], toward: [-uz, ux] });
    carried = t - s.length;
  }
  for (const dz of [-2.6, 2.6]) lamps.push({ at: [GARDEN.x - GARDEN.w / 2 - 1.2, GARDEN.z + dz], toward: [0, -Math.sign(dz)] });
  return lamps;
}

// --- the trees -------------------------------------------------------------------------

export type TreeKind = "narra" | "acacia" | "fruit";
export interface Tree {
  at: [number, number];
  kind: TreeKind;
  /** Canopy size, 1 for a grown tree. */
  scale: number;
}

/** A small deterministic shuffle, so the trees vary but never move. */
const jitter = (i: number, k: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Shade trees where people walk in the open: a double row along the drive
 * from the Oblation to the Main Building, a row down the Main Building's
 * back lawn toward the Teaching and Learning Hub, and clumps along the
 * walkway's lawn. Narra (the national tree, common on UP campuses) and
 * acacia (rain tree, Samanea saman, with its wide umbrella of shade). Kept
 * clear of the roads, the buildings, the solar station, and where
 * visitors arrive.
 */
export function treeList(): Tree[] {
  const trees: Tree[] = [];
  let i = 0;
  const add = (x: number, z: number, kind: TreeKind) => {
    trees.push({ at: [x + (jitter(i, 1) - 0.5) * 1.6, z + (jitter(i, 2) - 0.5) * 1.6], kind, scale: 0.85 + jitter(i, 3) * 0.3 });
    i++;
  };
  // The drive: both sides, clear of the station on the north side and of
  // the Main Building's forecourt.
  for (let x = 36; x <= 72; x += 12) {
    add(x, 15, "narra");
    if (x < 66) add(x, -15, "narra");
  }
  // The Main Building's back lawn, toward the walkway.
  for (let z = -28; z <= 30; z += 14) add(146, z, "acacia");
  // Along the walkway's lawn, set back from it on the side away from the lamps.
  for (const s of WALKWAY_SEGMENTS) {
    const ux = (s.to[0] - s.from[0]) / s.length;
    const uz = (s.to[1] - s.from[1]) / s.length;
    for (let t = 12; t < s.length - 6; t += 22) add(s.from[0] + ux * t - uz * 9, s.from[1] + uz * t + ux * 9, i % 3 === 0 ? "narra" : "acacia");
  }
  return trees;
}

/** How far up a tree's shade is cast from (the middle of its canopy). */
export const CANOPY_HEIGHT: Record<TreeKind, number> = { narra: 6.2, acacia: 6.8, fruit: 3.2 };
export const CANOPY_RADIUS: Record<TreeKind, number> = { narra: 3.6, acacia: 5.2, fruit: 1.8 };

// --- the garden ------------------------------------------------------------------------

/**
 * The FMDS Perma G.A.R.D.E.N. behind the Teaching and Learning Hub, which
 * the campus model doesn't have yet, built out. What UPOU's own pages say
 * it has (Adopt-A-Plot's 2 m × 2 m organic raised beds, water the
 * university supplies, a caretaker) is here as it is; the rest (the
 * compost bays, the rain tanks, the herb spiral, the food forest, the
 * nursery, the learning hut) is what a fuller permaculture design could
 * add, and the guides say so.
 *
 * Local frame: the garden's centre, x east, z south; the gate on the west,
 * facing the Hub.
 */
export const GARDEN = { x: 173, z: 60, w: 28, d: 30 };

/** Adopt-A-Plot's beds: 2 m × 2 m, with 1.2 m paths between them. */
export function bedPositions(): [number, number][] {
  const beds: [number, number][] = [];
  for (let col = 0; col < 4; col++) for (let row = 0; row < 3; row++) beds.push([-7 + col * 3.2, -3.2 + row * 3.2]);
  return beds;
}
export const BED = { size: 2, height: 0.35 };

/** The garden's stations, in its local frame: what a tour stops at. */
export const GARDEN_SPOTS = {
  gate: [-GARDEN.w / 2 + 1.5, 0],
  hut: [-9.5, -11],
  beds: [-2.2, 0],
  spiral: [-9.5, 6.5],
  compost: [10.5, 12],
  water: [-5.5, -11.5],
  forest: [10, -4],
  nursery: [2, 11.5],
} as const satisfies Record<string, [number, number]>;

export function gardenToWorld([x, z]: readonly [number, number]): [number, number] {
  return [GARDEN.x + x, GARDEN.z + z];
}

// --- shade from the sun ------------------------------------------------------------------

/**
 * Where the shade of something `height` metres up falls on the ground, as
 * an offset from directly under it, for a sun in direction `sun` (a unit
 * vector toward it), and how strong it is: none with the sun below about 8°
 * (it would stretch across the campus, and there's barely any sun to block),
 * fading in between. Cloud thins it.
 *
 * The world's own shadow map covers only the rooms near its origin; the
 * campus is hundreds of metres across, so this is how the walkway and the
 * trees cast their shade where it really falls at this hour.
 */
export function shadeOffset(sun: { x: number; y: number; z: number }, height: number, cloud = 0) {
  const lowest = Math.sin((8 * Math.PI) / 180);
  if (sun.y <= lowest) return { x: 0, z: 0, strength: 0 };
  let x = (-sun.x / sun.y) * height;
  let z = (-sun.z / sun.y) * height;
  const far = Math.hypot(x, z);
  const most = height * 3;
  if (far > most) {
    x *= most / far;
    z *= most / far;
  }
  const rise = Math.min(1, (sun.y - lowest) / (Math.sin((20 * Math.PI) / 180) - lowest));
  return { x, z, strength: rise * (1 - 0.75 * Math.min(1, Math.max(0, cloud))) };
}

// --- what visitors bump into ----------------------------------------------------------

export function futuresObstacles(state: Record<string, WorldStateValue>): Obstacle[] {
  const out: Obstacle[] = [];
  if (layerOn(state, "walkway")) for (const [x, z] of walkwayPosts()) out.push({ x, z, halfX: 0.1, halfZ: 0.1, rotationY: 0 });
  if (layerOn(state, "lamps")) for (const { at: [x, z] } of lampPositions()) out.push({ x, z, halfX: 0.12, halfZ: 0.12, rotationY: 0 });
  if (layerOn(state, "trees")) for (const t of treeList()) out.push({ x: t.at[0], z: t.at[1], halfX: 0.35, halfZ: 0.35, rotationY: 0 });
  if (layerOn(state, "garden")) {
    for (const [bx, bz] of bedPositions()) {
      const [x, z] = gardenToWorld([bx, bz]);
      out.push({ x, z, halfX: BED.size / 2, halfZ: BED.size / 2, rotationY: 0 });
    }
    const [sx, sz] = gardenToWorld(GARDEN_SPOTS.spiral);
    out.push({ x: sx, z: sz, halfX: 1.1, halfZ: 1.1, rotationY: 0 });
    const [cx, cz] = gardenToWorld(GARDEN_SPOTS.compost);
    out.push({ x: cx, z: cz, halfX: 2.4, halfZ: 0.7, rotationY: 0 });
    const [wx, wz] = gardenToWorld(GARDEN_SPOTS.water);
    out.push({ x: wx, z: wz, halfX: 1.4, halfZ: 0.6, rotationY: 0 });
  }
  return out;
}
