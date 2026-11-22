import * as THREE from "three";
import { setWorldQuaternion, solveTwoBone, type BodyRig, type PoseOverlay } from "../xr/body/bodyIk";
import type { HandTarget } from "./rig";

/**
 * The rest of the body, for the room modes' poses: hips that drop and
 * shift, a chest that turns and bends, feet that step, on top of whatever
 * the idle animation is doing. Before this, a sword swing moved an arm and
 * nothing else, and stood there like a mannequin with a moving arm; a real
 * swing starts in the legs and turns the hips and chest, and that is most
 * of what makes one read as a swing.
 *
 * Cheap: a rotation per spine bone, the hips' position, and the same
 * two-bone solve per leg the VR body already does (bodyIk.ts) — a few
 * dozen vector operations an avatar, no allocation. Everything is in the
 * body frame of rig.ts (x right, y up, z back; distances in eye heights),
 * so the same pose fits every avatar, and every client plays it the same
 * from the same small event.
 */
export interface BodyPose {
  /** The chest turned to the avatar's right, radians. The hips take a
   *  third of it, the spine the rest. */
  twist: number;
  /** The spine bent forward, radians (back, if negative). */
  lean: number;
  /** The spine bent toward the avatar's right, radians. */
  tilt: number;
  /** The hips lowered, bending the knees, in eye heights. */
  drop: number;
  /** The hips moved right and back (forward, if negative), eye heights. */
  shiftX: number;
  shiftZ: number;
  /** Each foot moved right and back of where the animation put it, and
   *  lifted, in eye heights. */
  left: [number, number, number];
  right: [number, number, number];
  /** How much of the chest's turn the hands go round with: all of it for a
   *  swing the body powers, none for a bow that keeps its aim. */
  carry: number;
  /** How much of the chest's turn and bend the head undoes, so the eyes
   *  stay on what's in front. */
  head: number;
  /** The head tipped forward on top of that, radians: a nod to the beat. */
  nod: number;
}

export interface BodyKey extends BodyPose {
  at: number;
}

export const NEUTRAL: BodyPose = { twist: 0, lean: 0, tilt: 0, drop: 0, shiftX: 0, shiftZ: 0, left: [0, 0, 0], right: [0, 0, 0], carry: 0.8, head: 0.6, nod: 0 };

/** A key from the parts that differ from standing still. */
export const key = (at: number, parts: Partial<BodyPose> = {}): BodyKey => ({ ...NEUTRAL, ...parts, at });

export const newBodyPose = (): BodyPose => ({ ...NEUTRAL, left: [0, 0, 0], right: [0, 0, 0] });

const smooth = (x: number) => x * x * (3 - 2 * x);
const NUMBERS = ["twist", "lean", "tilt", "drop", "shiftX", "shiftZ", "carry", "head", "nod"] as const;

export function copyBody(from: BodyPose, out: BodyPose) {
  for (const k of NUMBERS) out[k] = from[k];
  for (let i = 0; i < 3; i++) {
    out.left[i] = from.left[i];
    out.right[i] = from.right[i];
  }
  return out;
}

/** Where a track of keys is at `time` (0 to 1), eased between keys. */
export function sampleBody(keys: BodyKey[], time: number, out: BodyPose) {
  let i = 0;
  while (i < keys.length - 2 && time > keys[i + 1].at) i++;
  const a = keys[i];
  const b = keys[i + 1] ?? a;
  const s = smooth(Math.min(1, Math.max(0, (time - a.at) / Math.max(1e-6, b.at - a.at))));
  for (const k of NUMBERS) out[k] = a[k] + (b[k] - a[k]) * s;
  for (let j = 0; j < 3; j++) {
    out.left[j] = a.left[j] + (b.left[j] - a.left[j]) * s;
    out.right[j] = a.right[j] + (b.right[j] - a.right[j]) * s;
  }
  // A foot lifts on its way between two places, not only where a key
  // says so: half its travel, at most a little.
  for (const side of ["left", "right"] as const) {
    const travel = Math.hypot(b[side][0] - a[side][0], b[side][1] - a[side][1]);
    out[side][2] += Math.min(0.05, travel * 0.5) * Math.sin(s * Math.PI);
  }
  return out;
}

/** `pose` blended toward `other` by `t`. */
export function blendBody(pose: BodyPose, other: BodyPose, t: number) {
  if (t <= 0) return pose;
  for (const k of NUMBERS) pose[k] += (other[k] - pose[k]) * t;
  for (let i = 0; i < 3; i++) {
    pose.left[i] += (other.left[i] - pose.left[i]) * t;
    pose.right[i] += (other.right[i] - pose.right[i]) * t;
  }
  return pose;
}

/** The hips' share of the chest's turn. */
const HIP_SHARE = 0.35;
/** From the hips to the shoulders, in eye heights: how far a bend moves
 *  the hands with the chest. */
const SPINE_LENGTH = 0.3;

/**
 * Moves a hand target with the body: round with the chest's turn, and
 * along with the hips and the bend. Hand targets are authored for an
 * upright body, so without this a lunge would leave the hands behind.
 * `legs` is how much of the hips' movement is in (see poseBody).
 */
export function carryHand(target: HandTarget, pose: BodyPose, weight: number, legs: number) {
  const angle = -pose.twist * pose.carry * weight;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (const v of [target.pos, target.blade, target.fingers]) {
    const x = v[0];
    const z = v[2];
    v[0] = x * c + z * s;
    v[2] = -x * s + z * c;
  }
  target.pos[0] += pose.shiftX * legs + Math.sin(pose.tilt * weight) * SPINE_LENGTH;
  target.pos[1] -= pose.drop * legs + (1 - Math.cos(pose.lean * weight)) * SPINE_LENGTH;
  target.pos[2] += pose.shiftZ * legs - Math.sin(pose.lean * weight) * SPINE_LENGTH;
  return target;
}

const SIDES = ["left", "right"] as const;
const rootQ = new THREE.Quaternion();
const feet = new THREE.Vector3();
const scale = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const back = new THREE.Vector3();
const forward = new THREE.Vector3();
const offset = new THREE.Vector3();
const hips = new THREE.Vector3();
const pole = new THREE.Vector3();
const goal = new THREE.Vector3();
const q = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const share = new THREE.Quaternion();
const undo = new THREE.Quaternion();
const identity = new THREE.Quaternion();
const recorded = { left: new THREE.Vector3(), right: new THREE.Vector3() };
const recordedQ = { left: new THREE.Quaternion(), right: new THREE.Quaternion() };

/**
 * Puts the body in `pose`, `weight` of the way. `legs` (0 to 1, at most
 * `weight`) is how much the hips and feet join in: none while walking,
 * where the walk animation owns the legs and a planted foot would skate.
 * Call before posing the hands, which then reach from wherever the
 * shoulders have gone.
 */
export function poseBody(rig: BodyRig, overlay: PoseOverlay, pose: BodyPose, weight: number, legs: number) {
  if (weight <= 0.001) return;
  rig.root.getWorldQuaternion(rootQ);
  (rig.scene.parent ?? rig.scene).getWorldPosition(feet);
  const eye = rig.eyeHeight * rig.root.getWorldScale(scale).y;
  right.copy(rig.modelRight).applyQuaternion(rootQ);
  up.copy(rig.modelUp).applyQuaternion(rootQ);
  forward.copy(rig.modelForward).applyQuaternion(rootQ);
  back.copy(forward).negate();

  const withLegs = legs > 0.001 && rig.legs.left && rig.legs.right ? legs : 0;
  if (withLegs > 0) {
    for (const side of SIDES) {
      const foot = rig.legs[side]!.foot;
      foot.updateWorldMatrix(true, false);
      recorded[side].setFromMatrixPosition(foot.matrixWorld);
      foot.getWorldQuaternion(recordedQ[side]);
    }
  }

  // ---- hips: lowered, shifted, and turned with a share of the chest -------
  const hipTurn = pose.twist * HIP_SHARE * withLegs;
  if (withLegs > 0 && rig.hips.parent) {
    offset.set(0, 0, 0).addScaledVector(up, -pose.drop).addScaledVector(right, pose.shiftX).addScaledVector(back, pose.shiftZ).multiplyScalar(eye * withLegs);
    if (offset.lengthSq() > 1e-10) {
      rig.hips.getWorldPosition(hips).add(offset);
      rig.hips.parent.updateWorldMatrix(true, false);
      overlay.setPosition(rig.hips, rig.hips.parent.worldToLocal(hips));
    }
    if (Math.abs(hipTurn) > 1e-4) {
      rig.hips.getWorldQuaternion(q).premultiply(turn.setFromAxisAngle(up, -hipTurn));
      setWorldQuaternion(overlay, rig.hips, q, 1);
    }

    // ---- feet: where the animation had them, moved by the pose -----------
    for (const side of SIDES) {
      const leg = rig.legs[side]!;
      const [x, z, lift] = pose[side];
      goal.copy(recorded[side]).addScaledVector(right, x * eye).addScaledVector(back, z * eye).addScaledVector(up, Math.max(0, lift) * eye);
      // Knees bend forward over the toes, and a little out.
      leg.upper.getWorldPosition(pole).lerp(goal, 0.5).addScaledVector(forward, eye * 0.5).addScaledVector(right, (side === "right" ? 1 : -1) * eye * 0.06);
      solveTwoBone(overlay, leg.upper, leg.lower, leg.foot, goal, pole, withLegs);
      // Flat on the floor, whatever the shins just did.
      setWorldQuaternion(overlay, leg.foot, recordedQ[side], withLegs);
    }
  }

  // ---- spine: the rest of the turn, and the bends ----------------------------
  if (rig.spine.length > 0) {
    turn.setFromAxisAngle(up, -(pose.twist * weight - hipTurn));
    turn.multiply(q.setFromAxisAngle(right, -pose.lean * weight));
    turn.multiply(q.setFromAxisAngle(back, -pose.tilt * weight));
    share.copy(identity).slerp(turn, 1 / rig.spine.length);
    // Each bone adds its share on top of its parent's.
    for (const bone of rig.spine) {
      bone.getWorldQuaternion(q).premultiply(share);
      setWorldQuaternion(overlay, bone, q, 1);
    }
    // ---- head: kept on what's in front, and nodding ------------------------
    if (pose.head > 0 || pose.nod !== 0) {
      turn.multiply(q.setFromAxisAngle(up, -hipTurn));
      undo.copy(turn).invert();
      share.copy(identity).slerp(undo, pose.head);
      // The nod about the head's own sideways axis, once it faces ahead.
      share.premultiply(q.setFromAxisAngle(right, -pose.nod * weight));
      rig.head.getWorldQuaternion(q).premultiply(share);
      setWorldQuaternion(overlay, rig.head, q, 1);
    }
  }
}

/**
 * Whether an avatar is walking, eased, from how fast its feet move, kept
 * by whoever poses it. The walk animation owns the legs while it is.
 */
export class Gait {
  private last = new THREE.Vector3();
  private has = false;
  moving = 0;

  update(rig: BodyRig, delta: number) {
    (rig.scene.parent ?? rig.scene).getWorldPosition(feet);
    const speed = this.has && delta > 0 ? Math.hypot(feet.x - this.last.x, feet.z - this.last.z) / delta : 0;
    this.last.copy(feet);
    this.has = true;
    // A jump of more than a few metres is a teleport, not a walk.
    const target = speed > 20 ? this.moving : THREE.MathUtils.smoothstep(speed, 0.25, 0.9);
    this.moving += (target - this.moving) * (1 - Math.exp(-(target > this.moving ? 12 : 5) * delta));
    return this.moving;
  }
}
