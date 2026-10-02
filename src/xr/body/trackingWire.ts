/**
 * The wire format for VR body tracking: where a headset player's head and
 * hands are, relative to their own body.
 *
 * Shared by the sender (XrBodyTracker), the room server (worker/room.ts,
 * which validates and relays it), and every receiver (TrackedBody). Pure
 * data and arithmetic on purpose — no three.js — so the worker can import
 * it without pulling a renderer into a Durable Object.
 *
 * ## The body frame
 *
 * Every point is expressed relative to the player's feet and the direction
 * their body faces, not in world space:
 *
 *   x = to their right, y = up, z = behind them (so forward is -z)
 *
 * and every position is divided by the player's standing eye height. That
 * last part is what lets a 1.85m player's reach land correctly on a small
 * avatar and a child's on a tall one: a receiver multiplies back out by the
 * *avatar's* eye height, so "hand raised just above the head" stays just
 * above the head whatever either body measures.
 *
 * Orientations are quaternions in the same frame. For a hand, the
 * quaternion's own -z axis points from the wrist toward the fingers and
 * its -y axis out of the palm — WebXR's hand-joint convention, which
 * controller grips are converted into before sending (see xrPose.ts).
 */

/** [x, y, z, qx, qy, qz, qw]: a position and an orientation. */
export type TrackedPoint = [number, number, number, number, number, number, number];

export interface TrackedHand {
  pose: TrackedPoint;
  /** How closed the hand is: [index finger, the other three], each
   *  0 (open) to 1 (fist). From the trigger and grip on a controller, or
   *  measured from the fingers when hands are tracked directly. */
  curl: [number, number];
}

export interface TrackedPose {
  head: TrackedPoint;
  left: TrackedHand | null;
  right: TrackedHand | null;
  /** Current eye height over standing eye height: 1 standing, less when
   *  crouching, ducking or kneeling. Drives the avatar's hips down. */
  height: number;
}

/** How often a headset player sends their pose. Ten a second is enough
 *  for a wave to read as a wave once the receiver smooths it, at about a
 *  third of a kilobyte per message. */
export const TRACKING_SEND_INTERVAL_MS = 100;

/** Server-side floor on that interval, per connection. Above the send
 *  rate so normal jitter is never dropped; low enough that a client
 *  ignoring the interval cannot flood the room. */
export const TRACKING_MIN_INTERVAL_MS = 50;

/** How long a receiver keeps applying the last pose it got before
 *  deciding the sender has gone (left VR, crashed, lost connection) and
 *  letting the avatar's own animation take back over. */
export const TRACKING_STALE_MS = 1500;

/** Positions are in eye-heights, so 2.5 is a long way past any reach. */
const MAX_COORD = 2.5;
const DECIMALS = 1000;

const round = (value: number) => Math.round(value * DECIMALS) / DECIMALS;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function sanitizePoint(raw: unknown): TrackedPoint | null {
  if (!Array.isArray(raw) || raw.length !== 7) return null;
  if (!raw.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const [x, y, z, qx, qy, qz, qw] = raw as number[];
  // A zero-length quaternion has no orientation to normalise to, and is
  // never something a real headset reports.
  const length = Math.hypot(qx, qy, qz, qw);
  if (length < 1e-3) return null;
  return [
    round(clamp(x, -MAX_COORD, MAX_COORD)),
    round(clamp(y, -MAX_COORD, MAX_COORD)),
    round(clamp(z, -MAX_COORD, MAX_COORD)),
    round(qx / length),
    round(qy / length),
    round(qz / length),
    round(qw / length),
  ];
}

function sanitizeHand(raw: unknown): TrackedHand | null {
  if (!raw || typeof raw !== "object") return null;
  const hand = raw as { pose?: unknown; curl?: unknown };
  const pose = sanitizePoint(hand.pose);
  if (!pose) return null;
  const curl = Array.isArray(hand.curl) && hand.curl.length === 2 ? hand.curl : [0, 0];
  const [index, others] = curl.map((value) => (typeof value === "number" && Number.isFinite(value) ? round(clamp(value, 0, 1)) : 0));
  return { pose, curl: [index, others] };
}

/**
 * Validates and normalises a pose from the network.
 *
 * Returns `null` for "this player has stopped tracking" (they left VR),
 * and `undefined` for a malformed message, which the caller drops. The
 * distinction matters: a null has to reach every receiver so their avatar
 * stops holding the last pose, while garbage should reach nobody. Every
 * number is clamped as well as checked, because each one ends up as a bone
 * rotation on other people's screens, and a value outside any real range
 * folds an avatar through itself rather than merely looking wrong.
 */
export function sanitizeTrackedPose(raw: unknown): TrackedPose | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const pose = raw as { head?: unknown; left?: unknown; right?: unknown; height?: unknown };
  const head = sanitizePoint(pose.head);
  if (!head) return undefined;
  const height = typeof pose.height === "number" && Number.isFinite(pose.height) ? round(clamp(pose.height, 0.3, 1.1)) : 1;
  return { head, left: sanitizeHand(pose.left), right: sanitizeHand(pose.right), height };
}
