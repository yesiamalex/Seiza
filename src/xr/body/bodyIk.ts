import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { TrackedPoint, TrackedPose } from "./trackingWire";

/**
 * Puts a tracked pose onto a VRM: arms reach for the hands, the head turns
 * the way the real one does, fingers close with the trigger and grip, and
 * the hips drop when the player physically crouches.
 *
 * Everything here works on the *normalized* humanoid, after AvatarAnimator
 * has written the frame's animation and before VrmAvatar's vrm.update()
 * copies the normalized pose onto the real skeleton. It never assumes which
 * way a model faces or how its bones are oriented: three-vrm's normalized
 * bones all have identity rest rotations in the model's own space, so
 * facing and limb directions are read off the skeleton's rest positions
 * instead. That is the difference between working on every avatar and
 * working on the one it was tested with — VRM 0 and VRM 1 models face
 * opposite ways, for a start.
 */

type Side = "left" | "right";
const SIDES: readonly Side[] = ["left", "right"];

interface ArmBones {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
  /** The hand bone's own "toward the fingers" direction, in its local
   *  space. */
  handForward: THREE.Vector3;
  /** Each finger as [proximal, intermediate, distal], and which curl
   *  value drives it. */
  fingers: { chain: THREE.Object3D[]; curl: 0 | 1 }[];
  /** Local axis a finger joint turns about to close toward the palm. */
  curlAxis: THREE.Vector3;
  /** The collarbone, which lifts when the hand goes overhead. */
  shoulder: THREE.Object3D | null;
}

interface LegBones {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  foot: THREE.Object3D;
}

export interface BodyRig {
  root: THREE.Object3D;
  /** The model. Its *parent* is where the feet are — the group VrmAvatar
   *  draws it in — not the model itself, whose height AvatarAnimator
   *  offsets while seated. Looked up each frame rather than once, since
   *  the model is not necessarily parented yet when the rig is read. */
  scene: THREE.Object3D;
  hips: THREE.Object3D;
  /** The spine, chest, and upper chest, whichever the rig has: what a bow
   *  bends. */
  spine: THREE.Object3D[];
  neck: THREE.Object3D | null;
  head: THREE.Object3D;
  arms: Partial<Record<Side, ArmBones>>;
  legs: Partial<Record<Side, LegBones>>;
  /** The model's facing, right and up, in its own space. */
  modelForward: THREE.Vector3;
  modelRight: THREE.Vector3;
  modelUp: THREE.Vector3;
  /** Eye height in the model's own units, before any scaling. */
  eyeHeight: number;
  /** Between the eyes, relative to the head bone, in the model's own
   *  space — which is also the normalized head bone's space at rest. */
  eyeOffset: THREE.Vector3;
}

/** Palms face down in the VRM rest pose — the spec's T-pose — so this is
 *  the palm direction in every hand bone's local space. */
const PALM_LOCAL = new THREE.Vector3(0, -1, 0);
/** Degrees each finger joint closes at full curl. The same numbers the
 *  generated gestures use for a fist (scripts/generate-motions.mjs). */
const CURL_DEGREES = [70, 90, 60];
/** How much of a head turn the neck takes; the head takes the rest. */
const NECK_SHARE = 0.4;
/** Furthest the hips may drop for a physical crouch, as a fraction of eye
 *  height. Past this the knee bend needed is not one a leg can make. */
const MAX_HIP_DROP = 0.45;
/** A lower head than this, as a fraction of standing eye height, is still
 *  standing: a relaxed posture, a slouch, or tracking settling. A real
 *  crouch is far deeper, and without this the knees were always a little
 *  bent. Applied here, where the pose is drawn, so poses from any client
 *  get it. */
const CROUCH_DEAD_ZONE = 0.08;

const FINGERS: { name: string; curl: 0 | 1 }[] = [
  { name: "Index", curl: 0 },
  { name: "Middle", curl: 1 },
  { name: "Ring", curl: 1 },
  { name: "Little", curl: 1 },
];
const FINGER_SEGMENTS = ["Proximal", "Intermediate", "Distal"];

/**
 * Rest position of a normalized bone in model space. Summing local
 * positions up the chain is exact because every normalized rest rotation
 * is identity; the hips are the one bone whose position animation moves,
 * so theirs comes from the rest pose instead.
 */
function restPosition(vrm: VRM, name: VRMHumanBoneName): THREE.Vector3 | null {
  const humanoid = vrm.humanoid;
  const root = humanoid.normalizedHumanBonesRoot;
  const hips = humanoid.getNormalizedBoneNode("hips");
  const hipsRest = humanoid.normalizedRestPose.hips?.position;
  let node = humanoid.getNormalizedBoneNode(name);
  if (!node) return null;
  const sum = new THREE.Vector3();
  while (node && node !== root) {
    if (node === hips && hipsRest) sum.add(new THREE.Vector3().fromArray(hipsRest));
    else sum.add(node.position);
    node = node.parent;
  }
  return sum;
}

/** Reads the bones and measurements a tracked pose needs. Null for a rig
 *  missing something essential (no head, no arms). */
export function createBodyRig(vrm: VRM): BodyRig | null {
  const humanoid = vrm.humanoid;
  const bone = (name: VRMHumanBoneName) => humanoid.getNormalizedBoneNode(name);
  const hips = bone("hips");
  const head = bone("head");
  const leftShoulder = restPosition(vrm, "leftUpperArm");
  const rightShoulder = restPosition(vrm, "rightUpperArm");
  const headRest = restPosition(vrm, "head");
  if (!hips || !head || !leftShoulder || !rightShoulder || !headRest) return null;

  const modelUp = new THREE.Vector3(0, 1, 0);
  const modelLeft = leftShoulder.clone().sub(rightShoulder).setY(0).normalize();
  // left × up = forward, whichever way the model was authored to face.
  const modelForward = new THREE.Vector3().crossVectors(modelLeft, modelUp).normalize();
  const modelRight = new THREE.Vector3().crossVectors(modelForward, modelUp).normalize();

  const eye = restPosition(vrm, "leftEye");
  const eyeHeight = eye ? eye.y : headRest.y * 1.045;
  const rightEye = restPosition(vrm, "rightEye");
  // Without eye bones, a typical face: a little above the head bone and
  // its depth ahead of it.
  const eyeOffset = eye
    ? (rightEye ? eye.clone().add(rightEye).multiplyScalar(0.5) : eye.clone()).sub(headRest)
    : modelUp.clone().multiplyScalar(eyeHeight - headRest.y).addScaledVector(modelForward, 0.07);
  // Centred, whichever eye bones exist.
  eyeOffset.addScaledVector(modelRight, -eyeOffset.dot(modelRight));

  const arms: BodyRig["arms"] = {};
  const legs: BodyRig["legs"] = {};
  for (const side of SIDES) {
    const upper = bone(`${side}UpperArm`);
    const lower = bone(`${side}LowerArm`);
    const hand = bone(`${side}Hand`);
    if (upper && lower && hand) {
      // Toward the fingers: the middle knuckle's offset from the wrist if
      // the rig has fingers, otherwise the forearm's own direction.
      const knuckle = bone(`${side}MiddleProximal` as VRMHumanBoneName);
      const handForward = (knuckle ? knuckle.position.clone() : hand.position.clone()).normalize();
      const fingers = FINGERS.map(({ name, curl }) => ({
        chain: FINGER_SEGMENTS.map((segment) => bone(`${side}${name}${segment}` as VRMHumanBoneName)).filter(
          (node): node is THREE.Object3D => node != null
        ),
        curl,
      })).filter((finger) => finger.chain.length > 0);
      // Turning a finger about forward × palm by a positive angle moves it
      // from forward toward the palm, i.e. closes it.
      const curlAxis = new THREE.Vector3().crossVectors(handForward, PALM_LOCAL).normalize();
      arms[side] = { upper, lower, hand, handForward, fingers, curlAxis, shoulder: bone(`${side}Shoulder`) };
    }
    const legUpper = bone(`${side}UpperLeg`);
    const legLower = bone(`${side}LowerLeg`);
    const foot = bone(`${side}Foot`);
    if (legUpper && legLower && foot) legs[side] = { upper: legUpper, lower: legLower, foot };
  }
  if (!arms.left && !arms.right) return null;

  return {
    root: humanoid.normalizedHumanBonesRoot,
    scene: vrm.scene,
    hips,
    spine: (["spine", "chest", "upperChest"] as const).map(bone).filter((node): node is THREE.Object3D => node != null),
    neck: bone("neck"),
    head,
    arms,
    legs,
    modelForward,
    modelRight,
    modelUp,
    eyeHeight,
    eyeOffset,
  };
}

/**
 * Writes bone rotations on top of whatever animation is playing, and takes
 * them back off again.
 *
 * The animation mixer rewrites most bones every frame, which wipes last
 * frame's IK for free. But not all of them: the locomotion clips don't
 * animate fingers, so a finger curled by tracking would simply stay
 * curled after tracking stopped. So every write is recorded, and at the
 * start of the next frame any bone still holding exactly what was written
 * — nothing has overwritten it — is put back the way it was found.
 */
export class PoseOverlay {
  private rotations = new Map<THREE.Object3D, { before: THREE.Quaternion; written: THREE.Quaternion; live: boolean }>();
  private positions = new Map<THREE.Object3D, { before: THREE.Vector3; written: THREE.Vector3; live: boolean }>();

  restore() {
    for (const [node, entry] of this.rotations) {
      if (entry.live && node.quaternion.equals(entry.written)) node.quaternion.copy(entry.before);
      entry.live = false;
    }
    for (const [node, entry] of this.positions) {
      if (entry.live && node.position.equals(entry.written)) node.position.copy(entry.before);
      entry.live = false;
    }
  }

  clear() {
    this.rotations.clear();
    this.positions.clear();
  }

  setQuaternion(node: THREE.Object3D, target: THREE.Quaternion, weight: number) {
    if (weight <= 0) return;
    let entry = this.rotations.get(node);
    if (!entry) {
      entry = { before: new THREE.Quaternion(), written: new THREE.Quaternion(), live: false };
      this.rotations.set(node, entry);
    }
    // Only the first write in a frame records "before"; a bone written
    // twice must restore to what animation left, not to the first write.
    if (!entry.live) entry.before.copy(node.quaternion);
    node.quaternion.slerp(target, Math.min(1, weight));
    entry.written.copy(node.quaternion);
    entry.live = true;
  }

  setPosition(node: THREE.Object3D, target: THREE.Vector3) {
    let entry = this.positions.get(node);
    if (!entry) {
      entry = { before: new THREE.Vector3(), written: new THREE.Vector3(), live: false };
      this.positions.set(node, entry);
    }
    if (!entry.live) entry.before.copy(node.position);
    node.position.copy(target);
    entry.written.copy(node.position);
    entry.live = true;
  }
}

const shared = new WeakMap<object, { overlay: PoseOverlay; frame: number }>();

/**
 * The one overlay everything that poses an avatar shares (VR tracking, the
 * room modes), taken back off once a frame, before the first of them
 * writes. Each with its own overlay, the second to write a bone recorded
 * the first one's pose as "before" and put it back every frame, so a hand
 * curled by one mode stayed curled after both had stopped. `frame` is
 * anything the same for every caller in a frame and different the next
 * (the frame clock's elapsed time).
 */
export function sharedOverlay(avatar: object, frame: number): PoseOverlay {
  let entry = shared.get(avatar);
  if (!entry) shared.set(avatar, (entry = { overlay: new PoseOverlay(), frame: NaN }));
  if (entry.frame !== frame) {
    entry.frame = frame;
    entry.overlay.restore();
  }
  return entry.overlay;
}

// ---- math -------------------------------------------------------------------

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const shoulder = new THREE.Vector3();
const elbow = new THREE.Vector3();
const wrist = new THREE.Vector3();
const reach = new THREE.Vector3();
const bendDir = new THREE.Vector3();
const newElbow = new THREE.Vector3();
const clampedTarget = new THREE.Vector3();
const fromElbow = new THREE.Vector3();
const toElbow = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const q3 = new THREE.Quaternion();
const basis = new THREE.Matrix4();

/** Sets a bone's *world* rotation, by way of its parent's. */
export function setWorldQuaternion(overlay: PoseOverlay, node: THREE.Object3D, world: THREE.Quaternion, weight: number) {
  if (!node.parent) return;
  node.parent.getWorldQuaternion(q2);
  q3.copy(q2).invert().multiply(world);
  overlay.setQuaternion(node, q3, weight);
}

/** Rotates a bone so that a direction it carries (`from`, world) ends up
 *  pointing along `to`. The smallest rotation that does it. */
function swingBone(overlay: PoseOverlay, node: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, weight: number) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  q1.setFromUnitVectors(v1.copy(from).normalize(), v2.copy(to).normalize());
  node.getWorldQuaternion(q2);
  q1.multiply(q2);
  setWorldQuaternion(overlay, node, q1, weight);
}

/** Orthonormal frame from a forward and a rough up, as a quaternion that
 *  maps local x → forward, y → up. */
function frameQuaternion(forward: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  v1.copy(forward).normalize();
  v2.copy(up).addScaledVector(v1, -up.dot(v1));
  // Up parallel to forward has no unique frame; any perpendicular will do.
  if (v2.lengthSq() < 1e-8) {
    v2.set(v1.y, -v1.x, 0);
    if (v2.lengthSq() < 1e-8) v2.set(0, v1.z, -v1.y);
  }
  v2.normalize();
  v3.crossVectors(v1, v2);
  basis.makeBasis(v1, v2, v3);
  return out.setFromRotationMatrix(basis);
}

const localFrame = new THREE.Quaternion();
const worldFrame = new THREE.Quaternion();

/** Rotates a bone so its local (forward, up) land on world (forward, up). */
function alignBone(
  overlay: PoseOverlay,
  node: THREE.Object3D,
  localForward: THREE.Vector3,
  localUp: THREE.Vector3,
  worldForward: THREE.Vector3,
  worldUp: THREE.Vector3,
  weight: number
) {
  frameQuaternion(localForward, localUp, localFrame);
  frameQuaternion(worldForward, worldUp, worldFrame);
  worldFrame.multiply(localFrame.invert());
  setWorldQuaternion(overlay, node, worldFrame, weight);
}

/**
 * Two-bone IK: bends root → mid → end so the end reaches `target`, with
 * the middle joint bending toward `pole`. The classic law-of-cosines
 * solution, done on world positions so it is indifferent to how the bones
 * are oriented.
 */
export function solveTwoBone(
  overlay: PoseOverlay,
  root: THREE.Object3D,
  mid: THREE.Object3D,
  end: THREE.Object3D,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  weight: number
) {
  if (weight <= 0) return;
  end.updateWorldMatrix(true, false);
  shoulder.setFromMatrixPosition(root.matrixWorld);
  elbow.setFromMatrixPosition(mid.matrixWorld);
  wrist.setFromMatrixPosition(end.matrixWorld);
  const upperLength = shoulder.distanceTo(elbow);
  const lowerLength = elbow.distanceTo(wrist);
  if (upperLength < 1e-4 || lowerLength < 1e-4) return;

  reach.copy(target).sub(shoulder);
  const distance = THREE.MathUtils.clamp(
    reach.length(),
    Math.abs(upperLength - lowerLength) + 1e-4,
    (upperLength + lowerLength) * 0.999
  );
  reach.normalize();

  // Which way the joint bends: toward the pole, within the plane the
  // limb swings in. Falls back to the way it already bends if the pole
  // sits exactly on the line to the target.
  bendDir.copy(pole).sub(shoulder);
  bendDir.addScaledVector(reach, -bendDir.dot(reach));
  if (bendDir.lengthSq() < 1e-8) {
    bendDir.copy(elbow).sub(shoulder);
    bendDir.addScaledVector(reach, -bendDir.dot(reach));
  }
  bendDir.normalize();

  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const out = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  newElbow.copy(shoulder).addScaledVector(reach, along).addScaledVector(bendDir, out);

  toElbow.copy(newElbow).sub(shoulder);
  swingBone(overlay, root, fromElbow.copy(elbow).sub(shoulder), toElbow, weight);

  end.updateWorldMatrix(true, false);
  elbow.setFromMatrixPosition(mid.matrixWorld);
  wrist.setFromMatrixPosition(end.matrixWorld);
  clampedTarget.copy(shoulder).addScaledVector(reach, distance);
  swingBone(overlay, mid, fromElbow.copy(wrist).sub(elbow), clampedTarget.sub(elbow), weight);
}

// ---- applying a pose ----------------------------------------------------------

export interface TrackedWeights {
  head: number;
  arms: number;
  /** Per hand, so one controller dropping out lets that arm alone go
   *  back to its animation. */
  hand: Record<Side, number>;
  legs: number;
}

const rootQ = new THREE.Quaternion();
const bodyQ = new THREE.Quaternion();
const feetPos = new THREE.Vector3();
const worldScale = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const back = new THREE.Vector3();
const forward = new THREE.Vector3();
const pointQ = new THREE.Quaternion();
const target = new THREE.Vector3();
const pole = new THREE.Vector3();
const dirF = new THREE.Vector3();
const dirU = new THREE.Vector3();
const neckWorld = new THREE.Quaternion();
const headWorld = new THREE.Quaternion();
const recordedFeet = { left: new THREE.Vector3(), right: new THREE.Vector3() };
const recordedFeetQ = { left: new THREE.Quaternion(), right: new THREE.Quaternion() };
const hipsTarget = new THREE.Vector3();
const curlQ = new THREE.Quaternion();
const headQ = new THREE.Quaternion();
const yawEuler = new THREE.Euler(0, 0, 0, "YXZ");
const twistQ = new THREE.Quaternion();
const bendQ = new THREE.Quaternion();
const spineQ = new THREE.Quaternion();
const shift = new THREE.Vector3();
const hipsWorld = new THREE.Vector3();
const headBone = new THREE.Vector3();
const headGoal = new THREE.Vector3();
const spineFrom = new THREE.Vector3();
const spineTo = new THREE.Vector3();
const neckTarget = new THREE.Vector3();
const shoulderAt = new THREE.Vector3();
const twistAxis = new THREE.Vector3();
const twistAxisQ = new THREE.Quaternion();
const forearmQ = new THREE.Quaternion();
const stepFoot = new THREE.Vector3();
const stepFootQ = new THREE.Quaternion();
/** How much of the hand's twist the forearm takes. */
const FOREARM_TWIST_SHARE = 0.5;
/** A step: how long each foot is off the ground, and how high it lifts
 *  (in eye heights). */
const STEP_SECONDS = 0.32;
const STEP_LIFT = 0.045;
const upperAt = new THREE.Vector3();

/** How much of a head turn the chest follows, and the most it turns. */
const TWIST_SHARE = 0.4;
const MAX_TWIST = 0.6;
/** The most the spine bends to put the head where the real one is. */
const MAX_LEAN = 0.6;
/** Lean smaller than this (metres) is standing straight. */
const LEAN_DEAD_ZONE = 0.03;
/** The furthest the feet stay planted from under the head. */
const MAX_PLANTED_OFFSET = 0.35;

/**
 * Where a tracked player's feet are, which is not straight under their
 * head. A headset reports only the head, and the avatar is drawn with its
 * feet under it, so leaning in to look at something used to slide the
 * whole avatar forward, upright, like a chess piece. People don't move like
 * that: their feet stay where they are and they bend, and only when they
 * lean too far do they take a step.
 *
 * Kept per avatar, by whoever draws it (TrackedBody), from where it's drawn,
 * so it needs nothing new on the network and works for every sender.
 */
export class Balance {
  readonly planted = new THREE.Vector3();
  private valid = false;
  private stepping = false;
  private last = new THREE.Vector3();
  private stepClock = 0;

  reset() {
    this.valid = false;
    this.stepping = false;
    this.stepClock = 0;
  }

  /** While stepping (not while walking, which the walk animation shows):
   *  which foot is up, and how far, 0 to 1. */
  get step(): { side: "left" | "right"; lift: number } | null {
    if (!this.stepping) return null;
    const n = this.stepClock / STEP_SECONDS;
    return { side: Math.floor(n) % 2 === 0 ? "right" : "left", lift: Math.sin((n % 1) * Math.PI) };
  }

  /** Moves the feet toward `target` (under the neck), the way feet do. */
  update(target: THREE.Vector3, delta: number) {
    if (!this.valid) {
      this.planted.copy(target);
      this.last.copy(target);
      this.valid = true;
      return this.planted;
    }
    const speed = this.last.distanceTo(target) / Math.max(delta, 1e-3);
    this.last.copy(target);
    const apart = Math.hypot(target.x - this.planted.x, target.z - this.planted.z);
    if (apart > 1.5) this.planted.copy(target);
    if (apart > 0.28) this.stepping = true;
    else if (apart < 0.1) this.stepping = false;
    // Walking (the thumbstick, or across the room): the feet keep up.
    // Leaning too far: a quick step. Otherwise, a slow settle, so a lean
    // held for a while eases back to standing over the feet.
    const rate = speed > 0.6 ? 10 : this.stepping ? 6 : apart > LEAN_DEAD_ZONE ? 0.5 : 0;
    this.stepClock = this.stepping && speed <= 0.6 ? this.stepClock + delta : 0;
    const t = 1 - Math.exp(-rate * delta);
    this.planted.x += (target.x - this.planted.x) * t;
    this.planted.z += (target.z - this.planted.z) * t;
    this.planted.y = target.y;
    return this.planted;
  }
}

function toWorldPoint(point: TrackedPoint, eye: number, out: THREE.Vector3) {
  return out.set(point[0], point[1], point[2]).applyQuaternion(bodyQ).multiplyScalar(eye).add(feetPos);
}

function toWorldQuaternion(point: TrackedPoint, out: THREE.Quaternion) {
  return out.set(point[3], point[4], point[5], point[6]).premultiply(bodyQ);
}

/**
 * `balance` (optional) lets the body lean: its feet stay planted while the
 * head moves, and the spine bends to carry the head there. Leave it out
 * for an avatar something else positions under the camera (your own, in
 * a headset: see SelfView).
 */
export function applyTrackedPose(rig: BodyRig, overlay: PoseOverlay, pose: TrackedPose, weights: TrackedWeights, balance?: Balance, delta = 0) {
  // The body frame the pose was sent in (see trackingWire.ts), rebuilt on
  // this avatar: right, up and *back* (the frame's +z), from the model's
  // own facing and wherever the avatar now stands.
  rig.root.getWorldQuaternion(rootQ);
  (rig.scene.parent ?? rig.scene).getWorldPosition(feetPos);
  rig.root.getWorldScale(worldScale);
  right.copy(rig.modelRight).applyQuaternion(rootQ);
  up.copy(rig.modelUp).applyQuaternion(rootQ);
  forward.copy(rig.modelForward).applyQuaternion(rootQ);
  back.copy(forward).negate();
  basis.makeBasis(right, up, back);
  bodyQ.setFromRotationMatrix(basis);
  const eye = rig.eyeHeight * worldScale.y;

  // The head's world rotation, as a rotation of the head bone from rest.
  toWorldQuaternion(pose.head, pointQ);
  dirF.set(0, 0, -1).applyQuaternion(pointQ);
  dirU.set(0, 1, 0).applyQuaternion(pointQ);
  frameQuaternion(rig.modelForward, rig.modelUp, localFrame);
  frameQuaternion(dirF, dirU, headWorld);
  headWorld.multiply(localFrame.invert());

  // ---- feet: planted, not under the head ------------------------------------
  // The avatar is drawn with its feet under the real eyes. Move the body
  // back to where the feet were planted; the spine then bends (below) to
  // bring the head forward again to the eyes.
  const leaning = balance && weights.legs > 0.001 && rig.spine.length > 0;
  if (leaning) {
    // Under the neck, which the head turns about: the eyes, less the
    // eyes' offset from the head bone turned the way the head faces, but
    // level, so looking down doesn't read as leaning.
    yawEuler.setFromQuaternion(headWorld, "YXZ");
    headQ.setFromAxisAngle(up, yawEuler.y);
    toWorldPoint(pose.head, eye, neckTarget).sub(shift.copy(rig.eyeOffset).multiplyScalar(worldScale.y).applyQuaternion(headQ).setY(0));
    neckTarget.y = feetPos.y;
    const planted = balance.update(neckTarget, delta);
    shift.subVectors(planted, feetPos).setY(0);
    if (shift.length() > MAX_PLANTED_OFFSET) shift.setLength(MAX_PLANTED_OFFSET);
    shift.multiplyScalar(weights.legs);
    if (shift.lengthSq() > 1e-8 && rig.hips.parent) {
      rig.hips.getWorldPosition(hipsWorld).add(shift);
      rig.hips.parent.updateWorldMatrix(true, false);
      overlay.setPosition(rig.hips, rig.hips.parent.worldToLocal(hipsWorld));
    }
  } else shift.set(0, 0, 0);

  // ---- hips: a physical crouch ------------------------------------------
  // Done before the spine, because everything above the hips moves with them.
  const drop = Math.min(MAX_HIP_DROP, Math.max(0, 1 - pose.height - CROUCH_DEAD_ZONE)) * eye * weights.legs;
  if (drop > 0.005 && rig.legs.left && rig.legs.right) {
    for (const side of SIDES) {
      const foot = rig.legs[side]!.foot;
      foot.updateWorldMatrix(true, false);
      recordedFeet[side].setFromMatrixPosition(foot.matrixWorld);
      foot.getWorldQuaternion(recordedFeetQ[side]);
    }
    hipsTarget.copy(rig.hips.position);
    hipsTarget.y -= drop / worldScale.y;
    overlay.setPosition(rig.hips, hipsTarget);
    for (const side of SIDES) {
      const leg = rig.legs[side]!;
      // Knees bend forward: aim the pole out in front of the shin.
      leg.upper.getWorldPosition(pole).lerp(recordedFeet[side], 0.5).addScaledVector(forward, eye * 0.5);
      solveTwoBone(overlay, leg.upper, leg.lower, leg.foot, recordedFeet[side], pole, 1);
      // Feet stay flat, whatever the shins just did.
      setWorldQuaternion(overlay, leg.foot, recordedFeetQ[side], 1);
    }
  }

  // ---- a step: the feet catch up one at a time, lifted ------------------------
  // Without this, a step to recover from a lean slid the planted feet
  // across the floor.
  const step = leaning ? balance!.step : null;
  if (step && step.lift > 0.01 && rig.legs.left && rig.legs.right) {
    const leg = rig.legs[step.side]!;
    leg.foot.updateWorldMatrix(true, false);
    stepFoot.setFromMatrixPosition(leg.foot.matrixWorld).addScaledVector(up, STEP_LIFT * eye * step.lift * weights.legs);
    leg.foot.getWorldQuaternion(stepFootQ);
    leg.upper.getWorldPosition(pole).lerp(stepFoot, 0.5).addScaledVector(forward, eye * 0.5);
    solveTwoBone(overlay, leg.upper, leg.lower, leg.foot, stepFoot, pole, 1);
    setWorldQuaternion(overlay, leg.foot, stepFootQ, 1);
  }

  // ---- spine: turn with the head, and lean to where it is -------------------
  // A head turned on a rigid torso is what made tracked avatars look
  // stiff: people turn their chest part of the way too. And with the feet
  // planted, the spine bends so the head arrives where the real one is.
  if (rig.spine.length > 0 && (weights.head > 0 || leaning)) {
    twistQ.set(pose.head[3], pose.head[4], pose.head[5], pose.head[6]);
    yawEuler.setFromQuaternion(twistQ, "YXZ");
    const twist = THREE.MathUtils.clamp(yawEuler.y * TWIST_SHARE, -MAX_TWIST, MAX_TWIST) * weights.head;
    twistQ.setFromAxisAngle(up, twist / rig.spine.length);

    // Twist first, then the lean in two passes: the spine bends from bones
    // above the hips, so one pass, aimed from the hips, fell well short.
    for (let pass = 0; pass < (leaning ? 3 : 1); pass++) {
      bendQ.identity();
      if (pass > 0) {
        rig.head.updateWorldMatrix(true, false);
        headBone.setFromMatrixPosition(rig.head.matrixWorld);
        rig.spine[0].getWorldPosition(hipsWorld);
        // Where the head bone belongs: behind the real eyes by the avatar's
        // own eye offset, turned the way the head is.
        toWorldPoint(pose.head, eye, headGoal).sub(spineTo.copy(rig.eyeOffset).multiplyScalar(worldScale.y).applyQuaternion(headWorld));
        spineFrom.subVectors(headBone, hipsWorld);
        // Only how far it is to the side or ahead; height is the crouch's.
        const along = Math.hypot(headGoal.x - headBone.x, headGoal.z - headBone.z);
        const dead = pass === 1 ? LEAN_DEAD_ZONE : 0;
        if (along <= dead) break;
        spineTo.set(headGoal.x - headBone.x, 0, headGoal.z - headBone.z).multiplyScalar((along - dead) / along).add(spineFrom);
        const angle = spineFrom.angleTo(spineTo);
        if (angle < 1e-4) break;
        bendQ.setFromUnitVectors(spineFrom.normalize(), spineTo.normalize());
        if (angle > MAX_LEAN / 2) bendQ.slerp(spineQ.identity(), 1 - MAX_LEAN / 2 / angle);
        bendQ.slerp(spineQ.identity(), 1 - weights.legs);
        spineQ.identity().slerp(bendQ, 1 / rig.spine.length);
        bendQ.copy(spineQ);
      }
      // Each bone takes its share on top of its parent's, so the top of
      // the spine has the whole of it.
      for (const bone of rig.spine) {
        bone.getWorldQuaternion(spineQ);
        spineQ.premultiply(bendQ);
        if (pass === 0) spineQ.premultiply(twistQ);
        setWorldQuaternion(overlay, bone, spineQ, 1);
      }
    }
  }

  // ---- head -------------------------------------------------------------
  if (weights.head > 0) {
    // A share of the way to the head's rotation for the neck, measured
    // from the body's own neutral (rootQ: rest rotations are identity, so
    // a bone at rest is oriented like the root).
    if (rig.neck) {
      // From the top of the spine, which may already have turned and
      // leaned with the head (above).
      const top = rig.spine[rig.spine.length - 1];
      if (top) top.getWorldQuaternion(neckWorld);
      else neckWorld.copy(rootQ);
      neckWorld.slerp(headWorld, NECK_SHARE);
      setWorldQuaternion(overlay, rig.neck, neckWorld, weights.head);
    }
    setWorldQuaternion(overlay, rig.head, headWorld, weights.head);
  }

  // ---- arms, hands, fingers ---------------------------------------------
  for (const side of SIDES) {
    const arm = rig.arms[side];
    const hand = pose[side];
    const weight = weights.arms * weights.hand[side];
    if (!arm || !hand || weight <= 0) continue;

    toWorldPoint(hand.pose, eye, target);
    // Reaching overhead lifts the collarbone too, rather than the arm
    // pivoting alone at a fixed shoulder, which pinched the armpit.
    if (arm.shoulder) {
      arm.shoulder.getWorldPosition(shoulderAt);
      arm.upper.getWorldPosition(upperAt);
      const lift = THREE.MathUtils.smoothstep(target.y - upperAt.y, 0, 0.35 * eye);
      if (lift > 0.01) swingBone(overlay, arm.shoulder, spineFrom.subVectors(upperAt, shoulderAt), spineTo.subVectors(target, shoulderAt), 0.2 * lift * weight);
    }
    // Elbows hang down, a little back and a little out, the way they do
    // when a hand is raised in front of you.
    // Hands raised, the elbows flare out to the side rather than hanging
    // down (try lifting your hands to your head); a hand reaching across
    // the body swings its elbow out too, instead of folding it into the chest.
    const outward = side === "left" ? -1 : 1;
    arm.upper.getWorldPosition(upperAt);
    const raised = THREE.MathUtils.smoothstep(target.y - upperAt.y, -0.15 * eye, 0.3 * eye);
    const across = THREE.MathUtils.clamp((-outward * shoulderAt.subVectors(target, feetPos).dot(right)) / (0.2 * eye), 0, 1);
    arm.upper.getWorldPosition(pole)
      .addScaledVector(up, -0.35 * eye * (1 - 0.75 * raised))
      .addScaledVector(back, 0.15 * eye * (1 + raised))
      .addScaledVector(right, outward * eye * (0.25 + 0.3 * raised + 0.2 * across));
    solveTwoBone(overlay, arm.upper, arm.lower, arm.hand, target, pole, weight);

    toWorldQuaternion(hand.pose, pointQ);
    dirF.set(0, 0, -1).applyQuaternion(pointQ);
    dirU.set(0, -1, 0).applyQuaternion(pointQ);
    alignBone(overlay, arm.hand, arm.handForward, PALM_LOCAL, dirF, dirU, weight);
    // A turned wrist turns the forearm too: half of the hand's twist about
    // the forearm goes to the forearm, so the wrist doesn't wring like a
    // sweet wrapper. Then the hand is put back exactly where it was asked.
    // (Scratch of its own: setWorldQuaternion uses q2 and q3 inside.)
    arm.lower.getWorldQuaternion(forearmQ);
    arm.hand.getWorldQuaternion(twistAxisQ).premultiply(q3.copy(forearmQ).invert());
    twistAxis.copy(arm.hand.position).normalize();
    const along = twistAxisQ.x * twistAxis.x + twistAxisQ.y * twistAxis.y + twistAxisQ.z * twistAxis.z;
    const wring = 2 * Math.atan2(along, twistAxisQ.w);
    const share = THREE.MathUtils.euclideanModulo(wring + Math.PI, Math.PI * 2) - Math.PI;
    if (Math.abs(share) > 0.05) {
      twistAxis.applyQuaternion(forearmQ);
      forearmQ.premultiply(twistAxisQ.setFromAxisAngle(twistAxis, share * FOREARM_TWIST_SHARE));
      setWorldQuaternion(overlay, arm.lower, forearmQ, weight);
      alignBone(overlay, arm.hand, arm.handForward, PALM_LOCAL, dirF, dirU, weight);
    }

    for (const finger of arm.fingers) {
      const amount = hand.curl[finger.curl];
      finger.chain.forEach((node, index) => {
        curlQ.setFromAxisAngle(arm.curlAxis, THREE.MathUtils.degToRad(CURL_DEGREES[index] ?? 60) * amount);
        overlay.setQuaternion(node, curlQ, weight);
      });
    }
  }
}
