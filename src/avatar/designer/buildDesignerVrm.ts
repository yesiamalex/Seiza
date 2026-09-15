import * as THREE from "three";
import { VRM, VRMHumanoid, type VRM1Meta, type VRMHumanBoneName, type VRMHumanBones } from "@pixiv/three-vrm";
import type { AvatarSpec } from "./avatarSpec";

/**
 * Builds a real three-vrm `VRM` object from an AvatarSpec, entirely in code.
 *
 * It is a genuine VRM instance with a VRM humanoid, not a look-alike:
 * `createVRMAnimationClip`, the normalized-bone pose API, and everything
 * else in the app that accepts a VRM work on it unchanged. So designed
 * avatars get the same idle/walk/run blending and gestures as uploaded ones.
 *
 * Construction:
 * - Authored in VRM 1.0 space (faces +Z, character's left is +X) and marked
 *   `metaVersion: "1"`, so VrmAvatar.tsx orients it exactly like an uploaded
 *   VRM 1.0 file.
 * - Rigid skinning: each body part is an ordinary mesh parented to its bone
 *   instead of a weighted SkinnedMesh. Joint spheres cover the seams. This is
 *   the stylized-figure look (think wooden mannequin / Mii), and it removes
 *   every weight-painting failure mode.
 * - No spring bones, so nothing on a designed avatar can flail.
 */

type Vec3 = [number, number, number];

interface BoneDef {
  name: VRMHumanBoneName;
  parent: VRMHumanBoneName | null;
  /** World-space rest position before height scaling. */
  at: Vec3;
}

function skeleton(build: number): BoneDef[] {
  const shoulderX = 0.165 * build;
  return [
    { name: "hips", parent: null, at: [0, 0.92, 0] },
    { name: "spine", parent: "hips", at: [0, 1.02, 0] },
    { name: "chest", parent: "spine", at: [0, 1.15, 0] },
    { name: "upperChest", parent: "chest", at: [0, 1.27, 0] },
    { name: "neck", parent: "upperChest", at: [0, 1.4, 0] },
    { name: "head", parent: "neck", at: [0, 1.48, 0] },
    { name: "leftShoulder", parent: "upperChest", at: [0.035, 1.35, 0] },
    { name: "leftUpperArm", parent: "leftShoulder", at: [shoulderX, 1.35, 0] },
    { name: "leftLowerArm", parent: "leftUpperArm", at: [shoulderX + 0.25, 1.35, 0] },
    { name: "leftHand", parent: "leftLowerArm", at: [shoulderX + 0.47, 1.35, 0] },
    { name: "rightShoulder", parent: "upperChest", at: [-0.035, 1.35, 0] },
    { name: "rightUpperArm", parent: "rightShoulder", at: [-shoulderX, 1.35, 0] },
    { name: "rightLowerArm", parent: "rightUpperArm", at: [-shoulderX - 0.25, 1.35, 0] },
    { name: "rightHand", parent: "rightLowerArm", at: [-shoulderX - 0.47, 1.35, 0] },
    { name: "leftUpperLeg", parent: "hips", at: [0.09, 0.87, 0] },
    { name: "leftLowerLeg", parent: "leftUpperLeg", at: [0.09, 0.49, 0] },
    { name: "leftFoot", parent: "leftLowerLeg", at: [0.09, 0.09, 0] },
    { name: "leftToes", parent: "leftFoot", at: [0.09, 0.03, 0.1] },
    { name: "rightUpperLeg", parent: "hips", at: [-0.09, 0.87, 0] },
    { name: "rightLowerLeg", parent: "rightUpperLeg", at: [-0.09, 0.49, 0] },
    { name: "rightFoot", parent: "rightLowerLeg", at: [-0.09, 0.09, 0] },
    { name: "rightToes", parent: "rightFoot", at: [-0.09, 0.03, 0.1] },
  ];
}

export function buildDesignerVrm(spec: AvatarSpec): VRM {
  const h = spec.height;
  const b = spec.build;
  const scene = new THREE.Group();
  scene.name = "SeizaDesignerAvatar";

  // ---- materials (one per color, shared across parts) --------------------
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (hex: string, roughness = 0.62) => {
    const key = `${hex}:${roughness}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness: 0 });
      materials.set(key, m);
    }
    return m;
  };
  const skin = mat(spec.skin, 0.55);
  const hair = mat(spec.hairColor, 0.7);
  const top = mat(spec.topColor);
  const bottom = mat(spec.bottomColor);
  const shoe = mat(spec.shoeColor, 0.5);
  const accessory = mat(spec.accessoryColor, 0.45);
  const white = mat("#f7f5f2", 0.4);
  const dark = mat("#1b1b1f", 0.35);

  // ---- bones --------------------------------------------------------------
  const defs = skeleton(b);
  const bones = new Map<VRMHumanBoneName, THREE.Object3D>();
  for (const def of defs) {
    const bone = new THREE.Object3D();
    bone.name = `SeizaDesigner_${def.name}`;
    const parentDef = def.parent ? defs.find((d) => d.name === def.parent)! : null;
    const origin = parentDef ? parentDef.at : ([0, 0, 0] as Vec3);
    bone.position.set((def.at[0] - origin[0]) * h, (def.at[1] - origin[1]) * h, (def.at[2] - origin[2]) * h);
    (def.parent ? bones.get(def.parent)! : scene).add(bone);
    bones.set(def.name, bone);
  }

  // ---- mesh helpers (all dimensions are pre-height; `h` applied here) ------
  const add = (
    boneName: VRMHumanBoneName,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: Vec3 = [0, 0, 0],
    rotation: Vec3 = [0, 0, 0],
    scale: Vec3 = [1, 1, 1]
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0] * h, position[1] * h, position[2] * h);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.scale.set(scale[0] * h, scale[1] * h, scale[2] * h);
    mesh.castShadow = true;
    bones.get(boneName)!.add(mesh);
    return mesh;
  };
  const sphere = (r: number, w = 20, hs = 14) => new THREE.SphereGeometry(r, w, hs);
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14);
  const cap = (r: number, thetaLength: number) => new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, thetaLength);
  const HALF_PI = Math.PI / 2;

  // ---- torso ----------------------------------------------------------------
  const dress = spec.top === "dress";
  const pelvisMat = dress ? top : bottom;
  add("hips", sphere(0.13), pelvisMat, [0, -0.01, 0], [0, 0, 0], [1.12 * b, 0.72, 0.82]);
  add("spine", capsule(0.115, 0.06), top, [0, 0.07, 0], [0, 0, 0], [1.1 * b, 1, 0.8]);
  add("chest", capsule(0.13, 0.08), top, [0, 0.07, 0], [0, 0, 0], [1.18 * b, 1, 0.8]);
  add("upperChest", sphere(0.12), top, [0, 0.055, 0], [0, 0, 0], [1.55 * b, 0.62, 0.8]);
  add("neck", new THREE.CylinderGeometry(0.042, 0.048, 0.11, 14), skin, [0, 0.03, 0]);

  if (spec.top === "blazer") {
    // Shirt placket and optional tie over the jacket front.
    add("chest", new THREE.BoxGeometry(0.07, 0.2, 0.01), white, [0, 0.1, 0.108]);
    add("upperChest", new THREE.CylinderGeometry(0.05, 0.001, 0.09, 3), white, [0, 0.07, 0.092], [0, 0, Math.PI], [1, 1, 0.25]);
  }
  if (spec.accessories.includes("tie")) {
    add("chest", new THREE.BoxGeometry(0.032, 0.17, 0.012), accessory, [0, 0.09, 0.118]);
    add("upperChest", new THREE.BoxGeometry(0.04, 0.03, 0.014), accessory, [0, 0.085, 0.1]);
  }
  if (spec.top === "hoodie") {
    add("upperChest", new THREE.TorusGeometry(0.1, 0.035, 10, 20, Math.PI), top, [0, 0.07, -0.07], [HALF_PI * 0.4, 0, 0], [1.1 * b, 1, 1]);
    add("spine", new THREE.BoxGeometry(0.16, 0.06, 0.02), top, [0, 0.03, 0.098]);
  }

  // Skirt / dress hem — rigid on the hips.
  if (spec.bottom === "skirt" || dress) {
    const length = dress ? 0.36 : 0.26;
    add("hips", new THREE.CylinderGeometry(0.14 * b, 0.23 * b, length, 24, 1, true), dress ? top : bottom, [0, -length / 2 + 0.02, 0], [0, 0, 0], [1, 1, 0.82]);
    add("hips", new THREE.CircleGeometry(0.14 * b, 20), dress ? top : bottom, [0, 0.02, 0], [-HALF_PI, 0, 0], [1, 1, 0.82]);
  }

  // ---- head and face --------------------------------------------------------
  const headY = 0.14;
  add("head", sphere(0.125, 28, 20), skin, [0, headY, 0], [0, 0, 0], [0.98, 1.07, 1]);
  for (const side of [1, -1]) {
    add("head", sphere(0.028), skin, [0.122 * side, headY - 0.005, -0.005], [0, 0, 0], [0.6, 1, 0.8]);
    // Eye white, iris, highlight.
    add("head", sphere(0.026), white, [0.045 * side, headY + 0.005, 0.1], [0, 0, 0], [1, 1.2, 0.55]);
    add("head", sphere(0.016), mat(spec.eyeColor, 0.3), [0.045 * side, headY + 0.003, 0.113], [0, 0, 0], [1, 1.15, 0.5]);
    add("head", sphere(0.0055), white, [0.05 * side, headY + 0.012, 0.121]);
    // Brow.
    add("head", capsule(0.005, 0.03), hair, [0.046 * side, headY + 0.052, 0.112], [0, 0, HALF_PI + 0.12 * side]);
  }
  add("head", sphere(0.011), mat(spec.skin, 0.7), [0, headY - 0.028, 0.124], [0, 0, 0], [1, 0.8, 0.9]);
  add("head", new THREE.TorusGeometry(0.02, 0.0045, 8, 16, Math.PI), mat("#9b4a4a", 0.5), [0, headY - 0.058, 0.116], [0, 0, Math.PI]);

  // ---- hair -----------------------------------------------------------------
  const hairTop = (radius: number, thetaLength: number) => add("head", cap(radius, thetaLength), hair, [0, headY + 0.008, -0.004], [0, 0, 0], [1, 1.07, 1.02]);
  const hairBack = (radius: number, thetaLength: number) =>
    add("head", cap(radius, thetaLength), hair, [0, headY + 0.008, -0.01], [-HALF_PI, 0, 0], [1, 1.02, 1.07]);
  const bangs = () => add("head", sphere(0.1), hair, [0, headY + 0.088, 0.07], [0.35, 0, 0], [1.08, 0.36, 0.55]);

  switch (spec.hairStyle) {
    case "buzz":
      hairTop(0.13, Math.PI * 0.42);
      hairBack(0.13, Math.PI * 0.46);
      break;
    case "short":
      hairTop(0.136, Math.PI * 0.47);
      hairBack(0.136, Math.PI * 0.5);
      bangs();
      break;
    case "bob":
      hairTop(0.14, Math.PI * 0.5);
      hairBack(0.142, Math.PI * 0.58);
      bangs();
      for (const side of [1, -1]) add("head", capsule(0.048, 0.12), hair, [0.108 * side, headY - 0.03, -0.012], [0, 0, 0], [0.8, 1, 1.15]);
      break;
    case "long":
      hairTop(0.14, Math.PI * 0.5);
      hairBack(0.142, Math.PI * 0.58);
      bangs();
      for (const side of [1, -1]) add("head", capsule(0.045, 0.2), hair, [0.105 * side, headY - 0.07, -0.02], [0, 0, 0], [0.7, 1, 1]);
      add("head", capsule(0.1, 0.24), hair, [0, headY - 0.2, -0.085], [0.12, 0, 0], [1.15, 1, 0.42]);
      break;
    case "ponytail":
      hairTop(0.137, Math.PI * 0.48);
      hairBack(0.139, Math.PI * 0.52);
      bangs();
      add("head", sphere(0.03), accessory, [0, headY + 0.04, -0.13]);
      add("head", capsule(0.042, 0.2), hair, [0, headY - 0.08, -0.155], [0.25, 0, 0], [1, 1, 0.9]);
      break;
    case "bun":
      hairTop(0.137, Math.PI * 0.48);
      hairBack(0.139, Math.PI * 0.52);
      bangs();
      add("head", sphere(0.065), hair, [0, headY + 0.13, -0.05]);
      break;
    case "none":
      break;
  }

  // ---- accessories ------------------------------------------------------------
  if (spec.accessories.includes("glasses")) {
    for (const side of [1, -1]) add("head", new THREE.TorusGeometry(0.03, 0.0045, 8, 24), dark, [0.046 * side, headY + 0.004, 0.13]);
    add("head", new THREE.BoxGeometry(0.03, 0.005, 0.005), dark, [0, headY + 0.01, 0.132]);
  }
  if (spec.accessories.includes("cap")) {
    add("head", cap(0.143, Math.PI * 0.46), accessory, [0, headY + 0.018, -0.005], [0, 0, 0], [1, 1, 1.03]);
    add("head", new THREE.CylinderGeometry(0.11, 0.11, 0.012, 24, 1, false, -HALF_PI, Math.PI), accessory, [0, headY + 0.085, 0.07], [-0.12, 0, 0], [1, 1, 1.1]);
  }
  if (spec.accessories.includes("headphones")) {
    add("head", new THREE.TorusGeometry(0.148, 0.012, 8, 28, Math.PI), accessory, [0, headY + 0.01, 0]);
    for (const side of [1, -1]) add("head", new THREE.CylinderGeometry(0.045, 0.045, 0.035, 20), accessory, [0.14 * side, headY - 0.005, 0], [0, 0, HALF_PI]);
  }

  // ---- arms -------------------------------------------------------------------
  const longSleeves = spec.top === "longsleeve" || spec.top === "hoodie" || spec.top === "blazer";
  const upperArmMat = spec.top === "dress" ? skin : top;
  const lowerArmMat = longSleeves ? top : skin;
  for (const [side, prefix] of [[1, "left"], [-1, "right"]] as const) {
    const upper = `${prefix}UpperArm` as VRMHumanBoneName;
    const lower = `${prefix}LowerArm` as VRMHumanBoneName;
    const hand = `${prefix}Hand` as VRMHumanBoneName;
    add(upper, sphere(0.052 * b), upperArmMat);
    add(upper, capsule(0.043 * b, 0.17), upperArmMat, [0.125 * side, 0, 0], [0, 0, HALF_PI]);
    add(lower, sphere(0.039 * b), lowerArmMat);
    add(lower, capsule(0.036 * b, 0.16), lowerArmMat, [0.11 * side, 0, 0], [0, 0, HALF_PI]);
    add(hand, sphere(0.043), skin, [0.045 * side, -0.004, 0.004], [0, 0, 0], [1.15, 0.62, 0.95]);
    add(hand, capsule(0.012, 0.03), skin, [0.02 * side, 0.0, 0.034], [HALF_PI, 0, 0]);
  }

  // ---- legs -------------------------------------------------------------------
  const bareLegs = spec.bottom === "skirt" || dress;
  const upperLegMat = bareLegs ? skin : bottom;
  const lowerLegMat = bareLegs || spec.bottom === "shorts" ? skin : bottom;
  for (const [side, prefix] of [[1, "left"], [-1, "right"]] as const) {
    const upper = `${prefix}UpperLeg` as VRMHumanBoneName;
    const lower = `${prefix}LowerLeg` as VRMHumanBoneName;
    const foot = `${prefix}Foot` as VRMHumanBoneName;
    add(upper, sphere(0.066 * b), upperLegMat);
    add(upper, capsule(0.061 * b, 0.26), upperLegMat, [0.002 * side, -0.19, 0]);
    add(lower, sphere(0.052 * b), lowerLegMat);
    add(lower, capsule(0.048 * b, 0.3), lowerLegMat, [0, -0.2, 0]);
    add(foot, sphere(0.05), shoe, [0, -0.045, 0.035], [0, 0, 0], [1.05, 0.75, 2]);
  }

  // ---- VRM ----------------------------------------------------------------
  scene.updateMatrixWorld(true);
  const humanBones = Object.fromEntries([...bones].map(([name, node]) => [name, { node }])) as unknown as VRMHumanBones;
  const humanoid = new VRMHumanoid(humanBones);
  scene.add(humanoid.normalizedHumanBonesRoot);

  const meta: VRM1Meta = {
    metaVersion: "1",
    name: "Seiza designer avatar",
    authors: ["Generated by Seiza's avatar designer"],
    licenseUrl: "https://vrm.dev/licenses/1.0/",
    avatarPermission: "everyone",
    allowExcessivelyViolentUsage: false,
    allowExcessivelySexualUsage: false,
    commercialUsage: "corporation",
    allowPoliticalOrReligiousUsage: false,
    allowAntisocialOrHateUsage: false,
    creditNotation: "unnecessary",
    allowRedistribution: true,
    modification: "allowModificationRedistribution",
  };

  return new VRM({ scene, meta, humanoid, materials: [...materials.values()] });
}
