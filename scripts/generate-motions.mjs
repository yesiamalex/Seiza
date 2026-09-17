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
//     left lower arm    X  ROLLS the forearm, which is what aims the palm:
//                          at rest, -90 faces it forward, 0 faces it inward
//                          toward the thigh, +90 faces it backward. The right
//                          forearm is mirrored, so negate the angle.
//
// The palm angles below were not guessed: they were solved against a real VRM
// rig and checked by measuring, in world space, where each hand ended up and
// which way its palm pointed. Reaching a specific point — palms meeting for
// gasshō, hands landing on the thighs — needs the shoulder, both arm bones
// and the forearm roll together, which is why those poses carry more numbers
// than the rest.

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
// Smootherstep rather than smoothstep: its second derivative is zero at both
// ends, so a keyframe's arrival and departure have no visible kink. On short
// gestures the difference is the whole reason a wave reads as a wave instead
// of a twitch.
const smooth = (u) => u * u * u * (u * (6 * u - 15) + 10);
// Gestures are authored at a comfortable reading pace and then stretched a
// little, because played at the authored speed they came off as hurried.
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
    // A slow breath. Faster than this and a standing avatar looks restless.
    duration: 5.5,
    sample: (t) => {
      const p = (2 * Math.PI * t) / 5.5;
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
// Gestures
//
// One-shot gestures start and end on the relaxed base pose, so they can fade
// out into whatever the body was doing. A gesture marked `hold: true` instead
// ENDS on the pose it should keep: the player holds the key (or sits on a
// chair) and the avatar stays there until released, rather than the clip
// looping or snapping back. AvatarAnimator clamps the final frame for those.
// ---------------------------------------------------------------------------
/** Right arm up beside the head, palm toward whoever is watching. */
const waveUp = (swing) => ({
  rightUpperArm: { z: -50 },
  rightLowerArm: { y: swing, x: -90 },
  spine: { z: -2 },
  head: { z: -4, y: -4 },
});

/**
 * Hands in front of the chest, palms facing each other. `close` runs from
 * the open position to palms touching. Re-solved on a rig at true chest
 * height (~1.06m — the sternum, not the collarbone) after the first pass
 * landed the open hands up near the shoulder/chin and read as clipped.
 */
const palmsTogether = (close) => ({
  leftShoulder: { z: -25 },
  rightShoulder: { z: 25 },
  leftUpperArm: { z: -62 - 37 * close, y: -14 - 7 * close, x: 21 - 1 * close },
  rightUpperArm: { z: 62 + 37 * close, y: 14 + 7 * close, x: 21 - 1 * close },
  leftLowerArm: { y: -(97 - 10 * close), x: -23 + 16 * close },
  rightLowerArm: { y: 97 - 10 * close, x: 23 - 16 * close },
  leftHand: { z: -19 },
  rightHand: { z: 19 },
});
const GESTURES = [
  {
    name: "wave",
    label: "Wave",
    fullBody: false,
    keys: [
      { t: 0, pose: {} },
      { t: 0.4, pose: waveUp(20) },
      { t: 0.7, pose: waveUp(52) },
      { t: 1.0, pose: waveUp(20) },
      { t: 1.3, pose: waveUp(52) },
      { t: 1.6, pose: waveUp(22) },
      { t: 1.9, pose: waveUp(40) },
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
    // Kneels and stays kneeling: pressing the key again (or moving) stands
    // back up, rather than the avatar popping up on its own after a few
    // seconds. Hands rest on the thighs, measured against a real rig.
    name: "seiza",
    label: "Seiza (hold)",
    fullBody: true,
    hold: true,
    keys: [
      { t: 0, pose: {} },
      {
        t: 0.7,
        pose: {
          spine: { x: 14 },
          leftUpperLeg: { x: -35 },
          rightUpperLeg: { x: -35 },
          leftLowerLeg: { x: 70 },
          rightLowerLeg: { x: 70 },
          leftUpperArm: { z: -80, x: -12 },
          rightUpperArm: { z: 80, x: -12 },
          _hips: [0, -0.26, 0],
        },
      },
      {
        t: 1.5,
        pose: {
          spine: { x: 3 },
          head: { x: 4 },
          leftUpperLeg: { x: -62 },
          rightUpperLeg: { x: -62 },
          leftLowerLeg: { x: 152 },
          rightLowerLeg: { x: 152 },
          leftFoot: { x: 60 },
          rightFoot: { x: 60 },
          // Re-solved with the elbow held to a genuinely relaxed ~28° bend
          // instead of the earlier near-straight arm — the first pass
          // minimized hand-to-thigh distance with no regard for the elbow,
          // which is what read as a stiff, clipped-looking arm.
          leftUpperArm: { z: -82, x: -17 },
          rightUpperArm: { z: 82, x: -17 },
          leftLowerArm: { y: -28, x: 111, z: 20 },
          rightLowerArm: { y: 28, x: -111, z: -20 },
          _hips: [0, -0.61, 0],
        },
      },
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
    keys: [
      { t: 0, pose: {} },
      { t: 0.4, pose: palmsTogether(0) },
      { t: 0.55, pose: palmsTogether(1) },
      { t: 0.75, pose: palmsTogether(0) },
      { t: 0.9, pose: palmsTogether(1) },
      { t: 1.1, pose: palmsTogether(0) },
      { t: 1.25, pose: palmsTogether(1) },
      { t: 1.45, pose: palmsTogether(0.3) },
      { t: 2.2, pose: {} },
    ],
  },
  {
    name: "cheer",
    label: "Cheer",
    fullBody: false,
    keys: (() => {
      // Solved on a rig: arms up in a V with the palms facing forward.
      const up = (lift) => ({
        spine: { x: -4 },
        head: { x: -8 },
        leftUpperArm: { z: lift, x: 4 },
        rightUpperArm: { z: -lift, x: 4 },
        leftLowerArm: { y: -11, x: -90 },
        rightLowerArm: { y: 11, x: 90 },
      });
      return [
        { t: 0, pose: {} },
        { t: 0.45, pose: up(80) },
        { t: 0.8, pose: up(60) },
        { t: 1.15, pose: up(80) },
        { t: 1.5, pose: up(64) },
        { t: 2.2, pose: {} },
      ];
    })(),
  },
  {
    name: "shrug",
    label: "Shrug",
    fullBody: false,
    keys: (() => {
      // Solved on a rig: forearms out with the palms turned up — the
      // "who knows" half of the gesture.
      const shrug = {
        leftShoulder: { z: 12 },
        rightShoulder: { z: -12 },
        leftUpperArm: { z: -85, x: -40 },
        rightUpperArm: { z: 85, x: -40 },
        leftLowerArm: { y: -72, x: -105 },
        rightLowerArm: { y: 72, x: 105 },
        leftHand: { x: -40 },
        rightHand: { x: 40 },
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
      // Arm out front, palm turned inward so the hand reads as pointing
      // rather than presenting.
      const point = {
        rightUpperArm: { y: 85, x: 4, z: 0 },
        rightLowerArm: { y: 4, x: -45 },
        head: { y: -6 },
        chest: { y: -4 },
      };
      return [
        { t: 0, pose: {} },
        { t: 0.45, pose: point },
        { t: 1.5, pose: point },
        { t: 2.0, pose: {} },
      ];
    })(),
  },
  {
    // 合掌 — palms together at the chest with a small bow. Everyday
    // thanks, and what you'd do before and after a meal (itadakimasu /
    // gochisousama) or in a dojo.
    name: "gassho",
    label: "Gasshō (thanks)",
    fullBody: false,
    keys: (() => {
      // Solved on a real rig at true chest/sternum height (~1.1m — the
      // original solve minimized only hand-to-hand distance and palm
      // facing, with no height target, and landed near the collarbone,
      // which read as hands held up by the face rather than at the chest).
      // Getting the hands together there needs a wrist bend too, not just
      // the shoulder and elbow, so the fingers still angle upward instead
      // of flattening out toward the chest.
      const palms = (bow) => ({
        spine: { x: bow },
        chest: { x: bow * 0.55 },
        neck: { x: 6 + bow * 0.2 },
        head: { x: 8 + bow * 0.25 },
        leftShoulder: { z: -25 },
        rightShoulder: { z: 25 },
        leftUpperArm: { z: -100, y: 60, x: -51 },
        rightUpperArm: { z: 100, y: -60, x: -51 },
        leftLowerArm: { y: -98, x: -1 },
        rightLowerArm: { y: 98, x: 1 },
        leftHand: { z: -40, x: -50 },
        rightHand: { z: 40, x: -50 },
      });
      return [
        { t: 0, pose: {} },
        { t: 0.8, pose: palms(2) },
        { t: 1.5, pose: palms(16) },
        { t: 2.4, pose: palms(16) },
        { t: 3.0, pose: palms(2) },
        { t: 3.6, pose: {} },
      ];
    })(),
  },
  {
    // はい! — the classroom "I have a question" hand. Held, not looped:
    // you keep it up until you're called on.
    name: "raisehand",
    label: "Raise hand (hold)",
    fullBody: false,
    hold: true,
    keys: [
      { t: 0, pose: {} },
      {
        t: 0.45,
        pose: {
          rightUpperArm: { z: -94, x: -8 },
          rightLowerArm: { y: 6, x: -85 },
          spine: { z: -3 },
          head: { x: -6, z: 5 },
        },
      },
      {
        t: 0.9,
        pose: {
          rightUpperArm: { z: -87, x: -6 },
          // Rolled so the palm faces forward, the way a raised hand reads.
          rightLowerArm: { y: 10, x: -85 },
          rightHand: { z: -6 },
          spine: { z: -2 },
          head: { x: -4, z: 4 },
        },
      },
    ],
  },
  {
    // Sitting on a chair or bench. Triggered by clicking a seat rather
    // than from the gesture menu (hence `hidden`), and held until the
    // player stands up. The 0.40m hips drop clears SEAT_HEIGHT in
    // src/scene/layout.ts (0.45 - 0.40 leaves the hips ~0.55m up, a few
    // centimetres above the seat cushion) — the original -0.45 drop landed
    // the hips almost exactly level with the cushion, which is what read as
    // sinking into the chair on avatars with slightly different proportions
    // than the one this was tuned against.
    name: "sit",
    label: "Sit",
    fullBody: true,
    hold: true,
    hidden: true,
    keys: [
      { t: 0, pose: {} },
      {
        t: 0.45,
        pose: {
          spine: { x: 8 },
          leftUpperLeg: { x: -45, z: 3 },
          rightUpperLeg: { x: -45, z: -3 },
          leftLowerLeg: { x: 45 },
          rightLowerLeg: { x: 45 },
          leftUpperArm: { z: -70, x: -14 },
          rightUpperArm: { z: 70, x: -14 },
          _hips: [0, -0.22, 0],
        },
      },
      {
        t: 0.95,
        pose: {
          spine: { x: 4 },
          chest: { x: -2 },
          head: { x: 2 },
          // Less extreme than the first pass (thigh was fully horizontal,
          // shin bent further back) — a slightly more upright seat, with a
          // bit more hip clearance above the chair (see the note above).
          leftUpperLeg: { x: -78, z: 5 },
          rightUpperLeg: { x: -78, z: -5 },
          leftLowerLeg: { x: 76 },
          rightLowerLeg: { x: 76 },
          leftFoot: { x: 8 },
          rightFoot: { x: 8 },
          // Hands resting lightly on top of the thighs. The elbow bend
          // (30°) is pinned rather than left for the solver to pick: an
          // unconstrained search happily flattens the arm to nearly
          // straight (it still lands near the thigh that way), which is
          // what read as a stiff, locked elbow.
          leftUpperArm: { z: -81, x: -29 },
          rightUpperArm: { z: 81, x: -29 },
          leftLowerArm: { y: -30, x: 102 },
          rightLowerArm: { y: 30, x: -102 },
          _hips: [0, -0.4, 0],
        },
      },
    ],
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
  const keys = gesture.keys.map((key) => ({ ...key, t: Number((key.t * GESTURE_TIME_SCALE).toFixed(3)) }));
  const duration = keys[keys.length - 1].t;
  const bones = gesture.fullBody ? allBones : allBones.filter((b) => UPPER_BODY.has(b));
  emit(
    `public/gestures/builtin/${gesture.name}.vrma`,
    writeVrma({ name: gesture.name, duration, sample: keyed(keys), loop: false, bones })
  );
  manifest.push({
    name: gesture.name,
    label: gesture.label,
    url: `/gestures/builtin/${gesture.name}.vrma`,
    duration,
    fullBody: gesture.fullBody,
    hold: gesture.hold === true,
    hidden: gesture.hidden === true,
  });
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
  /** Hold gestures stay on their final pose until released, instead of
   *  playing once and returning to the body's previous motion. */
  hold: boolean;
  /** Hidden gestures aren't offered in the menu or on the number keys —
   *  something else in the app triggers them (sitting on a chair). */
  hidden: boolean;
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
