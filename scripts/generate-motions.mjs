#!/usr/bin/env node
// Generates Seiza's built-in animation clips as VRM Animation (.vrma) files.
//
//   npm run generate:motions
//
// Why generated instead of downloaded: redistributable, license-clear
// humanoid clips are hard to find (see THIRD_PARTY_ASSETS.md), and every
// avatar in Seiza — uploaded VRMs, presets, and the built-in designer — is
// a VRM humanoid. The VRMC_vrm_animation format targets the VRM *normalized*
// humanoid rig, so one clip authored here plays on any of them; three-vrm
// handles the VRM 0.x / 1.0 axis difference when it builds the clip.
// Everything in this file is original work, covered by the repository
// license, and the output is byte-for-byte reproducible from this script.
//
// Outputs:
//   public/animations/{idle,walk,run}.vrma            locomotion loops
//   public/gestures/builtin/<name>.vrma               one-shot gestures
//   src/avatar/builtinMotions.generated.ts            manifest the app imports
//
// Authoring conventions (VRM 1.0 space):
//   character faces +Z, character's LEFT is +X, +Y is up, units are meters.
//   Rest pose is the T-pose: every bone rotation is identity.
//   Angles below are degrees, applied as Euler order "XZY": Y first, then
//   Z, then X, all about the parent's axes. Useful consequences:
//     spine/neck/head  +X  leans the top forward (toward +Z)
//     upper leg        -X  swings the leg forward;  +X swings it back
//     lower leg        +X  bends the knee (shin goes back)
//     left upper arm   -Z  lowers the arm;  +Z raises it.  Right arm: mirrored.
//     arm (lowered)    +X  swings it back;  -X swings it forward
//     left lower arm   -Y  bends the elbow forward.  Right arm: +Y.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FPS = 30;

// ---------------------------------------------------------------------------
// Rest skeleton. Only proportions matter: three-vrm rescales hips translation
// to each avatar's own hips height, and rotations are rest-relative.
// ---------------------------------------------------------------------------
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
const REST_HIPS = BONES[0][2];

/** Upper-body gestures only carry these bones, so walking legs keep going
 *  underneath a wave. Must match UPPER_BODY_BONES in AvatarAnimator.tsx. */
const UPPER_BODY = new Set([
  "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
]);

// Relaxed standing pose every clip starts from, so nothing a clip doesn't
// mention falls back to the T-pose.
const BASE = {
  leftUpperArm: { z: -72 },
  rightUpperArm: { z: 72 },
  leftLowerArm: { y: -10 },
  rightLowerArm: { y: 10 },
};

// ---------------------------------------------------------------------------
// Pose helpers
// ---------------------------------------------------------------------------
const deg = THREE.MathUtils.degToRad;
const smooth = (u) => u * u * (3 - 2 * u);

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

/** Keyframed clip: eased interpolation between full poses. */
function keyed(keys) {
  const full = keys.map((k) => ({ t: k.t, pose: withBase(k.pose) }));
  return (t) => {
    let i = full.findIndex((k) => k.t >= t);
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

const pos = (v) => Math.max(0, v);

// ---------------------------------------------------------------------------
// Locomotion loops (functions of time; the last sample equals the first)
// ---------------------------------------------------------------------------
const LOCOMOTION = [
  {
    name: "idle",
    duration: 4,
    sample: (t) => {
      const p = (2 * Math.PI * t) / 4;
      const breathe = Math.sin(p);
      return withBase({
        chest: { x: 1.2 * breathe },
        upperChest: { x: 0.6 * breathe },
        neck: { x: -0.5 * breathe },
        head: { x: 0.8 * Math.sin(p + 1), y: 2 * Math.sin(p / 2 + 0.4) },
        leftUpperArm: { z: -72 + 1.2 * breathe, x: 2 },
        rightUpperArm: { z: 72 - 1.2 * breathe, x: 2 },
        leftLowerArm: { y: -12 },
        rightLowerArm: { y: 12 },
        hips: { z: 1.2 * Math.sin(p / 2) },
        _hips: [0.006 * Math.sin(p / 2), 0.003 * breathe, 0],
      });
    },
  },
  {
    name: "walk",
    duration: 1.0,
    sample: (t) => {
      const p = 2 * Math.PI * t;
      const s = Math.sin(p);
      const c = Math.cos(p);
      const lKnee = 8 + 45 * Math.pow(pos(c), 1.4);
      const rKnee = 8 + 45 * Math.pow(pos(-c), 1.4);
      return withBase({
        hips: { y: 5 * s },
        spine: { x: 3, y: -3 * s },
        chest: { y: -2 * s },
        head: { y: 2 * s },
        leftUpperLeg: { x: -28 * s },
        rightUpperLeg: { x: 28 * s },
        leftLowerLeg: { x: lKnee },
        rightLowerLeg: { x: rKnee },
        leftFoot: { x: -0.35 * (-28 * s + lKnee) },
        rightFoot: { x: -0.35 * (28 * s + rKnee) },
        leftUpperArm: { z: -74, x: 22 * s },
        rightUpperArm: { z: 74, x: -22 * s },
        leftLowerArm: { y: -(14 + 14 * pos(-s)) },
        rightLowerArm: { y: 14 + 14 * pos(s) },
        _hips: [0, -0.03 * Math.abs(s), 0],
      });
    },
  },
  {
    name: "run",
    duration: 0.64,
    sample: (t) => {
      const p = (2 * Math.PI * t) / 0.64;
      const s = Math.sin(p);
      const c = Math.cos(p);
      const lKnee = 20 + 85 * Math.pow(pos(c), 1.2);
      const rKnee = 20 + 85 * Math.pow(pos(-c), 1.2);
      return withBase({
        hips: { y: 8 * s },
        spine: { x: 12, y: -5 * s },
        chest: { x: 4, y: -4 * s },
        head: { x: -8 },
        leftUpperLeg: { x: -45 * s },
        rightUpperLeg: { x: 45 * s },
        leftLowerLeg: { x: lKnee },
        rightLowerLeg: { x: rKnee },
        leftFoot: { x: -0.3 * (-45 * s + lKnee) },
        rightFoot: { x: -0.3 * (45 * s + rKnee) },
        leftUpperArm: { z: -68, x: 40 * s },
        rightUpperArm: { z: 68, x: -40 * s },
        leftLowerArm: { y: -(78 + 10 * s) },
        rightLowerArm: { y: 78 - 10 * s },
        _hips: [0, 0.015 - 0.05 * Math.abs(s), 0],
      });
    },
  },
];

// ---------------------------------------------------------------------------
// Gestures (one-shot, start and end on the relaxed base pose)
// ---------------------------------------------------------------------------
const WAVE_UP = { rightUpperArm: { z: -40, x: -10 }, head: { z: -4, y: -4 } };
const GESTURES = [
  {
    name: "wave",
    label: "Wave",
    fullBody: false,
    keys: [
      { t: 0, pose: {} },
      { t: 0.4, pose: { ...WAVE_UP, rightLowerArm: { z: -60 } } },
      { t: 0.7, pose: { ...WAVE_UP, rightLowerArm: { z: -85 } } },
      { t: 1.0, pose: { ...WAVE_UP, rightLowerArm: { z: -45 } } },
      { t: 1.3, pose: { ...WAVE_UP, rightLowerArm: { z: -85 } } },
      { t: 1.6, pose: { ...WAVE_UP, rightLowerArm: { z: -45 } } },
      { t: 1.9, pose: { ...WAVE_UP, rightLowerArm: { z: -70 } } },
      { t: 2.4, pose: {} },
    ],
  },
  {
    name: "bow",
    label: "Bow (ojigi)",
    fullBody: false,
    keys: [
      { t: 0, pose: {} },
      {
        t: 0.7,
        pose: {
          spine: { x: 26 },
          chest: { x: 16 },
          upperChest: { x: 8 },
          neck: { x: 6 },
          head: { x: 6 },
          leftUpperArm: { z: -80, x: -10 },
          rightUpperArm: { z: 80, x: -10 },
        },
      },
      {
        t: 1.7,
        pose: {
          spine: { x: 27 },
          chest: { x: 17 },
          upperChest: { x: 8 },
          neck: { x: 6 },
          head: { x: 6 },
          leftUpperArm: { z: -80, x: -10 },
          rightUpperArm: { z: 80, x: -10 },
        },
      },
      { t: 2.6, pose: {} },
    ],
  },
  {
    name: "seiza",
    label: "Seiza (formal kneel)",
    fullBody: true,
    keys: [
      { t: 0, pose: {} },
      {
        t: 0.6,
        pose: {
          spine: { x: 14 },
          leftUpperLeg: { x: -35 },
          rightUpperLeg: { x: -35 },
          leftLowerLeg: { x: 70 },
          rightLowerLeg: { x: 70 },
          _hips: [0, -0.26, 0],
        },
      },
      {
        t: 1.2,
        pose: {
          spine: { x: 2 },
          head: { x: 4 },
          leftUpperLeg: { x: -62 },
          rightUpperLeg: { x: -62 },
          leftLowerLeg: { x: 152 },
          rightLowerLeg: { x: 152 },
          leftFoot: { x: 60 },
          rightFoot: { x: 60 },
          leftUpperArm: { z: -72, x: -34 },
          rightUpperArm: { z: 72, x: -34 },
          leftLowerArm: { y: -58 },
          rightLowerArm: { y: 58 },
          _hips: [0, -0.61, 0],
        },
      },
      {
        t: 3.2,
        pose: {
          spine: { x: 2 },
          head: { x: 6 },
          leftUpperLeg: { x: -62 },
          rightUpperLeg: { x: -62 },
          leftLowerLeg: { x: 152 },
          rightLowerLeg: { x: 152 },
          leftFoot: { x: 60 },
          rightFoot: { x: 60 },
          leftUpperArm: { z: -72, x: -34 },
          rightUpperArm: { z: 72, x: -34 },
          leftLowerArm: { y: -58 },
          rightLowerArm: { y: 58 },
          _hips: [0, -0.61, 0],
        },
      },
      {
        t: 3.8,
        pose: {
          spine: { x: 14 },
          leftUpperLeg: { x: -35 },
          rightUpperLeg: { x: -35 },
          leftLowerLeg: { x: 70 },
          rightLowerLeg: { x: 70 },
          _hips: [0, -0.26, 0],
        },
      },
      { t: 4.5, pose: {} },
    ],
  },
  {
    name: "nod",
    label: "Nod",
    fullBody: false,
    keys: [
      { t: 0, pose: {} },
      { t: 0.35, pose: { head: { x: 18 }, neck: { x: 4 } } },
      { t: 0.7, pose: { head: { x: 2 } } },
      { t: 1.05, pose: { head: { x: 18 }, neck: { x: 4 } } },
      { t: 1.6, pose: {} },
    ],
  },
  {
    name: "clap",
    label: "Clap",
    fullBody: false,
    keys: (() => {
      const arms = (flex) => ({
        leftUpperArm: { y: -70, x: 30, z: 0 },
        rightUpperArm: { y: 70, x: 30, z: 0 },
        leftLowerArm: { y: -flex },
        rightLowerArm: { y: flex },
      });
      return [
        { t: 0, pose: {} },
        { t: 0.4, pose: arms(55) },
        { t: 0.55, pose: arms(80) },
        { t: 0.75, pose: arms(55) },
        { t: 0.9, pose: arms(80) },
        { t: 1.1, pose: arms(55) },
        { t: 1.25, pose: arms(80) },
        { t: 1.45, pose: arms(55) },
        { t: 2.2, pose: {} },
      ];
    })(),
  },
  {
    name: "cheer",
    label: "Cheer",
    fullBody: false,
    keys: (() => {
      const up = (lift) => ({
        spine: { x: -4 },
        head: { x: -8 },
        leftUpperArm: { z: lift, x: -10 },
        rightUpperArm: { z: -lift, x: -10 },
        leftLowerArm: { y: -10, z: 10 },
        rightLowerArm: { y: 10, z: -10 },
      });
      return [
        { t: 0, pose: {} },
        { t: 0.45, pose: up(62) },
        { t: 0.8, pose: up(44) },
        { t: 1.15, pose: up(62) },
        { t: 1.5, pose: up(48) },
        { t: 2.2, pose: {} },
      ];
    })(),
  },
  {
    name: "shrug",
    label: "Shrug",
    fullBody: false,
    keys: (() => {
      const shrug = {
        leftShoulder: { z: 12 },
        rightShoulder: { z: -12 },
        leftUpperArm: { z: -70, x: -6 },
        rightUpperArm: { z: 70, x: -6 },
        leftLowerArm: { y: -75 },
        rightLowerArm: { y: 75 },
        head: { z: 8 },
      };
      return [
        { t: 0, pose: {} },
        { t: 0.5, pose: shrug },
        { t: 1.1, pose: shrug },
        { t: 1.9, pose: {} },
      ];
    })(),
  },
  {
    name: "point",
    label: "Point",
    fullBody: false,
    keys: (() => {
      const point = { rightUpperArm: { y: 85, x: 4, z: 0 }, rightLowerArm: { y: 4 }, head: { y: -6 }, chest: { y: -4 } };
      return [
        { t: 0, pose: {} },
        { t: 0.45, pose: point },
        { t: 1.5, pose: point },
        { t: 2.0, pose: {} },
      ];
    })(),
  },
];

// ---------------------------------------------------------------------------
// VRMA (glTF binary) writer
// ---------------------------------------------------------------------------
function writeVrma({ name, duration, sample, loop, bones }) {
  const frameCount = Math.round(duration * FPS) + 1;
  const times = new Float32Array(frameCount);
  const rotations = new Map(bones.map((b) => [b, new Float32Array(frameCount * 4)]));
  const hipsTranslation = bones.includes("hips") ? new Float32Array(frameCount * 3) : null;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  for (let i = 0; i < frameCount; i++) {
    // Loops sample their last frame at t = 0 so the wrap is seamless.
    const t = i === frameCount - 1 ? (loop ? 0 : duration) : (i / (frameCount - 1)) * duration;
    times[i] = (i / (frameCount - 1)) * duration;
    const pose = sample(t);
    for (const bone of bones) {
      const r = pose[bone];
      q.setFromEuler(e.set(deg(r.x), deg(r.y), deg(r.z), "XZY"));
      rotations.get(bone).set([q.x, q.y, q.z, q.w], i * 4);
    }
    if (hipsTranslation) {
      hipsTranslation.set(REST_HIPS.map((v, j) => v + pose._hips[j]), i * 3);
    }
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
    asset: { version: "2.0", generator: "Seiza scripts/generate-motions.mjs" },
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
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunkLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonChunkLength);
  let offset = 20 + jsonChunkLength;
  view.setUint32(offset, byteLength, true);
  view.setUint32(offset + 4, 0x004e4942, true); // "BIN\0"
  offset += 8;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function emit(relativePath, bytes) {
  const file = join(ROOT, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  console.log(`  ${relativePath}  ${(bytes.byteLength / 1024).toFixed(1)} KB`);
}

const allBones = BONES.map(([bone]) => bone);
console.log("Generating Seiza motions:");

for (const clip of LOCOMOTION) {
  emit(`public/animations/${clip.name}.vrma`, writeVrma({ ...clip, loop: true, bones: allBones }));
}

const manifest = [];
for (const gesture of GESTURES) {
  const duration = gesture.keys[gesture.keys.length - 1].t;
  const bones = gesture.fullBody ? allBones : allBones.filter((b) => UPPER_BODY.has(b));
  emit(
    `public/gestures/builtin/${gesture.name}.vrma`,
    writeVrma({ name: gesture.name, duration, sample: keyed(gesture.keys), loop: false, bones })
  );
  manifest.push({ name: gesture.name, label: gesture.label, url: `/gestures/builtin/${gesture.name}.vrma`, duration, fullBody: gesture.fullBody });
}

const ts = `// AUTO-GENERATED by scripts/generate-motions.mjs — do not edit by hand.
// Re-run \`npm run generate:motions\` after changing the motion definitions.

export interface BuiltinGesture {
  name: string;
  label: string;
  url: string;
  /** Seconds. */
  duration: number;
  /** Full-body gestures also drive the legs (e.g. kneeling), so they
   *  override walking; upper-body gestures layer over it. */
  fullBody: boolean;
}

export const LOCOMOTION_CLIPS = {
  idle: "/animations/idle.vrma",
  walk: "/animations/walk.vrma",
  run: "/animations/run.vrma",
} as const;

export const BUILTIN_GESTURES: BuiltinGesture[] = ${JSON.stringify(manifest, null, 2)};
`;
emit("src/avatar/builtinMotions.generated.ts", new TextEncoder().encode(ts));
console.log("Done.");
