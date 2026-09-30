import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { VRM, VRMHumanoid, type VRM1Meta, type VRMHumanBoneName, type VRMHumanBones } from "@pixiv/three-vrm";
import type { AvatarSpec } from "./avatarSpec";
import { buildDesignerExpressions, type DesignerFaceParts } from "./designerExpressions";

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

  /**
   * A limb segment that is thicker at one end than the other.
   *
   * This exists because uniform capsules are what made these avatars look
   * like sausages: a real upper arm is noticeably wider at the shoulder
   * than at the elbow, a thigh more so at the hip than at the knee, and
   * with a constant radius the eye reads the whole limb as one extruded
   * tube. The cylinder carries the taper and a sphere at each end caps it
   * at the matching radius, so the joint spheres this rig already relies
   * on still cover the seams.
   *
   * Built pointing down -Y (a limb hanging from its joint); callers
   * rotate it into place exactly as they did the capsules.
   */
  const taperedLimb = (rTop: number, rBottom: number, length: number): THREE.BufferGeometry => {
    const parts: THREE.BufferGeometry[] = [];
    const shaft = new THREE.CylinderGeometry(rTop, rBottom, length, 14, 1, true);
    parts.push(shaft);
    const topCap = new THREE.SphereGeometry(rTop, 14, 8, 0, Math.PI * 2, 0, HALF_PI);
    topCap.translate(0, length / 2, 0);
    parts.push(topCap);
    const bottomCap = new THREE.SphereGeometry(rBottom, 14, 8, 0, Math.PI * 2, HALF_PI, HALF_PI);
    bottomCap.translate(0, -length / 2, 0);
    parts.push(bottomCap);
    return mergeGeometries(parts);
  };

  // ---- torso ----------------------------------------------------------------
  // The torso is where "chorizo" was decided. Previously hips, spine and
  // chest were all within a few percent of the same width, which is the
  // definition of a tube. Now the spine is explicitly the narrow point
  // (spec.waist) and the shoulders explicitly the wide one
  // (spec.shoulders), so the silhouette has a middle.
  const waist = spec.waist;
  const shoulderSpread = spec.shoulders;
  const dress = spec.top === "dress";
  const pelvisMat = dress ? top : bottom;
  //
  // The three segments are sized and placed to actually meet: the spine
  // ends at exactly the radius the chest begins at, and their spans
  // overlap by a centimetre. They also share one horizontal scale, so a
  // radius written here means the same width in both. Getting any of
  // that wrong leaves a visible ridge around the middle of every avatar,
  // which is what a first pass at this produced.
  const WAIST_RADIUS = 0.105 * waist;
  const TORSO_SCALE: Vec3 = [1.1 * b, 1, 0.8];
  add("hips", sphere(0.13), pelvisMat, [0, -0.01, 0], [0, 0, 0], [1.16 * b, 0.74, 0.84]);
  // spine bone sits at y=1.02: this spans roughly 0.99 → 1.13.
  add("spine", taperedLimb(WAIST_RADIUS, 0.125, 0.14), top, [0, 0.04, 0], [0, 0, 0], TORSO_SCALE);
  // chest bone sits at y=1.15: this spans roughly 1.12 → 1.27.
  add("chest", taperedLimb(0.142, WAIST_RADIUS, 0.15), top, [0, 0.045, 0], [0, 0, 0], TORSO_SCALE);
  add("upperChest", sphere(0.12), top, [0, 0.055, 0], [0, 0, 0], [1.52 * b * shoulderSpread, 0.64, 0.82]);
  // Deltoid caps, so the arms grow out of the shoulders instead of being
  // stuck onto the side of a box.
  for (const side of [1, -1]) {
    add("upperChest", sphere(0.056 * b), dress ? skin : top, [0.15 * side * b * shoulderSpread, 0.03, 0], [0, 0, 0], [1, 0.95, 1]);
  }
  add("neck", new THREE.CylinderGeometry(0.04, 0.05, 0.11, 14), skin, [0, 0.03, 0]);

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
  //
  // The complaint about the old face was that it looked like a child's
  // drawing, and the reason is that it *was* one: flat features pasted
  // onto the front of a ball, with no structure behind them. What reads
  // as a face is the structure — a jaw narrower than the cranium, a brow
  // that overhangs, a nose with a bridge, eyes set into sockets rather
  // than stuck on the surface.
  //
  // The eyes, brows and mouth are each wrapped in their own Group, not
  // added straight to the head bone, because the expression system moves
  // those groups (see designerExpressions.ts). A part added directly to
  // the bone could not be animated without disturbing its siblings.
  const headY = 0.14;
  const headGroup = new THREE.Group();
  headGroup.position.set(0, headY * h, 0);
  bones.get("head")!.add(headGroup);

  /** Adds a mesh to the head group, in pre-height units, like `add`. */
  const face = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: Vec3 = [0, 0, 0],
    rotation: Vec3 = [0, 0, 0],
    scale: Vec3 = [1, 1, 1],
    parent: THREE.Object3D = headGroup
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0] * h, position[1] * h, position[2] * h);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.scale.set(scale[0] * h, scale[1] * h, scale[2] * h);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  /** A face sub-group positioned in pre-height units. */
  const facePart = (position: Vec3) => {
    const group = new THREE.Group();
    group.position.set(position[0] * h, position[1] * h, position[2] * h);
    headGroup.add(group);
    return group;
  };

  // Cranium, then a jaw that is narrower and set slightly forward. Two
  // overlapping masses instead of one sphere is what gives the profile a
  // chin and the front view a taper.
  face(sphere(0.125, 28, 20), skin, [0, 0, 0], [0, 0, 0], [0.98, 1.06, 1]);
  face(sphere(0.098, 22, 16), skin, [0, -0.05, 0.012], [0, 0, 0], [0.92, 0.95, 1.0]);
  face(sphere(0.07, 18, 14), skin, [0, -0.086, 0.028], [0, 0, 0], [0.8, 0.72, 0.95]);

  // Brow ridge: a shallow swell across the top of the eye sockets, there
  // to catch a shadow rather than to be seen. Kept just inside the skull
  // surface at the brows' own X offset — pushed any further forward it
  // becomes a shelf that visibly protrudes AND occludes the brows drawn
  // on top of it, which is what a first pass did.
  face(sphere(0.088), skin, [0, 0.043, 0.066], [0, 0, 0], [1.06, 0.3, 0.52]);

  // Nose — a bridge running down from between the brows, then a small
  // tip. Kept deliberately understated: at this level of stylisation a
  // nose only has to catch a highlight and cast a short shadow, and
  // anything larger immediately reads as a caricature.
  face(taperedLimb(0.006, 0.0105, 0.046), skin, [0, 0.004, 0.111], [0.2, 0, 0], [1, 1, 0.7]);
  face(sphere(0.0108), skin, [0, -0.026, 0.12], [0, 0, 0], [1, 0.82, 0.95]);
  for (const side of [1, -1]) {
    face(sphere(0.0052), skin, [0.0108 * side, -0.028, 0.1155], [0, 0, 0], [1, 0.82, 0.9]);
  }

  const eyeWhite = mat("#f7f5f2", 0.25);
  const iris = mat(spec.eyeColor, 0.28);
  const eyeGroups: Record<string, THREE.Group> = {};
  const browGroups: Record<string, THREE.Group> = {};
  for (const [side, key] of [
    [1, "leftEye"],
    [-1, "rightEye"],
  ] as const) {
    // Ear.
    face(sphere(0.028), skin, [0.122 * side, -0.005, -0.005], [0, 0, 0], [0.6, 1, 0.8]);

    // Socket: a slightly darker recess the eyeball sits inside, so the
    // eye has a rim around it instead of floating on the cheek.
    face(sphere(0.032), mat(spec.skin, 0.8), [0.045 * side, 0.004, 0.096], [0, 0, 0], [1.05, 0.9, 0.35]);

    const eye = facePart([0.045 * side, 0.004, 0.1]);
    eye.name = key;
    eyeGroups[key] = eye;
    face(sphere(0.025), eyeWhite, [0, 0, 0], [0, 0, 0], [1, 1.18, 0.5], eye);
    face(sphere(0.0122), iris, [0, -0.001, 0.0125], [0, 0, 0], [1, 1.1, 0.5], eye);
    face(sphere(0.0056), mat("#17151a", 0.2), [0, -0.001, 0.0175], [0, 0, 0], [1, 1.05, 0.4], eye);
    face(sphere(0.0042), white, [0.005, 0.0075, 0.0205], [0, 0, 0], [1, 1, 0.5], eye);
    // Upper lid, in skin tone: scaling the eye group down for a blink
    // tucks the eyeball behind this rather than just shrinking it. It
    // sits high and shallow — far enough down to define the top of the
    // eye, not so far that the avatar looks half asleep.
    face(sphere(0.0245), skin, [0, 0.0265, 0.002], [0, 0, 0], [1.04, 0.42, 0.5], eye);

    const browKey = side > 0 ? "leftBrow" : "rightBrow";
    // Low enough to clear the bangs on every hair style, which is where
    // the first pass put them — invisible, on the avatars that had hair.
    // z sits a hair proud of the skull surface at this x/y (~0.109), so
    // the brow reads as drawn on the face instead of embedded in it.
    const brow = facePart([0.046 * side, 0.0425, 0.1125]);
    brow.name = browKey;
    browGroups[browKey] = brow;
    face(capsule(0.0055, 0.034), hair, [0, 0, 0], [0, 0, HALF_PI], [1, 1, 0.65], brow);
  }

  // Mouth: a shallow curve, grouped so expressions and visemes can
  // stretch it. The rest pose is a near-neutral line.
  const mouth = facePart([0, -0.054, 0.1105]);
  mouth.name = "mouth";
  face(new THREE.TorusGeometry(0.0142, 0.0034, 8, 16, Math.PI), mat("#9b4a4a", 0.5), [0, 0, 0], [0, 0, Math.PI], [1, 1, 1], mouth);

  // ---- hair -----------------------------------------------------------------
  // thetaLength is how far down the skull the cap reaches, measured from
  // the crown. It has to stop ABOVE the brow line (y +0.0425): the
  // original values ran down past y +0.013, which is below the brows, so
  // every hair style except "buzz" and "none" quietly buried them — and
  // with them most of the face's expression range, since the brows do
  // more expressive work than anything else here. The front is covered
  // by bangs() instead, and the back and sides by hairBack().
  const hairTop = (radius: number, thetaLength: number) => add("head", cap(radius, thetaLength), hair, [0, headY + 0.008, -0.004], [0, 0, 0], [1, 1.07, 1.02]);
  const hairBack = (radius: number, thetaLength: number) =>
    add("head", cap(radius, thetaLength), hair, [0, headY + 0.008, -0.01], [-HALF_PI, 0, 0], [1, 1.02, 1.07]);
  // Raised and shortened from the original: the old bangs reached down
  // to exactly the brow line and hid the brows on every hair style that
  // used them, which cost those avatars most of their expression range.
  const bangs = () => add("head", sphere(0.1), hair, [0, headY + 0.097, 0.068], [0.35, 0, 0], [1.08, 0.3, 0.55]);

  switch (spec.hairStyle) {
    case "buzz":
      hairTop(0.13, Math.PI * 0.37);
      hairBack(0.13, Math.PI * 0.46);
      break;
    case "short":
      hairTop(0.136, Math.PI * 0.38);
      hairBack(0.136, Math.PI * 0.5);
      bangs();
      break;
    case "bob":
      hairTop(0.14, Math.PI * 0.38);
      hairBack(0.142, Math.PI * 0.58);
      bangs();
      for (const side of [1, -1]) add("head", capsule(0.048, 0.12), hair, [0.108 * side, headY - 0.03, -0.012], [0, 0, 0], [0.8, 1, 1.15]);
      break;
    case "long":
      hairTop(0.14, Math.PI * 0.38);
      hairBack(0.142, Math.PI * 0.58);
      bangs();
      for (const side of [1, -1]) add("head", capsule(0.045, 0.2), hair, [0.105 * side, headY - 0.07, -0.02], [0, 0, 0], [0.7, 1, 1]);
      add("head", capsule(0.1, 0.24), hair, [0, headY - 0.2, -0.085], [0.12, 0, 0], [1.15, 1, 0.42]);
      break;
    case "ponytail":
      hairTop(0.137, Math.PI * 0.38);
      hairBack(0.139, Math.PI * 0.52);
      bangs();
      add("head", sphere(0.03), accessory, [0, headY + 0.04, -0.13]);
      add("head", capsule(0.042, 0.2), hair, [0, headY - 0.08, -0.155], [0.25, 0, 0], [1, 1, 0.9]);
      break;
    case "bun":
      hairTop(0.137, Math.PI * 0.38);
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
    // Shoulder → elbow → wrist, each segment narrowing. Rotated so the
    // limb's -Y axis points down the arm, away from the body.
    add(upper, sphere(0.05 * b), upperArmMat);
    add(upper, taperedLimb(0.048 * b, 0.037 * b, 0.2), upperArmMat, [0.125 * side, 0, 0], [0, 0, HALF_PI * side]);
    add(lower, sphere(0.037 * b), lowerArmMat);
    add(lower, taperedLimb(0.037 * b, 0.028 * b, 0.19), lowerArmMat, [0.11 * side, 0, 0], [0, 0, HALF_PI * side]);
    add(hand, sphere(0.042), skin, [0.045 * side, -0.004, 0.004], [0, 0, 0], [1.15, 0.6, 0.92]);
    add(hand, capsule(0.011, 0.03), skin, [0.02 * side, 0.0, 0.034], [HALF_PI, 0, 0]);
  }

  // ---- legs -------------------------------------------------------------------
  const bareLegs = spec.bottom === "skirt" || dress;
  const upperLegMat = bareLegs ? skin : bottom;
  const lowerLegMat = bareLegs || spec.bottom === "shorts" ? skin : bottom;
  for (const [side, prefix] of [[1, "left"], [-1, "right"]] as const) {
    const upper = `${prefix}UpperLeg` as VRMHumanBoneName;
    const lower = `${prefix}LowerLeg` as VRMHumanBoneName;
    const foot = `${prefix}Foot` as VRMHumanBoneName;
    // Thigh and calf both taper toward the knee and ankle — the single
    // biggest contributor to the legs reading as legs.
    add(upper, sphere(0.068 * b), upperLegMat);
    add(upper, taperedLimb(0.066 * b, 0.05 * b, 0.3), upperLegMat, [0.002 * side, -0.19, 0]);
    add(lower, sphere(0.05 * b), lowerLegMat);
    // Calf bulge: widest just below the knee, narrowest at the ankle.
    add(lower, taperedLimb(0.054 * b, 0.031 * b, 0.34), lowerLegMat, [0, -0.2, 0]);
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

  // Expressions, built from the face groups captured above. A designed
  // avatar gets the same preset names an uploaded VRM exposes, so nothing
  // downstream has to know which kind it is dealing with.
  const faceParts: DesignerFaceParts = {
    leftEye: eyeGroups.leftEye,
    rightEye: eyeGroups.rightEye,
    leftBrow: browGroups.leftBrow,
    rightBrow: browGroups.rightBrow,
    mouth,
  };
  const expressionManager = buildDesignerExpressions(faceParts);

  return new VRM({ scene, meta, humanoid, expressionManager, materials: [...materials.values()] });
}
