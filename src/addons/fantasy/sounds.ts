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
  if (weapon === "rod") {
    // A bolt cast: a rising, hollow whoosh with a shimmer on top.
    toneHit(v, { frequency: 260, sweepTo: 820, duration: 0.38, gain: 0.18, type: "sine", attack: 0.04 });
    noiseHit(v, { frequency: 900, sweepTo: 3200, duration: 0.34, gain: 0.3, q: 2.5, attack: 0.05 });
    toneHit(v, { frequency: 1480, duration: 0.3, gain: 0.05, type: "triangle", delay: 0.06 });
    return;
  }
  if (weapon === "bow") {
    // The string's release: a low twang and a quick hiss.
    toneHit(v, { frequency: 110, sweepTo: 70, duration: 0.22, gain: 0.35, type: "triangle" });
    noiseHit(v, { frequency: 3000, sweepTo: 1200, duration: 0.18, gain: 0.25, q: 0.8 });
    return;
  }
  const heavy = weapon === "naginata" || weapon === "scythe";
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

/** A special winding up, in its element's voice: air drawn in for all,
 *  and each element's own gathering over it. */
export function playSpecialCharge(element: Element, distance?: number) {
  const v = voice(0.9, distance, 24);
  if (!v) return;
  noiseHit(v, { frequency: 300, sweepTo: 3200, duration: 0.42, gain: element === "havoc" ? 0.25 : 0.4, q: 1.2, attack: 0.36 });
  switch (element) {
    case "spectro":
      // A bright chord swelling in, shimmering.
      for (const [i, f] of [880, 1109, 1319].entries()) toneHit(v, { frequency: f, sweepTo: f * 1.5, duration: 0.42, gain: 0.07, type: "sine", attack: 0.3, delay: i * 0.02 });
      break;
    case "havoc":
      // Drawn down into the dark: a falling growl and a hollow suck.
      toneHit(v, { frequency: 140, sweepTo: 45, duration: 0.42, gain: 0.3, type: "sawtooth", attack: 0.3 });
      noiseHit(v, { frequency: 900, sweepTo: 120, duration: 0.42, gain: 0.35, type: "lowpass", attack: 0.38 });
      break;
    case "aero":
      // Gusts winding up round you.
      for (let i = 0; i < 3; i++) noiseHit(v, { frequency: 500 + i * 300, sweepTo: 1800 + i * 500, duration: 0.2, gain: 0.25, q: 3, delay: i * 0.11, attack: 0.1 });
      break;
    case "electro":
      toneHit(v, { frequency: 160, sweepTo: 480, duration: 0.42, gain: 0.16, type: "triangle", attack: 0.34 });
      for (let i = 0; i < 5; i++) noiseHit(v, { frequency: 6000, duration: 0.03, gain: 0.25, type: "highpass", delay: 0.08 + i * 0.065 });
      break;
    case "fusion":
      toneHit(v, { frequency: 110, sweepTo: 330, duration: 0.42, gain: 0.16, type: "sawtooth", attack: 0.34 });
      noiseHit(v, { frequency: 400, sweepTo: 1200, duration: 0.42, gain: 0.3, type: "lowpass", attack: 0.3 });
      break;
    case "glacio":
      toneHit(v, { frequency: 520, sweepTo: 1560, duration: 0.42, gain: 0.14, type: "triangle", attack: 0.34 });
      noiseHit(v, { frequency: 8000, duration: 0.42, gain: 0.12, type: "highpass", attack: 0.3 });
      break;
  }
}

/**
 * A special landing, in its element's voice, over a boom that every one
 * shares: the low thump you feel more than hear, then the element's own
 * signature, then a tail that carries.
 */
export function playSpecial(element: Element, distance?: number) {
  const v = voice(1.15, distance, 34);
  if (!v) return;
  toneHit(v, { frequency: 70, sweepTo: 28, duration: 0.9, gain: element === "havoc" ? 0.9 : 0.7 });
  noiseHit(v, { frequency: 180, sweepTo: 50, duration: 0.6, gain: 0.7, type: "lowpass" });
  switch (element) {
    case "spectro":
      // A burst of light: a bright, ringing chord opening over a shimmer.
      for (const [i, f] of [1319, 1661, 1976, 2637].entries()) toneHit(v, { frequency: f, duration: 1.3, gain: 0.09, type: "sine", delay: i * 0.025 });
      noiseHit(v, { frequency: 9000, duration: 0.7, gain: 0.25, type: "highpass", attack: 0.02 });
      for (let i = 0; i < 6; i++) toneHit(v, { frequency: 3000 + i * 420, duration: 0.15, gain: 0.04, type: "sine", delay: 0.15 + i * 0.08 });
      break;
    case "havoc":
      // The plunge: a heavy, dark impact, a distorted growl, and a long
      // falling drone, the air sucked back after it.
      toneHit(v, { frequency: 55, sweepTo: 22, duration: 1.6, gain: 0.8, type: "sine" });
      toneHit(v, { frequency: 110, sweepTo: 40, duration: 1.1, gain: 0.25, type: "sawtooth", delay: 0.02 });
      noiseHit(v, { frequency: 400, sweepTo: 60, duration: 1.4, gain: 0.6, type: "lowpass", delay: 0.05 });
      noiseHit(v, { frequency: 200, sweepTo: 1400, duration: 0.6, gain: 0.25, type: "bandpass", q: 2, delay: 0.7, attack: 0.5 });
      break;
    case "aero":
      // An updraft: a rushing gust sweeping up, swirling round, and away.
      noiseHit(v, { frequency: 300, sweepTo: 3000, duration: 0.6, gain: 0.8, q: 1.5, attack: 0.05 });
      for (let i = 0; i < 4; i++) noiseHit(v, { frequency: 700 + (i % 2) * 600, sweepTo: 2400 - (i % 2) * 900, duration: 0.35, gain: 0.35, q: 4, delay: 0.2 + i * 0.16, attack: 0.12 });
      noiseHit(v, { frequency: 1200, sweepTo: 400, duration: 1.2, gain: 0.3, type: "bandpass", q: 1, delay: 0.4, attack: 0.2 });
      break;
    case "electro":
      // The crack, a sizzle, and thunder rolling in after.
      noiseHit(v, { frequency: 6500, sweepTo: 900, duration: 0.18, gain: 1, type: "highpass" });
      noiseHit(v, { frequency: 2600, duration: 0.5, gain: 0.3, type: "bandpass", q: 6, delay: 0.02 });
      noiseHit(v, { frequency: 260, sweepTo: 45, duration: 1.8, gain: 0.85, type: "lowpass", delay: 0.12, attack: 0.08 });
      noiseHit(v, { frequency: 160, sweepTo: 40, duration: 1.4, gain: 0.5, type: "lowpass", delay: 0.55, attack: 0.1 });
      break;
    case "fusion":
      // A rushing whoosh, a roar, and crackle as it burns down.
      noiseHit(v, { frequency: 240, sweepTo: 1800, duration: 0.45, gain: 0.95, type: "lowpass", attack: 0.06 });
      noiseHit(v, { frequency: 700, sweepTo: 220, duration: 1.3, gain: 0.55, type: "bandpass", q: 0.8, delay: 0.12, attack: 0.1 });
      for (let i = 0; i < 9; i++) noiseHit(v, { frequency: 3000 + (i % 3) * 900, duration: 0.04, gain: 0.3, type: "bandpass", q: 4, delay: 0.25 + i * 0.09 + (i % 2) * 0.03 });
      break;
    case "glacio":
      // Ice cracking up out of the ground: glassy partials, a bright hiss,
      // and the cold breath of it sublimating away.
      for (const [i, f] of [1568, 2093, 2637, 3136, 3951].entries()) toneHit(v, { frequency: f, sweepTo: f * 0.96, duration: 1.2, gain: 0.1, type: "triangle", delay: i * 0.03 });
      noiseHit(v, { frequency: 7000, sweepTo: 2600, duration: 0.4, gain: 0.6, type: "highpass" });
      for (let i = 0; i < 6; i++) toneHit(v, { frequency: 4200 - i * 330, duration: 0.12, gain: 0.06, type: "sine", delay: 0.1 + i * 0.07 });
      noiseHit(v, { frequency: 5000, sweepTo: 9000, duration: 1.2, gain: 0.15, type: "highpass", delay: 0.3, attack: 0.3 });
      break;
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
