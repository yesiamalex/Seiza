import * as THREE from "three";
import type { BodyPose } from "../body";
import type { HandTarget } from "../rig";

/**
 * ExerSeiza's rides: a Japanese mamachari (a step-through city bike with a
 * front basket and a bell), a skateboard, and a moped. Each is built from
 * a few merged shapes in metres, front toward -z, wheels on the ground,
 * and knows how fast it goes, how a slope slows it, and how its rider sits.
 */
export const VEHICLES = ["bike", "skateboard", "moped"] as const;
export type Vehicle = (typeof VEHICLES)[number];

export const VEHICLE_LABELS: Record<Vehicle, [string, string]> = {
  bike: ["Bike", "自転車"],
  skateboard: ["Skateboard", "スケートボード"],
  moped: ["Moped", "原付"],
};

export interface VehicleSpec {
  /** Top speed on the flat, as a multiple of walking (3.2 m/s). */
  speed: number;
  /** How much a slope changes that: 3 halves it on a 1-in-6 climb. A motor
   *  cares less than legs do. */
  slope: number;
  /** Wheel radius, metres, for how fast they turn. */
  wheel: number;
  /** Has a bell (or a horn) to ring. */
  bell: "bell" | "horn" | null;
  /** How quickly it gets up to speed and slows again, per second: a bike
   *  answers the pedals, a moped's motor winds up, a board rolls on. */
  ease: number;
}

export const VEHICLE_SPECS: Record<Vehicle, VehicleSpec> = {
  bike: { speed: 1.9, slope: 3, wheel: 0.33, bell: "bell", ease: 2.6 },
  skateboard: { speed: 1.5, slope: 3.5, wheel: 0.03, bell: null, ease: 1.4 },
  moped: { speed: 3, slope: 1, wheel: 0.22, bell: "horn", ease: 1.8 },
};

/**
 * How a slope changes a ride's speed: `gradient` is rise over run (0.1 is
 * 10%), uphill positive. Slower up, a little faster down, within limits.
 */
export function slopeFactor(vehicle: Vehicle, gradient: number) {
  const g = Math.max(-0.3, Math.min(0.3, gradient));
  return Math.max(0.35, Math.min(1.35, 1 - VEHICLE_SPECS[vehicle].slope * g));
}

const material = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const tube = (r: number, a: THREE.Vector3, b: THREE.Vector3) => {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
};
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function mesh(parts: THREE.BufferGeometry[], mat: THREE.Material) {
  const geometry = parts.length === 1 ? parts[0] : mergeAll(parts);
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = true;
  m.userData.navIgnore = true;
  return m;
}
function mergeAll(parts: THREE.BufferGeometry[]) {
  // A small local merge (positions and normals), so this file needs no utils import.
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = flat.reduce((n, g) => n + g.getAttribute("position").count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  let at = 0;
  for (const g of flat) {
    position.set(g.getAttribute("position").array as Float32Array, at * 3);
    normal.set(g.getAttribute("normal").array as Float32Array, at * 3);
    at += g.getAttribute("position").count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  return merged;
}

/** A wheel, spinning about x: a tyre and a hub, its own object. */
function wheel(r: number, z: number, y = r) {
  const group = new THREE.Group();
  group.position.set(0, y, z);
  group.add(mesh([new THREE.TorusGeometry(r, r * 0.09, 8, 28).rotateY(Math.PI / 2)], material("#26262a", { roughness: 0.8 })));
  const spokes = [0, 1, 2, 3, 4, 5].map((i) => new THREE.BoxGeometry(0.006, r * 1.9, 0.006).rotateX((i / 6) * Math.PI));
  group.add(mesh([...spokes, new THREE.CylinderGeometry(r * 0.12, r * 0.12, 0.06, 10).rotateZ(Math.PI / 2)], material("#c9cdd3", { metalness: 0.7, roughness: 0.3 })));
  group.userData.wheel = r;
  return group;
}

export interface Built {
  root: THREE.Group;
  /** The wheels, to spin as it goes. */
  wheels: THREE.Object3D[];
}

export function buildVehicle(kind: Vehicle): Built {
  const root = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  if (kind === "bike") {
    // A mamachari: cream step-through frame, front basket, chain guard, bell.
    const frame = material("#efe2c4", { roughness: 0.4, metalness: 0.2 });
    const chrome = material("#c9cdd3", { metalness: 0.75, roughness: 0.3 });
    wheels.push(wheel(0.33, -0.55), wheel(0.33, 0.55));
    root.add(...wheels);
    root.add(
      mesh(
        [
          tube(0.022, v(0, 0.36, 0.06), v(0, 0.82, -0.42)), // down tube, low: the step-through
          tube(0.022, v(0, 0.36, 0.06), v(0, 0.86, 0.22)), // seat tube
          tube(0.018, v(0, 0.36, 0.06), v(0, 0.33, 0.55)), // chain stay
          tube(0.016, v(0, 0.72, 0.18), v(0, 0.33, 0.55)), // seat stay
          tube(0.02, v(0, 0.82, -0.42), v(0, 0.33, -0.55)), // fork
          new THREE.BoxGeometry(0.03, 0.05, 0.42).translate(0.05, 0.36, 0.34), // chain guard
          new THREE.BoxGeometry(0.06, 0.012, 0.5).translate(0, 0.69, 0.56), // rear rack
        ],
        frame
      )
    );
    root.add(
      mesh(
        [
          tube(0.014, v(0, 0.82, -0.42), v(0, 0.98, -0.42)), // stem
          tube(0.013, v(-0.28, 0.98, -0.4), v(0.28, 0.98, -0.4)), // handlebar
          new THREE.SphereGeometry(0.03, 10, 8).translate(0.2, 1.0, -0.4), // the bell
        ],
        chrome
      )
    );
    root.add(mesh([new THREE.BoxGeometry(0.17, 0.05, 0.26).translate(0, 0.88, 0.24)], material("#5a3a28", { roughness: 0.7 }))); // seat
    // The basket: a wire box, open on top.
    const basket = new THREE.Group();
    const wire = material("#b8bdc4", { metalness: 0.6, roughness: 0.35, wireframe: true });
    basket.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.26, 4, 3, 3), wire));
    basket.position.set(0, 0.86, -0.66);
    root.add(basket);
  } else if (kind === "skateboard") {
    root.add(mesh([new THREE.BoxGeometry(0.21, 0.018, 0.78).translate(0, 0.085, 0)], material("#d9733f", { roughness: 0.6 })));
    root.add(mesh([new THREE.BoxGeometry(0.16, 0.02, 0.05).translate(0, 0.06, -0.27), new THREE.BoxGeometry(0.16, 0.02, 0.05).translate(0, 0.06, 0.27)], material("#b9bec6", { metalness: 0.7 })));
    for (const z of [-0.27, 0.27])
      for (const x of [-0.08, 0.08]) {
        const w = new THREE.Group();
        w.position.set(x, 0.03, z);
        w.add(mesh([new THREE.CylinderGeometry(0.03, 0.03, 0.035, 12).rotateZ(Math.PI / 2)], material("#f2efe6")));
        w.userData.wheel = 0.03;
        wheels.push(w);
        root.add(w);
      }
  } else {
    // A moped: a step-through body with a leg shield, a long seat, a headlight.
    const body = material("#8fc5d8", { roughness: 0.35, metalness: 0.15 });
    wheels.push(wheel(0.22, -0.58), wheel(0.22, 0.56));
    root.add(...wheels);
    root.add(
      mesh(
        [
          new THREE.BoxGeometry(0.3, 0.06, 0.62).translate(0, 0.3, 0.02), // floorboard
          new THREE.BoxGeometry(0.34, 0.5, 0.08).translate(0, 0.56, -0.36), // leg shield
          new THREE.BoxGeometry(0.34, 0.3, 0.5).translate(0, 0.48, 0.42), // rear body
          new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10).translate(0, 0.62, -0.44).rotateX(0), // steering column
        ],
        body
      )
    );
    root.add(mesh([new THREE.BoxGeometry(0.26, 0.08, 0.5).translate(0, 0.7, 0.36)], material("#2b2724", { roughness: 0.8 }))); // seat
    root.add(mesh([tube(0.015, v(-0.3, 0.98, -0.46), v(0.3, 0.98, -0.46)), new THREE.CylinderGeometry(0.03, 0.03, 0.3, 10).translate(0, 0.84, -0.46)], material("#c9cdd3", { metalness: 0.75, roughness: 0.3 })));
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10).translate(0, 0.9, -0.52), new THREE.MeshBasicMaterial({ color: "#fff6d6", toneMapped: false }));
    light.userData.navIgnore = true;
    root.add(light);
    // Where it shines: a soft pool of light on the ground ahead, one flat
    // card (ExerLayer brightens it at night; your own moped also casts a
    // real spotlight). A see-through cone read as a traffic cone.
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 4).rotateX(-Math.PI / 2).translate(0, 0.03, -2.7),
      new THREE.MeshBasicMaterial({ map: lightPool(), color: "#fff2c8", transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    beam.name = "beam";
    beam.userData.navIgnore = true;
    root.add(beam);
  }
  return { root, wheels };
}

/** The headlight's pool: brightest by the wheel, fading out ahead and to the sides. */
let pool: THREE.CanvasTexture | null = null;
function lightPool(): THREE.Texture | null {
  if (pool || typeof document === "undefined") return pool;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  // An ellipse that's faded to nothing well inside the card's edges.
  ctx.scale(1, 2);
  const glow = ctx.createRadialGradient(32, 40, 0, 32, 40, 30);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.5, "rgba(255,255,255,0.45)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  pool = new THREE.CanvasTexture(canvas);
  return pool;
}

/** The ride's own height in metres where the rider's hands go: the grips. */
const GRIPS: Partial<Record<Vehicle, { x: number; y: number; z: number }>> = {
  bike: { x: 0.25, y: 0.98, z: -0.4 },
  moped: { x: 0.27, y: 0.98, z: -0.46 },
};

/** The metre height these rides are drawn for: an eye height of 1.55. */
export const RIDE_EYE = 1.55;

/** How a ride is going, for the rider's body to answer: seconds, metres a
 *  second, how fast it's turning (radians a second, left positive), and
 *  how long it's been in the air (a jump), seconds. */
export interface RideMotion {
  t: number;
  speed: number;
  turn: number;
  air: number;
}
const STILL: RideMotion = { t: 0, speed: 0, turn: 0, air: 0 };

/** The trick a skateboarder does in the air, by jump: a kickflip, a 360
 *  shove-it, a grab, in turn. */
export const TRICKS = ["kickflip", "shove-it", "grab"] as const;
export type Trick = (typeof TRICKS)[number];

/**
 * How the rider sits or stands, for a pedal stroke at `phase` (radians,
 * from the distance ridden), in the body frame the hand and foot targets
 * use: eye heights, x right, y up, z back. With `motion`, the body
 * answers the ride as a real one does: leaning into a turn, the shoulders
 * rocking with the pedals, a moped's bump of the road, a board's carving
 * sway and pumping knees, and tucked up in the air over a jump.
 */
export function riderPose(kind: Vehicle, phase: number, out: BodyPose, motion: RideMotion = STILL, trick: Trick = "kickflip"): BodyPose {
  const moving = Math.min(1, motion.speed / 3);
  // Into the turn: a left turn leans left (tilt is toward the right).
  const into = Math.max(-0.3, Math.min(0.3, -motion.turn * 0.22)) * moving;
  out.twist = 0;
  out.tilt = 0;
  out.shiftX = 0;
  out.nod = 0;
  out.carry = 0;
  out.head = 0.85;
  if (kind === "bike") {
    // Leaning to the bars, feet going round on the pedals, half a turn apart.
    out.lean = 0.32;
    out.drop = 0.03;
    out.shiftZ = 0.11;
    // Over the top and forward, down and back: a forward stroke as the phase
    // (the distance ridden) grows. Offsets are [right, back, lift].
    const pedal = (p: number): [number, number, number] => [0, -0.06 - 0.07 * Math.sin(p), 0.12 + 0.07 * Math.cos(p)];
    out.left = [-0.05, ...pedal(phase).slice(1)] as [number, number, number];
    out.right = [0.05, ...pedal(phase + Math.PI).slice(1)] as [number, number, number];
    // The shoulders and hips rock with each stroke; lower to the bars when fast.
    out.twist = 0.07 * Math.sin(phase) * moving;
    out.tilt = into + 0.025 * Math.sin(phase) * moving;
    out.nod = 0.03 * Math.sin(phase * 2) * moving;
    out.lean += 0.05 * moving;
  } else if (kind === "moped") {
    // Sat upright on the long seat, feet flat on the floorboard.
    out.lean = 0.12;
    out.drop = 0.16;
    out.shiftZ = 0.06;
    out.left = [-0.05, -0.12, 0.13];
    out.right = [0.05, -0.12, 0.13];
    // The road comes up through the seat; into the turns, less than a bike.
    out.tilt = into * 0.8;
    out.drop += 0.006 * Math.sin(motion.t * 11) * moving;
    out.nod = 0.015 * Math.sin(motion.t * 7) * moving;
  } else {
    // Standing on the board, one foot ahead of the other, knees soft.
    out.lean = 0.08;
    out.drop = 0.05;
    out.shiftZ = 0;
    out.twist = 0.25;
    out.left = [0.02, -0.17, 0.04];
    out.right = [-0.02, 0.13, 0.04];
    // Carving: a slow sway from edge to edge, the knees pumping, more into a turn.
    out.tilt = into * 1.3 + 0.05 * Math.sin(motion.t * 1.4) * moving;
    out.twist = 0.25 + 0.05 * Math.sin(motion.t * 1.4) * moving;
    out.drop = 0.05 + 0.025 * (0.5 + 0.5 * Math.sin(motion.t * 2.1)) * moving;
    if (motion.air > 0) {
      // Tucked up over the board, the feet with it; a grab reaches down.
      out.drop = trick === "grab" ? 0.24 : 0.17;
      out.lean = trick === "grab" ? 0.35 : 0.18;
      out.left = [0.02, -0.17, 0.1];
      out.right = [-0.02, 0.13, 0.1];
    }
  }
  return out;
}

/** Where each hand grips, or null (on a skateboard the arms hang free). */
export function gripTarget(kind: Vehicle, side: "left" | "right", out: HandTarget): HandTarget | null {
  const grip = GRIPS[kind];
  if (!grip) return null;
  const m = side === "right" ? 1 : -1;
  out.pos[0] = (m * grip.x) / RIDE_EYE;
  out.pos[1] = grip.y / RIDE_EYE;
  out.pos[2] = grip.z / RIDE_EYE + 0.05;
  out.blade[0] = -m;
  out.blade[1] = 0;
  out.blade[2] = 0;
  out.fingers[0] = 0;
  out.fingers[1] = -0.3;
  out.fingers[2] = -1;
  out.curl = 0.9;
  return out;
}
