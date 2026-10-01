import * as THREE from "three";
import { VRM, VRMHumanoid, type VRM1Meta, type VRMHumanBoneName, type VRMHumanBones } from "@pixiv/three-vrm";
import type { AvatarSpec } from "./avatarSpec";
import { buildDesignerExpressions, type DesignerFaceParts } from "./designerExpressions";
import { chainWeights, sampleProfile, sweepGeometry, type ProfileKey } from "./designerBody";
import { decalMaterial, faceDecalGeometry, paintBlush, paintBrow, paintEye, paintMouth, raycastFaceSurface, sculptedHeadGeometry } from "./designerFace";

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

  // ---- skinned body helpers ------------------------------------------------
  const skinnedParts: THREE.SkinnedMesh[] = [];
  const body = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Skinned meshes keep their rest-pose bounds; never cull a moving body.
    mesh.frustumCulled = false;
    scene.add(mesh);
    skinnedParts.push(mesh);
  };

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
    { s: 0.875, a: W(0.146), b: 0.094, c: -0.014 },
    { s: 0.93, a: W(0.146), b: 0.094, c: -0.01 },
    { s: 1.0, a: W(0.134 * (0.55 + 0.5 * waist)), b: 0.084, c: -0.004 },
    { s: 1.06, a: W(0.128 * (0.5 + 0.55 * waist)), b: 0.082, c: 0.0 },
    { s: 1.13, a: W(0.136), b: 0.09, c: 0.006 },
    { s: 1.21, a: W(0.146 * (0.6 + 0.4 * shoulderSpread)), b: 0.096, c: 0.008 },
    { s: 1.29, a: W(0.156 * shoulderSpread), b: 0.09, c: 0.002 },
    { s: 1.345, a: W(0.158 * shoulderSpread), b: 0.076, c: -0.006 },
    { s: 1.378, a: W(0.122 * shoulderSpread), b: 0.062, c: -0.01 },
    { s: 1.405, a: 0.054, b: 0.052, c: -0.006 },
    { s: 1.49, a: 0.049, b: 0.05, c: 0.0 },
    { s: 1.57, a: 0.04, b: 0.042, c: 0.004 },
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

  if (spec.top === "blazer") {
    // Shirt placket and optional tie over the jacket front.
    // Shirt front: a tapering V down from the collar, not a flat panel.
    add("chest", new THREE.CylinderGeometry(0.045, 0.004, 0.17, 3), white, [0, 0.1, torsoFront(1.25) - 0.004], [-0.08, 0, 0], [1, 1, 0.25]);
    add("upperChest", new THREE.CylinderGeometry(0.05, 0.001, 0.09, 3), white, [0, 0.07, torsoFront(1.34) + 0.004], [0, 0, Math.PI], [1, 1, 0.25]);
  }
  if (spec.accessories.includes("tie")) {
    add("chest", new THREE.CylinderGeometry(0.02, 0.026, 0.2, 4, 1), accessory, [0, 0.1, torsoFront(1.25) + 0.008], [-0.08, Math.PI / 4, 0], [1, 1, 0.35]);
    add("upperChest", new THREE.BoxGeometry(0.04, 0.03, 0.014), accessory, [0, 0.085, torsoFront(1.355) + 0.008]);
  }
  if (spec.top === "hoodie") {
    add("upperChest", new THREE.TorusGeometry(0.1, 0.035, 10, 20, Math.PI), top, [0, 0.085, -0.075], [HALF_PI * 0.4, 0, 0], [1.1 * b, 1, 1]);
    add("spine", new THREE.BoxGeometry(0.17, 0.07, 0.016), top, [0, 0.035, torsoFront(1.055) + 0.008]);
  }

  // Skirt / dress hem — rigid on the hips.
  if (spec.bottom === "skirt" || dress) {
    const length = dress ? 0.36 : 0.26;
    // Starts just above the hip line at the hips' own width, so it hangs
    // from the waist instead of looking like a cone pushed onto it.
    const skirt = new THREE.CylinderGeometry(0.165 * b, 0.25 * b, length, 28, 3, true);
    add("hips", skirt, dress ? top : bottom, [0, -length / 2 + 0.035, -0.01], [0, 0, 0], [1, 1, 0.7]);
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
  const headY = 0.128;
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

  // One sculpted head mesh (see sculptedHeadGeometry). Its surface, in
  // the same pre-height units as everything placed with `face()`, is
  // what the painted features are wrapped onto.
  const headGeometry = sculptedHeadGeometry();
  face(headGeometry, faceSkin);
  const headSurface = raycastFaceSurface(headGeometry);
  // Nose: just a tip that catches a highlight and a short shadow. At this
  // level of stylisation anything more reads as a caricature.
  face(sphere(0.0055), faceSkin, [0, -0.04, headSurface(0, -0.04) - 0.0015], [0, 0, 0], [1, 0.75, 1]);

  // Painted features (designerFace.ts), each in the group the expression
  // system animates. Eye and brow are painted once and mirrored.
  const eyeMat = decalMaterial(paintEye(spec.eyeColor), 0.18);
  const browMat = decalMaterial(paintBrow(spec.hairColor));
  const blushMat = decalMaterial(paintBlush());
  const eyeGroups: Record<string, THREE.Group> = {};
  const browGroups: Record<string, THREE.Group> = {};
  for (const [side, key] of [
    [1, "leftEye"],
    [-1, "rightEye"],
  ] as const) {
    // Ear.
    face(sphere(0.024), faceSkin, [0.116 * side, -0.01, -0.004], [0, 0, 0], [0.5, 1, 0.75]);

    const eyeDecal = faceDecalGeometry(headSurface, 0.042 * side, -0.016, 0.064, 0.072, 0.0015, side < 0);
    const eye = facePart(eyeDecal.origin);
    eye.name = key;
    eyeGroups[key] = eye;
    face(eyeDecal.geometry, eyeMat, [0, 0, 0], [0, 0, 0], [1, 1, 1], eye);

    // Kept below the bangs on every hair style, so the brows (which carry
    // most of an expression) are never buried.
    const browKey = side > 0 ? "leftBrow" : "rightBrow";
    const browDecal = faceDecalGeometry(headSurface, 0.045 * side, 0.031, 0.054, 0.0135, 0.002, side < 0);
    const brow = facePart(browDecal.origin);
    brow.name = browKey;
    browGroups[browKey] = brow;
    face(browDecal.geometry, browMat, [0, 0, 0], [0, 0, 0], [1, 1, 1], brow);

    const blush = faceDecalGeometry(headSurface, 0.06 * side, -0.046, 0.05, 0.024, 0.001);
    face(blush.geometry, blushMat, blush.origin);
  }

  // Mouth: painted open, then squashed to a soft closed line at rest.
  // Visemes and expressions scale this group, which parts the lips.
  const mouthDecal = faceDecalGeometry(headSurface, 0, -0.07, 0.034, 0.02, 0.0015);
  const mouth = facePart(mouthDecal.origin);
  mouth.name = "mouth";
  mouth.scale.y = 0.42;
  face(mouthDecal.geometry, decalMaterial(paintMouth()), [0, 0, 0], [0, 0, 0], [1, 1, 1], mouth);

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
  // A fringe of tapered locks across the forehead, the way anime-styled
  // hair is shaped, instead of one flattened sphere (which read as a
  // helmet brim). Each lock follows the curve of the forehead and leans
  // slightly outward, and all of them stop above the brow line so the
  // brows, which carry most of an expression, stay visible.
  const bangs = () => {
    const LOCKS = 9;
    for (let i = 0; i < LOCKS; i++) {
      const t = (i - (LOCKS - 1) / 2) / ((LOCKS - 1) / 2); // -1 … 1
      const angle = t * 1.05;
      // Alternating lengths, shorter toward the temples.
      const length = 0.043 - Math.abs(t) * 0.008 + (i % 2) * 0.007;
      const lock = new THREE.ConeGeometry(0.037, length, 10, 1);
      lock.scale(1, 1, 0.45);
      lock.rotateZ(Math.PI - t * 0.2);
      lock.rotateX(-0.38);
      lock.rotateY(angle);
      // Rooted on the hairline edge of the cap (head-local y ≈ 0.075, where
      // the cap is ~0.13 out from the centre) and hanging down over the
      // forehead, ending above the brows.
      const centerY = 0.095 - length / 2;
      const radius = 0.122 + (0.075 - centerY) * 0.12;
      add("head", lock, hair, [Math.sin(angle) * radius, headY + centerY, Math.cos(angle) * radius]);
    }
  };


  // Two locks hanging in front of the ears, framing the face. Without them
  // every style read as a helmet sitting on a ball.
  const sideLocks = (length = 0.11) => {
    for (const side of [1, -1]) {
      const lock = new THREE.ConeGeometry(0.03, length, 10, 1);
      lock.scale(0.5, 1, 1);
      lock.rotateZ(Math.PI + 0.12 * side);
      lock.rotateX(-0.12);
      add("head", lock, hair, [0.118 * side, headY + 0.03 - length / 2, 0.05]);
    }
  };

  switch (spec.hairStyle) {
    case "buzz":
      hairTop(0.13, Math.PI * 0.37);
      hairBack(0.13, Math.PI * 0.46);
      break;
    case "short":
      hairTop(0.136, Math.PI * 0.38);
      hairBack(0.136, Math.PI * 0.5);
      bangs();
      sideLocks(0.085);
      break;
    case "bob":
      hairTop(0.14, Math.PI * 0.38);
      hairBack(0.142, Math.PI * 0.58);
      bangs();
      sideLocks(0.12);
      for (const side of [1, -1]) add("head", capsule(0.048, 0.12), hair, [0.108 * side, headY - 0.03, -0.012], [0, 0, 0], [0.8, 1, 1.15]);
      break;
    case "long":
      hairTop(0.14, Math.PI * 0.38);
      hairBack(0.142, Math.PI * 0.58);
      bangs();
      sideLocks(0.15);
      for (const side of [1, -1]) add("head", capsule(0.045, 0.2), hair, [0.105 * side, headY - 0.07, -0.02], [0, 0, 0], [0.7, 1, 1]);
      add("head", capsule(0.1, 0.24), hair, [0, headY - 0.2, -0.085], [0.12, 0, 0], [1.15, 1, 0.42]);
      break;
    case "ponytail":
      hairTop(0.137, Math.PI * 0.38);
      hairBack(0.139, Math.PI * 0.52);
      bangs();
      sideLocks(0.11);
      add("head", sphere(0.03), accessory, [0, headY + 0.04, -0.13]);
      add("head", capsule(0.042, 0.2), hair, [0, headY - 0.08, -0.155], [0.25, 0, 0], [1, 1, 0.9]);
      break;
    case "bun":
      hairTop(0.137, Math.PI * 0.38);
      hairBack(0.139, Math.PI * 0.52);
      bangs();
      sideLocks(0.11);
      add("head", sphere(0.065), hair, [0, headY + 0.13, -0.05]);
      break;
    case "none":
      break;
  }

  // ---- accessories ------------------------------------------------------------
  if (spec.accessories.includes("glasses")) {
    // Centred on the painted eyes (see the eye decals above).
    for (const side of [1, -1]) add("head", new THREE.TorusGeometry(0.033, 0.0042, 8, 28), dark, [0.042 * side, headY - 0.016, 0.127]);
    add("head", new THREE.BoxGeometry(0.018, 0.005, 0.005), dark, [0, headY - 0.008, 0.13]);
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
    { s: shoulderX - 0.07, a: W(0.034), b: W(0.04) },
    { s: shoulderX, a: W(0.04), b: W(0.046) },
    { s: shoulderX + 0.05, a: W(0.041), b: W(0.042) },
    { s: shoulderX + 0.14, a: W(0.035), b: W(0.035) },
    { s: shoulderX + 0.235, a: W(0.028), b: W(0.03) },
    { s: shoulderX + 0.275, a: W(0.03), b: W(0.033) },
    { s: shoulderX + 0.34, a: W(0.027), b: W(0.029) },
    { s: shoulderX + 0.44, a: W(0.018), b: W(0.025) },
    { s: shoulderX + 0.49, a: W(0.017), b: W(0.024) },
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
      if (short) arm(sleeveLength - 0.03, 0.49, skin);
    } else {
      arm(-0.07, 0.49, skin);
    }

    // Hand: a flattened palm, four slightly curled fingers and a thumb,
    // rigid on the hand bone. A single blob here was the "mitten" look.
    add(hand, sphere(0.034), skin, [0.04 * side, -0.002, 0.0], [0, 0, 0], [1.2, 0.48, 1.0]);
    for (const [i, z] of [0.018, 0.006, -0.006, -0.017].entries()) {
      const length = [0.034, 0.038, 0.036, 0.028][i];
      add(hand, capsule(0.0072, length), skin, [(0.083 + length / 2 - 0.006) * side, -0.006 - length * 0.16, z], [0, 0, (HALF_PI - 0.35) * side]);
    }
    add(hand, capsule(0.0085, 0.026), skin, [0.03 * side, -0.006, 0.032], [HALF_PI, 0, -0.55 * side]);
  }

  // ---- legs -------------------------------------------------------------------
  // Hip to ankle as one skinned surface. The top starts inside the pelvis
  // and is weighted to the hips, so the thigh flows out of the torso and
  // the crotch is a continuous shape under the trousers, rather than two
  // tubes plugged into a ball.
  const bareLegs = spec.bottom === "skirt" || dress;
  const legKeys: ProfileKey[] = [
    { s: 0.06, a: W(0.029), b: W(0.03) },
    { s: 0.1, a: W(0.031), b: W(0.033) },
    { s: 0.17, a: W(0.035), b: W(0.038), c: -0.002 },
    { s: 0.29, a: W(0.044), b: W(0.05), c: -0.007 },
    { s: 0.37, a: W(0.048), b: W(0.053), c: -0.008 },
    { s: 0.44, a: W(0.046), b: W(0.048), c: -0.003 },
    { s: 0.49, a: W(0.045), b: W(0.047), c: 0.004 },
    { s: 0.55, a: W(0.05), b: W(0.052), c: 0.004 },
    { s: 0.66, a: W(0.06), b: W(0.062), c: 0.006 },
    { s: 0.78, a: W(0.069), b: W(0.07), c: 0.004 },
    { s: 0.87, a: W(0.073), b: W(0.072), c: 0 },
    { s: 0.95, a: W(0.07), b: W(0.07), c: -0.004 },
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
      leg(0.06, 0.95, skin);
    } else if (spec.bottom === "shorts") {
      leg(0.6, 0.95, bottom, 1.08, 0.004);
      leg(0.06, 0.63, skin);
    } else {
      leg(0.075, 0.95, bottom, 1.0, 0.006);
    }
    add(foot, sphere(0.05), shoe, [0, -0.045, 0.035], [0, 0, 0], [1.05, 0.75, 2]);
  }

  // ---- VRM ----------------------------------------------------------------
  scene.updateMatrixWorld(true);
  // Bind every skinned part to one skeleton, in the rest pose built above.
  const rig = new THREE.Skeleton(boneList);
  for (const part of skinnedParts) part.bind(rig);
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
