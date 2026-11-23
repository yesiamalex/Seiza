import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { applyTrackedPose, createBodyRig, type BodyRig, type PoseOverlay } from "../xr/body/bodyIk";
import type { TrackedHand, TrackedPoint, TrackedPose } from "../xr/body/trackingWire";

/**
 * Posing an avatar's hands and putting things in them, for the room modes.
 *
 * Poses go through the same arm IK that VR tracking uses (bodyIk.ts), so a
 * sword swing is a few hand positions, not per-model bone angles, and it
 * works on every rig that VR does: VRM 0 and 1, VRoid, Avaturn, designer.
 *
 * Hand targets are in the body frame of trackingWire.ts: x to the player's
 * right, y up, z behind them (forward is -z), positions in eye heights.
 */
export type Vec3 = [number, number, number];

export interface HandTarget {
  pos: Vec3;
  /** Where the thumb side of the fist points: a held blade's direction. */
  blade: Vec3;
  /** Roughly where the fingers point; made square to `blade`. */
  fingers: Vec3;
  /** How closed the hand is, 0 open to 1 fist (default fist). */
  curl?: number;
}

const f = new THREE.Vector3();
const p = new THREE.Vector3();
const t = new THREE.Vector3();
const bx = new THREE.Vector3();
const basis = new THREE.Matrix4();
const q = new THREE.Quaternion();

/**
 * A hand's orientation as trackingWire expects it (-z toward the fingers,
 * -y out of the palm), from where its blade and fingers point. The thumb is
 * fingers × palm on a right hand and palm × fingers on a left one.
 */
export function handQuaternion(side: "left" | "right", blade: Vec3, fingers: Vec3, out = new THREE.Quaternion()) {
  t.set(...blade).normalize();
  f.set(...fingers);
  f.addScaledVector(t, -f.dot(t));
  // Fingers along the blade say nothing about the twist: pick any square.
  if (f.lengthSq() < 1e-6) f.set(Math.abs(t.y) < 0.9 ? 0 : 1, Math.abs(t.y) < 0.9 ? 1 : 0, 0).addScaledVector(t, -(Math.abs(t.y) < 0.9 ? t.y : t.x));
  f.normalize();
  if (side === "right") p.crossVectors(t, f);
  else p.crossVectors(f, t);
  // Columns: local x = y × z, local y = -palm, local z = -fingers.
  p.normalize().negate();
  f.negate();
  bx.crossVectors(p, f);
  basis.makeBasis(bx, p, f);
  return out.setFromRotationMatrix(basis);
}

export const newTrackedHand = (): TrackedHand => ({ pose: [0, 0, 0, 0, 0, 0, 1], curl: [1, 1] });

/** A hand target as a TrackedHand, written into `out` (reuse one per hand). */
export function toTrackedHand(side: "left" | "right", target: HandTarget, out: TrackedHand = newTrackedHand()): TrackedHand {
  const o = handQuaternion(side, target.blade, target.fingers, q);
  const p = out.pose;
  p[0] = target.pos[0];
  p[1] = target.pos[1];
  p[2] = target.pos[2];
  p[3] = o.x;
  p[4] = o.y;
  p[5] = o.z;
  p[6] = o.w;
  out.curl[0] = out.curl[1] = target.curl ?? 1;
  return out;
}

const HEAD: TrackedPoint = [0, 1, 0, 0, 0, 0, 1];
const pose: TrackedPose = { head: HEAD, left: null, right: null, height: 1 };
const weights = { head: 0, arms: 1, hand: { left: 0, right: 0 }, legs: 0 };

/** Puts one or both hands where they're asked, blended by `weight`, and
 *  each hand by its own share of that (so one can fade while the other holds). */
export function poseHands(rig: BodyRig, overlay: PoseOverlay, right: TrackedHand | null, left: TrackedHand | null, weight: number, rightShare = 1, leftShare = 1) {
  if (weight <= 0.001 || (!right && !left)) return;
  pose.right = right;
  pose.left = left;
  weights.arms = Math.min(1, weight);
  weights.hand.right = right ? Math.min(1, rightShare) : 0;
  weights.hand.left = left ? Math.min(1, leftShare) : 0;
  applyTrackedPose(rig, overlay, pose, weights);
}

const rigs = new WeakMap<VRM, BodyRig | null>();
/** The IK rig for an avatar, built once. Null for a rig without arms. */
export function rigFor(vrm: VRM): BodyRig | null {
  if (!rigs.has(vrm)) rigs.set(vrm, createBodyRig(vrm));
  return rigs.get(vrm) ?? null;
}

const rootQ = new THREE.Quaternion();
/** Which way an avatar faces, in the world, flat. */
export function facing(rig: BodyRig, out: THREE.Vector3) {
  rig.root.getWorldQuaternion(rootQ);
  return out.copy(rig.modelForward).applyQuaternion(rootQ).setY(0).normalize();
}

/** Where an avatar's feet are, and its eye height in the world. */
export function feetAndEye(rig: BodyRig, out: THREE.Vector3): number {
  (rig.scene.parent ?? rig.scene).getWorldPosition(out);
  const scale = rig.root.getWorldScale(t).y;
  return rig.eyeHeight * scale;
}

/**
 * Puts `prop` in an avatar's hand, held in a fist: its +y along the thumb
 * (a blade's direction), its +x toward the fingers (the edge), its origin
 * in the middle of the grip. On the normalized hand bone, whose axes are
 * the model's own, so the same prop sits right on every rig. Returns the
 * function that takes it away again.
 */
export function holdInHand(vrm: VRM, side: "left" | "right", prop: THREE.Object3D): () => void {
  const hand = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`);
  if (!hand) return () => {};
  const knuckle = vrm.humanoid.getNormalizedBoneNode(`${side}MiddleProximal` as VRMHumanBoneName);
  const toFingers = (knuckle ? knuckle.position.clone() : hand.position.clone().multiplyScalar(0.3)).normalize();
  const handLength = knuckle ? knuckle.position.length() : 0.08;
  const palm = new THREE.Vector3(0, -1, 0);
  const thumb = side === "right" ? new THREE.Vector3().crossVectors(toFingers, palm) : new THREE.Vector3().crossVectors(palm, toFingers);
  const back = new THREE.Vector3().crossVectors(toFingers, thumb);
  const holder = new THREE.Group();
  holder.name = "seiza-held";
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(toFingers, thumb.normalize(), back.normalize()));
  holder.userData.fist = holder.quaternion.clone();
  holder.position.copy(toFingers).multiplyScalar(handLength * 0.55).addScaledVector(palm, handLength * 0.32);
  holder.add(prop);
  hand.add(holder);
  return () => {
    hand.remove(holder);
  };
}

/** A quarter turn in the holder's frame, from the thumb's side to the fingers'. */
const ALONG_HANDLE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);

/**
 * Which way a prop held by holdInHand points. A drawn fist holds it out of
 * the thumb side, as a hand round a hilt does. A headset's controller is
 * drawn as an open hand with the fingers along its handle, so there the
 * prop goes along the fingers, which is along the handle and out of the
 * real fist: otherwise a sword pointed up and back at the player's face.
 * The bow stays as it is, upright in either.
 */
export function pointHeld(prop: THREE.Object3D, alongHandle: boolean) {
  const holder = prop.parent;
  const fist = holder?.userData.fist as THREE.Quaternion | undefined;
  if (!holder || !fist) return;
  if (alongHandle) holder.quaternion.copy(fist).multiply(ALONG_HANDLE);
  else holder.quaternion.copy(fist);
}

/**
 * Puts `prop` on an avatar's chest, in the body frame the hand targets use:
 * +x to the avatar's right, +y up, +z behind it (so -z is out of the
 * chest), whichever way the model was made to face. (Right, up, forward
 * would be a left-handed frame, which no rotation can make.)
 */
export function wearOnChest(vrm: VRM, rig: BodyRig, prop: THREE.Object3D): () => void {
  const chest = vrm.humanoid.getNormalizedBoneNode("upperChest") ?? vrm.humanoid.getNormalizedBoneNode("chest") ?? vrm.humanoid.getNormalizedBoneNode("spine");
  if (!chest) return () => {};
  const holder = new THREE.Group();
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rig.modelRight, rig.modelUp, rig.modelForward.clone().negate()));
  holder.add(prop);
  chest.add(holder);
  return () => {
    chest.remove(holder);
  };
}

/** Disposes every geometry and material under an object. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
