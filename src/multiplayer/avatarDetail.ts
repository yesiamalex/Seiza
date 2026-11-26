/**
 * How much of an avatar to work on, by where it is: in view or not, and how
 * far away, in a room of how many avatars. Every avatar is always drawn and
 * always moves; what changes far off in a crowd is only what can't be seen
 * at that distance.
 *
 * - **In view, near** (or in a small room): everything, every frame.
 * - **In a crowd** (more than CROWD_SIZE avatars), by distance: past 10 m
 *   the outline pass goes (MToon draws each avatar a second time for it,
 *   and at that size it's a hairline); past 20 m the hair and clothes
 *   physics too, and the pose is worked out every other frame (30 a second
 *   at 60: still smooth, at a distance where a step is a few pixels).
 * - **In a headset**, which draws everything twice (an eye each) in 14 ms
 *   at 72 Hz, a crowd starts at 5 and the tiers come closer (XR_TIERS):
 *   the outline goes past 5 m, where on a Quest 2's screen it's a pixel,
 *   and the physics past 12 m (`tight`). Low graphics on a phone
 *   (scene/graphics.ts) uses the same. Nothing else changes.
 * - **Out of view:** worked out every 6th frame, so it's in step when you
 *   turn round. Whether it's drawn is three.js's own frustum culling, frame
 *   by frame (VrmAvatar gives it a generous bounding sphere), so nothing on
 *   screen is ever skipped, in a mirror either.
 *
 * Animation time always advances in full (AvatarAnimator's updateEvery), so
 * a far-off wave or seiza doze stays on time.
 */

/** Out of view: every 6th frame, enough to catch up smoothly on return. */
export const OFFSCREEN_EVERY = 6;
/** At or below this many avatars, distance never lowers the detail, so a
 *  small class renders exactly as before. */
export const CROWD_SIZE = 8;
/** Distance tiers in a crowd: [beyond, update every, hair physics, outlines]. */
export const CROWD_TIERS: [number, number, boolean, boolean][] = [
  [20, 2, false, false],
  [10, 1, true, false],
];
/** In a headset: a crowd sooner, and the same steps nearer. */
export const XR_CROWD_SIZE = 4;
export const XR_TIERS: [number, number, boolean, boolean][] = [
  [12, 2, false, false],
  [5, 1, true, false],
];
/** Far, in a busy room: every 2nd frame (the remote players' planner). */
export const FAR_DISTANCE = CROWD_TIERS[0][0];
export const FAR_EVERY = CROWD_TIERS[0][1];

export interface AvatarDetail {
  /** Work out its pose every this many frames. */
  every: number;
  /** Run its hair and clothes physics (spring bones). */
  springs: boolean;
  /** Draw its outline. */
  outlines: boolean;
}

export function avatarDetail(avatar: { inView: boolean; distance: number; crowd: number; tight?: boolean }): AvatarDetail {
  if (!avatar.inView) return { every: OFFSCREEN_EVERY, springs: false, outlines: true };
  if (avatar.crowd > (avatar.tight ? XR_CROWD_SIZE : CROWD_SIZE)) {
    for (const [beyond, every, springs, outlines] of avatar.tight ? XR_TIERS : CROWD_TIERS) if (avatar.distance > beyond) return { every, springs, outlines };
  }
  return { every: 1, springs: true, outlines: true };
}

/** How often a remote avatar's animation updates (RemotePlayers' planner). */
export function avatarUpdateEvery(avatar: { inView: boolean; distance: number; remoteCount: number; tight?: boolean }): number {
  return avatarDetail({ inView: avatar.inView, distance: avatar.distance, crowd: avatar.remoteCount, tight: avatar.tight }).every;
}
