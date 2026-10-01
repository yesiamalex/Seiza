import * as THREE from "three";

/**
 * Smoothly skinned body parts for designer avatars.
 *
 * The first designer avatars were rigid: every body part a separate
 * capsule or sphere parented to one bone, with "joint spheres" hiding the
 * seams. That is the wooden-mannequin look, and it is where the
 * complaints came from. Every joint was a visible bead between two tubes
 * (the "chorizo" links), and the crotch was a ball with two cylinders
 * stuck under it.
 *
 * Here each limb and the torso is one continuous surface swept along its
 * bones, with every ring of vertices weighted between the bones on either
 * side of the nearest joint. A bent elbow or knee is then a single bend
 * in one surface, the way a skinned VRM from VRoid behaves, rather than
 * two parts pivoting against each other. It also lets the torso flow into
 * the legs instead of the legs plugging into a sphere.
 *
 * Everything here is generated per avatar: a few thousand vertices in
 * total, built once when the avatar is.
 */

/** One cross-section along a sweep: half-widths on the two in-plane axes
 *  and an optional offset along the second (front/back) axis. */
export interface ProfileKey {
  /** Position along the sweep (metres, pre-height). Keys ascend by `s`. */
  s: number;
  /** Half-width on the first in-plane axis. */
  a: number;
  /** Half-width on the second in-plane axis. */
  b: number;
  /** Centre offset along the second in-plane axis. */
  c?: number;
}

export type Influences = Array<[boneIndex: number, weight: number]>;

const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

/**
 * The profile's shape at `s`, interpolated with a Catmull-Rom spline
 * through the keys. Plain linear interpolation put a visible crease at
 * every key, which reads as segments again; the spline gives the
 * continuous curves of a calf or a waist.
 */
export function sampleProfile(keys: ProfileKey[], s: number): { a: number; b: number; c: number } {
  if (s <= keys[0].s) return { a: keys[0].a, b: keys[0].b, c: keys[0].c ?? 0 };
  const last = keys[keys.length - 1];
  if (s >= last.s) return { a: last.a, b: last.b, c: last.c ?? 0 };
  let i = 0;
  while (i < keys.length - 2 && s > keys[i + 1].s) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = (s - k1.s) / (k2.s - k1.s);
  return {
    a: Math.max(0.001, catmullRom(k0.a, k1.a, k2.a, k3.a, t)),
    b: Math.max(0.001, catmullRom(k0.b, k1.b, k2.b, k3.b, t)),
    c: catmullRom(k0.c ?? 0, k1.c ?? 0, k2.c ?? 0, k3.c ?? 0, t),
  };
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Bone weights along a chain of bones, by position along the sweep.
 *
 * `bones` are listed in ascending `s` order and `joints[k]` is where
 * bones[k] hands over to bones[k + 1], as [position, half-width of the
 * blend]. A wider blend bends more softly and loses less volume; a
 * narrower one keeps more shape near the joint. The widths used by the
 * builder are tuned per joint.
 */
export function chainWeights(bones: number[], joints: Array<[number, number]>) {
  return (s: number): Influences => {
    for (let k = 0; k < joints.length; k++) {
      const [at, half] = joints[k];
      if (s < at - half) return [[bones[k], 1]];
      if (s <= at + half) {
        const t = smoothstep(at - half, at + half, s);
        return [
          [bones[k], 1 - t],
          [bones[k + 1], t],
        ];
      }
    }
    return [[bones[bones.length - 1], 1]];
  };
}

export interface SweepOptions {
  keys: ProfileKey[];
  from: number;
  to: number;
  /** Ring spacing along the sweep. */
  step?: number;
  /** Points around each ring. */
  segments?: number;
  /** Superellipse exponent for the cross-section: 2 is an ellipse, higher
   *  is boxier. A little above 2 reads as a body rather than a pipe. */
  exponent?: number;
  /** Clothing layers are the same sweep scaled out slightly, so they sit
   *  just outside the skin under every pose (they share its weights). */
  inflate?: number;
  pad?: number;
  /** Maps a point on the ring (s, in-plane u, in-plane v) to a position. */
  place: (s: number, u: number, v: number) => [number, number, number];
  weights: (s: number) => Influences;
  capFrom?: boolean;
  capTo?: boolean;
}

/** A skinned tube along a profile, as a BufferGeometry with skin attributes. */
export function sweepGeometry(options: SweepOptions): THREE.BufferGeometry {
  const { keys, from, to, step = 0.014, segments = 18, exponent = 2.25, inflate = 1, pad = 0, place, weights } = options;
  const capFrom = options.capFrom ?? true;
  const capTo = options.capTo ?? true;
  const ringCount = Math.max(2, Math.ceil(Math.abs(to - from) / step) + 1);

  const positions: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const indices: number[] = [];
  const centers: THREE.Vector3[] = [];

  const pushInfluences = (influences: Influences) => {
    const sorted = [...influences].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const total = sorted.reduce((sum, [, w]) => sum + w, 0) || 1;
    for (let k = 0; k < 4; k++) {
      skinIndex.push(sorted[k]?.[0] ?? 0);
      skinWeight.push(sorted[k] ? sorted[k][1] / total : 0);
    }
  };

  const power = 2 / exponent;
  const shaped = (x: number) => Math.sign(x) * Math.pow(Math.abs(x), power);

  for (let r = 0; r < ringCount; r++) {
    const s = from + ((to - from) * r) / (ringCount - 1);
    const { a, b, c } = sampleProfile(keys, s);
    const ra = a * inflate + pad;
    const rb = b * inflate + pad;
    const influences = weights(s);
    centers.push(new THREE.Vector3(...place(s, 0, c)));
    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const [x, y, z] = place(s, ra * shaped(Math.cos(theta)), c + rb * shaped(Math.sin(theta)));
      positions.push(x, y, z);
      pushInfluences(influences);
    }
  }

  for (let r = 0; r < ringCount - 1; r++) {
    for (let j = 0; j < segments; j++) {
      const a = r * segments + j;
      const b = r * segments + ((j + 1) % segments);
      const c = (r + 1) * segments + j;
      const d = (r + 1) * segments + ((j + 1) % segments);
      indices.push(a, c, b, b, c, d);
    }
  }

  const addCap = (ring: number, reverse: boolean) => {
    const center = positions.length / 3;
    const p = centers[ring];
    positions.push(p.x, p.y, p.z);
    const base = ring * segments;
    for (let k = 0; k < 4; k++) {
      skinIndex.push(skinIndex[base * 4 + k]);
      skinWeight.push(skinWeight[base * 4 + k]);
    }
    for (let j = 0; j < segments; j++) {
      const a = base + j;
      const b = base + ((j + 1) % segments);
      if (reverse) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  };
  if (capFrom) addCap(0, false);
  if (capTo) addCap(ringCount - 1, true);

  // The winding that faces outward depends on which way the sweep runs
  // and on `place` (a mirrored arm flips it), so check one face against
  // its ring centre and flip everything if it points inward, rather than
  // making every caller reason about handedness.
  const v = (i: number) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const midRing = Math.floor((ringCount - 1) / 2);
  const mid = midRing * segments;
  const [i0, i1, i2] = [indices[mid * 6], indices[mid * 6 + 1], indices[mid * 6 + 2]];
  const p0 = v(i0);
  const normal = new THREE.Vector3().subVectors(v(i1), p0).cross(new THREE.Vector3().subVectors(v(i2), p0));
  const outward = new THREE.Vector3().subVectors(p0, centers[midRing]);
  if (normal.dot(outward) < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const t = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = t;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
