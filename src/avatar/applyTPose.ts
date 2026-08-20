import type { VRM, VRMHumanoid } from "@pixiv/three-vrm";

// three-vrm's humanoid.resetNormalizedPose() resets to the *file's own*
// authored rest pose — VRM spec guidance recommends that be a literal
// T-pose, but real-world exports don't reliably comply (relaxed A-pose,
// tool-specific quirks). For a preview meant to compare avatars
// consistently, that's not good enough. This instead absolute-sets the
// arm rotations on the *normalized* rig, whose local axes (not
// necessarily rest angles) ARE guaranteed consistent across avatars —
// that's the actual portability guarantee VRM normalization provides,
// and the same property GestureController.tsx relies on to play one
// gesture clip across any uploaded VRM.
//
// Axis/sign not visually verified against a real avatar in a running
// browser (same caveat as useProceduralGait.ts) — if arms end up
// pointing down/up instead of straight out on a real file, flip
// ARM_ANGLE's sign; it won't produce a broken pose either way since the
// base (identity) rotation is still reset first.
const ARM_ANGLE = Math.PI / 2;

export function applyTPose(vrm: VRM) {
  const humanoid = vrm.humanoid;
  humanoid.resetNormalizedPose();
  setArmZ(humanoid, "leftUpperArm", -ARM_ANGLE);
  setArmZ(humanoid, "rightUpperArm", ARM_ANGLE);
  humanoid.update();
}

function setArmZ(humanoid: VRMHumanoid, name: "leftUpperArm" | "rightUpperArm", angle: number) {
  const node = humanoid.getNormalizedBoneNode(name);
  if (node) node.rotation.z = angle;
}
