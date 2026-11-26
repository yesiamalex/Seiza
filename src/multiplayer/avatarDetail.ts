/**
 * How much of an avatar to work on, by where it is: in view or not, and how
 * far away, in a room of how many avatars. What matters in a crowd is the
 * avatars you can't really see. Nobody near you changes at all.
 *
 * - **Out of view, not close by:** not drawn (and not skinned on the GPU).
 *   Avatars near you stay drawn even out of view, because a mirror or the
 *   edge of the screen may still show them.
 * - **In a crowd** (more than CROWD_SIZE avatars), by distance: near ones
 *   in full; further out the outline pass goes (MToon draws each avatar a
 *   second time for it, which is lost at a distance anyway), then the hair
 *   physics, and the pose is worked out less often.
 *
 * Animation time always advances in full (AvatarAnimator's updateEvery), so
 * a far-off wave or seiza doze stays on time; only how often the pose is
 * recomputed changes.
 */

/** Out of view: every 6th frame, enough to catch up smoothly on return. */
export const OFFSCREEN_EVERY = 6;
/** Within this, an avatar out of view is still drawn (mirrors, the screen's edge). */
export const DRAWN_NEAR = 8;
/** At or below this many avatars, distance never lowers the detail, so a
 *  small class renders exactly as before. */
export const CROWD_SIZE = 8;
/** Distance tiers in a crowd: [beyond, update every, hair physics, outlines]. */
export const CROWD_TIERS: [number, number, boolean, boolean][] = [
  [35, 4, false, false],
  [20, 3, false, false],
  [10, 2, true, false],
];
/** Kept for the remote players' planner: far, in a busy room, every 2nd frame. */
export const FAR_DISTANCE = CROWD_TIERS[2][0];
export const FAR_EVERY = CROWD_TIERS[2][1];

export interface AvatarDetail {
  /** Draw it at all. */
  drawn: boolean;
  /** Work out its pose every this many frames. */
  every: number;
  /** Run its hair and clothes physics (spring bones). */
  springs: boolean;
  /** Draw its outline. */
  outlines: boolean;
}

export function avatarDetail(avatar: { inView: boolean; distance: number; crowd: number }): AvatarDetail {
  if (!avatar.inView) return { drawn: avatar.distance < DRAWN_NEAR, every: OFFSCREEN_EVERY, springs: false, outlines: false };
  if (avatar.crowd > CROWD_SIZE) {
    for (const [beyond, every, springs, outlines] of CROWD_TIERS) if (avatar.distance > beyond) return { drawn: true, every, springs, outlines };
  }
  return { drawn: true, every: 1, springs: true, outlines: true };
}

/** How often a remote avatar's animation updates (RemotePlayers' planner). */
export function avatarUpdateEvery(avatar: { inView: boolean; distance: number; remoteCount: number }): number {
  return avatarDetail({ inView: avatar.inView, distance: avatar.distance, crowd: avatar.remoteCount }).every;
}
