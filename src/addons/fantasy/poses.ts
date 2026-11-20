import type { HandTarget, Vec3 } from "../rig";
import { WEAPON_SPECS, type Weapon } from "./weapons";

/**
 * Fighting poses as a handful of keys each: where the weapon hand is, which
 * way the blade points, which way the hand itself points (wrist to
 * knuckles). Body frame, eye heights: x right, y up, z back (see rig.ts).
 * Played the same on every client from one small event, so a swing costs
 * the network a few bytes and the frame a little arithmetic.
 */
interface Key {
  at: number;
  pos: Vec3;
  blade: Vec3;
  fingers: Vec3;
}

/** "recoil": a swing bounced off a blade. "stagger": a guard that stopped a
 *  blow, knocked aside long enough for a quick follow-up to get in, so a
 *  raised guard can't simply be held up as a wall. */
export type ActionKind = "swing" | "special" | "shoot" | "recoil" | "stagger";

export interface Action {
  kind: ActionKind;
  /** Which swing of the combo (0 or 1). */
  n: number;
  /** When it started, in seconds (performance.now() / 1000). */
  start: number;
}

// --- blades: sword, katana, naginata, light saber ------------------------------

// The resting stance carries the blade low at the side, tip by the knee,
// out of the space between two fighters: only raising it (PARRY, below)
// puts it in the path of their swings.
const GUARD: Key = { at: 0, pos: [0.18, 0.54, -0.14], blade: [0.3, -0.85, -0.43], fingers: [0.05, -0.45, 0.9] };

const SWINGS: Key[][] = [
  // A diagonal cut, high right to low left.
  [
    GUARD,
    { at: 0.22, pos: [0.2, 0.95, -0.06], blade: [0.25, 0.55, 0.8], fingers: [0, 0.82, -0.57] },
    { at: 0.5, pos: [0.02, 0.76, -0.4], blade: [-0.25, 0.1, -0.96], fingers: [0, -1, 0] },
    { at: 0.75, pos: [-0.16, 0.5, -0.28], blade: [-0.7, -0.5, -0.5], fingers: [0.3, -0.85, 0.42] },
    { ...GUARD, at: 1 },
  ],
  // The backhand: flat, left to right.
  [
    GUARD,
    { at: 0.22, pos: [-0.14, 0.74, -0.16], blade: [-0.85, 0.25, -0.45], fingers: [0.1, -0.9, 0.3] },
    { at: 0.5, pos: [0.04, 0.76, -0.42], blade: [0.15, 0.2, -0.97], fingers: [0, -1, 0] },
    { at: 0.75, pos: [0.24, 0.74, -0.2], blade: [0.9, 0.25, -0.35], fingers: [0, -1, 0] },
    { ...GUARD, at: 1 },
  ],
];

// Guarding: the blade raised across the body at chest height, where an
// incoming blade is likely, not certain, to meet it.
const PARRY: Key = { at: 0, pos: [0.14, 0.82, -0.3], blade: [-0.96, 0.25, -0.1], fingers: [0.1, 0, -1] };

// Knocked back by a block: the blade thrown up and away, then on guard.
const RECOIL: Key[] = [{ at: 0, pos: [0.16, 0.9, -0.14], blade: [0.35, 0.85, 0.4], fingers: [0, 0.4, -0.9] }, { ...GUARD, at: 1 }];

// Raised high behind the head, then brought down in front.
const SLAM: Key[] = [
  GUARD,
  { at: 0.35, pos: [0.06, 1.1, -0.02], blade: [0, 0.45, 0.9], fingers: [0, 0.9, -0.45] },
  { at: 0.55, pos: [0.02, 0.55, -0.45], blade: [0, -0.45, -0.9], fingers: [0, -0.9, 0.45] },
  { at: 0.8, pos: [0.02, 0.55, -0.45], blade: [0, -0.45, -0.9], fingers: [0, -0.9, 0.45] },
  { ...GUARD, at: 1 },
];

// --- the bow -----------------------------------------------------------------
// The bow is in the left hand; the right draws the string to the cheek.

const BOW_LOW: Key = { at: 0, pos: [-0.14, 0.56, -0.16], blade: [0.2, 0.6, -0.77], fingers: [0, -0.8, -0.6] };
const BOW_UP: Key = { at: 0, pos: [-0.06, 0.84, -0.34], blade: [0, 1, 0], fingers: [0.1, 0, -1] };
const DRAWN: Key = { at: 0, pos: [0.02, 0.88, -0.05], blade: [0, 1, 0], fingers: [-0.3, 0, -1] };
const LOOSED: Key = { at: 0, pos: [0.09, 0.9, 0.02], blade: [0, 1, 0], fingers: [-0.1, 0.3, -1] };
const RIGHT_REST: Key = { at: 0, pos: [0.03, 0.8, -0.3], blade: [0, 1, 0], fingers: [-0.3, 0, -1] };

const at = (key: Key, time: number): Key => ({ ...key, at: time });
const BOW_HAND = (release: number): Key[] => [at(BOW_LOW, 0), at(BOW_UP, release * 0.55), at(BOW_UP, release + 0.15), at(BOW_LOW, 1)];
const DRAW_HAND = (release: number): Key[] => [at(RIGHT_REST, 0), at(DRAWN, release * 0.6), at(DRAWN, release), at(LOOSED, release + 0.08), at(RIGHT_REST, 1)];

/** Seconds each action takes, and the moment in it that counts (the blade
 *  meeting its target, the arrow leaving the string), as a fraction. */
export const TIMING: Record<ActionKind, { duration: number; impact: number; trail: [number, number] }> = {
  swing: { duration: 0.42, impact: 0.5, trail: [0.28, 0.74] },
  special: { duration: 0.75, impact: 0.56, trail: [0.4, 0.62] },
  shoot: { duration: 0.6, impact: 0.5, trail: [0, 0] },
  recoil: { duration: 0.3, impact: 0, trail: [0, 0] },
  stagger: { duration: 0.75, impact: 0, trail: [0, 0] },
};
/** A bow's special draws longer before it looses. */
export const BOW_SPECIAL = { duration: 1.0, impact: 0.7 };

const BOW_SPECIAL_TIMING = { ...TIMING.shoot, ...BOW_SPECIAL };
export function timingOf(weapon: Weapon, kind: ActionKind) {
  if (weapon === "bow") return kind === "special" ? BOW_SPECIAL_TIMING : TIMING.shoot;
  return TIMING[kind];
}

/** Bow and drawing hand for a shot, and for a special's longer draw. */
const BOW_TRACKS = [TIMING.shoot.impact, BOW_SPECIAL.impact].map((release) => ({ bow: BOW_HAND(release), draw: DRAW_HAND(release) }));

const smooth = (x: number) => x * x * (3 - 2 * x);

function sample(keys: Key[], time: number, out: HandTarget) {
  let i = 0;
  while (i < keys.length - 2 && time > keys[i + 1].at) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(1e-6, b.at - a.at);
  const s = smooth(Math.min(1, Math.max(0, (time - a.at) / span)));
  for (let k = 0; k < 3; k++) {
    out.pos[k] = a.pos[k] + (b.pos[k] - a.pos[k]) * s;
    out.blade[k] = a.blade[k] + (b.blade[k] - a.blade[k]) * s;
    out.fingers[k] = a.fingers[k] + (b.fingers[k] - a.fingers[k]) * s;
  }
  return out;
}

const copy = (key: Key, out: HandTarget) => {
  for (let k = 0; k < 3; k++) {
    out.pos[k] = key.pos[k];
    out.blade[k] = key.blade[k];
    out.fingers[k] = key.fingers[k];
  }
  return out;
};

export interface HeldPose {
  right: HandTarget | null;
  left: HandTarget | null;
  /** Whether the blade is moving fast enough to leave a trail. */
  trail: boolean;
}

const newTarget = (): HandTarget => ({ pos: [0, 0, 0], blade: [0, 1, 0], fingers: [0, 0, -1] });

/**
 * Where the hands are for a weapon at a moment: on guard, or partway
 * through an action. Writes into `out` (pass the same one every frame).
 */
export function heldPose(weapon: Weapon, action: Action | null, now: number, out: HeldPose = { right: newTarget(), left: newTarget(), trail: false }, guard = false): HeldPose {
  const right = out.right ?? newTarget();
  const left = out.left ?? newTarget();
  const timing = action ? timingOf(weapon, action.kind) : null;
  const time = action && timing ? (now - action.start) / timing.duration : 1;
  const active = action !== null && time < 1;

  if (weapon === "bow") {
    if (active) {
      const tracks = BOW_TRACKS[action!.kind === "special" ? 1 : 0];
      sample(tracks.bow, time, left);
      sample(tracks.draw, time, right);
    } else copy(BOW_LOW, left);
    out.left = left;
    out.right = active ? right : null;
    out.trail = false;
    return out;
  }

  const keys = !active ? null : action!.kind === "special" ? SLAM : action!.kind === "recoil" || action!.kind === "stagger" ? RECOIL : SWINGS[action!.n % SWINGS.length];
  if (keys) sample(keys, time, right);
  else copy(guard ? PARRY : GUARD, right);
  out.right = right;
  out.trail = active && timing !== null && time >= timing.trail[0] && time <= timing.trail[1];

  const other = WEAPON_SPECS[weapon].otherHand;
  if (other === null) out.left = null;
  else {
    // The other hand further down the same grip, holding the same way. The
    // blade is normalized first, so the spacing stays true mid-blend.
    const length = Math.hypot(...right.blade) || 1;
    for (let k = 0; k < 3; k++) {
      left.pos[k] = right.pos[k] - (right.blade[k] / length) * other;
      left.blade[k] = right.blade[k];
      left.fingers[k] = right.fingers[k];
    }
    out.left = left;
  }
  return out;
}
