// The room's light switches as a plain module store, for fittings that
// read them every frame without threading props down (text boards, and a
// world's own code). App.tsx keeps it in step with the room's state.
import * as THREE from "three";
import { DEFAULT_LIGHTS, type LightZone } from "../multiplayer/types";
import { skyState } from "../sky/skyState";
import { CLASSROOM, CORRIDOR, OUTDOOR } from "./layout";

export const roomLights: Record<LightZone, boolean> = { ...DEFAULT_LIGHTS };

const inside = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) =>
  x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/** Which switch lights the spot (x, z): the garden's outside, the
 *  classroom's in the classroom and corridor, the hall's elsewhere. */
export function lightZoneAt(x: number, z: number): LightZone {
  if (inside(OUTDOOR, x, z)) return "pond";
  if (inside(CLASSROOM, x, z) || inside(CORRIDOR, x, z)) return "classroom";
  return "hall";
}

/** How much a surface needs lifting to stay readable: fully at night, a
 *  little by day, and a middling amount under a fixed sky. */
export function nightNeed(): number {
  return skyState.active ? 1 - 0.8 * skyState.dayness : 0.5;
}

let signWash: THREE.CanvasTexture | null = null;
/**
 * A wash of light from a lamp along a surface's top edge: full at the top,
 * fading down it. Used as a light map, it lights the surface's own colours
 * (the writing stays crisp) and costs no light at all.
 */
export function signWashTexture(): THREE.CanvasTexture {
  if (signWash) return signWash;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.4, "#bdbdbd");
    g.addColorStop(1, "#6b6b6b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
  }
  signWash = new THREE.CanvasTexture(canvas);
  return signWash;
}
