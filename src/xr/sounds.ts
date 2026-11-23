import { noiseHit, toneHit, voice } from "../addons/sound";

/**
 * Small sounds for doing things in a headset, where there's no cursor or
 * screen change to tell you it worked: a soft tick for a menu button or a
 * tab, a whoosh for a teleport, a pop for picking something up, a toss for
 * throwing it. Synthesized, like the rest of Seiza's sounds, and quiet.
 */
export function playTick() {
  const v = voice(0.35);
  if (!v) return;
  toneHit(v, { frequency: 1500, duration: 0.05, gain: 0.25, type: "triangle" });
}

export function playTeleport() {
  const v = voice(0.5);
  if (!v) return;
  noiseHit(v, { frequency: 600, sweepTo: 2400, duration: 0.25, gain: 0.25, q: 1.2 });
  toneHit(v, { frequency: 520, sweepTo: 880, duration: 0.2, gain: 0.12 });
}

export function playGrab() {
  const v = voice(0.45);
  if (!v) return;
  toneHit(v, { frequency: 330, sweepTo: 520, duration: 0.08, gain: 0.3, type: "triangle" });
}

export function playThrow() {
  const v = voice(0.45);
  if (!v) return;
  noiseHit(v, { frequency: 900, sweepTo: 300, duration: 0.2, gain: 0.25, q: 0.9 });
}
