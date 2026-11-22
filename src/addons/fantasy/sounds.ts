import { noiseHit, toneHit, voice } from "../sound";
import type { Element, Weapon } from "./weapons";

/** A blade cutting air: a band of noise sweeping up, then away. */
export function playSwing(weapon: Weapon, distance?: number) {
  const v = voice(0.9, distance);
  if (!v) return;
  if (weapon === "lightsaber") {
    toneHit(v, { frequency: 92, sweepTo: 150, duration: 0.32, gain: 0.25, type: "sawtooth", attack: 0.03 });
    toneHit(v, { frequency: 184, sweepTo: 120, duration: 0.3, gain: 0.12, type: "square", attack: 0.03 });
    return;
  }
  if (weapon === "bow") {
    // The string's release: a low twang and a quick hiss.
    toneHit(v, { frequency: 110, sweepTo: 70, duration: 0.22, gain: 0.35, type: "triangle" });
    noiseHit(v, { frequency: 3000, sweepTo: 1200, duration: 0.18, gain: 0.25, q: 0.8 });
    return;
  }
  const heavy = weapon === "naginata";
  noiseHit(v, { frequency: heavy ? 500 : 700, sweepTo: heavy ? 1800 : 2600, duration: heavy ? 0.3 : 0.24, gain: 0.5, q: 1.4, attack: 0.08 });
}

/** A blow landing: a knock, and steel's ring for a blade. */
export function playHit(weapon: Weapon | null, distance?: number) {
  const v = voice(1, distance);
  if (!v) return;
  noiseHit(v, { frequency: 900, sweepTo: 300, duration: 0.12, gain: 0.7, q: 0.7 });
  toneHit(v, { frequency: 90, sweepTo: 50, duration: 0.14, gain: 0.55 });
  if (weapon === "lightsaber") noiseHit(v, { frequency: 4500, duration: 0.18, gain: 0.35, type: "highpass" });
  else if (weapon !== "bow") {
    toneHit(v, { frequency: 2350, duration: 0.35, gain: 0.08, type: "triangle", delay: 0.01 });
    toneHit(v, { frequency: 3510, duration: 0.25, gain: 0.05, type: "triangle", delay: 0.01 });
  }
}

/** Blade meeting blade: a bright ring over a short scrape. */
export function playClash(lightsaber: boolean, distance?: number) {
  const v = voice(1, distance);
  if (!v) return;
  if (lightsaber) {
    noiseHit(v, { frequency: 2200, sweepTo: 600, duration: 0.25, gain: 0.6, q: 2 });
    toneHit(v, { frequency: 140, sweepTo: 80, duration: 0.3, gain: 0.35, type: "sawtooth" });
    return;
  }
  noiseHit(v, { frequency: 5200, sweepTo: 2600, duration: 0.09, gain: 0.55, q: 1.5 });
  for (const [f, g] of [[1870, 0.14], [2960, 0.1], [4410, 0.06]] as const) toneHit(v, { frequency: f, duration: 0.6, gain: g, type: "triangle" });
}

/** A special winding up: air drawn in, rising, in its element's colour. */
export function playSpecialCharge(element: Element, distance?: number) {
  const v = voice(0.9, distance, 24);
  if (!v) return;
  // A swell of air sweeping up to the release, and a rising tone under it.
  noiseHit(v, { frequency: 300, sweepTo: 3200, duration: 0.42, gain: 0.45, q: 1.2, attack: 0.36 });
  const base = element === "ice" ? 520 : element === "fire" ? 110 : 160;
  toneHit(v, { frequency: base, sweepTo: base * 3, duration: 0.42, gain: 0.16, type: element === "fire" ? "sawtooth" : "triangle", attack: 0.34 });
  if (element === "lightning") for (let i = 0; i < 5; i++) noiseHit(v, { frequency: 6000, duration: 0.03, gain: 0.25, type: "highpass", delay: 0.08 + i * 0.065 });
}

/**
 * A special landing, in its element's voice, over a boom that every one
 * shares: the low thump you feel more than hear, then the element's own
 * signature, then a tail that carries.
 */
export function playSpecial(element: Element, distance?: number) {
  const v = voice(1.15, distance, 34);
  if (!v) return;
  toneHit(v, { frequency: 70, sweepTo: 28, duration: 0.9, gain: 0.7 });
  noiseHit(v, { frequency: 180, sweepTo: 50, duration: 0.6, gain: 0.7, type: "lowpass" });
  if (element === "lightning") {
    // The crack, a sizzle, and thunder rolling in after.
    noiseHit(v, { frequency: 6500, sweepTo: 900, duration: 0.18, gain: 1, type: "highpass" });
    noiseHit(v, { frequency: 2600, duration: 0.5, gain: 0.3, type: "bandpass", q: 6, delay: 0.02 });
    noiseHit(v, { frequency: 260, sweepTo: 45, duration: 1.8, gain: 0.85, type: "lowpass", delay: 0.12, attack: 0.08 });
    noiseHit(v, { frequency: 160, sweepTo: 40, duration: 1.4, gain: 0.5, type: "lowpass", delay: 0.55, attack: 0.1 });
  } else if (element === "fire") {
    // A rushing whoosh, a roar, and crackle as it burns down.
    noiseHit(v, { frequency: 240, sweepTo: 1800, duration: 0.45, gain: 0.95, type: "lowpass", attack: 0.06 });
    noiseHit(v, { frequency: 700, sweepTo: 220, duration: 1.3, gain: 0.55, type: "bandpass", q: 0.8, delay: 0.12, attack: 0.1 });
    for (let i = 0; i < 9; i++) noiseHit(v, { frequency: 3000 + (i % 3) * 900, duration: 0.04, gain: 0.3, type: "bandpass", q: 4, delay: 0.25 + i * 0.09 + (i % 2) * 0.03 });
  } else {
    // Shatter: glassy partials falling over a bright hiss, and a ringing tail.
    for (const [i, f] of [1568, 2093, 2637, 3136, 3951].entries()) toneHit(v, { frequency: f, sweepTo: f * 0.96, duration: 1.2, gain: 0.1, type: "triangle", delay: i * 0.03 });
    noiseHit(v, { frequency: 7000, sweepTo: 2600, duration: 0.4, gain: 0.6, type: "highpass" });
    for (let i = 0; i < 6; i++) toneHit(v, { frequency: 4200 - i * 330, duration: 0.12, gain: 0.06, type: "sine", delay: 0.1 + i * 0.07 });
  }
}

/** The meter filling up: a short rising chime. Only for the one it's for. */
export function playCharged() {
  const v = voice(0.6);
  if (!v) return;
  toneHit(v, { frequency: 660, duration: 0.18, gain: 0.2, type: "triangle" });
  toneHit(v, { frequency: 990, duration: 0.3, gain: 0.2, type: "triangle", delay: 0.09 });
}

export function playKnockedOut(distance?: number) {
  const v = voice(0.8, distance);
  if (!v) return;
  toneHit(v, { frequency: 330, sweepTo: 110, duration: 0.6, gain: 0.3, type: "triangle" });
}
