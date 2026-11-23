import { copyBody, NEUTRAL, type BodyPose } from "../body";
import type { Instrument } from "./instruments";

/**
 * How a musician moves while playing (see ../body.ts for the pose itself).
 * Before this the hands played and the rest stood still, which is the one
 * thing nobody does with music on.
 *
 * Everyone grooves to one beat, taken from the wall clock the way the light
 * sticks' sway is (BandLayer.tsx), so a band on stage moves together with
 * nothing sent: 120 a minute, which most pop sits near. How much someone
 * moves rises with how much they're playing and falls away when they stop,
 * and each note adds its own accent: a drummer dips into the hit, a
 * guitarist rocks back on the strum.
 */
export const BEATS_PER_SECOND = 2;

export interface Groove {
  /** How into it they are, 0 to 1, eased: up while notes come, down after. */
  energy: number;
}

/** Seconds after the last note that the groove keeps going. */
const PLAYING_SECONDS = 2.5;
/** At rest, holding an instrument, there's still a little movement. */
const AT_REST = 0.2;

export function updateGroove(groove: Groove, instrument: Instrument, note: { at: number } | null, waving: boolean, now: number, dt: number) {
  const playing = instrument === "lightstick" ? waving : note !== null && now - note.at < PLAYING_SECONDS;
  const target = playing ? 1 : AT_REST;
  groove.energy += (target - groove.energy) * (1 - Math.exp(-(target > groove.energy ? 4 : 1.2) * dt));
  return groove.energy;
}

const base: BodyPose = { ...NEUTRAL, left: [0, 0, 0], right: [0, 0, 0] };

/** How much a groove moves the body: kept small, so it reads as feeling
 *  the music rather than bouncing to it. */
const MOTION = 0.6;

/**
 * The body for an instrument at a moment. `side` is where along the desk
 * the last note was (keys and drums, eye heights, + right), for leaning
 * toward it. Writes into `out`.
 */
export function bandBody(instrument: Instrument, note: { at: number; n?: number } | null, energy: number, side: number, clock: number, now: number, out: BodyPose): BodyPose {
  copyBody(base, out);
  const beat = clock * BEATS_PER_SECOND;
  // 0 between beats, 1 on one: the dip of a bob, eased so it rolls rather
  // than bounces.
  const bob = Math.pow(0.5 - 0.5 * Math.cos(beat * Math.PI * 2), 1.5);
  // Side to side, once every two beats.
  const sway = Math.sin(beat * Math.PI);
  // The note just played, fading fast.
  const accent = note ? Math.exp(-Math.max(0, now - note.at) * 9) : 0;
  const e = energy * MOTION;

  switch (instrument) {
    case "drums":
      // Over the pads, settling on the beat, dipping into each hit and
      // turning toward the hand that played it.
      out.lean = 0.12 + 0.04 * accent;
      out.drop = 0.02 + 0.02 * bob * e + 0.015 * accent;
      out.twist = -side * 0.5;
      out.nod = 0.08 * bob * e + 0.06 * accent;
      out.carry = 0;
      out.head = 0.4;
      break;
    case "kit": {
      // Seated on the throne: hips down onto it, the right foot forward on
      // the kick pedal and the left on the hi-hat's, leaning in over the
      // snare. The kick lifts the right heel; each hit nods the head.
      const kick = note && note.n === 5 ? accent : 0;
      out.drop = 0.21 + 0.012 * bob * e;
      out.shiftZ = 0.04;
      out.lean = 0.12 + 0.03 * accent;
      out.twist = 0.02 * sway * e;
      out.nod = 0.07 * bob * e + 0.05 * accent;
      out.left = [-0.1, -0.24, 0.012 * bob * e];
      out.right = [0.08, -0.32, 0.035 * kick];
      out.carry = 0;
      out.head = 0.45;
      break;
    }
    case "keys":
      // Leaning over the keys, swaying, and toward where the hands are.
      out.lean = 0.1 + 0.02 * accent;
      out.drop = 0.015 + 0.01 * bob * e;
      out.tilt = 0.04 * sway * e;
      out.shiftX = side * 0.2;
      out.twist = -side * 0.35;
      out.nod = 0.05 * bob * e + 0.04 * accent;
      out.carry = 0;
      out.head = 0.5;
      break;
    case "guitar":
      // Feet apart, rocking: back on the strum, a nod and a tap of the
      // back foot on the beat.
      out.lean = -0.03 - 0.05 * accent + 0.02 * bob * e;
      out.drop = 0.025 + 0.02 * bob * e;
      out.twist = -0.12 + 0.05 * sway * e;
      out.tilt = 0.03 * sway * e;
      out.nod = 0.09 * bob * e + 0.06 * accent;
      out.left = [-0.02, -0.06, 0];
      out.right = [0.03, 0.06, 0.02 * e * Math.max(0, Math.sin(beat * Math.PI * 2))];
      out.carry = 0;
      out.head = 0.3;
      break;
    case "electric":
      // A rock stance: wide, low, leaning back on the big notes and into
      // the riffs, the head driving the beat.
      out.lean = -0.06 - 0.08 * accent + 0.04 * bob * e;
      out.drop = 0.05 + 0.025 * bob * e;
      out.twist = -0.18 + 0.06 * sway * e;
      out.tilt = -0.03 + 0.03 * sway * e;
      out.nod = 0.12 * bob * e + 0.08 * accent;
      out.left = [-0.05, -0.08, 0];
      out.right = [0.06, 0.08, 0];
      out.carry = 0;
      out.head = 0.25;
      break;
    case "bass":
      // Cool and low: knees taking the beat, a small sway, the head barely
      // nodding. Bassists keep time with their whole body, not their head.
      out.lean = -0.02 + 0.015 * bob * e;
      out.drop = 0.035 + 0.03 * bob * e;
      out.twist = -0.1 + 0.04 * sway * e;
      out.tilt = 0.025 * sway * e;
      out.nod = 0.05 * bob * e + 0.03 * accent;
      out.left = [-0.03, -0.05, 0];
      out.right = [0.04, 0.06, 0];
      out.carry = 0;
      out.head = 0.4;
      break;
    case "kulintang":
      // Tall over the row of gongs, swaying toward the hand that's playing,
      // light in the body: the mallets do the work.
      out.lean = 0.08 + 0.02 * accent;
      out.drop = 0.02 + 0.012 * bob * e;
      out.shiftX = side * 0.15;
      out.twist = -side * 0.3;
      out.tilt = 0.03 * sway * e;
      out.nod = 0.05 * bob * e + 0.04 * accent;
      out.carry = 0;
      out.head = 0.5;
      break;
    case "taiko":
      // The taiko stance: feet wide, knees bent low, hips square to the
      // drum, and the whole body behind each don.
      out.drop = 0.07 + 0.02 * bob * e + 0.03 * accent;
      out.lean = 0.1 + 0.06 * accent;
      out.twist = 0.03 * sway * e;
      out.nod = 0.05 * bob * e + 0.05 * accent;
      out.left = [-0.09, -0.02, 0];
      out.right = [0.09, 0.04, 0];
      out.carry = 0;
      out.head = 0.35;
      break;
    case "shaker":
      // A bounce on the beat and a sway, the shaker going with the body.
      out.drop = 0.02 + 0.025 * bob * e;
      out.twist = 0.08 * sway * e;
      out.tilt = 0.04 * sway * e;
      out.nod = 0.06 * bob * e + 0.03 * accent;
      out.carry = 0.4;
      out.head = 0.45;
      break;
    case "lightstick": {
      // A concert crowd: swaying with the stick overhead, and a small
      // bounce on the beat. The stick's own sway runs off the same clock.
      const wave = Math.sin(clock * Math.PI * 2 * 0.9);
      out.twist = 0.1 * wave * e;
      out.tilt = 0.05 * wave * e;
      out.drop = 0.015 + 0.02 * bob * e;
      out.lean = -0.02 * e;
      out.nod = 0.04 * bob * e;
      out.carry = 0.5;
      out.head = 0.5;
      break;
    }
  }
  return out;
}
