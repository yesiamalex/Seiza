import type { VRM } from "@pixiv/three-vrm";

/** Upper arm plus forearm, in metres, of the avatars TOGETHER_SPACING is
 *  measured for (VRoid Studio's samples, give or take a few millimetres). */
export const REFERENCE_ARM_LENGTH = 0.434;

const scales = new Map<string, number>();

/** An avatar's arm length, from its rest skeleton: the same whatever pose
 *  it's in, or how it's been scaled in the scene. Null for a rig without
 *  arm bones. */
export function armLength(vrm: VRM): number | null {
  const rest = vrm.humanoid.normalizedRestPose;
  const lower = rest.leftLowerArm?.position;
  const hand = rest.leftHand?.position;
  if (!lower || !hand) return null;
  return Math.hypot(...lower) + Math.hypot(...hand);
}

/** Records a player's avatar once it's loaded (or forgets it, for null). */
export function setAvatarReach(playerId: string, vrm: VRM | null) {
  const length = vrm ? armLength(vrm) : null;
  if (length) scales.set(playerId, Math.min(1.35, Math.max(0.75, length / REFERENCE_ARM_LENGTH)));
  else scales.delete(playerId);
}

/** How long a player's arms are against the reference: 1 until their
 *  avatar has loaded. */
export function reachScale(playerId: string | null): number {
  return (playerId && scales.get(playerId)) || 1;
}
