import type { VRM } from "@pixiv/three-vrm";

// three-vrm's humanoid.resetNormalizedPose() resets to the *normalized*
// rig's rest pose, which the VRM spec defines as T-pose by construction
// (see VRMHumanoid's own docs: "A VRMPose of its normalized human bones
// that is its default state" / the normalized rig exists specifically so
// rest == T-pose is guaranteed regardless of the source file's own
// authored bind pose). That earlier assumption was wrong in this file's
// first version: it *also* added an explicit ±90° arm rotation on top of
// the reset, on the theory that reset alone wasn't reliably T-pose.
// Real-world evidence (a live screenshot) showed the opposite problem —
// arms rotated a further 90° past T-pose into pointing straight up —
// which is consistent with reset alone already being correct T-pose, and
// the added rotation double-applying on top of it. Removed here; if this
// turns out wrong for some file, the fix is deleting this whole
// workaround, not re-adding a guessed rotation on top of the reset.
export function applyTPose(vrm: VRM) {
  vrm.humanoid.resetNormalizedPose();
  vrm.humanoid.update();
}
