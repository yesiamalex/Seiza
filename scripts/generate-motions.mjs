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
//     left lower arm    X  swings the (bent) forearm round the upper arm,
//                          which is also what turns the palm.
//     left fingers     -Z  curl toward the palm.  Right hand: +Z.
//
//   MIRRORING. The right side of a symmetric pose is the left side with Y and
//   Z negated and X LEFT ALONE: reflecting across the body's midline flips
//   rotations about the up and forward axes, but not about the side-to-side
//   one. This file used to say the forearm's X should be negated too. It
//   shouldn't, and every pose written that way (seiza, sitting, the clap) put
//   the right hand somewhere the left one wasn't: out at the side, palm up,
//   while the left rested on the thigh. Symmetric poses are therefore written
//   once, for the left side, and the right is derived by mirror() below, so
//   the two can't drift apart again.
//
// The palm angles below were not guessed: they were solved against a real VRM
// rig and checked by measuring, in world space, where each hand ended up and
// which way its palm pointed. Reaching a specific point — palms meeting for
// gasshō, hands landing on the thighs — needs the shoulder, both arm bones
// and the forearm roll together, which is why those poses carry more numbers
// than the rest.

import { createHash } from "node:crypto";
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

// Fingers, for the few clips that need them (see `fingers` on a gesture). The
// left hand points along +X with the palm down and the thumb forward; the
// right hand is its mirror image. Only the hierarchy matters here: a clip
// carries rotations, and those retarget onto each avatar's own finger bones.
// Fingers are optional in VRM, and a rig without them simply ignores these
// tracks (three-vrm skips humanoid bones the avatar doesn't have).
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

/** Upper-body gestures only carry these bones, so walking legs keep going
 *  underneath a wave. Must match UPPER_BODY_BONES in AvatarAnimator.tsx. */
const UPPER_BODY = new Set([
  "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  ...FINGER_BONES,
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

/**
 * The right-side twin of a left-side pose: every `left*` bone copied to its
 * `right*` counterpart with Y and Z negated and X kept (see MIRRORING at the
 * top of this file). Bones that aren't sided pass through unchanged.
 */
function mirror(pose) {
  const out = {};
  for (const [bone, r] of Object.entries(pose)) {
    out[bone] = r;
    if (bone.startsWith("left")) {
      out[`right${bone.slice(4)}`] = { x: r.x ?? 0, y: -(r.y ?? 0), z: -(r.z ?? 0) };
    }
  }
  return out;
}

// How far each finger joint bends in a full curl, in degrees: roughly a loose
// fist. The middle joint does the most, the tip the least.
const CURL = { Proximal: 70, Intermediate: 90, Distal: 60 };

/**
 * A hand shape for the LEFT hand (pass it through mirror() for the right).
 * Each finger takes a curl from 0 (straight) to 1 (curled into the palm).
 * `thumb` folds the thumb in across the palm by the same measure, and
 * `spread` fans the four fingers apart (negative draws them together).
 */
function leftHand({ thumb = 0, index = 0, middle = 0, ring = 0, little = 0, spread = 0 } = {}) {
  const pose = {};
  const fans = { Index: 1, Middle: 0, Ring: -1, Little: -2 };
  for (const [name, curl] of Object.entries({ Index: index, Middle: middle, Ring: ring, Little: little })) {
    // Curling toward the palm is -Z on the left hand, the same way that
    // lowers the left arm. Fanning is about Y, within the plane of the palm.
    pose[`left${name}Proximal`] = { z: -CURL.Proximal * curl, y: -fans[name] * spread };
    pose[`left${name}Intermediate`] = { z: -CURL.Intermediate * curl };
    pose[`left${name}Distal`] = { z: -CURL.Distal * curl };
  }
  // +Y swings the left thumb from its rest angle (out and forward) in across
  // the palm; -Z then closes it down onto the fingers.
  pose.leftThumbMetacarpal = { y: 28 * thumb, z: -10 * thumb };
  pose.leftThumbProximal = { y: 14 * thumb, z: -32 * thumb };
  pose.leftThumbDistal = { z: -38 * thumb };
  return pose;
}

// Hand shapes used below. A hand left at the model's rest pose is flat and
// splayed: fine on a waving hand, wrong almost everywhere else.
const RELAXED = { thumb: 0.25, index: 0.18, middle: 0.24, ring: 0.3, little: 0.36, spread: -2 };
const FLAT = { thumb: 0.05, index: 0.04, middle: 0.04, ring: 0.05, little: 0.06, spread: -3 };
const POINTING = { thumb: 0.85, index: 0, middle: 0.95, ring: 1.0, little: 1.0, spread: -1 };

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
 * Linear blend between two poses written as { bone: { x, y, z } }. Used where
 * a gesture moves between two solved end points (the clap's open and closed
 * hands), so every frame in between stays on the path the solver found.
 */
function blendPose(a, b, u) {
  const out = {};
  for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = a[bone] ?? {};
    const q = b[bone] ?? {};
    out[bone] = {
      x: (p.x ?? 0) + ((q.x ?? 0) - (p.x ?? 0)) * u,
      y: (p.y ?? 0) + ((q.y ?? 0) - (p.y ?? 0)) * u,
      z: (p.z ?? 0) + ((q.z ?? 0) - (p.z ?? 0)) * u,
    };
  }
  return out;
}

// Palms facing, fingers straight and together, thumb laid along the index
// finger instead of sticking up, which is the shape both the clap and
// gassho need.
const PRESSED = { thumb: 0.32, index: 0.04, middle: 0.04, ring: 0.05, little: 0.06, spread: -4 };

/**
 * Hands in front of the chest, palms facing each other. `close` runs from
 * the open position to the moment of the clap.
 *
 * Both ends were solved across four real avatars at once (three VRoid models,
 * one of them a VRM 0.x download, and a VRM 1.0 sample), scoring the palms
 * themselves rather than the wrists: each palm must face the other, the
 * fingers must point forward and up at 40 degrees, and the two palms must
 * stop 4-5cm apart centre to centre. That last number is the fix for
 * "overlapping": the old closed pose put the knuckles 1.5cm apart, which is
 * inside each other once there's a hand around the bones. Written for the
 * left side only and mirrored, so the two hands can't be unequal.
 */
const CLAP_OPEN = mirror({
  leftUpperArm: { x: 34, y: -37, z: -43 },
  leftLowerArm: { x: 6, y: -96 },
  leftHand: { x: -33, y: -30, z: 30 },
  ...leftHand(PRESSED),
});
const CLAP_CLOSED = mirror({
  leftUpperArm: { x: 41, y: -55, z: -63 },
  leftLowerArm: { x: 22, y: -87 },
  leftHand: { x: -17, y: -30, z: 35 },
  ...leftHand(PRESSED),
});
const palmsTogether = (close) => blendPose(CLAP_OPEN, CLAP_CLOSED, close);
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
    fingers: true,
    // Settled onto the floor at runtime: the hip drop below is only a
    // starting point, and the app lowers or lifts each avatar until its
    // shins actually rest on the ground.
    ground: "floor",
    keys: [
      { t: 0, pose: {} },
      {
        t: 0.7,
        pose: {
          spine: { x: 14 },
          ...mirror({
            leftUpperLeg: { x: -35 },
            leftLowerLeg: { x: 70 },
            leftUpperArm: { z: -80, x: -12 },
          }),
          _hips: [0, -0.26, 0],
        },
      },
      {
        t: 1.5,
        pose: {
          spine: { x: 3 },
          head: { x: 4 },
          ...mirror({
            // Sitting back onto the heels: thighs close to level, the knee
            // folded right up, and each shin angled in a touch so the feet
            // meet under the body instead of sticking out behind the hips.
            leftUpperLeg: { x: -68 },
            leftLowerLeg: { x: 158, z: -7 },
            // Pointed right out, so the top of the foot lies flat on the
            // floor with the sole up, the way seiza is actually sat.
            leftFoot: { x: 84 },
            leftToes: { x: 20 },
          }),
          // Hands resting ON the thighs, solved across four real rigs
          // (including a VRM 0.x VRoid Hub model) against each one's own
          // thigh line, and measured at the PALM rather than the wrist —
          // the wrist joint sits a whole hand's length short of where the
          // hand actually touches, which is why the previous solve read as
          // hands sunk into the inner thigh. The wrist angles are part of
          // the solve because forearm roll alone can't lay the palm flat
          // without dragging the hand off the leg; with them, the palm
          // normal points 83% of the way straight down on every rig,
          // against 46% before. Elbow bend is held at a relaxed 28 degrees.
          ...mirror({
            leftUpperArm: { x: -24, y: -10, z: -75 },
            leftLowerArm: { x: 111, y: -40 },
            leftHand: { x: -5, y: 18, z: 34 },
            ...leftHand(RELAXED),
          }),
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
    fingers: true,
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
      const up = (lift) =>
        mirror({
          spine: { x: -4 },
          head: { x: -8 },
          leftUpperArm: { z: lift, x: 4 },
          leftLowerArm: { y: -11, x: -90 },
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
      // Elbows in at the sides, forearms out front, palms up — the
      // "who knows" half of the gesture. Re-solved across three rigs with
      // the hands held to roughly shoulder width: the previous version
      // flung them well outside the body, which is what read as arms
      // sticking out sideways.
      const shrug = {
        ...mirror({
          leftUpperArm: { z: -84, x: -32 },
          leftLowerArm: { y: -34, x: -58 },
          leftHand: { x: -30 },
        }),
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
    fingers: true,
    keys: (() => {
      // What makes a point read as a point is the hand: one finger out,
      // the rest closed. The old version had neither, and a dead-straight
      // arm raised at shoulder height with a flat open palm is a salute, not
      // a point. So: the index finger extended and the others curled in,
      // the upper arm forward and below the shoulder, and the elbow bent so
      // the forearm lifts to aim, which is how people actually point at
      // something across a room. The chest and head turn a little with it.
      const pointingHand = mirror(leftHand(POINTING));
      const point = {
        rightUpperArm: { z: 72, x: -30, y: 20 },
        rightLowerArm: { y: 50 },
        rightHand: { z: -6 },
        // The other hand hangs relaxed rather than flat and splayed.
        ...leftHand(RELAXED),
        ...Object.fromEntries(Object.entries(pointingHand).filter(([bone]) => bone.startsWith("right"))),
        chest: { y: -6 },
        neck: { y: -3 },
        head: { y: -6, x: -2 },
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
    fingers: true,
    keys: (() => {
      // Palms pressed flat together at the sternum, fingers pointing up and
      // a little forward, elbows relaxed at the sides. Solved the same way as
      // the clap (see palmsTogether): on all four test avatars each palm
      // faces the other exactly, the fingers point within a degree of the
      // target, and the palm centres sit 3-3.3cm apart, which is two palms
      // touching rather than one sunk into the other. Each palm is scored on
      // facing the OTHER palm from its own side of the body; a looser score
      // let the hands cross over and meet back to back. The previous
      // version cupped the hands palms-up in a V, with the fingers forward.
      const palms = (bow) => ({
        spine: { x: bow },
        chest: { x: bow * 0.55 },
        neck: { x: 6 + bow * 0.2 },
        head: { x: 8 + bow * 0.25 },
        ...mirror({
          leftUpperArm: { x: 5, y: -46, z: -56 },
          leftLowerArm: { x: 44, y: -106 },
          leftHand: { x: -10, y: -30, z: 61 },
          ...leftHand(PRESSED),
        }),
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
    fingers: true,
    // Settled onto the seat at runtime rather than trusting the baked hip
    // height, which can only ever be right for one set of proportions.
    ground: "seat",
    keys: [
      { t: 0, pose: {} },
      {
        t: 0.45,
        pose: {
          spine: { x: 8 },
          ...mirror({
            leftUpperLeg: { x: -45, z: 3 },
            leftLowerLeg: { x: 45 },
            leftUpperArm: { z: -70, x: -14 },
          }),
          _hips: [0, -0.18, 0],
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
          ...mirror({
            leftUpperLeg: { x: -78, z: 5 },
            leftLowerLeg: { x: 76 },
            leftFoot: { x: 8 },
          }),
          // Hands on the thighs, solved the same way as seiza's: palm
          // contact, four rigs, wrists included. A deeper elbow bend than
          // seiza because a seated thigh is closer to horizontal, so the
          // hand has further to travel forward to land on it.
          ...mirror({
            leftUpperArm: { x: -24, y: -10, z: -72 },
            leftLowerArm: { x: 102, y: -40 },
            leftHand: { x: 3, y: 21, z: 40 },
            ...leftHand(RELAXED),
          }),
          // Only a starting point. The app measures each avatar's hips
          // against the real seat height every frame and slides the body
          // to meet it (ground: "seat" above), so no baked number here has
          // to be right for every set of proportions — which is just as
          // well, because none can be.
          _hips: [0, -0.33, 0],
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

/**
 * Short content hash, appended to each clip's URL in the manifest.
 *
 * Regenerating a motion rewrites the file but leaves its path alone, so a
 * browser (or a CDN) that already has the old bytes happily keeps serving
 * them — which looks exactly like the fix not working. A hash in the query
 * string gives changed clips a new URL and leaves unchanged ones cacheable.
 */
function contentHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}

const allBones = BONES.map(([bone]) => bone);
// Locomotion never touches the fingers: the idle hand is the model's own.
const bodyBones = allBones.filter((b) => !FINGER_BONES.has(b));
console.log("Generating Seiza motions:");

const locomotionUrls = {};
for (const clip of LOCOMOTION) {
  const bytes = writeVrma({ ...clip, loop: true, bones: bodyBones });
  emit(`public/animations/${clip.name}.vrma`, bytes);
  locomotionUrls[clip.name] = `/animations/${clip.name}.vrma?v=${contentHash(bytes)}`;
}

const manifest = [];
for (const gesture of GESTURES) {
  const keys = gesture.keys.map((key) => ({ ...key, t: Number((key.t * GESTURE_TIME_SCALE).toFixed(3)) }));
  const duration = keys[keys.length - 1].t;
  // Finger tracks only go into clips that shape the hand; everywhere else
  // the avatar's own resting hand is left alone.
  const bones = (gesture.fullBody ? allBones : allBones.filter((b) => UPPER_BODY.has(b))).filter(
    (b) => gesture.fingers === true || !FINGER_BONES.has(b)
  );
  const bytes = writeVrma({ name: gesture.name, duration, sample: keyed(keys), loop: false, bones });
  emit(`public/gestures/builtin/${gesture.name}.vrma`, bytes);
  manifest.push({
    name: gesture.name,
    label: gesture.label,
    url: `/gestures/builtin/${gesture.name}.vrma?v=${contentHash(bytes)}`,
    duration,
    fullBody: gesture.fullBody,
    hold: gesture.hold === true,
    hidden: gesture.hidden === true,
    ground: gesture.ground ?? "none",
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
  /**
   * How the app should settle this pose onto the world at runtime.
   *
   * A clip can only carry one hip height, but every avatar has different
   * leg proportions, so a baked height that grounds one body leaves another
   * hovering or sunk. "floor" drops the avatar until whatever is lowest
   * (shins, feet) rests on the ground; "seat" lifts the hips to the height
   * of the seat they're sitting on. See AvatarAnimator.
   */
  ground: "none" | "floor" | "seat";
}

// The ?v= is a content hash: regenerating a clip changes its URL, so a
// browser that cached the old bytes fetches the new ones instead of quietly
// keeping the old motion.
export const LOCOMOTION_CLIPS = {
  idle: ${JSON.stringify(locomotionUrls.idle)},
  walk: ${JSON.stringify(locomotionUrls.walk)},
  run: ${JSON.stringify(locomotionUrls.run)},
} as const;

export const BUILTIN_GESTURES: BuiltinGesture[] = ${JSON.stringify(manifest, null, 2)};
`;
emit("src/avatar/builtinMotions.generated.ts", new TextEncoder().encode(ts));
console.log("Done.");
