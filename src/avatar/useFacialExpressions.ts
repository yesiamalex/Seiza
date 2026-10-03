import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { VRM } from "@pixiv/three-vrm";
import { FACE_EXPRESSIONS } from "./gestures";

/**
 * Drives an avatar's face: auto-blink, plus whatever expression the
 * current gesture asks for.
 *
 * Works on every avatar without branching on which kind it is. Uploaded
 * VRMs express through the morph targets their artist sculpted; designer
 * avatars express by moving their face parts (designerExpressions.ts).
 * Both register the same preset names under the same
 * `vrm.expressionManager`, so this only ever talks to that.
 *
 * Models that lack a given expression — or lack expressions entirely,
 * which plenty of uploaded VRMs do — are handled by simply not finding
 * it. `getExpression` returns null and nothing is set. That is why every
 * lookup below is guarded rather than assumed: an avatar with no face
 * data should be expressionless, not broken.
 */

/** Seconds between blinks, randomised so a room of avatars doesn't blink
 *  in unison — which is far more unsettling than not blinking at all. */
const BLINK_MIN_GAP = 2.4;
const BLINK_MAX_GAP = 7.0;
/** A blink is fast: down and back up inside a sixth of a second. */
const BLINK_DURATION = 0.16;
/** How quickly expression weights chase their target. Fast enough to feel
 *  like a reaction, slow enough not to pop. */
const EXPRESSION_RATE = 11;

/**
 * Lip sync.
 *
 * This is amplitude-driven, not phoneme-driven: it opens the mouth in
 * proportion to how loud the speaker currently is. Real viseme detection
 * would mean running formant analysis or a phoneme model per peer, every
 * frame, for everyone in the room — a lot of CPU to decide between "aa"
 * and "oh" on a face that, for designer avatars, is a single curved bar.
 * At conversational distance an amplitude-driven mouth is most of the
 * perceived benefit for almost none of the cost.
 *
 * The signal is the same per-peer RMS level useRealtimeMedia already
 * computes for the speaking indicator, so lip sync costs one extra
 * expression write per avatar per frame and no new audio plumbing.
 *
 * Two visemes rather than one: "aa" is the open jaw and carries the
 * amplitude, while a little "ih" underneath keeps the mouth from reading
 * as a perfect circle at low volume. Mixing both is what stops it
 * looking like a fish.
 */
/** Below this RMS the mouth stays shut — room tone shouldn't mumble. */
const LIPSYNC_NOISE_FLOOR = 0.045;
/** RMS that corresponds to a fully open mouth. Normal speech peaks well
 *  below 1.0, so this is deliberately low. */
const LIPSYNC_FULL_SCALE = 0.28;
/** Opening is quicker than closing, which is how a jaw actually moves and
 *  stops the mouth strobing on every syllable gap. */
const LIPSYNC_OPEN_RATE = 26;
const LIPSYNC_CLOSE_RATE = 14;

const nextBlinkGap = () => BLINK_MIN_GAP + Math.random() * (BLINK_MAX_GAP - BLINK_MIN_GAP);

interface FaceState {
  weights: Map<string, number>;
  timeToBlink: number;
  blinkElapsed: number;
  blinking: boolean;
  mouthOpen: number;
  /** How shut the eyes are held, 0..1, for a sleeping face. */
  sleep: number;
}

/**
 * @param speakingLevel Current RMS mic level for whoever owns this
 *   avatar, 0 when silent or unknown. Drives lip sync; pass 0 (the
 *   default) to leave the mouth alone entirely.
 */
export function useFacialExpressions(
  vrm: VRM | null,
  expression: string | null,
  speakingLevel = 0,
  /** How airborne the avatar is, 0..1. A jump is a locomotion state
   *  rather than a gesture, so it carries no expression of its own; this
   *  lets the face react to it anyway. A ref, not a value, because it
   *  changes every frame and must not re-render anything. */
  airborneRef?: { current: number }
) {
  const stateRef = useRef<FaceState>({
    weights: new Map(),
    // Stagger the first blink too, so avatars that spawn together don't
    // start in phase and then stay that way.
    timeToBlink: nextBlinkGap(),
    blinkElapsed: 0,
    blinking: false,
    mouthOpen: 0,
    sleep: 0,
  });

  // Negative priority, for the same reason AvatarAnimator's pose pass
  // uses one: VrmAvatar calls vrm.update() at priority 0, and that is
  // what actually applies expression weights to the model. Setting them
  // after it would show up a frame late.
  useFrame((_, rawDelta) => {
    const manager = vrm?.expressionManager;
    if (!manager) return;
    // Tab-out and heavy-load frames produce huge deltas; a blink that
    // "lasts" one 3-second frame just looks like the eyes vanished.
    const delta = Math.min(rawDelta, 0.1);
    const state = stateRef.current;

    // --- blink ---------------------------------------------------------
    if (state.blinking) {
      state.blinkElapsed += delta;
      if (state.blinkElapsed >= BLINK_DURATION) {
        state.blinking = false;
        state.timeToBlink = nextBlinkGap();
      }
    } else {
      state.timeToBlink -= delta;
      if (state.timeToBlink <= 0) {
        state.blinking = true;
        state.blinkElapsed = 0;
      }
    }
    // Triangle wave: shut by the midpoint, open again by the end.
    const blinkPhase = state.blinking ? state.blinkElapsed / BLINK_DURATION : 0;
    const blinkWeight = state.blinking ? 1 - Math.abs(blinkPhase * 2 - 1) : 0;
    // "sleep" is not a preset of its own: it holds the eyes shut, eased
    // so they droop rather than snap, and wears "relaxed" underneath. The
    // blink preset is the one every VRM and designer avatar shares.
    const sleeping = expression === "sleep";
    state.sleep += ((sleeping ? 1 : 0) - state.sleep) * (1 - Math.exp(-3 * delta));
    if (state.sleep < 0.002) state.sleep = 0;
    if (manager.getExpression("blink")) manager.setValue("blink", Math.max(blinkWeight, state.sleep));

    // --- expression ----------------------------------------------------
    // "neutral" is the absence of the others rather than a preset to
    // apply, so it drives every weight to zero.
    // Being in the air outranks whatever face a gesture asked for, but
    // only while actually off the ground: it is brief, and it is the most
    // expressive thing happening at that moment. Surprise reads as the
    // lurch of a jump far better than the alternatives do.
    const airborne = airborneRef?.current ?? 0;
    const wanted =
      airborne > 0.35 ? "surprised" : sleeping ? "relaxed" : expression && expression !== "neutral" ? expression : null;
    const smoothing = 1 - Math.exp(-EXPRESSION_RATE * delta);

    for (const name of FACE_EXPRESSIONS) {
      if (name === "neutral") continue;
      if (!manager.getExpression(name)) continue;
      const target = name === wanted ? 1 : 0;
      const current = state.weights.get(name) ?? 0;
      const next = current + (target - current) * smoothing;
      // Snap the tail so a decaying weight actually reaches zero instead
      // of leaving a permanent 0.4% smile on every avatar in the room.
      const settled = Math.abs(next - target) < 0.002 ? target : next;
      state.weights.set(name, settled);
      manager.setValue(name, settled);
    }

    // --- lip sync ------------------------------------------------------
    // Normalised above a noise floor so that a quiet room, a muted mic
    // (level 0), or a model with no viseme at all all resolve to a
    // closed, still mouth rather than a twitching one.
    const target = Math.min(1, Math.max(0, (speakingLevel - LIPSYNC_NOISE_FLOOR) / (LIPSYNC_FULL_SCALE - LIPSYNC_NOISE_FLOOR)));
    const rate = target > state.mouthOpen ? LIPSYNC_OPEN_RATE : LIPSYNC_CLOSE_RATE;
    state.mouthOpen += (target - state.mouthOpen) * (1 - Math.exp(-rate * delta));
    if (state.mouthOpen < 0.004) state.mouthOpen = 0;

    if (manager.getExpression("aa")) manager.setValue("aa", state.mouthOpen);
    // A touch of "ih" widens the shape so it isn't a perfect O, and it
    // leads the jaw slightly, which reads as articulation.
    if (manager.getExpression("ih")) manager.setValue("ih", state.mouthOpen * 0.35);
  }, -1);
}
