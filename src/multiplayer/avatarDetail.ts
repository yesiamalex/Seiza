/**
 * How often a remote avatar's animation and hair physics update. Nothing
 * about how anyone looks or moves changes, only how often the pose is
 * recomputed, and only where the difference can't be seen. Animation time
 * always advances in full (see AvatarAnimator's updateEvery), so a far-off
 * wave, gesture, or seiza doze stays on time.
 */

/** Out of view: every 4th frame, enough to catch up smoothly on return. */
export const OFFSCREEN_EVERY = 4;
/** Far away in a busy room: every 2nd frame. */
export const FAR_EVERY = 2;
export const FAR_DISTANCE = 12;
/** Below this many remote avatars, distance never lowers the rate, so a
 *  small class renders exactly as before. */
export const CROWD_SIZE = 8;

export function avatarUpdateEvery(avatar: { inView: boolean; distance: number; remoteCount: number }): number {
  if (!avatar.inView) return OFFSCREEN_EVERY;
  if (avatar.remoteCount > CROWD_SIZE && avatar.distance > FAR_DISTANCE) return FAR_EVERY;
  return 1;
}
