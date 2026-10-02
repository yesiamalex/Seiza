import type { XrBodySample } from "./xrPose";
import type { TrackedPose } from "./trackingWire";

/**
 * The latest body-tracking pose for every player, read once a frame by
 * whichever avatar it belongs to (TrackedBody).
 *
 * Plain module state rather than React state, for the same reason
 * touchInput.ts and gizmoState.ts are: poses arrive ten times a second per
 * headset, every one of them is read from a frame loop anyway, and
 * routing them through setState would re-render the whole player list on
 * every packet for nothing.
 */

export interface TrackingSample {
  pose: TrackedPose;
  /** performance.now() when it arrived. */
  receivedAt: number;
}

/** The key the local player's own pose is stored under. Not a valid
 *  connection id, so it can never collide with a remote player's. */
export const LOCAL_TRACKING_SOURCE = "@local";

const samples = new Map<string, TrackingSample>();

/** The local player's head and hands in world space, this frame — what
 *  the wrist menu anchors to. Null outside a session. */
let localWorld: XrBodySample | null = null;
/** The local player's measured standing eye height, in metres. */
let localStandingEye = 0;

export const trackingStore = {
  set(source: string, pose: TrackedPose | null) {
    if (pose) samples.set(source, { pose, receivedAt: performance.now() });
    else samples.delete(source);
  },
  get(source: string): TrackingSample | null {
    return samples.get(source) ?? null;
  },
  /** Everything remote, dropped on disconnect so a reconnect does not
   *  briefly pose avatars from the previous session. */
  clearRemote() {
    for (const key of [...samples.keys()]) if (key !== LOCAL_TRACKING_SOURCE) samples.delete(key);
  },
  setLocalWorld(sample: XrBodySample | null, standingEye: number) {
    localWorld = sample;
    localStandingEye = standingEye;
  },
  getLocalWorld(): XrBodySample | null {
    return localWorld;
  },
  getLocalStandingEye(): number {
    return localStandingEye;
  },
};
