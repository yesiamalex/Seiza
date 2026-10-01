import { POND_CENTER, POND_WATER_RADIUS } from "./layout";

/**
 * Who is in the pond, and the ripples they've made since the pond last
 * looked.
 *
 * Every avatar (local and remote) reports its position once a frame from
 * VrmAvatar; Pond.tsx drains the ripple queue each frame and reads the
 * positions to make the koi keep their distance. A module-level channel
 * rather than React state: this runs every frame, and nothing here should
 * cause a re-render. It's also why remote players stir the water too
 * without anything extra being sent over the network.
 */

interface Wader {
  x: number;
  z: number;
  /** Where the last ripple was dropped, and when. */
  rippleX: number;
  rippleZ: number;
  rippleAt: number;
  seenAt: number;
}

const waders = new Map<string, Wader>();
const pending: Array<[x: number, z: number, strength: number]> = [];

/** A ripple every this many metres walked, but no faster than this. */
const STEP_DISTANCE = 0.4;
const STEP_MIN_MS = 220;
/** A wader not reported for this long has left (or unmounted). */
const FORGET_MS = 1500;

export function stirPond(id: string, x: number, z: number) {
  const inWater = Math.hypot(x - POND_CENTER[0], z - POND_CENTER[1]) < POND_WATER_RADIUS + 0.1;
  const now = performance.now();
  const wader = waders.get(id);
  if (!inWater) {
    if (wader) waders.delete(id);
    return;
  }
  if (!wader) {
    // Stepping in makes the biggest splash.
    waders.set(id, { x, z, rippleX: x, rippleZ: z, rippleAt: now, seenAt: now });
    pending.push([x, z, 1]);
    return;
  }
  wader.x = x;
  wader.z = z;
  wader.seenAt = now;
  if (Math.hypot(x - wader.rippleX, z - wader.rippleZ) > STEP_DISTANCE && now - wader.rippleAt > STEP_MIN_MS) {
    pending.push([x, z, 0.65]);
    wader.rippleX = x;
    wader.rippleZ = z;
    wader.rippleAt = now;
  }
}

/** Ripples made since the last call, oldest first. */
export function takePondRipples() {
  return pending.splice(0);
}

/** Current positions of everyone standing in the water. */
export function pondWaders(): Array<{ x: number; z: number }> {
  const now = performance.now();
  const out: Array<{ x: number; z: number }> = [];
  for (const [id, wader] of waders) {
    if (now - wader.seenAt > FORGET_MS) waders.delete(id);
    else out.push(wader);
  }
  return out;
}
