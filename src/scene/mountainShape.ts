import makiling from "./makiling.json";

/**
 * Mt. Makiling, beyond the meadow's far end: its real shape, from public
 * elevation data (makiling.json: AWS Terrain Tiles, 8 km around the
 * summit, its heights above the plain round it), scaled down evenly so its
 * slopes are the real mountain's. A walk or a ride up it climbs the true
 * gradients, which is what ExerSeiza's slope and a smart trainer read.
 *
 * Pure numbers here (mountainShape.ts), shared by the floor you walk on (layout.ts), the
 * ground drawn (Mountain.tsx), and the trees kept off it (Outdoors.tsx).
 */
const N = makiling.size;
const HEIGHTS = makiling.heights;

/** Where it stands by default: past the meadow's far end and west of its
 *  middle, clear of the beach and the sea, its foot on the outer ground
 *  (layout.ts's OUTER_GROUND_Y). */
const MEADOW_PLACE = { x: -30, z: 134, y: -0.06 };
/** Its footprint: centre, the height of its foot, and width, metres. A
 *  model world puts it elsewhere (placeMountain). */
export const MOUNTAIN = { ...MEADOW_PLACE, size: 110 };
/** World metres per real metre: about 1 to 67. */
export const MOUNTAIN_SCALE = MOUNTAIN.size / makiling.spanMeters;
/** The real summit's height above sea level, metres. */
export const MAKILING_SUMMIT_M = makiling.summitMeters;

/** The mountain's height (world metres) above the outer ground at a point, 0 off it. */
export function mountainHeight(x: number, z: number): number {
  const u = ((x - MOUNTAIN.x) / MOUNTAIN.size + 0.5) * (N - 1);
  const v = ((z - MOUNTAIN.z) / MOUNTAIN.size + 0.5) * (N - 1);
  if (u < 0 || v < 0 || u > N - 1 || v > N - 1) return 0;
  const i = Math.min(N - 2, Math.floor(u));
  const j = Math.min(N - 2, Math.floor(v));
  const tu = u - i;
  const tv = v - j;
  const h = (a: number, b: number) => HEIGHTS[b * N + a];
  const real = h(i, j) * (1 - tu) * (1 - tv) + h(i + 1, j) * tu * (1 - tv) + h(i, j + 1) * (1 - tu) * tv + h(i + 1, j + 1) * tu * tv;
  return real * MOUNTAIN_SCALE;
}

/** How high a point really is, metres above sea level, for the heat: the
 *  air cools about 6.5 °C every kilometre up. */
export function realAltitude(x: number, z: number): number {
  const h = mountainHeight(x, z);
  return h > 0 ? makiling.baseMeters + h / MOUNTAIN_SCALE : 0;
}

/** Within the mountain's round footprint, plus a margin (trees, hills). */
export const onMountain = (x: number, z: number, margin = 0) => Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < MOUNTAIN.size * 0.5 + margin;

/** The summit: the highest point of the grid, from the mountain's centre. */
const PEAK: [number, number] = (() => {
  let best = 0;
  for (let k = 1; k < HEIGHTS.length; k++) if (HEIGHTS[k] > HEIGHTS[best]) best = k;
  const i = best % N;
  const j = Math.floor(best / N);
  return [(i / (N - 1) - 0.5) * MOUNTAIN.size, (j / (N - 1) - 0.5) * MOUNTAIN.size];
})();
/** The summit in world x and z. */
export const SUMMIT: [number, number] = [MOUNTAIN.x + PEAK[0], MOUNTAIN.z + PEAK[1]];

/** The trail: straight up from its north foot (toward the meadow, or the
 *  campus) to the summit. */
export const TRAIL_FROM: [number, number] = [SUMMIT[0], MOUNTAIN.z - MOUNTAIN.size * 0.5 + 2];

/** Moves the mountain (a model world's world.json `mountain`), or back to
 *  the meadow's with none. Everything here follows; the meadow's own floor
 *  plan (layout.ts) keeps its place, since only built-in worlds use it. */
export function placeMountain(at?: { x: number; z: number; y?: number }): void {
  MOUNTAIN.x = at ? at.x : MEADOW_PLACE.x;
  MOUNTAIN.z = at ? at.z : MEADOW_PLACE.z;
  MOUNTAIN.y = at ? (at.y ?? 0) : MEADOW_PLACE.y;
  SUMMIT[0] = MOUNTAIN.x + PEAK[0];
  SUMMIT[1] = MOUNTAIN.z + PEAK[1];
  TRAIL_FROM[0] = SUMMIT[0];
  TRAIL_FROM[1] = MOUNTAIN.z - MOUNTAIN.size * 0.5 + 2;
}
export function nearTrail(x: number, z: number, width = 1.4): boolean {
  const [ax, az] = TRAIL_FROM;
  const [bx, bz] = SUMMIT;
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < width;
}
