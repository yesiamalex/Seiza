import * as THREE from "three";
import { sweepGeometry, type ProfileKey } from "./designerBody";

/**
 * Hair for designer avatars, as locks: each one a tapered strip swept
 * along a curve over the scalp, ending in a point, the way anime-styled
 * hair is modelled. The first hair hung cones and capsules off a
 * skull cap, which read as a helmet with a sawtooth fringe and blobs
 * stuck on; strips that follow the head and overlap read as hair, and
 * the outline pass (buildDesignerVrm) draws each lock's edge.
 *
 * All positions are in the avatar's pre-height space, in the same frame
 * as the skeleton: the head's centre is SCALP.center.
 */

/** The scalp the locks lie on: the hair cap's ellipsoid. */
/** Where the head's middle sits above the head bone (1.48, pre-height).
 *  Low enough that the chin overlaps the top of the neck, as on a VRoid
 *  avatar, so the neck is short. Everything on the head follows it. */
export const HEAD_OFFSET = 0.1;

export const SCALP = {
  center: new THREE.Vector3(0, 1.48 + HEAD_OFFSET + 0.008, -0.004),
  rx: 0.138,
  ry: 0.148,
  rz: 0.141,
};

/** A point on (or `lift` off) the scalp. `az` is around the head, 0 at
 *  the front and +π/2 at the character's left; `el` is down from the
 *  crown, 0 at the top and π/2 at ear level. */
export function scalpPoint(az: number, el: number, lift = 0): THREE.Vector3 {
  const s = Math.sin(el);
  return new THREE.Vector3(SCALP.rx * s * Math.sin(az), SCALP.ry * Math.cos(el), SCALP.rz * s * Math.cos(az))
    .multiplyScalar(1 + lift)
    .add(SCALP.center);
}

export interface LockOptions {
  /** The lock's spine, root first. */
  points: THREE.Vector3[];
  /** Half-width at its widest. */
  width: number;
  /** Half-thickness. */
  thickness: number;
  /** Where along the lock (0–1) it is widest; it narrows after. */
  widest?: number;
  /** 0 for a sharp point, up to 1 for a rounded tip: a fringe of sharp
   *  points reads as a saw. */
  blunt?: number;
  /** The head bone's index, which every lock is weighted to. */
  bone: number;
  /** Pre-height to metres. */
  h: number;
}

/** One lock: a flat, tapered strip along a smooth curve, its flat side
 *  facing out from the head, so it lies on the scalp and hangs from it. */
export function hairLock({ points, width, thickness, widest = 0.3, blunt = 0, bone, h }: LockOptions): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const keys: ProfileKey[] = [
    { s: 0, a: width * 0.72, b: thickness * 0.8 },
    { s: widest, a: width, b: thickness },
    { s: 0.72, a: width * (0.55 + 0.25 * blunt), b: thickness * 0.75 },
    { s: 0.93, a: width * (0.16 + 0.42 * blunt), b: thickness * (0.4 + 0.3 * blunt) },
    { s: 1, a: Math.max(0.0015, width * 0.3 * blunt), b: Math.max(0.0012, thickness * 0.4 * blunt) },
  ];
  const across = new THREE.Vector3();
  const out = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const point = new THREE.Vector3();
  return sweepGeometry({
    keys,
    from: 0,
    to: 1,
    step: 0.06,
    segments: 8,
    exponent: 2,
    place: (s, u, v) => {
      curve.getPointAt(s, point);
      curve.getTangentAt(s, tangent);
      // Flat side out from the head's centre; the width runs across it.
      out.subVectors(point, SCALP.center).normalize();
      across.crossVectors(tangent, out);
      if (across.lengthSq() < 1e-8) across.set(1, 0, 0);
      across.normalize();
      out.crossVectors(across, tangent).normalize();
      return [(point.x + across.x * u + out.x * v) * h, (point.y + across.y * u + out.y * v) * h, (point.z + across.z * u + out.z * v) * h];
    },
    weights: () => [[bone, 1]],
    capFrom: true,
    capTo: blunt > 0,
  });
}

/** A lock that starts on the scalp at `az`, runs down it from `elRoot` to
 *  `elEdge` (lifting off a little, as hair does), and then, if `drop` is
 *  more than 0, hangs that far below, splaying `out` and curling back in
 *  by `curl` at the tip. */
export function scalpLock(az: number, elRoot: number, elEdge: number, drop = 0, out = 0, curl = 0): THREE.Vector3[] {
  const points = [scalpPoint(az, elRoot, 0.025), scalpPoint(az, (elRoot + elEdge) / 2, 0.055), scalpPoint(az, elEdge, 0.08)];
  if (drop > 0) {
    const edge = points[2];
    // Outward along the ground, from the head's axis toward the lock.
    const away = new THREE.Vector3(edge.x - SCALP.center.x, 0, edge.z - SCALP.center.z).normalize();
    points.push(edge.clone().add(new THREE.Vector3(0, -drop * 0.5, 0)).addScaledVector(away, out * 0.7));
    points.push(edge.clone().add(new THREE.Vector3(0, -drop, 0)).addScaledVector(away, out - curl));
  }
  return points;
}
