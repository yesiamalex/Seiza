import * as THREE from "three";

/**
 * Blade contact, the cheap way: a blade is a line segment from grip to tip,
 * a body is a capsule (a segment with a radius), and touching is two
 * segments coming closer than their thicknesses. Blade on body is a hit,
 * blade on blade a block. The same test serves a VR player's real swing and
 * a keyframed one on a phone, so a swing that doesn't reach doesn't land.
 */

const d1 = new THREE.Vector3();
const d2 = new THREE.Vector3();
const r = new THREE.Vector3();
const c1 = new THREE.Vector3();
const c2 = new THREE.Vector3();

export interface Closest {
  distance: number;
  /** Where along the first segment (0 to 1) the closest point is. */
  s: number;
  /** The closest point on the first segment. */
  point: THREE.Vector3;
}

/** The closest approach of segments p1–q1 and p2–q2 (Ericson, RTCD 5.1.9). */
export function segmentDistance(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3, out: Closest = { distance: 0, s: 0, point: new THREE.Vector3() }): Closest {
  d1.subVectors(q1, p1);
  d2.subVectors(q2, p2);
  r.subVectors(p1, p2);
  const a = d1.lengthSq();
  const e = d2.lengthSq();
  const f = d2.dot(r);
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) {
    s = t = 0;
  } else if (a <= 1e-12) {
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= 1e-12) {
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  c1.copy(p1).addScaledVector(d1, s);
  c2.copy(p2).addScaledVector(d2, t);
  out.distance = c1.distanceTo(c2);
  out.s = s;
  out.point.copy(c1);
  return out;
}

export interface Capsule {
  a: THREE.Vector3;
  b: THREE.Vector3;
  radius: number;
}

/** A standing body, shins to crown, from where its feet are and its eye height. */
export function bodyCapsule(feet: THREE.Vector3, eye: number, out: Capsule = { a: new THREE.Vector3(), b: new THREE.Vector3(), radius: 0 }): Capsule {
  out.radius = eye * 0.15;
  out.a.copy(feet).setY(feet.y + eye * 0.15 + out.radius * 0.5);
  out.b.copy(feet).setY(feet.y + eye * 1.05 - out.radius);
  return out;
}

/** How close two blades must pass to meet: about their two widths. */
export const BLADE_CONTACT = 0.07;

const sb = new THREE.Vector3();
const st = new THREE.Vector3();
/** A blade's position this frame and last, swept: the segments in between,
 *  one for every 15 cm the tip moved, so a fast swing on a slow frame can't
 *  pass through someone unseen. */
export function sweep(prevBase: THREE.Vector3, prevTip: THREE.Vector3, base: THREE.Vector3, tip: THREE.Vector3, visit: (base: THREE.Vector3, tip: THREE.Vector3) => boolean) {
  const b = sb;
  const t = st;
  const steps = Math.min(10, Math.max(1, Math.ceil(prevTip.distanceTo(tip) / 0.15)));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    b.lerpVectors(prevBase, base, k);
    t.lerpVectors(prevTip, tip, k);
    if (visit(b, t)) return true;
  }
  return false;
}
