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

/** A special landing, in its element's voice. */
export function playSpecial(element: Element, distance?: number) {
  const v = voice(1.1, distance, 30);
  if (!v) return;
  if (element === "lightning") {
    noiseHit(v, { frequency: 5000, sweepTo: 600, duration: 0.25, gain: 1, type: "highpass" });
    noiseHit(v, { frequency: 400, sweepTo: 60, duration: 1.1, gain: 0.8, type: "lowpass", delay: 0.05 });
    toneHit(v, { frequency: 60, sweepTo: 32, duration: 0.8, gain: 0.5, delay: 0.03 });
  } else if (element === "fire") {
    noiseHit(v, { frequency: 200, sweepTo: 1400, duration: 0.5, gain: 0.9, type: "lowpass", attack: 0.12 });
    noiseHit(v, { frequency: 3000, duration: 0.7, gain: 0.25, type: "bandpass", q: 3, delay: 0.1 });
    toneHit(v, { frequency: 70, sweepTo: 40, duration: 0.6, gain: 0.5 });
  } else {
    for (const [i, f] of [1568, 2093, 2637, 3136].entries()) toneHit(v, { frequency: f, duration: 0.9, gain: 0.12, type: "triangle", delay: i * 0.035 });
    noiseHit(v, { frequency: 6000, sweepTo: 2500, duration: 0.35, gain: 0.5, type: "highpass" });
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
