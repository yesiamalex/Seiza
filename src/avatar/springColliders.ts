import * as THREE from "three";
import {
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
  type VRM,
  type VRMHumanBoneName,
  type VRMSpringBoneColliderGroup,
} from "@pixiv/three-vrm";

/**
 * Lets an avatar's hair collide with the lower body as well as the upper.
 *
 * A VRM carries its own spring-bone colliders, and three-vrm already applies
 * them, but which colliders each hair chain is told to check is the model
 * author's choice, and authors set it up for standing. VRoid exports, the
 * most common source, give the hair the head, neck, chest, spine and arm
 * colliders and give the thigh colliders to the skirt alone, and nothing
 * covers the hips. Standing, that is invisible. In a crouch, a bow, or
 * seiza the torso folds over the legs and long hair passes straight through
 * them.
 *
 * So, once per model: any spring chain the author already made collide with
 * the torso also gets the thigh colliders (the model's own, or capsules
 * built from the leg bones if it has none) and one sphere over the hips.
 * Chains the author left without body collision, such as a bust or a coat
 * tail, are left alone; that was a choice, not an omission.
 *
 * Every size is measured from the skeleton rather than assumed, and every
 * shape is placed in a bone's own local space using only positions, so it
 * fits VRM 0 and VRM 1 rigs alike without knowing which way either faces.
 *
 * What this cannot fix: spring bones collide at their joints, a few per
 * strand, so the mesh between two joints can still cut through a body. That
 * is how every VRM application works, and the remedy, collision against the
 * mesh itself, costs far more than a room of avatars can afford.
 *
 * Cost: one test per hair joint per added collider per frame, a few hundred
 * vector operations for a long-haired model. Not measurable next to skinning.
 */

const extended = new WeakSet<VRM>();

const TORSO: VRMHumanBoneName[] = ["spine", "chest", "upperChest", "neck"];
/** Hips sphere radius as a share of the distance between the hip joints. */
const HIPS_RADIUS_SHARE = 0.6;
/** Synthesized thigh capsule radius as a share of thigh length. */
const THIGH_RADIUS_SHARE = 0.16;

const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();

export function extendHairCollision(vrm: VRM): void {
  const manager = vrm.springBoneManager;
  if (!manager || extended.has(vrm)) return;
  extended.add(vrm);

  const raw = (name: VRMHumanBoneName) => vrm.humanoid.getRawBoneNode(name);
  const groupBone = (group: VRMSpringBoneColliderGroup) => group.colliders[0]?.parent ?? null;
  const torso = new Set(TORSO.map(raw).filter((node): node is THREE.Object3D => node != null));

  const joints = [...manager.joints].filter((joint) =>
    joint.colliderGroups.some((group) => {
      const bone = groupBone(group);
      return bone != null && torso.has(bone);
    })
  );
  if (joints.length === 0) return;

  const hips = raw("hips");
  const leftLeg = raw("leftUpperLeg");
  const rightLeg = raw("rightUpperLeg");
  if (!hips || !leftLeg || !rightLeg) return;
  vrm.scene.updateMatrixWorld(true);

  const added: VRMSpringBoneColliderGroup[] = [];

  // The thighs: the model's own colliders where it has them.
  for (const leg of [leftLeg, rightLeg]) {
    const own = manager.colliderGroups.find((group) => groupBone(group) === leg);
    if (own) {
      added.push(own);
      continue;
    }
    const knee = vrm.humanoid.getRawBoneNode(leg === leftLeg ? "leftLowerLeg" : "rightLowerLeg");
    if (!knee || knee.parent !== leg) continue;
    // Tail at the knee, in the thigh's own space: the knee's local position
    // is exactly that, whatever the rig's orientation.
    const length = knee.position.length();
    const collider = new VRMSpringBoneCollider(
      new VRMSpringBoneColliderShapeCapsule({
        offset: new THREE.Vector3(),
        tail: knee.position.clone(),
        radius: length * THIGH_RADIUS_SHARE,
      })
    );
    leg.add(collider);
    added.push({ colliders: [collider], name: "seiza:thigh" });
  }

  // The hips, which no common export covers. Sized from the distance
  // between the hip joints, and centred on the hips bone so no direction
  // has to be assumed.
  // Measured in world space and divided back by the hips' world scale, so
  // the radius is in the bone's own units, which is where the sphere lives.
  leftLeg.getWorldPosition(scratchA);
  rightLeg.getWorldPosition(scratchB);
  const hipWidth = scratchA.distanceTo(scratchB) / Math.max(1e-6, hips.getWorldScale(new THREE.Vector3()).x);
  if (hipWidth > 1e-3) {
    const collider = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapeSphere({ radius: hipWidth * HIPS_RADIUS_SHARE }));
    hips.add(collider);
    added.push({ colliders: [collider], name: "seiza:hips" });
  }

  for (const joint of joints) {
    for (const group of added) {
      if (!joint.colliderGroups.includes(group)) joint.colliderGroups.push(group);
    }
  }
}
