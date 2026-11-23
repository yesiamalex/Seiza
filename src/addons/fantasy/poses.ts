import { copyBody, key as bodyKey, sampleBody, type BodyKey, type BodyPose } from "../body";
import type { HandTarget, Vec3 } from "../rig";
import { isPole, WEAPON_SPECS, type Element, type Weapon } from "./weapons";

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
  /** How closed the hand is (a fist, if not said): open for a gesture. */
  curl?: number;
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
// At rest, a low guard: the tip forward and down, ahead of the knees. Hung
// straight down, a long blade went through the thigh and into the floor,
// and from your own eyes it seemed to point back at you.
const GUARD: Key = { at: 0, pos: [0.19, 0.55, -0.17], blade: [0.28, -0.58, -0.76], fingers: [0.18, -0.76, 0.63] };
// A naginata rests upright at the right side, blade high, in one hand: held
// like a sword's guard, its long shaft ran up past the face.
const POLE_REST: Key = { at: 0, pos: [0.2, 0.6, -0.12], blade: [0.04, 0.98, -0.18], fingers: [-0.2, 0, -1] };

/** The cuts a blade can make. Each weapon strings some of them into its
 *  own combo (SWING_SETS), so no two weapons fight alike. */
export type Cut = "diagonal" | "backhand" | "thrust" | "rising" | "overhead" | "cast";

const CUTS: Record<Cut, Key[]> = {
  // High right to low left.
  diagonal: [
    GUARD,
    { at: 0.22, pos: [0.2, 0.95, -0.06], blade: [0.25, 0.55, 0.8], fingers: [0, 0.82, -0.57] },
    { at: 0.5, pos: [0.02, 0.76, -0.4], blade: [-0.25, 0.1, -0.96], fingers: [0, -1, 0] },
    { at: 0.75, pos: [-0.16, 0.5, -0.28], blade: [-0.7, -0.5, -0.5], fingers: [0.3, -0.85, 0.42] },
    { ...GUARD, at: 1 },
  ],
  // Flat, left to right.
  backhand: [
    GUARD,
    { at: 0.22, pos: [-0.14, 0.74, -0.16], blade: [-0.85, 0.25, -0.45], fingers: [0.1, -0.9, 0.3] },
    { at: 0.5, pos: [0.04, 0.76, -0.42], blade: [0.15, 0.2, -0.97], fingers: [0, -1, 0] },
    { at: 0.75, pos: [0.24, 0.74, -0.2], blade: [0.9, 0.25, -0.35], fingers: [0, -1, 0] },
    { ...GUARD, at: 1 },
  ],
  // Drawn back to the hip, then driven straight ahead.
  thrust: [
    GUARD,
    { at: 0.26, pos: [0.22, 0.66, 0.04], blade: [0.08, 0.06, -1], fingers: [0, -1, 0] },
    { at: 0.5, pos: [0.05, 0.75, -0.56], blade: [0, 0.04, -1], fingers: [0, -1, 0] },
    { at: 0.72, pos: [0.06, 0.74, -0.52], blade: [0.02, 0.02, -1], fingers: [0, -1, 0] },
    { ...GUARD, at: 1 },
  ],
  // Low left, up and across to high right.
  rising: [
    GUARD,
    { at: 0.24, pos: [-0.12, 0.5, -0.24], blade: [-0.55, -0.6, -0.58], fingers: [0.35, -0.5, -0.8] },
    { at: 0.5, pos: [0.06, 0.8, -0.44], blade: [0.3, 0.45, -0.84], fingers: [0, -0.9, -0.4] },
    { at: 0.75, pos: [0.24, 1.0, -0.16], blade: [0.6, 0.78, 0.15], fingers: [0.2, 0.2, -1] },
    { ...GUARD, at: 1 },
  ],
  // A cast, with a rod: raised, then pointed out at the target, the orb
  // leading, and held while the bolt goes.
  cast: [
    GUARD,
    { at: 0.28, pos: [0.2, 0.92, -0.08], blade: [0.1, 0.95, 0.25], fingers: [-0.2, 0, -1] },
    { at: 0.5, pos: [0.12, 0.88, -0.4], blade: [0, 0.35, -0.94], fingers: [0, -0.94, -0.35] },
    { at: 0.72, pos: [0.12, 0.88, -0.38], blade: [0, 0.35, -0.94], fingers: [0, -0.94, -0.35] },
    { ...GUARD, at: 1 },
  ],
  // Straight down from overhead.
  overhead: [
    GUARD,
    { at: 0.26, pos: [0.07, 1.08, -0.06], blade: [0, 0.6, 0.8], fingers: [0, 0.8, -0.6] },
    { at: 0.5, pos: [0.04, 0.72, -0.46], blade: [0, -0.2, -0.98], fingers: [0, -0.98, 0.2] },
    { at: 0.74, pos: [0.04, 0.56, -0.4], blade: [0, -0.62, -0.78], fingers: [0, -0.78, 0.62] },
    { ...GUARD, at: 1 },
  ],
};

/**
 * Each blade's combo, in order. The sword is the all-rounder; the katana
 * opens with the overhead cut and answers with a diagonal and a rising
 * one; the naginata sweeps and thrusts at range; the light saber, the
 * fastest, chains four.
 */
export const SWING_SETS: Record<Exclude<Weapon, "bow">, Cut[]> = {
  sword: ["diagonal", "backhand", "thrust"],
  katana: ["overhead", "diagonal", "rising"],
  naginata: ["backhand", "diagonal", "overhead"],
  scythe: ["diagonal", "backhand", "overhead"],
  rod: ["cast"],
  lightsaber: ["diagonal", "backhand", "rising", "thrust"],
};

/** The bow's shots, by turns: standing, kneeling low, and canted. */
export type Shot = "standing" | "kneeling" | "canted";
export const SHOTS: Shot[] = ["standing", "kneeling", "canted"];

/** Combo numbers run 0 to COMBO_CYCLE - 1, a multiple of every set's
 *  length, so each weapon's sequence comes round evenly. */
export const COMBO_CYCLE = 12;

export function cutOf(weapon: Exclude<Weapon, "bow">, n: number): Cut {
  const set = SWING_SETS[weapon];
  return set[((n % set.length) + set.length) % set.length];
}

// Guarding: the blade raised across the body at chest height, where an
// incoming blade is likely, not certain, to meet it.
const PARRY: Key = { at: 0, pos: [0.14, 0.82, -0.3], blade: [-0.96, 0.25, -0.1], fingers: [0.1, 0, -1] };
// A naginata's: the shaft across the chest, blade out to the right.
const POLE_PARRY: Key = { at: 0, pos: [0.16, 0.84, -0.3], blade: [0.96, 0.25, -0.12], fingers: [0, 0, -1] };
/** Weapons that rest upright at the side: the long hafts, and the rod. */
const upright = (weapon: Weapon) => isPole(weapon) || weapon === "rod";
const restOf = (weapon: Weapon) => (upright(weapon) ? POLE_REST : GUARD);
const parryOf = (weapon: Weapon) => (upright(weapon) ? POLE_PARRY : PARRY);

// Knocked back by a block: the blade thrown up and away, then on guard.
const RECOIL: Key[] = [{ at: 0, pos: [0.16, 0.9, -0.14], blade: [0.35, 0.85, 0.4], fingers: [0, 0.4, -0.9] }, { ...GUARD, at: 1 }];

/** Every blade's moves, and a pole's, which start from and end at its own
 *  rest instead of the sword's. */
const fromRest = (keys: Key[], rest: Key) => keys.map((k) => (k.pos === GUARD.pos ? { ...rest, at: k.at } : k));
const BLADE_KEYS = { cuts: CUTS, recoil: RECOIL };
// Raised for a pole's overhead blow, the blade goes back over the right
// shoulder: straight up, its long shaft came down in front of the face.
const OVER_SHOULDER = { pos: [0.16, 0.96, -0.08] as Vec3, blade: [0.25, 0.55, 0.8] as Vec3, fingers: [0, 0.82, -0.57] as Vec3 };
const raised = (keys: Key[]) => keys.map((k, i) => (i === 1 ? { ...k, ...OVER_SHOULDER } : k));
const POLE_KEYS = {
  cuts: Object.fromEntries(Object.entries(CUTS).map(([cut, keys]) => [cut, fromRest(cut === "overhead" ? raised(keys) : keys, POLE_REST)])) as Record<Cut, Key[]>,
  recoil: fromRest(RECOIL, POLE_REST),
};

// --- the bow -----------------------------------------------------------------
// The bow is in the left hand, the arm straight out; the right draws the
// string right back to the ear.

const BOW_LOW: Key = { at: 0, pos: [-0.14, 0.56, -0.16], blade: [0.2, 0.6, -0.77], fingers: [0, -0.8, -0.6] };
const BOW_UP: Key = { at: 0, pos: [-0.07, 0.85, -0.38], blade: [0, 1, 0], fingers: [0.1, 0, -1] };
const DRAWN: Key = { at: 0, pos: [0.07, 0.9, 0.07], blade: [0, 1, 0], fingers: [-0.3, 0, -1] };
const LOOSED: Key = { at: 0, pos: [0.13, 0.92, 0.11], blade: [0, 1, 0], fingers: [-0.1, 0.3, -1] };
const RIGHT_REST: Key = { at: 0, pos: [0.03, 0.8, -0.3], blade: [0, 1, 0], fingers: [-0.3, 0, -1] };

// A canted shot: the bow tipped over to the right, the draw following it.
const BOW_CANT: Key = { at: 0, pos: [-0.06, 0.83, -0.38], blade: [0.5, 0.86, 0], fingers: [0.1, 0, -1] };
const DRAWN_CANT: Key = { at: 0, pos: [0.09, 0.87, 0.06], blade: [0.5, 0.86, 0], fingers: [-0.3, 0, -1] };

const at = (key: Key, time: number): Key => ({ ...key, at: time });
const BOW_HAND = (release: number, up = BOW_UP): Key[] => [at(BOW_LOW, 0), at(up, release * 0.55), at(up, release + 0.15), at(BOW_LOW, 1)];
const DRAW_HAND = (release: number, drawn = DRAWN): Key[] => [at(RIGHT_REST, 0), at(drawn, release * 0.6), at(drawn, release), at(LOOSED, release + 0.08), at(RIGHT_REST, 1)];

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
/** A rod's cast is slower than a swing: the bolt is magic, not muscle. */
const CAST_TIMING = { duration: 0.6, impact: 0.5, trail: [0, 0] as [number, number] };

export function timingOf(weapon: Weapon, kind: ActionKind) {
  if (weapon === "bow") return kind === "special" ? BOW_SPECIAL_TIMING : TIMING.shoot;
  if (weapon === "rod" && kind === "swing") return CAST_TIMING;
  return TIMING[kind];
}

/** Bow and drawing hand for each shot (a kneeling shot's hands are a
 *  standing one's; the body lowers them), and for a special's longer draw. */
const BOW_TRACKS: Record<Shot | "special", { bow: Key[]; draw: Key[] }> = {
  standing: { bow: BOW_HAND(TIMING.shoot.impact), draw: DRAW_HAND(TIMING.shoot.impact) },
  kneeling: { bow: BOW_HAND(TIMING.shoot.impact), draw: DRAW_HAND(TIMING.shoot.impact) },
  canted: { bow: BOW_HAND(TIMING.shoot.impact, BOW_CANT), draw: DRAW_HAND(TIMING.shoot.impact, DRAWN_CANT) },
  special: { bow: BOW_HAND(BOW_SPECIAL.impact), draw: DRAW_HAND(BOW_SPECIAL.impact) },
};
const shotOf = (action: Action) => (action.kind === "special" ? "special" : SHOTS[action.n % SHOTS.length]);

/**
 * How far the bow's string is drawn, 0 to 1, for an action at a moment:
 * pulled back with the drawing hand, held, and snapped forward at release.
 * The string follows the hand only while this is above 0.
 */
export function bowDraw(action: Action | null, now: number): number {
  if (!action) return 0;
  const timing = timingOf("bow", action.kind);
  const t = (now - action.start) / timing.duration;
  if (t < 0 || t >= timing.impact) return 0;
  return Math.min(1, t / (timing.impact * 0.6));
}

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
  out.curl = (a.curl ?? 1) + ((b.curl ?? 1) - (a.curl ?? 1)) * s;
  return out;
}

const copy = (key: Key, out: HandTarget) => {
  for (let k = 0; k < 3; k++) {
    out.pos[k] = key.pos[k];
    out.blade[k] = key.blade[k];
    out.fingers[k] = key.fingers[k];
  }
  out.curl = key.curl ?? 1;
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
export function heldPose(weapon: Weapon, action: Action | null, now: number, out: HeldPose = { right: newTarget(), left: newTarget(), trail: false }, guard = false, element: Element = "spectro"): HeldPose {
  const right = out.right ?? newTarget();
  const left = out.left ?? newTarget();
  const timing = action ? timingOf(weapon, action.kind) : null;
  const time = action && timing ? (now - action.start) / timing.duration : 1;
  const active = action !== null && time < 1;

  if (weapon === "bow") {
    if (active) {
      const tracks = BOW_TRACKS[shotOf(action!)];
      sample(tracks.bow, time, left);
      sample(tracks.draw, time, right);
    } else copy(BOW_LOW, left);
    out.left = left;
    out.right = active ? right : null;
    out.trail = false;
    return out;
  }

  const set = upright(weapon) ? POLE_KEYS : BLADE_KEYS;
  const move = active && action!.kind === "special" ? movesFor(weapon)[element] : null;
  const keys = !active ? null : move ? move.right : action!.kind === "recoil" || action!.kind === "stagger" ? set.recoil : set.cuts[cutOf(weapon, action!.n)];
  if (keys) sample(keys, time, right);
  else copy(guard ? parryOf(weapon) : restOf(weapon), right);
  out.right = right;
  out.trail = active && timing !== null && time >= timing.trail[0] && time <= timing.trail[1];

  // Two-handed weapons rest in one hand, the other at the side: reaching
  // it across to the grip at the hip put the arm through the belly. Both
  // hands come on to guard and to cut.
  const other = WEAPON_SPECS[weapon].otherHand;
  if (move && move.left && (other === null || move.free)) {
    // A special's gesture: the other hand off the grip, or free already.
    sample(move.left, time, left);
    out.left = left;
    return out;
  }
  // A one-handed weapon's special without a gesture is held in both hands.
  // (letting go just before the end, so it comes back to rest one-handed).
  const gap = other ?? (move && time < 0.9 ? ONE_HAND_GRIP : null);
  if (gap === null || (!active && !guard)) out.left = null;
  else {
    // The other hand further down the same grip, holding the same way. The
    // blade is normalized first, so the spacing stays true mid-blend.
    const length = Math.hypot(...right.blade) || 1;
    for (let k = 0; k < 3; k++) {
      left.pos[k] = right.pos[k] - (right.blade[k] / length) * gap;
      left.blade[k] = right.blade[k];
      left.fingers[k] = right.fingers[k];
    }
    left.curl = 1;
    clearOfBody(right, left);
    out.left = left;
  }
  return out;
}
/** Both hands on a one-handed hilt, the second just below the first. */
const ONE_HAND_GRIP = 0.085;

/** The front of the torso, in eye heights: half its width, how far in
 *  front of the body's centre line its middle is, and the heights it spans. */
const TORSO = { halfWidth: 0.2, front: 0.12, bottom: 0.42, top: 1.0 };
/** Room for the fist itself, and the forearm behind it. */
const FIST = 0.07;

/**
 * Moves a two-handed grip forward, both hands together so the grip stays
 * whole, until neither hand is inside the torso. A pole held across the
 * body put its lower hand through the chest otherwise, on a slim avatar
 * most of all. The torso's front is taken as an ellipse, deepest at the
 * middle.
 */
export function clearOfBody(right: HandTarget, left: HandTarget) {
  let push = 0;
  for (const hand of [right, left]) {
    const [x, y, z] = hand.pos;
    if (y < TORSO.bottom || y > TORSO.top) continue;
    const across = x / TORSO.halfWidth;
    if (Math.abs(across) >= 1) continue;
    const surface = -TORSO.front * Math.sqrt(1 - across * across) - FIST;
    push = Math.max(push, z - surface);
  }
  if (push <= 0) return;
  right.pos[2] -= push;
  left.pos[2] -= push;
}

// --- the body ------------------------------------------------------------------
// Timed to the hand keys above, so the arm and the body arrive together.
// Twist turns the chest to the right; feet are [right, back, lift] from
// where the animation stands them; all in eye heights (see ../body.ts).
// A blade is held in the right hand, so the left foot leads.

const STANCE = bodyKey(0, { twist: 0.18, lean: 0.05, drop: 0.035, shiftZ: 0.01, left: [-0.015, -0.07, 0], right: [0.02, 0.07, 0] });
const stance = (at: number) => ({ ...STANCE, at });
// Raised to guard: square to the blow, a little lower.
const PARRY_BODY = bodyKey(0, { twist: 0.04, lean: 0.07, drop: 0.055, left: [-0.02, -0.08, 0], right: [0.03, 0.08, 0] });

const CUT_BODY: Record<Cut, BodyKey[]> = {
  // Wound up to the right, then a step in on the front foot as the chest
  // turns through.
  diagonal: [
    stance(0),
    bodyKey(0.22, { twist: 0.5, lean: -0.04, drop: 0.03, shiftX: 0.01, shiftZ: 0.03, left: [-0.015, -0.07, 0], right: [0.02, 0.08, 0] }),
    bodyKey(0.5, { twist: -0.35, lean: 0.24, drop: 0.075, shiftZ: -0.07, left: [-0.02, -0.17, 0], right: [0.02, 0.07, 0] }),
    bodyKey(0.75, { twist: -0.5, lean: 0.2, drop: 0.07, shiftZ: -0.06, left: [-0.02, -0.17, 0], right: [0.02, 0.06, 0] }),
    stance(1),
  ],
  // Wound to the left, then the back foot steps through.
  backhand: [
    stance(0),
    bodyKey(0.22, { twist: -0.45, lean: 0.06, drop: 0.04, shiftX: -0.01, left: [-0.015, -0.07, 0], right: [0.02, 0.07, 0] }),
    bodyKey(0.5, { twist: 0.3, lean: 0.2, drop: 0.07, shiftZ: -0.05, left: [-0.02, -0.07, 0], right: [0.04, -0.06, 0] }),
    bodyKey(0.75, { twist: 0.5, lean: 0.14, drop: 0.06, shiftZ: -0.04, left: [-0.02, -0.07, 0], right: [0.04, -0.06, 0] }),
    stance(1),
  ],
  // Coiled back on the rear foot, then a long lunge behind the point.
  thrust: [
    stance(0),
    bodyKey(0.26, { twist: 0.4, lean: -0.03, drop: 0.05, shiftZ: 0.04, left: [-0.015, -0.07, 0], right: [0.02, 0.1, 0] }),
    bodyKey(0.5, { twist: -0.1, lean: 0.26, drop: 0.1, shiftZ: -0.11, left: [-0.02, -0.22, 0], right: [0.02, 0.1, 0] }),
    bodyKey(0.72, { twist: -0.08, lean: 0.24, drop: 0.1, shiftZ: -0.1, left: [-0.02, -0.22, 0], right: [0.02, 0.1, 0] }),
    stance(1),
  ],
  // Crouched low to the left, then rising and turning up through the cut.
  rising: [
    stance(0),
    bodyKey(0.24, { twist: -0.35, lean: 0.14, drop: 0.09, shiftX: -0.01, left: [-0.02, -0.09, 0], right: [0.03, 0.08, 0] }),
    bodyKey(0.5, { twist: 0.2, lean: 0.06, drop: 0.04, shiftZ: -0.04, left: [-0.02, -0.14, 0], right: [0.03, 0.06, 0] }),
    bodyKey(0.75, { twist: 0.45, lean: -0.05, drop: 0.01, tilt: -0.05, shiftZ: -0.03, left: [-0.02, -0.14, 0], right: [0.03, 0.06, 0] }),
    stance(1),
  ],
  // A cast: drawn up and back a little, then a step into it, leaning in.
  cast: [
    stance(0),
    bodyKey(0.28, { twist: 0.15, lean: -0.06, drop: 0.02, left: [-0.015, -0.07, 0], right: [0.02, 0.08, 0] }),
    bodyKey(0.5, { twist: -0.05, lean: 0.14, drop: 0.04, shiftZ: -0.04, left: [-0.02, -0.13, 0], right: [0.02, 0.07, 0] }),
    bodyKey(0.72, { twist: -0.05, lean: 0.12, drop: 0.04, shiftZ: -0.04, left: [-0.02, -0.13, 0], right: [0.02, 0.07, 0] }),
    stance(1),
  ],
  // Up tall with the blade overhead, then a short step and drop into it.
  overhead: [
    stance(0),
    bodyKey(0.26, { twist: 0.08, lean: -0.1, drop: 0, shiftZ: 0.02, left: [-0.015, -0.07, 0], right: [0.02, 0.08, 0] }),
    bodyKey(0.5, { twist: 0, lean: 0.3, drop: 0.08, shiftZ: -0.07, left: [-0.02, -0.16, 0], right: [0.02, 0.07, 0] }),
    bodyKey(0.74, { twist: 0, lean: 0.28, drop: 0.08, shiftZ: -0.06, left: [-0.02, -0.16, 0], right: [0.02, 0.07, 0] }),
    stance(1),
  ],
};

// Bounced off a blade: rocked back onto the back foot.
const RECOIL_BODY: BodyKey[] = [stance(0), bodyKey(0.25, { twist: 0.35, lean: -0.14, drop: 0.03, shiftZ: 0.05, left: [-0.015, -0.06, 0], right: [0.02, 0.12, 0] }), stance(1)];
// A guard knocked aside: thrown further, and a step back to recover.
const STAGGER_BODY: BodyKey[] = [
  stance(0),
  bodyKey(0.2, { twist: 0.4, lean: -0.2, tilt: 0.08, drop: 0.05, shiftZ: 0.08, left: [-0.02, 0.02, 0], right: [0.03, 0.16, 0] }),
  bodyKey(0.5, { twist: 0.3, lean: -0.1, tilt: 0.04, drop: 0.05, shiftZ: 0.06, left: [-0.02, 0.02, 0], right: [0.03, 0.16, 0] }),
  stance(1),
];

// The bow: side-on to the target, the chest turning further as it draws.
// The hands keep their aim (carry 0) while the chest turns under them.
const ARCHER = bodyKey(0, { twist: -0.15, drop: 0.02, left: [-0.02, -0.05, 0], right: [0.03, 0.05, 0], carry: 0, head: 0.85 });
const archer = (at: number) => ({ ...ARCHER, at });
const archerDrawn = (at: number, deeper = 0) =>
  bodyKey(at, { twist: -0.55, lean: -0.03, drop: 0.03 + deeper, left: [-0.03, -0.08, 0], right: [0.04, 0.07, 0], carry: 0, head: 0.85 });
const archerLoosed = (at: number, kick = 0) =>
  bodyKey(at, { twist: -0.5, lean: -0.06 - kick, drop: 0.03, shiftZ: 0.02 + kick * 0.3, left: [-0.03, -0.08, 0], right: [0.04, 0.07, 0], carry: 0, head: 0.85 });
const shoot = (release: number, deeper = 0, kick = 0, drawn = archerDrawn) => [archer(0), drawn(release * 0.6, deeper), drawn(release, deeper), archerLoosed(release + 0.12, kick), archer(1)];
// Down on one knee: the back knee near the ground, the front foot forward.
const kneelDrawn = (at: number) =>
  bodyKey(at, { twist: -0.5, lean: 0.04, drop: 0.24, shiftZ: 0.03, left: [-0.03, -0.18, 0], right: [0.04, 0.16, 0], carry: 0, head: 0.85 });
// Canted: the chest leaning over with the bow, a step out to the right.
const cantDrawn = (at: number) =>
  bodyKey(at, { twist: -0.45, lean: 0, tilt: 0.12, drop: 0.05, shiftX: 0.02, left: [-0.03, -0.08, 0], right: [0.1, 0.05, 0], carry: 0, head: 0.85 });
const BOW_BODY: Record<Shot | "special", BodyKey[]> = {
  standing: shoot(TIMING.shoot.impact),
  kneeling: shoot(TIMING.shoot.impact, 0, 0, kneelDrawn),
  canted: shoot(TIMING.shoot.impact, 0, 0, cantDrawn),
  special: shoot(BOW_SPECIAL.impact, 0.04, 0.06),
};

// --- specials: a move for each element ----------------------------------------------
// The weapon hand, the other hand, and the body, timed to the special's
// moment (TIMING.special.impact, 0.56). Where the other hand makes the
// gesture (light let go from the palm, fire thrust from it, a palm pressed
// to the ground), a two-handed weapon is held in one hand for it; the rest
// keep both hands on the grip, and with a one-handed weapon raise the
// other hand with it.

/** The free hand hanging easy at the side, where its gestures start and end. */
const HAND_DOWN: Key = { at: 0, pos: [-0.2, 0.52, -0.08], blade: [0.2, 0, -1], fingers: [0, -1, 0], curl: 0.4 };
/** An open left hand: palm out ahead (thumb in), palm down, palm up. */
const PALM_OUT = { blade: [1, 0, 0] as Vec3, fingers: [0, 1, 0] as Vec3, curl: 0.05 };
const PALM_DOWN = { blade: [1, 0, 0] as Vec3, fingers: [0, 0, -1] as Vec3, curl: 0.1 };
const PALM_UP = { blade: [-1, 0, 0] as Vec3, fingers: [0, 0.3, -1] as Vec3, curl: 0.1 };
/** A blade held out of a gesture's way, low at the right, tip down; and
 *  out wide and back, clear of a crouch. */
const ASIDE: Key = { at: 0, pos: [0.26, 0.62, -0.06], blade: [0.35, -0.85, 0.2], fingers: [0, -0.25, 1] };
const WIDE: Key = { at: 0, pos: [0.3, 0.74, 0.02], blade: [0.8, -0.3, 0.5], fingers: [0, -1, 0] };
/** Overhead, the blade back behind the head. */
const OVERHEAD: Key = { at: 0, pos: [0.06, 1.12, -0.06], blade: [0, 0.5, 0.86], fingers: [0, 0.86, -0.5] };
/** Held straight up to the sky; and swept up there at the end of Aero's rise. */
const SKYWARD: Key = { at: 0, pos: [0.16, 1.18, -0.2], blade: [0.04, 1, -0.05], fingers: [0, 0, -1] };
const SWEPT_UP: Key = { at: 0, pos: [0.16, 1.1, -0.22], blade: [0.25, 0.96, -0.1], fingers: [0, 0.1, -1] };

const STANCE_FEET = { left: [-0.015, -0.07, 0] as [number, number, number], right: [0.02, 0.07, 0] as [number, number, number] };
const pose = (time: number, parts: Partial<BodyPose>) => bodyKey(time, { ...STANCE_FEET, ...parts });
const LUNGE_FEET = { left: [-0.03, -0.2, 0] as [number, number, number], right: [0.03, 0.12, 0] as [number, number, number] };

interface Move {
  /** The weapon hand, from the weapon's rest and back to it. */
  right: Key[];
  /** The other hand's gesture: always with a one-handed weapon, and with a
   *  two-handed one if `free`. Null: on the grip. */
  left: Key[] | null;
  free: boolean;
  body: BodyKey[];
}

const MOVES: Record<Element, Move> = {
  // Spectro: light let go from the open palm, swept from left to right as
  // the chest turns through, the blade held aside.
  spectro: {
    right: [GUARD, at(ASIDE, 0.3), at(ASIDE, 0.8), { ...GUARD, at: 1 }],
    left: [at(HAND_DOWN, 0), { at: 0.3, pos: [-0.36, 0.86, -0.22], ...PALM_OUT }, { at: 0.56, pos: [-0.02, 0.88, -0.42], ...PALM_OUT }, { at: 0.76, pos: [0.14, 0.86, -0.34], ...PALM_OUT }, at(HAND_DOWN, 1)],
    free: true,
    body: [
      stance(0),
      pose(0.3, { twist: -0.45, lean: 0.02, drop: 0.05, carry: 0.3 }),
      pose(0.56, { twist: 0.2, lean: 0.14, drop: 0.07, shiftZ: -0.04, carry: 0.3, left: [-0.02, -0.14, 0] }),
      pose(0.76, { twist: 0.42, lean: 0.1, drop: 0.06, carry: 0.3, left: [-0.02, -0.14, 0] }),
      stance(1),
    ],
  },
  // Havoc: up onto the toes, the weapon overhead in both hands, then a
  // plunge, driving it down into the ground in a deep crouch.
  havoc: {
    right: [GUARD, at(OVERHEAD, 0.3), at(OVERHEAD, 0.44), { at: 0.56, pos: [0.04, 0.6, -0.4], blade: [0.02, -0.98, -0.16], fingers: [0, -0.16, 0.98] }, { at: 0.82, pos: [0.04, 0.6, -0.4], blade: [0.02, -0.98, -0.16], fingers: [0, -0.16, 0.98] }, { ...GUARD, at: 1 }],
    left: null,
    free: false,
    body: [
      stance(0),
      pose(0.3, { lean: -0.16, drop: -0.015, shiftZ: 0.02 }),
      pose(0.44, { lean: -0.16, drop: -0.015, shiftZ: 0.02 }),
      pose(0.56, { lean: 0.5, drop: 0.25, shiftZ: -0.1, ...LUNGE_FEET }),
      pose(0.82, { lean: 0.44, drop: 0.23, shiftZ: -0.09, ...LUNGE_FEET }),
      stance(1),
    ],
  },
  // Aero: crouched low, the weapon and the open palm down by the left knee,
  // then sweeping up and rising onto the toes, calling the wind up.
  aero: {
    right: [GUARD, { at: 0.28, pos: [-0.08, 0.48, -0.3], blade: [-0.45, -0.55, -0.7], fingers: [0.3, -0.7, 0.6] }, at(SWEPT_UP, 0.56), at(SWEPT_UP, 0.8), { ...GUARD, at: 1 }],
    left: [at(HAND_DOWN, 0), { at: 0.28, pos: [-0.16, 0.5, -0.3], ...PALM_UP }, { at: 0.56, pos: [-0.2, 1.06, -0.2], ...PALM_UP }, { at: 0.8, pos: [-0.2, 1.06, -0.2], ...PALM_UP }, at(HAND_DOWN, 1)],
    free: false,
    body: [stance(0), pose(0.28, { twist: -0.22, lean: 0.24, drop: 0.14 }), pose(0.56, { twist: 0.15, lean: -0.14, drop: -0.02, tilt: -0.04 }), pose(0.8, { twist: 0.1, lean: -0.1 }), stance(1)],
  },
  // Electro: the weapon held up to the sky, arched back, looking up as
  // the lightning is called down.
  electro: {
    right: [GUARD, at(SKYWARD, 0.35), at(SKYWARD, 0.75), { ...GUARD, at: 1 }],
    left: [at(HAND_DOWN, 0), { at: 0.35, pos: [-0.18, 1.12, -0.16], ...PALM_OUT }, { at: 0.75, pos: [-0.18, 1.12, -0.16], ...PALM_OUT }, at(HAND_DOWN, 1)],
    free: false,
    body: [stance(0), pose(0.35, { lean: -0.18, drop: -0.012, head: 0.15 }), pose(0.56, { lean: -0.1, drop: 0.05, head: 0.3 }), pose(0.75, { lean: -0.08, drop: 0.05, head: 0.4 }), stance(1)],
  },
  // Fusion: the open hand drawn back to the chest, then thrust out, the
  // shoulder behind it, fire let go from the palm.
  fusion: {
    right: [GUARD, at(ASIDE, 0.3), at(ASIDE, 0.8), { ...GUARD, at: 1 }],
    left: [at(HAND_DOWN, 0), { at: 0.3, pos: [-0.18, 0.78, -0.02], ...PALM_OUT }, { at: 0.56, pos: [-0.04, 0.84, -0.46], ...PALM_OUT }, { at: 0.8, pos: [-0.04, 0.84, -0.46], ...PALM_OUT }, at(HAND_DOWN, 1)],
    free: true,
    body: [
      stance(0),
      pose(0.3, { twist: 0.4, lean: -0.04, drop: 0.05, shiftZ: 0.03, carry: 0.3 }),
      pose(0.56, { twist: -0.35, lean: 0.18, drop: 0.08, shiftZ: -0.07, carry: 0.3, left: [-0.02, -0.18, 0] }),
      pose(0.8, { twist: -0.3, lean: 0.15, drop: 0.07, shiftZ: -0.06, carry: 0.3, left: [-0.02, -0.18, 0] }),
      stance(1),
    ],
  },
  // Glacio: the palm raised, then brought down flat to the ground in a
  // low crouch, the weapon out wide, as the ice comes up.
  glacio: {
    right: [GUARD, at(WIDE, 0.3), at(WIDE, 0.82), { ...GUARD, at: 1 }],
    left: [at(HAND_DOWN, 0), { at: 0.3, pos: [-0.08, 0.92, -0.26], ...PALM_DOWN }, { at: 0.56, pos: [-0.06, 0.46, -0.26], ...PALM_DOWN }, { at: 0.82, pos: [-0.06, 0.46, -0.26], ...PALM_DOWN }, at(HAND_DOWN, 1)],
    free: true,
    body: [
      stance(0),
      pose(0.3, { lean: -0.05 }),
      pose(0.56, { lean: 0.5, drop: 0.28, twist: -0.1, shiftZ: -0.04, left: [-0.03, -0.16, 0], right: [0.04, 0.14, 0] }),
      pose(0.82, { lean: 0.46, drop: 0.27, twist: -0.1, shiftZ: -0.04, left: [-0.03, -0.16, 0], right: [0.04, 0.14, 0] }),
      stance(1),
    ],
  },
};

/** A pole held up to the sky beside the shoulder, leaning out: straight
 *  up, its haft stood in front of the face. */
const POLE_SKYWARD = { pos: [0.28, 1.1, -0.14] as Vec3, blade: [0.3, 0.95, -0.05] as Vec3, fingers: [-0.3, 0, -1] as Vec3 };

/** A pole's version of each move: from and to its own rest, held upright
 *  out of a gesture's way, and raised over the shoulder, not overhead. */
const POLE_MOVES = Object.fromEntries(
  Object.entries(MOVES).map(([element, move]) => [
    element,
    {
      ...move,
      right: move.right.map((k) =>
        k.pos === GUARD.pos || k.pos === ASIDE.pos || k.pos === WIDE.pos ? { ...POLE_REST, at: k.at } : k.pos === OVERHEAD.pos ? { ...k, ...OVER_SHOULDER } : k.pos === SKYWARD.pos || k.pos === SWEPT_UP.pos ? { ...k, ...POLE_SKYWARD } : k
      ),
    },
  ])
) as Record<Element, Move>;
const movesFor = (weapon: Weapon) => (upright(weapon) ? POLE_MOVES : MOVES);

/** Down and done: knelt, slumped, the head hanging. */
export const KNOCKED_OUT: BodyPose = bodyKey(0, { twist: 0.1, lean: 0.5, tilt: 0.06, drop: 0.3, shiftZ: 0.06, left: [-0.03, -0.1, 0], right: [0.04, 0.14, 0], carry: 0, head: 0 });

/** Hit: a flinch back, on top of whatever else is going on. */
export const FLINCH_SECONDS = 0.38;

/**
 * Where the body is for a weapon at a moment, like heldPose for the
 * hands: on guard (breathing, a little), or partway through an action,
 * with a flinch on top if a hit landed in the last moment. `seed` keeps
 * everyone's breathing from being in step.
 */
export function bodyPose(weapon: Weapon, action: Action | null, now: number, guard: boolean, out: BodyPose, hurtAt = -Infinity, seed = 0, element: Element = "spectro"): BodyPose {
  const timing = action ? timingOf(weapon, action.kind) : null;
  const time = action && timing ? (now - action.start) / timing.duration : 1;
  const active = action !== null && time < 1;
  if (weapon === "bow") {
    if (active) sampleBody(BOW_BODY[shotOf(action!)], time, out);
    else copyBody(ARCHER, out);
  } else if (active) {
    const keys = action!.kind === "special" ? MOVES[element].body : action!.kind === "recoil" ? RECOIL_BODY : action!.kind === "stagger" ? STAGGER_BODY : CUT_BODY[cutOf(weapon, action!.n)];
    sampleBody(keys, time, out);
  } else copyBody(guard ? PARRY_BODY : STANCE, out);

  if (!active) {
    // Breathing, and a slow sway: alive, not posed.
    out.drop += 0.006 * Math.sin(now * 2.2 + seed);
    out.twist += 0.025 * Math.sin(now * 0.8 + seed * 1.7);
  }
  const since = (now - hurtAt) / FLINCH_SECONDS;
  if (since >= 0 && since < 1) {
    // Sharp in, slower out.
    const e = Math.sin(Math.pow(since, 0.6) * Math.PI);
    // Which way it turns comes from the seed, so it varies by person.
    out.twist += 0.12 * e * (seed % 2 < 1 ? 1 : -1);
    out.lean -= 0.14 * e;
    out.drop += 0.03 * e;
    out.shiftZ += 0.04 * e;
  }
  return out;
}
