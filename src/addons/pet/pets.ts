import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createStore } from "../store";
import { oneOf, sendAddonEvent, type AddonEvent } from "../bus";
import { hasProfanity } from "../../moderation/profanity";
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

/** The shared shape is painted in greys (belly white, coat this); each pet's
 *  own material tints it its coat, so every pet of a kind still shares one
 *  geometry and one shader. */
const COAT_GREY = 0.72;
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
  const coat = new THREE.Color(COAT_GREY, COAT_GREY, COAT_GREY);
  const belly = new THREE.Color(1, 1, 1);
  // The nose, eyes, and paws: a dark grey, so any coat's tint keeps them dark
  // and only warms them toward its colour.
  const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const shade = Math.min(0.6, (lum(new THREE.Color(s.dark)) * COAT_GREY) / Math.max(lum(new THREE.Color(s.coat)), 1e-3));
  const dark = new THREE.Color(shade, shade, shade);
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

/** A coat colour as a pet's tint over the grey shape. */
export const coatTint = (coat: string) => new THREE.Color(coat).multiplyScalar(1 / COAT_GREY);

/** A new pet, its own skeleton over the kind's shared shape, in its coat. */
export function buildPet(kind: Pet, coat = SHAPES[kind].coat): BuiltPet {
  let made = geometries.get(kind);
  if (!made) geometries.set(kind, (made = build(kind)));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, color: coatTint(coat) });
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
  geometries.clear();
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

/** How a pet looks: its kind, coat, size, name, and, if its owner gave it
 *  one, its own model (uploaded here, as avatars are). */
export interface PetLook {
  kind: Pet;
  coat: string;
  /** 0.7 to 1.4 of the kind's size. */
  size: number;
  name: string;
  /** This deployment's own upload (/api/avatars/…), never anywhere else. */
  model: string | null;
}
export const PET_SIZE = { min: 0.7, max: 1.4 };
export const COATS: Record<Pet, string[]> = {
  dog: ["#b9824e", "#3b2a20", "#e8d8bf", "#8a5a33", "#d9a35b", "#6f6a66"],
  cat: ["#d4873e", "#2b2724", "#f2ece2", "#8b8580", "#c9a77a", "#5b4a3f"],
  capybara: ["#93704c", "#7a5a3b", "#a8875f", "#6b5340"],
};
const MODEL_URL = /^\/api\/avatars\/[0-9a-f-]{36}\.vrm$/;
const HEX = /^#[0-9a-f]{6}$/i;

export const defaultLook = (kind: Pet): PetLook => ({ kind, coat: SHAPES[kind].coat, size: 1, name: "", model: null });
/** A pet's name as shown: what its owner called it, unless rude, else its kind. */
export const petName = (look: PetLook, label: string) => (look.name && !hasProfanity(look.name) ? look.name : label);

export const pet = createStore<{ kind: Pet | null; look: PetLook | null }>({ kind: null, look: null });
export const remotePets = new Map<string, PetLook>();

export function announcePet() {
  const { look } = pet.get();
  sendAddonEvent("pet", look ? { k: "pe", v: look.kind, c: look.coat, s: look.size, n: look.name, u: look.model ?? "" } : { k: "pe", v: "" });
}

export function setPet(kind: Pet | null) {
  if (pet.get().kind === kind) return;
  pet.set({ kind, look: kind ? { ...defaultLook(kind), ...remembered(kind) } : null });
  announcePet();
}

/** Changes how your pet looks, for you and the room, and remembers it. */
export function setPetLook(change: Partial<Omit<PetLook, "kind">>) {
  const { kind, look } = pet.get();
  if (!kind || !look) return;
  const next = { ...look, ...change };
  pet.set({ kind, look: next });
  try {
    localStorage.setItem(`seiza.pet.${kind}`, JSON.stringify(next));
  } catch {
    // Private mode: it's only for now.
  }
  announcePet();
}

function remembered(kind: Pet): Partial<PetLook> {
  try {
    const saved = readLook({ ...JSON.parse(localStorage.getItem(`seiza.pet.${kind}`) ?? "{}"), v: kind });
    return saved ?? {};
  } catch {
    return {};
  }
}

/** A look from the room (or storage), every field checked. */
function readLook(data: Record<string, unknown>): PetLook | null {
  const kind = oneOf(data.v ?? data.kind, PETS);
  if (!kind) return null;
  const size = typeof (data.s ?? data.size) === "number" ? Number(data.s ?? data.size) : 1;
  const name = typeof (data.n ?? data.name) === "string" ? String(data.n ?? data.name).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").slice(0, 16) : "";
  const coat = String(data.c ?? data.coat ?? "");
  const model = String(data.u ?? data.model ?? "");
  return {
    kind,
    coat: HEX.test(coat) ? coat : SHAPES[kind].coat,
    size: Number.isFinite(size) ? Math.min(PET_SIZE.max, Math.max(PET_SIZE.min, size)) : 1,
    name,
    model: MODEL_URL.test(model) ? model : null,
  };
}

/** Pats are heard locally (patted) and by the room: whose pet (its owner's
 *  id), and who patted it (theirs; "" for this visitor). */
export const patted = createStore<{ owner: string; by: string; at: number }>({ owner: "", by: "", at: 0 });
export function patPet(owner: string, by = "") {
  patted.set({ owner, by, at: performance.now() });
  if (by === "") sendAddonEvent("pet", { k: "pat", v: owner });
}

/** The pet nearest you, close enough to pat (PetLayer keeps it current). */
export const nearPet = createStore<{ owner: string | null; name: string }>({ owner: null, name: "" });

export type PetEvent = { k: "hi" } | { k: "pe"; look: PetLook | null } | { k: "pat"; owner: string };

export function parsePetEvent(data: AddonEvent): PetEvent | null {
  if (data.k === "hi") return { k: "hi" };
  if (data.k === "pe") {
    if (data.v === "") return { k: "pe", look: null };
    const look = readLook(data);
    return look ? { k: "pe", look } : null;
  }
  if (data.k === "pat" && typeof data.v === "string" && data.v.length <= 64) return { k: "pat", owner: data.v };
  return null;
}
