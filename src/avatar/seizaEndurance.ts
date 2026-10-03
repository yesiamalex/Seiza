import { useEffect, useState } from "react";

/**
 * Seiza endurance: what kneeling too long does to an avatar.
 *
 * Real seiza is comfortable for a few minutes and then famously isn't:
 * the mind wanders, the feet go to sleep, and standing up becomes an
 * event. Seiza plays that for laughs. An avatar held in the seiza posture
 * nods off with floating Zs after two minutes, trembles with pins and
 * needles after four, and fumes after six; and standing up after the legs
 * have gone leaves them numb for a few steps.
 *
 * Each client times every avatar from the moment it saw that avatar kneel,
 * so the phases need no network traffic of their own. Someone who joins a
 * room mid-seiza sees the clock start from their own arrival, which is a
 * fair trade for adding nothing to the protocol.
 *
 * `?seizaSpeed=30` in the page URL runs the clock thirty times faster, for
 * demonstrating the whole sequence in under a quarter of a minute.
 */

export type SeizaPhase = "composed" | "dozing" | "numb" | "agony";

interface PhaseInfo {
  id: SeizaPhase;
  /** Seconds into seiza at which this phase begins. */
  at: number;
  label: string;
  /** The same in Japanese, for the timer readout. */
  jp: string;
}

export const SEIZA_PHASES: readonly PhaseInfo[] = [
  { id: "composed", at: 0, label: "Composed", jp: "落ち着いている" },
  { id: "dozing", at: 120, label: "Dozing off", jp: "うとうと" },
  { id: "numb", at: 240, label: "Legs falling asleep", jp: "足がしびれてきた" },
  { id: "agony", at: 360, label: "Agony", jp: "げ、限界！" },
];

/** Standing up after this many seconds leaves the legs numb. */
export const NUMB_AFTER = 240;
/** How long numb legs last after standing, in seconds. */
export const NUMB_DURATION = 5;

/** Demonstration speed-up, read once from `?seizaSpeed=`. */
export const SEIZA_CLOCK_SPEED = (() => {
  if (typeof location === "undefined") return 1;
  const value = Number(new URLSearchParams(location.search).get("seizaSpeed"));
  return Number.isFinite(value) && value > 0 ? Math.min(value, 120) : 1;
})();

export function phaseFor(seconds: number): PhaseInfo {
  let current = SEIZA_PHASES[0];
  for (const phase of SEIZA_PHASES) if (seconds >= phase.at) current = phase;
  return current;
}

/** Seconds kneeling since `startedAt` (a performance.now() reading). */
export function seizaSeconds(startedAt: number): number {
  return ((performance.now() - startedAt) / 1000) * SEIZA_CLOCK_SPEED;
}

/**
 * The face each phase wears. Composed returns null so the seiza posture's
 * own calm face shows through; "sleep" is the held-shut eyes that
 * useFacialExpressions understands.
 */
export function enduranceExpression(phase: SeizaPhase | null): string | undefined {
  if (phase === "dozing") return "sleep";
  if (phase === "numb") return "sad";
  if (phase === "agony") return "angry";
  return undefined;
}

/** How much the body shakes, 0 to 1. */
export function enduranceTremble(phase: SeizaPhase | null): number {
  return phase === "agony" ? 1 : phase === "numb" ? 0.45 : 0;
}

/**
 * Tracks one avatar's time in seiza. `phase` is null while not kneeling.
 *
 * Re-renders only when the phase changes, by waking at the next threshold
 * rather than ticking every second, so a room full of kneeling avatars
 * costs a handful of timers, not a render per second each.
 */
export function useSeizaEndurance(kneeling: boolean): { phase: SeizaPhase | null; startedAt: number | null } {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<SeizaPhase | null>(null);

  useEffect(() => {
    if (!kneeling) {
      setStartedAt(null);
      setPhase(null);
      return;
    }
    const start = performance.now();
    setStartedAt(start);
    setPhase("composed");
    const timers = SEIZA_PHASES.slice(1).map((next) =>
      window.setTimeout(() => setPhase(next.id), (next.at / SEIZA_CLOCK_SPEED) * 1000)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [kneeling]);

  return { phase, startedAt };
}
