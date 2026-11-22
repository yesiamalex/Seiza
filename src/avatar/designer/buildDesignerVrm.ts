import * as THREE from "three";
import { VRM, VRMHumanoid, type VRM1Meta, type VRMHumanBoneName, type VRMHumanBones } from "@pixiv/three-vrm";
import type { AvatarSpec } from "./avatarSpec";
import { buildDesignerExpressions, type DesignerFaceParts } from "./designerExpressions";
import { chainWeights, sampleProfile, sweepGeometry, type ProfileKey } from "./designerBody";
import { decalMaterial, faceDecalGeometry, paintBlush, paintBrow, paintClosedEye, paintEye, paintMouth, raycastFaceSurface, sculptedHeadGeometry } from "./designerFace";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HEAD_OFFSET, hairLock, SCALP, scalpLock } from "./designerHair";
import { mergeParts, OUTLINE_WIDTH, outlineMaterial, rigidPart, torsoPanel } from "./designerMesh";

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
 * - The torso, arms and legs are smoothly skinned surfaces swept along the
 *   bones (designerBody.ts), so knees, elbows, hips and shoulders bend as
 *   one surface instead of as separate parts meeting at a bead. Head, hands,
 *   feet, hair and accessories are rigid on their bone, which is what those
 *   parts are on a real skinned avatar too.
 * - The face is painted (designerFace.ts), not assembled from beads.
 * - Hair is tapered locks swept over the scalp (designerHair.ts).
 * - Everything but the painted face is merged into one skinned mesh per
 *   colour, each with an outline (designerMesh.ts): about twenty draw
 *   calls an avatar, outlines included, where the separate parts were fifty.
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

/**
 * Three-tone light ramps for the cel shading (shadow, mid, lit), shared by
 * every designer avatar. The face has its own, much flatter one.
 */
const toonRamps = new Map<string, THREE.DataTexture>();
function toonRamp(kind: "body" | "face" = "body"): THREE.DataTexture {
  let ramp = toonRamps.get(kind);
  if (!ramp) {
    const tones = kind === "face" ? [212, 236, 255] : [128, 200, 255];
    ramp = new THREE.DataTexture(new Uint8Array(tones), 3, 1, THREE.RedFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
    toonRamps.set(kind, ramp);
  }
  return ramp;
}

export function buildDesignerVrm(spec: AvatarSpec): VRM {
  const h = spec.height;
  const b = spec.build;
  const scene = new THREE.Group();
  scene.name = "SeizaDesignerAvatar";

  // ---- materials (one per color, shared across parts) --------------------
  //
  // Cel-shaded rather than physically shaded. Smooth glossy shading on
  // simple rounded forms is exactly what made these read as inflatable
  // toys: every surface got the same soft highlight and gradient as a
  // balloon. A few flat tones, like the MToon shading VRoid avatars use,
  // reads as drawn instead, and matches the uploaded avatars in the room.
  // `roughness` is kept in the signature only so call sites stay the same.
  const materials = new Map<string, THREE.MeshToonMaterial>();
  const mat = (hex: string, _roughness = 0.62) => {
    let m = materials.get(hex);
    if (!m) {
      m = new THREE.MeshToonMaterial({ color: hex, gradientMap: toonRamp() });
      materials.set(hex, m);
    }
    return m;
  };
  const skin = mat(spec.skin, 0.55);
  // The face gets an almost flat ramp: a hard shadow band across a face
  // is the one place cel shading looks wrong, and anime faces are lit
  // nearly evenly for exactly that reason.
  const faceSkin = new THREE.MeshToonMaterial({ color: spec.skin, gradientMap: toonRamp("face") });
  materials.set(`${spec.skin}:face`, faceSkin);
  const hair = mat(spec.hairColor, 0.7);
  // Hair is built from open shells (caps cut off above the face), whose
  // inside faces would otherwise vanish and leave hairline slivers.
  hair.side = THREE.DoubleSide;
  const top = mat(spec.topColor);
  const bottom = mat(spec.bottomColor);
  const shoe = mat(spec.shoeColor, 0.5);
  const accessory = mat(spec.accessoryColor, 0.45);
  const white = mat("#f7f5f2", 0.4);
  const dark = mat("#1b1b1f", 0.35);
  /** A darker (k < 1) or lighter (k > 1) shade of a colour: for cuffs,
   *  collars, and trims, so a garment has edges without a new colour. */
  const shade = (hex: string, k: number) => mat("#" + new THREE.Color(hex).multiplyScalar(k).getHexString());
  // A sole that stands out from the shoe: light under dark shoes, dark under light ones.
  const soleMat = new THREE.Color(spec.shoeColor).getHSL({ h: 0, s: 0, l: 0 }).l < 0.35 ? mat("#e6e1d8") : mat("#3a332e");

  // ---- bones --------------------------------------------------------------
  const defs = skeleton(b);
  const bones = new Map<VRMHumanBoneName, THREE.Bone>();
  const boneList: THREE.Bone[] = [];
  const boneIndex = {} as Record<VRMHumanBoneName, number>;
  for (const def of defs) {
    const bone = new THREE.Bone();
    boneIndex[def.name] = boneList.length;
    boneList.push(bone);
    bone.name = `SeizaDesigner_${def.name}`;
    const parentDef = def.parent ? defs.find((d) => d.name === def.parent)! : null;
    const origin = parentDef ? parentDef.at : ([0, 0, 0] as Vec3);
    bone.position.set((def.at[0] - origin[0]) * h, (def.at[1] - origin[1]) * h, (def.at[2] - origin[2]) * h);
    (def.parent ? bones.get(def.parent)! : scene).add(bone);
    bones.set(def.name, bone);
  }

  // ---- parts, gathered by material (see designerMesh.ts) -------------------
  scene.updateMatrixWorld(true);
  const buckets = new Map<string, { material: THREE.Material; outline: boolean; parts: THREE.BufferGeometry[] }>();
  const collect = (geometry: THREE.BufferGeometry, material: THREE.Material, outline = true) => {
    const key = `${material.uuid}:${outline}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = { material, outline, parts: [] }));
    bucket.parts.push(geometry);
  };
  const local = new THREE.Matrix4();
  const placed = (position: Vec3, rotation: Vec3, scale: Vec3) =>
    local.compose(
      new THREE.Vector3(position[0] * h, position[1] * h, position[2] * h),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])),
      new THREE.Vector3(scale[0] * h, scale[1] * h, scale[2] * h)
    );

  // ---- mesh helpers (all dimensions are pre-height; `h` applied here) ------
  /** A rigid part on a bone, placed relative to it in its rest pose. */
  const add = (
    boneName: VRMHumanBoneName,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: Vec3 = [0, 0, 0],
    rotation: Vec3 = [0, 0, 0],
    scale: Vec3 = [1, 1, 1],
    outline = true
  ) => {
    const matrix = bones.get(boneName)!.matrixWorld.clone().multiply(placed(position, rotation, scale));
    collect(rigidPart(geometry, matrix, boneIndex[boneName]), material, outline);
  };
  const sphere = (r: number, w = 20, hs = 14) => new THREE.SphereGeometry(r, w, hs);
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14);
  const cap = (r: number, thetaLength: number) => new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, thetaLength);
  const HALF_PI = Math.PI / 2;

  // ---- skinned body helpers ------------------------------------------------
  const body = (geometry: THREE.BufferGeometry, material: THREE.Material) => collect(geometry, material);

  // ---- torso ----------------------------------------------------------------
  // One surface from the crotch to the top of the neck, weighted up the
  // spine. Its cross-section is wide and shallow, slightly squared off
  // (see `exponent`), and changes along its length: hips, a waist, the
  // ribcage, sloping shoulders, then the neck. That silhouette is the
  // difference between a figure and a stack of tubes.
  const waist = spec.waist;
  const shoulderSpread = spec.shoulders;
  const dress = spec.top === "dress";
  const W = (x: number) => x * b; // widths follow build
  const torsoKeys: ProfileKey[] = [
    // The pelvis closes just below the hip joints, narrow enough that the
    // thighs (which start inside it) form the crotch. A wide, low pelvis
    // bulged down between the legs as a separate seat shape.
    { s: 0.82, a: W(0.02), b: 0.02, c: -0.01 },
    { s: 0.845, a: W(0.075), b: 0.07, c: -0.012 },
    { s: 0.875, a: W(0.152), b: 0.098, c: -0.014 },
    { s: 0.93, a: W(0.152), b: 0.098, c: -0.01 },
    { s: 1.0, a: W(0.134 * (0.55 + 0.5 * waist)), b: 0.084, c: -0.004 },
    { s: 1.06, a: W(0.128 * (0.5 + 0.55 * waist)), b: 0.082, c: 0.0 },
    { s: 1.13, a: W(0.14), b: 0.096, c: 0.006 },
    { s: 1.21, a: W(0.152 * (0.6 + 0.4 * shoulderSpread)), b: 0.104, c: 0.008 },
    { s: 1.29, a: W(0.164 * shoulderSpread), b: 0.096, c: 0.002 },
    { s: 1.345, a: W(0.166 * shoulderSpread), b: 0.08, c: -0.006 },
    { s: 1.378, a: W(0.126 * shoulderSpread), b: 0.064, c: -0.01 },
    { s: 1.405, a: 0.046, b: 0.046, c: -0.006 },
    { s: 1.49, a: 0.037, b: 0.04, c: -0.002 },
    { s: 1.57, a: 0.034, b: 0.037, c: 0.002 },
  ];
  const torsoWeights = chainWeights(
    [boneIndex.hips, boneIndex.spine, boneIndex.chest, boneIndex.upperChest, boneIndex.neck, boneIndex.head],
    [
      [0.975, 0.045],
      [1.09, 0.045],
      [1.215, 0.045],
      [1.405, 0.025],
      [1.51, 0.02],
    ]
  );
  const torso = (from: number, to: number, material: THREE.Material, inflate = 1, pad = 0, capFrom = true, capTo = true) =>
    body(
      sweepGeometry({
        keys: torsoKeys,
        from,
        to,
        step: 0.012,
        segments: 22,
        exponent: 2.7,
        inflate,
        pad,
        place: (y, u, v) => [u * h, y * h, v * h],
        weights: torsoWeights,
        capFrom,
        capTo,
      }),
      material
    );
  /** Front surface of the torso at height y (pre-height), for things worn on it. */
  const torsoFront = (y: number) => {
    const { b: depth, c } = sampleProfile(torsoKeys, y);
    return c + depth;
  };

  const pelvisMat = dress ? top : bottom;
  const necklineY = spec.top === "tshirt" || dress ? 1.375 : 1.4;
  // Skin for the neck and collar. Clothing is the same sweep inflated a
  // few millimetres, with the same weights, so it follows every bend
  // exactly instead of being a separate shell that drifts.
  torso(necklineY - 0.03, 1.57, skin, 1, 0, true, true);
  torso(0.82, necklineY, top, 1.0, 0.004, true, false);
  // Waistband and seat, slightly outside the top's hem so the hem tucks
  // under it instead of flickering against it.
  if (!dress) torso(0.82, 0.985, pelvisMat, 1.0, 0.007, true, false);
  // What's worn on the torso front: lapels, a shirt front, a pocket. Each
  // follows the chest as it curves back toward the neck (torsoPanel).
  const panel = (outline: Array<[number, number]>, material: THREE.Material, lift: number, thickness = 0.004) =>
    body(torsoPanel(outline, torsoFront, lift, thickness, torsoWeights, h), material);
  // Trousers and shorts get a belt with a buckle; a skirt a waistband of
  // its own colour, which also closes the gap where the top's hem showed
  // through as specks above it.
  if (spec.bottom === "skirt" && !dress) torso(0.935, 0.99, shade(spec.bottomColor, 0.85), 1.0, 0.0095, false, false);
  else if (!dress) {
    torso(0.95, 0.988, mat("#2b2420"), 1.0, 0.0098, false, false);
    panel([[-0.018, 0.955], [0.018, 0.955], [0.018, 0.983], [-0.018, 0.983]], mat("#c8b27a"), 0.011, 0.004);
  } else torso(0.935, 0.99, shade(spec.topColor, 0.8), 1.0, 0.0095, false, false);
  // A collar at the neckline: a ribbed band on a T-shirt or dress, the
  // turned hem of a long-sleeved top.
  if (spec.top !== "blazer" && spec.top !== "hoodie") torso(necklineY - 0.014, necklineY + 0.002, shade(spec.topColor, 0.82), 1.0, 0.0072, false, false);

  if (spec.top === "blazer") {
    // The shirt in the V of the jacket, then the lapels either side of it,
    // and two buttons below.
    panel([[-0.05, 1.385], [0.05, 1.385], [0, 1.2]], white, 0.0045);
    const lapel = shade(spec.topColor, 0.82);
    for (const side of [1, -1]) {
      panel([[0.028 * side, 1.392], [0.098 * side, 1.345], [0.004 * side, 1.195], [0.012 * side, 1.255]], lapel, 0.006, 0.005);
    }
    for (const y of [1.15, 1.07]) panel([[-0.009, y - 0.009], [0.009, y - 0.009], [0.009, y + 0.009], [-0.009, y + 0.009]], dark, 0.006, 0.004);
  }
  if (spec.accessories.includes("tie")) {
    // The knot at the collar, then the blade, widening as it falls.
    panel([[-0.02, 1.378], [0.02, 1.378], [0.014, 1.352], [-0.014, 1.352]], accessory, 0.011, 0.01);
    panel([[-0.014, 1.352], [0.014, 1.352], [0.028, 1.17], [0, 1.15], [-0.028, 1.17]], accessory, 0.011, 0.005);
  }
  if (spec.top === "hoodie") {
    add("upperChest", new THREE.TorusGeometry(0.1, 0.035, 10, 20, Math.PI), top, [0, 0.085, -0.075], [HALF_PI * 0.4, 0, 0], [1.1 * b, 1, 1]);
    // The pouch pocket, and the hood's drawstrings with their tips.
    panel([[-0.09, 0.995], [0.09, 0.995], [0.068, 1.09], [-0.068, 1.09]], shade(spec.topColor, 0.88), 0.006, 0.005);
    for (const x of [-0.032, 0.032]) {
      panel([[x - 0.004, 1.37], [x + 0.004, 1.37], [x + 0.004, 1.27], [x - 0.004, 1.27]], white, 0.006, 0.004);
      panel([[x - 0.006, 1.27], [x + 0.006, 1.27], [x + 0.006, 1.25], [x - 0.006, 1.25]], shade(spec.topColor, 0.6), 0.006, 0.006);
    }
  }

  // Skirt / dress hem — rigid on the hips, in knife pleats: the radius
  // steps in and out round the hem, more toward the bottom, so the outline
  // draws them.
  if (spec.bottom === "skirt" || dress) {
    const length = dress ? 0.36 : 0.26;
    // Starts just above the hip line at the hips' own width, so it hangs
    // from the waist instead of looking like a cone pushed onto it.
    const skirt = new THREE.CylinderGeometry(0.152 * b, 0.25 * b, length, 48, 4, true);
    const position = skirt.getAttribute("position") as THREE.BufferAttribute;
    const PLEATS = 16;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const down = (length / 2 - y) / length;
      const phase = ((Math.atan2(z, x) / (Math.PI * 2)) * PLEATS + 10) % 1;
      const k = 1 + 0.045 * down * (phase - 0.5);
      position.setXYZ(i, x * k, y, z * k);
    }
    skirt.computeVertexNormals();
    // And an inside, a hair smaller and facing in: without it, looking
    // past the top edge or up under the hem showed straight through to
    // the shirt, as white specks round the waistband.
    const inside = skirt.clone();
    inside.scale(0.985, 1, 0.985);
    const index = inside.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const t = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, t);
    }
    const normal = inside.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
    const twoSided = mergeGeometries([skirt, inside])!;
    skirt.dispose();
    inside.dispose();
    // Its top edge sits inside the waistband, front to back as well.
    add("hips", twoSided, dress ? top : bottom, [0, -length / 2 + 0.035, -0.01], [0, 0, 0], [1, 1, 0.68]);
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
  // A little lower than the head bone's own height, so the chin overlaps
  // the top of the neck (see sculptedHeadGeometry) and the neck is short.
  const headY = HEAD_OFFSET;
  const headGroup = new THREE.Group();
  headGroup.position.set(0, headY * h, 0);
  bones.get("head")!.add(headGroup);

  /** Adds a part to the head, in pre-height units, like `add`. The painted
   *  features stay meshes of their own, in the groups the expressions move;
   *  the rest (the head, ears, nose) is merged like any rigid part. */
  const face = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: Vec3 = [0, 0, 0],
    rotation: Vec3 = [0, 0, 0],
    scale: Vec3 = [1, 1, 1],
    parent: THREE.Object3D = headGroup,
    outline = true
  ) => {
    const painted = "map" in material && (material as THREE.MeshStandardMaterial).map !== null;
    if (painted || parent !== headGroup) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0] * h, position[1] * h, position[2] * h);
      mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      mesh.scale.set(scale[0] * h, scale[1] * h, scale[2] * h);
      parent.add(mesh);
      return;
    }
    headGroup.updateMatrix();
    const matrix = bones.get("head")!.matrixWorld.clone().multiply(headGroup.matrix).multiply(placed(position, rotation, scale));
    collect(rigidPart(geometry, matrix, boneIndex.head), material, outline);
  };

  /** A face sub-group positioned in pre-height units. */
  const facePart = (position: Vec3) => {
    const group = new THREE.Group();
    group.position.set(position[0] * h, position[1] * h, position[2] * h);
    headGroup.add(group);
    return group;
  };

  // One sculpted head mesh (see sculptedHeadGeometry). Its surface, in
  // the same pre-height units as everything placed with `face()`, is
  // what the painted features are wrapped onto.
  const headGeometry = sculptedHeadGeometry();
  // A copy is merged (which moves it into place); the original stays as
  // it is, for the features to be wrapped onto.
  face(headGeometry.clone(), faceSkin);
  const headSurface = raycastFaceSurface(headGeometry);
  // Nose: just a tip that catches a highlight and a short shadow. At this
  // level of stylisation anything more reads as a caricature.
  face(sphere(0.005), faceSkin, [0, -0.052, headSurface(0, -0.052) - 0.0015], [0, 0, 0], [1, 0.75, 1], headGroup, false);

  // Painted features (designerFace.ts), each in the group the expression
  // system animates. The brow is painted once and mirrored; each eye has
  // its own painting, so its catch-lights fall on the same side as the
  // other's (see paintEye).
  const eyeMats = { left: decalMaterial(paintEye(spec.eyeColor), 0.18), right: decalMaterial(paintEye(spec.eyeColor, true), 0.18) };
  // The closed eye, faded in by the blink, and the laughing one, by a big
  // smile (see designerExpressions.ts).
  const lidMat = decalMaterial(paintClosedEye(spec.eyeColor));
  const smileMat = decalMaterial(paintClosedEye(spec.eyeColor, true));
  lidMat.opacity = smileMat.opacity = 0;
  const browMat = decalMaterial(paintBrow(spec.hairColor));
  const blushMat = decalMaterial(paintBlush());
  const eyeGroups: Record<string, THREE.Group> = {};
  const browGroups: Record<string, THREE.Group> = {};
  for (const [side, key] of [
    [1, "leftEye"],
    [-1, "rightEye"],
  ] as const) {
    // Ear.
    face(sphere(0.022), faceSkin, [0.106 * side, -0.012, -0.006], [0, 0, 0], [0.5, 1, 0.75]);

    // Large, set low (the middle of the eye just under the head's
    // equator), and close together, as on a VRoid face. The patch is a
    // little bigger than the eye painted in it (see paintEye).
    const eyeDecal = faceDecalGeometry(headSurface, 0.04 * side, -0.024, 0.078, 0.084, 0.0015, side < 0);
    const eye = facePart(eyeDecal.origin);
    eye.name = key;
    eyeGroups[key] = eye;
    face(eyeDecal.geometry, side > 0 ? eyeMats.left : eyeMats.right, [0, 0, 0], [0, 0, 0], [1, 1, 1], eye);
    // Beside the eye, not in its group, so the blink's squash leaves it whole.
    const lidDecal = faceDecalGeometry(headSurface, 0.04 * side, -0.024, 0.078, 0.084, 0.0018, side < 0);
    const lids = facePart(lidDecal.origin);
    face(lidDecal.geometry, lidMat, [0, 0, 0], [0, 0, 0], [1, 1, 1], lids);
    face(lidDecal.geometry.clone(), smileMat, [0, 0, 0], [0, 0, 0], [1, 1, 1], lids);

    // Kept below the bangs on every hair style, so the brows (which carry
    // most of an expression) are never buried.
    const browKey = side > 0 ? "leftBrow" : "rightBrow";
    const browDecal = faceDecalGeometry(headSurface, 0.043 * side, 0.032, 0.05, 0.012, 0.002, side < 0);
    const brow = facePart(browDecal.origin);
    brow.name = browKey;
    browGroups[browKey] = brow;
    face(browDecal.geometry, browMat, [0, 0, 0], [0, 0, 0], [1, 1, 1], brow);

    const blush = faceDecalGeometry(headSurface, 0.052 * side, -0.06, 0.046, 0.022, 0.001);
    face(blush.geometry, blushMat, blush.origin);
  }

  // Mouth: painted open, then squashed to a soft closed line at rest.
  // Visemes and expressions scale this group, which parts the lips.
  const mouthDecal = faceDecalGeometry(headSurface, 0, -0.082, 0.03, 0.018, 0.0015);
  const mouth = facePart(mouthDecal.origin);
  mouth.name = "mouth";
  mouth.scale.y = 0.42;
  face(mouthDecal.geometry, decalMaterial(paintMouth()), [0, 0, 0], [0, 0, 0], [1, 1, 1], mouth);

  // ---- hair -----------------------------------------------------------------
  // A cap over the crown and one over the back give the hair its volume;
  // the locks laid over them (designerHair.ts) give it its shape: a fringe
  // across the forehead, locks framing the face, and the back, each style
  // its own lengths. thetaLength is how far down the skull a cap reaches
  // from the crown, and stops above the brow line (y +0.0425) so the
  // brows, which carry most of an expression, are never buried.
  const hairTop = (radius: number, thetaLength: number) => add("head", cap(radius, thetaLength), hair, [0, headY + 0.008, -0.004], [0, 0, 0], [1, 1.07, 1.02]);
  const hairBack = (radius: number, thetaLength: number) =>
    add("head", cap(radius, thetaLength), hair, [0, headY + 0.008, -0.01], [-HALF_PI, 0, 0], [1, 1.02, 1.07]);
  const lock = (points: THREE.Vector3[], width: number, thickness: number, widest?: number, blunt?: number) =>
    body(hairLock({ points, width, thickness, widest, blunt, bone: boneIndex.head, h }), hair);
  // Under a cap the fringe would poke out below its brim.
  const capped = spec.accessories.includes("cap");
  const PI = Math.PI;
  /** Across the forehead, overlapping, with softly rounded tips at
   *  slightly uneven lengths, shorter toward the temples, every tip above
   *  the brows. */
  const fringe = (count = 11, spread = 0.98) => {
    if (capped) return;
    for (let i = 0; i < count; i++) {
      const t = (i - (count - 1) / 2) / ((count - 1) / 2);
      const uneven = [0, 0.01, 0.004, 0.012, 0.002][i % 5];
      lock(scalpLock(t * spread, 0.12 * PI, (0.4 + uneven - Math.abs(t) * 0.03) * PI), 0.03, 0.007, 0.45, 0.55);
    }
  };
  /** One lock in front of each ear, hanging `drop` below ear level. */
  const frame = (drop: number) => {
    // Two each side, broad, swept forward over the cheeks: VRoid hair
    // frames the face, which is much of why its faces read as narrow.
    for (const side of [1, -1]) {
      lock(scalpLock(1.12 * side, 0.24 * PI, 0.5 * PI, drop, 0.002, 0.016), 0.038, 0.009);
      lock(scalpLock(1.38 * side, 0.26 * PI, 0.52 * PI, drop * 0.85, 0.004, 0.012), 0.034, 0.009);
    }
  };
  /** Locks round the back, from ear to ear, hanging `drop` below the
   *  nape, splaying `out` and curling in by `curl`. */
  const back = (count: number, drop: number, out: number, curl: number, width: number, edge = 0.6) => {
    for (let i = 0; i < count; i++) {
      const t = (i - (count - 1) / 2) / ((count - 1) / 2);
      lock(scalpLock(PI + t * 1.3, 0.22 * PI, edge * PI, drop, out, curl), width, 0.013, 0.35);
    }
  };

  switch (spec.hairStyle) {
    case "buzz":
      hairTop(0.13, PI * 0.37);
      hairBack(0.13, PI * 0.46);
      break;
    case "short":
      hairTop(0.136, PI * 0.38);
      hairBack(0.136, PI * 0.5);
      fringe();
      frame(0.06);
      back(7, 0.02, 0.006, 0.01, 0.045);
      break;
    case "bob":
      hairTop(0.14, PI * 0.38);
      hairBack(0.142, PI * 0.55);
      fringe();
      frame(0.1);
      back(9, 0.085, 0.022, 0.034, 0.05);
      break;
    case "long":
      hairTop(0.14, PI * 0.38);
      hairBack(0.142, PI * 0.55);
      fringe();
      frame(0.17);
      back(9, 0.34, 0.035, 0.004, 0.052, 0.58);
      break;
    case "ponytail": {
      hairTop(0.137, PI * 0.38);
      hairBack(0.139, PI * 0.52);
      fringe();
      frame(0.08);
      add("head", sphere(0.026), accessory, [0, headY + 0.04, -0.132]);
      // The tail: out from the tie, then falling, thick at the top.
      const tie = new THREE.Vector3(0, SCALP.center.y + 0.04, -0.14);
      for (const x of [-0.012, 0.012]) {
        lock([tie.clone().setX(x * 0.5), new THREE.Vector3(x, tie.y - 0.026, -0.2), new THREE.Vector3(x * 1.3, tie.y - 0.156, -0.215), new THREE.Vector3(x, tie.y - 0.286, -0.18)], 0.034, 0.024, 0.3);
      }
      break;
    }
    case "bun":
      hairTop(0.137, PI * 0.38);
      hairBack(0.139, PI * 0.52);
      fringe();
      frame(0.06);
      back(7, 0.0, 0.004, 0.006, 0.042, 0.56);
      add("head", sphere(0.062, 20, 14), hair, [0, headY + 0.13, -0.05]);
      add("head", new THREE.TorusGeometry(0.05, 0.011, 8, 22), accessory, [0, headY + 0.1, -0.035], [HALF_PI - 0.35, 0, 0]);
      break;
    case "none":
      break;
  }

  // ---- accessories ------------------------------------------------------------
  if (spec.accessories.includes("glasses")) {
    // Centred on the painted eyes (see the eye decals above).
    for (const side of [1, -1]) add("head", new THREE.TorusGeometry(0.038, 0.0042, 8, 28), dark, [0.04 * side, headY - 0.024, 0.124]);
    add("head", new THREE.BoxGeometry(0.008, 0.005, 0.005), dark, [0, headY - 0.016, 0.127]);
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
  // Shoulder to wrist as one skinned surface, starting inside the torso so
  // the shoulder is a continuous curve (a deltoid, not a ball joint).
  // Sleeves are the same sweep, slightly inflated, over the part they cover.
  const longSleeves = spec.top === "longsleeve" || spec.top === "hoodie" || spec.top === "blazer";
  const sleeveLength = longSleeves ? 0.478 : spec.top === "tshirt" ? 0.13 : 0;
  const shoulderX = 0.165 * b;
  const armKeys: ProfileKey[] = [
    // Fuller than a mannequin's, as VRoid's are: a rounded deltoid, an
    // upper arm about as thick as the forearm's widest, a slim wrist.
    { s: shoulderX - 0.07, a: W(0.04), b: W(0.046) },
    { s: shoulderX, a: W(0.048), b: W(0.054) },
    { s: shoulderX + 0.05, a: W(0.048), b: W(0.05) },
    { s: shoulderX + 0.14, a: W(0.041), b: W(0.042) },
    { s: shoulderX + 0.235, a: W(0.034), b: W(0.036) },
    { s: shoulderX + 0.275, a: W(0.036), b: W(0.039) },
    { s: shoulderX + 0.34, a: W(0.032), b: W(0.034) },
    { s: shoulderX + 0.44, a: W(0.021), b: W(0.028) },
    { s: shoulderX + 0.49, a: W(0.02), b: W(0.027) },
  ];
  for (const [side, prefix] of [[1, "left"], [-1, "right"]] as const) {
    const shoulder = `${prefix}Shoulder` as VRMHumanBoneName;
    const upper = `${prefix}UpperArm` as VRMHumanBoneName;
    const lower = `${prefix}LowerArm` as VRMHumanBoneName;
    const hand = `${prefix}Hand` as VRMHumanBoneName;
    const weights = chainWeights(
      [boneIndex[shoulder], boneIndex[upper], boneIndex[lower], boneIndex[hand]],
      [
        [shoulderX - 0.005, 0.05],
        [shoulderX + 0.25, 0.035],
        [shoulderX + 0.47, 0.012],
      ]
    );
    const arm = (from: number, to: number, material: THREE.Material, inflate = 1, pad = 0) =>
      body(
        sweepGeometry({
          keys: armKeys,
          from: shoulderX + from,
          to: shoulderX + to,
          step: 0.012,
          segments: 16,
          exponent: 2.1,
          inflate,
          pad,
          // Along the arm is X (mirrored per side); the cross-section is
          // the vertical (a) and front/back (b) thickness.
          // A touch below the joint, so the top of the arm runs into the
          // shoulder's slope instead of standing above it like an epaulette.
          place: (x, u, v) => [side * x * h, (1.336 + u) * h, v * h],
          weights,
        }),
        material
      );
    if (sleeveLength > 0) {
      const short = sleeveLength < 0.3;
      arm(-0.07, sleeveLength, top, short ? 1.12 : 1.0, short ? 0.004 : 0.005);
      // A hem band at the end of the sleeve: a cuff, or a T-shirt's hem.
      arm(sleeveLength - (short ? 0.018 : 0.03), sleeveLength, shade(spec.topColor, 0.82), short ? 1.14 : 1.0, short ? 0.007 : 0.0085);
      // A shirt cuff showing past a jacket's sleeve.
      if (spec.top === "blazer") arm(sleeveLength - 0.006, sleeveLength + 0.012, white, 1.0, 0.0045);
      if (short) arm(sleeveLength - 0.03, 0.49, skin);
    } else {
      arm(-0.07, 0.49, skin);
    }

    // Hand: one smooth surface from the wrist to the fingertips, wide
    // across the knuckles and curling down at the end, and a thumb. The
    // separate thin fingers before read as claws at any distance.
    const handKeys: ProfileKey[] = [
      { s: 0.46, a: 0.016, b: 0.024 },
      { s: 0.5, a: 0.017, b: 0.034 },
      { s: 0.55, a: 0.0155, b: 0.04 },
      { s: 0.6, a: 0.0125, b: 0.038 },
      { s: 0.632, a: 0.0095, b: 0.03 },
      { s: 0.645, a: 0.004, b: 0.014 },
    ];
    body(
      sweepGeometry({
        // A touch narrower than life, as stylized hands are.
        keys: handKeys.map((k) => ({ ...k, s: shoulderX + k.s, a: k.a * b, b: k.b * b * 0.88 })),
        from: shoulderX + 0.46,
        to: shoulderX + 0.645,
        step: 0.01,
        segments: 14,
        exponent: 2.4,
        place: (x, u, v) => {
          const curl = Math.pow(Math.max(0, (x - shoulderX - 0.55) / 0.095), 2) * 0.022;
          return [side * x * h, (1.336 - curl + u) * h, v * h];
        },
        weights: () => [[boneIndex[hand], 1]],
      }),
      skin
    );
    const wrist = shoulderX + 0.47;
    body(
      hairLock({
        points: [
          new THREE.Vector3(side * (wrist + 0.018), 1.333, 0.016),
          new THREE.Vector3(side * (wrist + 0.042), 1.33, 0.036),
          new THREE.Vector3(side * (wrist + 0.066), 1.328, 0.043),
        ],
        width: 0.0095 * b,
        thickness: 0.0085 * b,
        widest: 0.25,
        bone: boneIndex[hand],
        h,
      }),
      skin
    );
  }

  // ---- legs -------------------------------------------------------------------
  // Hip to ankle as one skinned surface. The top starts inside the pelvis
  // and is weighted to the hips, so the thigh flows out of the torso and
  // the crotch is a continuous shape under the trousers, rather than two
  // tubes plugged into a ball.
  const bareLegs = spec.bottom === "skirt" || dress;
  const legKeys: ProfileKey[] = [
    { s: 0.06, a: W(0.031), b: W(0.032) },
    { s: 0.1, a: W(0.034), b: W(0.036) },
    { s: 0.17, a: W(0.04), b: W(0.043), c: -0.002 },
    { s: 0.29, a: W(0.05), b: W(0.057), c: -0.008 },
    { s: 0.37, a: W(0.054), b: W(0.06), c: -0.009 },
    { s: 0.44, a: W(0.052), b: W(0.054), c: -0.003 },
    { s: 0.49, a: W(0.051), b: W(0.053), c: 0.004 },
    { s: 0.55, a: W(0.057), b: W(0.059), c: 0.004 },
    { s: 0.66, a: W(0.068), b: W(0.07), c: 0.006 },
    { s: 0.78, a: W(0.078), b: W(0.079), c: 0.004 },
    { s: 0.87, a: W(0.083), b: W(0.081), c: 0 },
    { s: 0.95, a: W(0.078), b: W(0.078), c: -0.004 },
  ];
  for (const [side, prefix] of [[1, "left"], [-1, "right"]] as const) {
    const upper = `${prefix}UpperLeg` as VRMHumanBoneName;
    const lower = `${prefix}LowerLeg` as VRMHumanBoneName;
    const foot = `${prefix}Foot` as VRMHumanBoneName;
    const weights = chainWeights(
      [boneIndex[foot], boneIndex[lower], boneIndex[upper], boneIndex.hips],
      [
        [0.095, 0.02],
        [0.49, 0.04],
        [0.865, 0.055],
      ]
    );
    const x0 = 0.09 * side;
    const leg = (from: number, to: number, material: THREE.Material, inflate = 1, pad = 0) =>
      body(
        sweepGeometry({
          keys: legKeys,
          from,
          to,
          step: 0.012,
          segments: 18,
          exponent: 2.1,
          inflate,
          pad,
          place: (y, u, v) => [(x0 + u) * h, y * h, v * h],
          weights,
        }),
        material
      );
    if (bareLegs) {
      // Under a skirt the thigh stops below the hip, hidden: its full top
      // is wider than the skirt's waist and showed through at the sides.
      leg(0.06, 0.88, skin);
    } else if (spec.bottom === "shorts") {
      leg(0.6, 0.95, bottom, 1.08, 0.004);
      leg(0.06, 0.63, skin);
    } else {
      leg(0.075, 0.95, bottom, 1.0, 0.006);
    }
    // A shoe: heel to toe, high at the ankle and low at the toe, on a sole
    // a shade apart from it, so it reads as footwear rather than a lump.
    const shoeKeys: ProfileKey[] = [
      { s: -0.062, a: 0.026, b: 0.03, c: 0.042 },
      { s: -0.045, a: 0.036, b: 0.044, c: 0.049 },
      { s: 0.0, a: 0.041, b: 0.049, c: 0.053 },
      { s: 0.05, a: 0.045, b: 0.038, c: 0.043 },
      { s: 0.1, a: 0.044, b: 0.028, c: 0.033 },
      { s: 0.13, a: 0.034, b: 0.022, c: 0.027 },
      { s: 0.142, a: 0.014, b: 0.013, c: 0.025 },
    ];
    const footWeights = () => [[boneIndex[foot], 1]] as Array<[number, number]>;
    const shoePart = (keys: ProfileKey[], material: THREE.Material) =>
      body(
        sweepGeometry({
          keys,
          from: keys[0].s,
          to: keys[keys.length - 1].s,
          step: 0.01,
          segments: 16,
          exponent: 2.6,
          place: (z, u, v) => [(x0 + u) * h, v * h, z * h],
          weights: footWeights,
        }),
        material
      );
    shoePart(shoeKeys, shoe);
    shoePart(
      shoeKeys.map((k) => ({ s: k.s + (k.s > 0.1 ? 0.004 : k.s < -0.04 ? -0.003 : 0), a: k.a * 1.06 + 0.001, b: 0.0075, c: 0.0075 })),
      soleMat
    );
  }

  // ---- merge, bind, outline ----------------------------------------------
  scene.updateMatrixWorld(true);
  // One skinned mesh per material, all bound to one skeleton in the rest
  // pose built above, each with its outline (designerMesh.ts).
  const rig = new THREE.Skeleton(boneList);
  const outlineWidth = OUTLINE_WIDTH * h;
  for (const { material, outline, parts } of buckets.values()) {
    const geometry = mergeParts(parts);
    const surface = new THREE.SkinnedMesh(geometry, material);
    surface.castShadow = true;
    surface.receiveShadow = true;
    // Skinned meshes keep their rest-pose bounds; never cull a moving body.
    surface.frustumCulled = false;
    scene.add(surface);
    surface.bind(rig);
    if (outline) {
      const line = new THREE.SkinnedMesh(geometry, outlineMaterial((material as THREE.MeshToonMaterial).color, outlineWidth));
      line.frustumCulled = false;
      line.name = "SeizaDesignerOutline";
      scene.add(line);
      line.bind(rig);
    }
  }
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
    lids: { closed: lidMat, smile: smileMat, open: [eyeMats.left, eyeMats.right] },
  };
  const expressionManager = buildDesignerExpressions(faceParts);

  return new VRM({ scene, meta, humanoid, expressionManager, materials: [...materials.values()] });
}
