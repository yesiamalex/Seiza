#!/usr/bin/env node
// Generates Seilaya's together gestures as VRM Animation (.vrma) clips: a
// handshake, a high five, and a hug. They play only after both people agree
// (client/consent.ts), so they're listed in world.json as hidden gestures.
//
//   node worlds/seilaya/scripts/generate-gestures.mjs
//
// Seilaya keeps its own things in its own folder, so this is a fork of the
// few pieces it needs from Seiza's scripts/generate-motions.mjs: the rest
// skeleton, the pose helpers, and the .vrma writer. The authoring
// conventions are the same (see the top of that file): VRM 1.0 space,
// character faces +Z, its left is +X, angles in degrees in Euler order XZY,
// and the right side of a symmetric pose is mirror() of the left.
//
// Outputs worlds/seilaya/gestures/<name>.vrma, which build.mjs copies into
// the deployment. The output is byte-for-byte reproducible from this file.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "gestures");
const FPS = 30;

// --- rest skeleton (as in generate-motions.mjs) ---------------------------------------

const BONES = [
  ["hips", null, [0, 0.95, 0]],
  ["spine", "hips", [0, 0.1, 0]],
  ["chest", "spine", [0, 0.15, 0]],
  ["upperChest", "chest", [0, 0.1, 0]],
  ["neck", "upperChest", [0, 0.12, 0]],
  ["head", "neck", [0, 0.08, 0]],
  ["leftShoulder", "upperChest", [0.04, 0.07, 0]],
  ["leftUpperArm", "leftShoulder", [0.12, 0, 0]],
  ["leftLowerArm", "leftUpperArm", [0.26, 0, 0]],
  ["leftHand", "leftLowerArm", [0.24, 0, 0]],
  ["rightShoulder", "upperChest", [-0.04, 0.07, 0]],
  ["rightUpperArm", "rightShoulder", [-0.12, 0, 0]],
  ["rightLowerArm", "rightUpperArm", [-0.26, 0, 0]],
  ["rightHand", "rightLowerArm", [-0.24, 0, 0]],
  ["leftUpperLeg", "hips", [0.09, -0.04, 0]],
  ["leftLowerLeg", "leftUpperLeg", [0, -0.42, 0]],
  ["leftFoot", "leftLowerLeg", [0, -0.42, 0]],
  ["leftToes", "leftFoot", [0, -0.05, 0.12]],
  ["rightUpperLeg", "hips", [-0.09, -0.04, 0]],
  ["rightLowerLeg", "rightUpperLeg", [0, -0.42, 0]],
  ["rightFoot", "rightLowerLeg", [0, -0.42, 0]],
  ["rightToes", "rightFoot", [0, -0.05, 0.12]],
];
const FINGER_REST = [
  ["ThumbMetacarpal", "Hand", [0.025, -0.01, 0.025]],
  ["ThumbProximal", "ThumbMetacarpal", [0.035, 0, 0.02]],
  ["ThumbDistal", "ThumbProximal", [0.03, 0, 0.012]],
  ["IndexProximal", "Hand", [0.085, 0, 0.022]],
  ["IndexIntermediate", "IndexProximal", [0.035, 0, 0]],
  ["IndexDistal", "IndexIntermediate", [0.022, 0, 0]],
  ["MiddleProximal", "Hand", [0.088, 0, 0.004]],
  ["MiddleIntermediate", "MiddleProximal", [0.04, 0, 0]],
  ["MiddleDistal", "MiddleIntermediate", [0.024, 0, 0]],
  ["RingProximal", "Hand", [0.084, 0, -0.013]],
  ["RingIntermediate", "RingProximal", [0.036, 0, 0]],
  ["RingDistal", "RingIntermediate", [0.022, 0, 0]],
  ["LittleProximal", "Hand", [0.076, 0, -0.03]],
  ["LittleIntermediate", "LittleProximal", [0.028, 0, 0]],
  ["LittleDistal", "LittleIntermediate", [0.018, 0, 0]],
];
for (const side of ["left", "right"]) {
  for (const [name, parent, [x, y, z]] of FINGER_REST) {
    BONES.push([`${side}${name}`, `${side}${parent}`, [side === "left" ? x : -x, y, z]]);
  }
}
const FINGER_BONES = new Set(BONES.map(([bone]) => bone).filter((bone) => /(Thumb|Index|Middle|Ring|Little)/.test(bone)));
const REST_HIPS = BONES[0][2];
/** Upper body only, so the legs keep walking or standing underneath.
 *  Must match UPPER_BODY_BONES in Seiza's AvatarAnimator.tsx. */
const UPPER_BODY = new Set([
  "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  ...FINGER_BONES,
]);
const BASE = {
  leftUpperArm: { z: -72 },
  rightUpperArm: { z: 72 },
  leftLowerArm: { y: -10 },
  rightLowerArm: { y: 10 },
};

// --- pose helpers (as in generate-motions.mjs) -----------------------------------------

const deg = THREE.MathUtils.degToRad;
const smooth = (u) => u * u * u * (u * (6 * u - 15) + 10);
const GESTURE_TIME_SCALE = 1.2;

function withBase(pose) {
  const out = {};
  for (const [bone] of BONES) {
    const a = BASE[bone] ?? {};
    const b = pose[bone] ?? {};
    out[bone] = { x: b.x ?? a.x ?? 0, y: b.y ?? a.y ?? 0, z: b.z ?? a.z ?? 0 };
  }
  out._hips = pose._hips ?? [0, 0, 0];
  return out;
}

function keyed(keys) {
  const full = keys.map((k) => ({ t: k.t, pose: withBase(k.pose) }));
  return (t) => {
    const i = full.findIndex((k) => k.t >= t);
    if (i <= 0) return full[Math.max(0, i)].pose;
    const a = full[i - 1];
    const b = full[i];
    const u = smooth((t - a.t) / (b.t - a.t));
    const out = {};
    for (const [bone] of BONES) {
      out[bone] = {
        x: a.pose[bone].x + (b.pose[bone].x - a.pose[bone].x) * u,
        y: a.pose[bone].y + (b.pose[bone].y - a.pose[bone].y) * u,
        z: a.pose[bone].z + (b.pose[bone].z - a.pose[bone].z) * u,
      };
    }
    out._hips = a.pose._hips.map((v, j) => v + (b.pose._hips[j] - v) * u);
    return out;
  };
}

function mirror(pose) {
  const out = {};
  for (const [bone, r] of Object.entries(pose)) {
    out[bone] = r;
    if (bone.startsWith("left")) out[`right${bone.slice(4)}`] = { x: r.x ?? 0, y: -(r.y ?? 0), z: -(r.z ?? 0) };
  }
  return out;
}

const CURL = { Proximal: 70, Intermediate: 90, Distal: 60 };
function leftHand({ thumb = 0, index = 0, middle = 0, ring = 0, little = 0, spread = 0 } = {}) {
  const pose = {};
  const fans = { Index: 1, Middle: 0, Ring: -1, Little: -2 };
  for (const [name, curl] of Object.entries({ Index: index, Middle: middle, Ring: ring, Little: little })) {
    pose[`left${name}Proximal`] = { z: -CURL.Proximal * curl, y: -fans[name] * spread };
    pose[`left${name}Intermediate`] = { z: -CURL.Intermediate * curl };
    pose[`left${name}Distal`] = { z: -CURL.Distal * curl };
  }
  pose.leftThumbMetacarpal = { y: 28 * thumb, z: -10 * thumb };
  pose.leftThumbProximal = { y: 14 * thumb, z: -32 * thumb };
  pose.leftThumbDistal = { z: -38 * thumb };
  return pose;
}
/** The right hand only: the left hand's shape, mirrored, without the left. */
const rightHand = (shape) => Object.fromEntries(Object.entries(mirror(leftHand(shape))).filter(([bone]) => bone.startsWith("right")));

const RELAXED = { thumb: 0.25, index: 0.18, middle: 0.24, ring: 0.3, little: 0.36, spread: -2 };
const FLAT = { thumb: 0.05, index: 0.04, middle: 0.04, ring: 0.05, little: 0.06, spread: -3 };
/** Fingers wrapped loosely round another hand, thumb up. */
const GRIP = { thumb: 0.15, index: 0.45, middle: 0.5, ring: 0.55, little: 0.6, spread: -2 };

// --- the gestures -------------------------------------------------------------------------

/** Right hand out at waist height, palm facing in, as for a handshake.
 *  `pump` moves the hand up (positive) or down a few degrees. */
const shake = (pump) => ({
  // y swings the arm in toward the body's midline, where a handshake meets.
  rightUpperArm: { z: 64, x: -40 - pump, y: 20 },
  rightLowerArm: { y: 26 },
  rightHand: { z: pump * 0.5 },
  ...rightHand(GRIP),
  spine: { x: 3 },
  head: { x: 4 },
});

/** Right hand raised up and forward, palm out. `reach` stretches it toward
 *  the other person for the slap. */
const highFive = (reach) => ({
  rightUpperArm: { z: -42, y: 50 + 16 * reach },
  rightLowerArm: { x: -90, y: 28 - 18 * reach },
  ...rightHand(FLAT),
  spine: { y: -4 * reach, x: 2 },
  head: { x: -2 },
});

/** Both arms forward and round, as if around someone. `squeeze` closes them. */
const hug = (squeeze, sway = 0) => ({
  ...mirror({
    leftUpperArm: { z: -24 - 4 * squeeze, y: -56 - 10 * squeeze },
    leftLowerArm: { y: -52 - 18 * squeeze },
    ...leftHand(RELAXED),
  }),
  spine: { x: 6 + 2 * squeeze, y: sway },
  upperChest: { x: 4 },
  head: { x: 6, z: 6 },
});

const GESTURES = [
  {
    name: "handshake",
    keys: [
      { t: 0, pose: {} },
      { t: 0.5, pose: shake(0) },
      { t: 0.75, pose: shake(-6) },
      { t: 1.0, pose: shake(4) },
      { t: 1.25, pose: shake(-6) },
      { t: 1.5, pose: shake(3) },
      { t: 1.8, pose: shake(0) },
      { t: 2.4, pose: {} },
    ],
  },
  {
    name: "highfive",
    keys: [
      { t: 0, pose: {} },
      { t: 0.45, pose: highFive(0) },
      { t: 0.62, pose: highFive(1) },
      { t: 0.8, pose: highFive(0.2) },
      { t: 1.4, pose: {} },
    ],
  },
  {
    name: "hug",
    keys: [
      { t: 0, pose: {} },
      { t: 0.6, pose: hug(0) },
      { t: 1.0, pose: hug(1) },
      { t: 1.5, pose: hug(1, 4) },
      { t: 2.0, pose: hug(1, -4) },
      { t: 2.3, pose: hug(0.6) },
      { t: 2.9, pose: {} },
    ],
  },
];

// --- .vrma writer (as in generate-motions.mjs) -----------------------------------------------

function writeVrma({ name, duration, sample, bones }) {
  const frameCount = Math.round(duration * FPS) + 1;
  const times = new Float32Array(frameCount);
  const rotations = new Map(bones.map((b) => [b, new Float32Array(frameCount * 4)]));
  const hipsTranslation = bones.includes("hips") ? new Float32Array(frameCount * 3) : null;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < frameCount; i++) {
    const t = (i / (frameCount - 1)) * duration;
    times[i] = t;
    const pose = sample(t);
    for (const bone of bones) {
      const r = pose[bone];
      q.setFromEuler(e.set(deg(r.x), deg(r.y), deg(r.z), "XZY"));
      rotations.get(bone).set([q.x, q.y, q.z, q.w], i * 4);
    }
    if (hipsTranslation) hipsTranslation.set(REST_HIPS.map((v, j) => v + pose._hips[j]), i * 3);
  }
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteLength = 0;
  const addAccessor = (array, type, extra = {}) => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const padding = (4 - (bytes.byteLength % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength });
    chunks.push(bytes, new Uint8Array(padding));
    byteLength += bytes.byteLength + padding;
    const components = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: array.length / components, type, ...extra });
    return accessors.length - 1;
  };
  const timeAccessor = addAccessor(times, "SCALAR", { min: [0], max: [duration] });
  const nodeIndex = new Map(BONES.map(([bone], i) => [bone, i]));
  const channels = [];
  const samplers = [];
  for (const bone of bones) {
    samplers.push({ input: timeAccessor, output: addAccessor(rotations.get(bone), "VEC4"), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex.get(bone), path: "rotation" } });
  }
  if (hipsTranslation) {
    samplers.push({ input: timeAccessor, output: addAccessor(hipsTranslation, "VEC3"), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex.get("hips"), path: "translation" } });
  }
  const nodes = BONES.map(([bone, , translation]) => ({ name: bone, translation }));
  BONES.forEach(([bone, parent]) => {
    if (!parent) return;
    const p = nodes[nodeIndex.get(parent)];
    (p.children ??= []).push(nodeIndex.get(bone));
  });
  const json = {
    asset: { version: "2.0", generator: "Seilaya worlds/seilaya/scripts/generate-gestures.mjs" },
    extensionsUsed: ["VRMC_vrm_animation"],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: "1.0",
        humanoid: { humanBones: Object.fromEntries(BONES.map(([bone], i) => [bone, { node: i }])) },
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    animations: [{ name, channels, samplers }],
    buffers: [{ byteLength }],
    bufferViews,
    accessors,
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonChunkLength = jsonBytes.byteLength + jsonPadding;
  const total = 12 + 8 + jsonChunkLength + 8 + byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunkLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonChunkLength);
  let offset = 20 + jsonChunkLength;
  view.setUint32(offset, byteLength, true);
  view.setUint32(offset + 4, 0x004e4942, true);
  offset += 8;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const bones = BONES.map(([bone]) => bone).filter((b) => UPPER_BODY.has(b));
mkdirSync(OUT, { recursive: true });
console.log("Generating Seilaya's together gestures:");
for (const gesture of GESTURES) {
  const keys = gesture.keys.map((key) => ({ ...key, t: Number((key.t * GESTURE_TIME_SCALE).toFixed(3)) }));
  const duration = keys[keys.length - 1].t;
  const bytes = writeVrma({ name: gesture.name, duration, sample: keyed(keys), bones });
  writeFileSync(join(OUT, `${gesture.name}.vrma`), bytes);
  console.log(`  worlds/seilaya/gestures/${gesture.name}.vrma  ${(bytes.byteLength / 1024).toFixed(1)} KB, ${duration}s`);
}
