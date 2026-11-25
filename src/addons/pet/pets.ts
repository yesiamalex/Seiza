import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createStore } from "../store";
import { oneOf, sendAddonEvent, type AddonEvent } from "../bus";
import { noiseHit, toneHit, voice } from "../sound";

/**
 * Pets: a dog (aso), a cat (pusa), or a capybara that follows you. Each is
 * one skinned mesh, built here from a few shapes and a seven-bone skeleton
 * (body, head, four legs, tail), so a pet is one draw call, no download.
 * The room hears only which pet someone has, and a pat.
 */
export const PETS = ["dog", "cat", "capybara"] as const;
export type Pet = (typeof PETS)[number];
export const PET_LABELS: Record<Pet, [string, string]> = {
  dog: ["Dog (aso)", "犬"],
  cat: ["Cat (pusa)", "猫"],
  capybara: ["Capybara", "カピバラ"],
};

interface Shape {
  /** Body length, width, height, and how high its underside is (the legs). */
  length: number;
  width: number;
  height: number;
  legs: number;
  leg: number;
  head: [number, number, number];
  /** How far above the body's middle the head sits (a dog's head up, a capybara's level). */
  headUp: number;
  snout: [number, number, number] | null;
  /** A blunt, boxy head (a capybara's), not a round one. */
  boxHead?: boolean;
  ears: "flop" | "point" | "tiny";
  tail: number;
  coat: string;
  belly: string;
  dark: string;
  /** Top speed (m/s) and stride (m a step cycle). */
  speed: number;
  stride: number;
  /** How it rests: sits up, or lies down. */
  rest: "sit" | "lie";
}

export const SHAPES: Record<Pet, Shape> = {
  dog: { length: 0.62, width: 0.24, height: 0.27, legs: 0.3, leg: 0.055, head: [0.19, 0.19, 0.22], headUp: 0.2, snout: [0.1, 0.09, 0.13], ears: "flop", tail: 0.22, coat: "#b9824e", belly: "#e2c39a", dark: "#3d2b1f", speed: 6.5, stride: 0.6, rest: "sit" },
  cat: { length: 0.42, width: 0.16, height: 0.17, legs: 0.19, leg: 0.032, head: [0.14, 0.13, 0.13], headUp: 0.12, snout: [0.06, 0.045, 0.04], ears: "point", tail: 0.34, coat: "#d4873e", belly: "#f1d7b4", dark: "#5a3a22", speed: 5.5, stride: 0.42, rest: "sit" },
  capybara: { length: 0.95, width: 0.42, height: 0.44, legs: 0.2, leg: 0.075, head: [0.21, 0.24, 0.36], headUp: 0.1, snout: null, boxHead: true, ears: "tiny", tail: 0, coat: "#93704c", belly: "#a88661", dark: "#3e2e20", speed: 4.5, stride: 0.5, rest: "lie" },
};

/** Bone order. */
export const BODY = 0;
export const HEAD = 1;
export const LEGS = [2, 3, 4, 5] as const; // front left, front right, back left, back right
export const TAIL = 6;

export interface BuiltPet {
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  /** The body bone's rest height. */
  bodyY: number;
}

const materials = new Map<Pet, THREE.MeshStandardMaterial>();
const geometries = new Map<Pet, { geometry: THREE.BufferGeometry; joints: THREE.Vector3[] }>();

/** A unit box, its corners worn halfway to a ball: a capybara's blunt head. */
function roundedBox() {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  const p = g.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const round = v.clone().setLength(0.5);
    v.lerp(round, 0.55);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** One shape, coloured, its every vertex on one bone. */
function part(g: THREE.BufferGeometry, bone: number, color: (y: number) => THREE.Color) {
  const p = g.getAttribute("position");
  const colors = new Float32Array(p.count * 3);
  const index = new Uint16Array(p.count * 4);
  const weight = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const c = color(p.getY(i));
    colors.set([c.r, c.g, c.b], i * 3);
    index[i * 4] = bone;
    weight[i * 4] = 1;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(weight, 4));
  return g;
}

function build(kind: Pet) {
  const s = SHAPES[kind];
  const coat = new THREE.Color(s.coat);
  const belly = new THREE.Color(s.belly);
  const dark = new THREE.Color(s.dark);
  const earColor = coat.clone().lerp(dark, 0.45);
  const bodyY = s.legs + s.height / 2;
  const front = -s.length / 2;
  const headAt = new THREE.Vector3(0, bodyY + s.headUp, front - s.head[2] * 0.15);
  const solid = (c: THREE.Color) => () => c;
  const parts: THREE.BufferGeometry[] = [];

  // The body: an egg, lighter underneath.
  parts.push(part(new THREE.SphereGeometry(0.5, 14, 10).scale(s.width, s.height, s.length).translate(0, bodyY, 0), BODY, (y) => (y < bodyY - s.height * 0.15 ? belly : coat)));
  // A neck for the dog and the cat, from the body's front up to the head.
  if (s.headUp > 0.1) parts.push(part(new THREE.CylinderGeometry(s.head[0] * 0.32, s.width * 0.34, s.headUp + 0.06, 8).translate(0, bodyY + s.headUp / 2, front + 0.05), BODY, solid(coat)));
  // The head, its snout and nose, eyes, and ears.
  const head: THREE.BufferGeometry[] = [(s.boxHead ? roundedBox() : new THREE.SphereGeometry(0.5, 12, 10)).scale(...s.head).translate(headAt.x, headAt.y, headAt.z)];
  const tip = headAt.z - s.head[2] / 2;
  if (s.snout) head.push(new THREE.BoxGeometry(...s.snout).translate(0, headAt.y - s.head[1] * 0.18, tip + s.snout[2] * 0.2));
  parts.push(...head.map((g) => part(g, HEAD, solid(coat))));
  const noseZ = s.snout ? tip - s.snout[2] * 0.3 : tip + 0.01;
  const noseY = s.snout ? headAt.y - s.head[1] * 0.12 : headAt.y - s.head[1] * 0.05;
  parts.push(part(new THREE.SphereGeometry(s.head[0] * (s.snout ? 0.16 : 0.22), 8, 6).scale(1, 0.7, 0.8).translate(0, noseY, noseZ), HEAD, solid(dark)));
  for (const side of [-1, 1]) {
    parts.push(part(new THREE.SphereGeometry(s.head[0] * 0.08, 6, 5).translate(side * s.head[0] * 0.27, headAt.y + s.head[1] * 0.12, headAt.z - s.head[2] * 0.4), HEAD, solid(dark)));
    const ear =
      s.ears === "flop"
        ? new THREE.BoxGeometry(0.022, s.head[1] * 0.6, s.head[2] * 0.3).translate(0, -s.head[1] * 0.2, 0).rotateZ(side * 0.15).translate(side * s.head[0] * 0.5, headAt.y + s.head[1] * 0.3, headAt.z + 0.03)
        : s.ears === "point"
          ? new THREE.ConeGeometry(s.head[0] * 0.2, s.head[1] * 0.45, 4).rotateZ(-side * 0.25).translate(side * s.head[0] * 0.3, headAt.y + s.head[1] * 0.55, headAt.z + 0.01)
          : new THREE.SphereGeometry(s.head[0] * 0.13, 6, 5).translate(side * s.head[0] * 0.38, headAt.y + s.head[1] * 0.42, headAt.z + s.head[2] * 0.22);
    parts.push(part(ear, HEAD, solid(s.ears === "flop" ? earColor : coat)));
  }
  // Legs, their paws darker, each on its own bone at the hip or shoulder.
  const joints: THREE.Vector3[] = [new THREE.Vector3(0, bodyY, 0), headAt.clone().setY(bodyY + s.headUp * 0.6).setZ(front + 0.04)];
  const legTop = s.legs + s.height * 0.25;
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const at = new THREE.Vector3(x * s.width * 0.3, legTop, z * s.length * 0.3);
    joints.push(at);
    parts.push(part(new THREE.CylinderGeometry(s.leg, s.leg * 0.85, legTop, 7).translate(at.x, legTop / 2, at.z), joints.length - 1, (y) => (y < 0.05 ? dark : coat)));
  }
  // The tail, from the rump.
  const tailAt = new THREE.Vector3(0, bodyY + s.height * 0.25, s.length / 2 - 0.02);
  joints.push(tailAt);
  if (s.tail > 0) parts.push(part(new THREE.CylinderGeometry(0.012, s.leg * 0.5, s.tail, 6).translate(0, s.tail / 2, 0).rotateX(0.55).translate(tailAt.x, tailAt.y, tailAt.z), TAIL, solid(coat)));
  else parts.push(part(new THREE.SphereGeometry(0.02, 4, 3).translate(tailAt.x, tailAt.y, tailAt.z), TAIL, solid(coat)));

  const geometry = mergeGeometries(parts, false)!;
  geometry.computeBoundingSphere();
  for (const g of parts) g.dispose();
  return { geometry, joints };
}

/** A new pet, its own skeleton over the kind's shared shape and paint. */
export function buildPet(kind: Pet): BuiltPet {
  let made = geometries.get(kind);
  if (!made) geometries.set(kind, (made = build(kind)));
  let material = materials.get(kind);
  if (!material) materials.set(kind, (material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  const bones = made.joints.map(() => new THREE.Bone());
  const [bodyAt] = made.joints;
  bones[BODY].position.copy(bodyAt);
  for (let i = 1; i < bones.length; i++) {
    bones[i].position.copy(made.joints[i]).sub(bodyAt);
    bones[BODY].add(bones[i]);
  }
  const mesh = new THREE.SkinnedMesh(made.geometry, material);
  mesh.add(bones[BODY]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.userData.navIgnore = true;
  // Its bones move it off its rest-pose bounds: small enough never to cull.
  mesh.frustumCulled = false;
  return { mesh, bones, bodyY: bodyAt.y };
}

export function disposePets() {
  for (const g of geometries.values()) g.geometry.dispose();
  for (const m of materials.values()) m.dispose();
  geometries.clear();
  materials.clear();
}

/** A happy sound, by kind: a bark, a meow, a capybara's chirps. */
export function petSound(kind: Pet, distance?: number) {
  const v = voice(0.7, distance, 25, 2);
  if (!v) return;
  if (kind === "dog")
    for (const delay of [0, 0.2]) {
      noiseHit(v, { frequency: 900, duration: 0.09, gain: 0.22, delay, q: 1.5 });
      toneHit(v, { frequency: 430, sweepTo: 300, duration: 0.11, gain: 0.1, type: "square", delay });
    }
  else if (kind === "cat") {
    toneHit(v, { frequency: 620, sweepTo: 900, duration: 0.2, gain: 0.1, type: "triangle" });
    toneHit(v, { frequency: 900, sweepTo: 520, duration: 0.32, gain: 0.1, type: "triangle", delay: 0.16 });
  } else for (const delay of [0, 0.12, 0.24]) toneHit(v, { frequency: 1150, sweepTo: 920, duration: 0.07, gain: 0.07, type: "sine", delay });
}

// --- this visitor's pet, and everyone else's ------------------------------------------

export const pet = createStore<{ kind: Pet | null }>({ kind: null });
export const remotePets = new Map<string, Pet>();

export function announcePet() {
  sendAddonEvent("pet", { k: "pe", v: pet.get().kind ?? "" });
}

export function setPet(kind: Pet | null) {
  if (pet.get().kind === kind) return;
  pet.set({ kind });
  announcePet();
}

/** Pats are heard locally (patted) and by the room: whose pet, by owner id
 *  ("" for your own, from where it's sent). */
export const patted = createStore<{ owner: string; at: number }>({ owner: "", at: 0 });
export function patPet(owner: string, local = true) {
  patted.set({ owner, at: performance.now() });
  if (local) sendAddonEvent("pet", { k: "pat", v: owner });
}

export type PetEvent = { k: "hi" } | { k: "pe"; kind: Pet | null } | { k: "pat"; owner: string };

export function parsePetEvent(data: AddonEvent): PetEvent | null {
  if (data.k === "hi") return { k: "hi" };
  if (data.k === "pe") {
    if (data.v === "") return { k: "pe", kind: null };
    const kind = oneOf(data.v, PETS);
    return kind ? { k: "pe", kind } : null;
  }
  if (data.k === "pat" && typeof data.v === "string" && data.v.length <= 64) return { k: "pat", owner: data.v };
  return null;
}
