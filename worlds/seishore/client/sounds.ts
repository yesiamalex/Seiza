// Seishore's sounds, all made in code (no samples): a black kite's call
// over the coast, wind chimes, the konbini's door chime, and a vending
// machine's drink dropping. The sea's surf is Seiza's own (src/audio/sfx.ts).
import { noiseBuffer, noiseHit, toneHit, voice, type Voice } from "../../../src/addons/sound";
import { sfxOutput } from "../../../src/audio/sfx";

/** A bell-like strike: a sine and two inharmonic partials, ringing down. */
function bell(v: Voice, frequency: number, at: number, gain: number, ring: number) {
  for (const [ratio, level, decay] of [
    [1, 1, 1],
    [2.76, 0.32, 0.55],
    [5.4, 0.12, 0.3],
  ] as [number, number, number][])
    toneHit(v, { frequency: frequency * ratio, duration: ring * decay, gain: gain * level, type: "sine", delay: at, attack: 0.004 });
}

/**
 * The konbini's door: an automatic door's slide and a bright two-tone
 * chime, pin-pon, up then down (our own, not any chain's tune).
 */
export function doorChime(distance?: number) {
  const v = voice(0.7, distance, 14, 2.5);
  if (!v) return;
  noiseHit(v, { frequency: 700, sweepTo: 400, duration: 0.5, gain: 0.03, q: 0.8 });
  bell(v, 1318.5, 0.05, 0.12, 1.1);
  bell(v, 1046.5, 0.42, 0.12, 1.4);
}

/** A wind chime: thin glass struck by its clapper, once or a few times. */
export function furin(distance?: number) {
  const v = voice(0.6, distance, 12, 3);
  if (!v) return;
  const strikes = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < strikes; i++) bell(v, 2650 + Math.random() * 450, i * (0.12 + Math.random() * 0.2), 0.05 - i * 0.01, 1.6);
}

/**
 * A black kite (tonbi) wheeling over the coast: its call, a long high
 * whistle that rises, then a falling trill, pīhyororo.
 */
export function tonbi(distance = 30) {
  const v = voice(0.9, distance, 80, 3);
  if (!v) return;
  const { ctx, out, t } = v;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.12);
  g.gain.setValueAtTime(0.06, t + 0.75);
  // The long "pī": up a little, held.
  osc.frequency.setValueAtTime(2050, t);
  osc.frequency.linearRampToValueAtTime(2550, t + 0.7);
  // The trill, "hyororo": falling, wobbling.
  for (let i = 0; i < 6; i++) {
    const at = t + 0.8 + i * 0.13;
    osc.frequency.linearRampToValueAtTime(2450 - i * 60, at);
    osc.frequency.linearRampToValueAtTime(2150 - i * 60, at + 0.065);
    g.gain.setValueAtTime(0.05 - i * 0.006, at);
    g.gain.linearRampToValueAtTime(0.02, at + 0.06);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 1.8);
}

/** A vending machine: the coin in, a whir, and the bottle dropping, gatan. */
export function vendingDrop(distance?: number) {
  const v = voice(0.8, distance, 14, 2);
  if (!v) return;
  bell(v, 3800, 0, 0.03, 0.15);
  bell(v, 3400, 0.09, 0.025, 0.15);
  noiseHit(v, { frequency: 300, duration: 0.45, gain: 0.04, q: 2, delay: 0.25 });
  toneHit(v, { frequency: 120, sweepTo: 70, duration: 0.18, gain: 0.25, type: "sine", delay: 0.75 });
  noiseHit(v, { frequency: 1400, duration: 0.06, gain: 0.12, q: 1.5, delay: 0.75 });
}

// --- the coast ------------------------------------------------------------------------------

/** A black-tailed gull (umineko, "sea cat"): its mewing call, two or three. */
export function gull(distance = 25) {
  const v = voice(0.8, distance, 70, 2.5);
  if (!v) return;
  const { ctx, out, t } = v;
  const calls = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < calls; i++) {
    const at = t + i * (0.42 + Math.random() * 0.12);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const g = ctx.createGain();
    const base = 950 + Math.random() * 200;
    osc.frequency.setValueAtTime(base, at);
    osc.frequency.linearRampToValueAtTime(base * 1.45, at + 0.09);
    osc.frequency.linearRampToValueAtTime(base * 0.85, at + 0.32);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.045, at + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + 0.36);
  }
}

// --- the shrine and the temple ---------------------------------------------------------

/** A coin into the offering box: its clink off the slats, and the thud inside. */
export function coin(distance?: number) {
  const v = voice(0.8, distance, 12, 1.2);
  if (!v) return;
  bell(v, 4200, 0, 0.04, 0.12);
  bell(v, 3600, 0.11, 0.035, 0.12);
  bell(v, 3900, 0.19, 0.025, 0.1);
  noiseHit(v, { frequency: 500, duration: 0.08, gain: 0.08, q: 1.2, delay: 0.27 });
}

/** The shrine's bell (suzu), shaken by its rope: a bright jangle. */
export function suzu(distance?: number) {
  const v = voice(0.8, distance, 16, 2.5);
  if (!v) return;
  for (let i = 0; i < 9; i++) bell(v, 2400 + Math.random() * 1400, i * 0.07 + Math.random() * 0.03, 0.035, 0.7);
}

/** The fortune box shaken: wooden sticks rattling, one falling out. */
export function omikujiShake(distance?: number) {
  const v = voice(0.8, distance, 10, 1.6);
  if (!v) return;
  for (let i = 0; i < 7; i++) noiseHit(v, { frequency: 1400 + Math.random() * 900, duration: 0.03, gain: 0.07, q: 3, delay: i * 0.09 });
  toneHit(v, { frequency: 600, sweepTo: 420, duration: 0.06, gain: 0.08, type: "triangle", delay: 0.8 });
}

// --- hums and loops -----------------------------------------------------------------------

export interface Loop {
  /** How loud, 0 to 1 (the distance's falloff in it), and how hard it's working, 0 to 1. */
  set(level: number, work?: number): void;
  stop(): void;
}

function loop(build: (ctx: AudioContext, out: GainNode) => { nodes: AudioScheduledSourceNode[]; work?: (w: number, t: number) => void }, gain: number): Loop | null {
  const output = sfxOutput();
  if (!output || output.ctx.state !== "running") return null;
  const { ctx } = output;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(output.out);
  const { nodes, work } = build(ctx, out);
  for (const n of nodes) n.start();
  return {
    set(level, w = 0) {
      const t = ctx.currentTime;
      out.gain.setTargetAtTime(Math.max(0, level) * gain, t, 0.25);
      work?.(w, t);
    },
    stop() {
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      setTimeout(() => {
        for (const n of nodes) n.stop();
        out.disconnect();
      }, 600);
    },
  };
}

function noiseSource(ctx: AudioContext) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  return s;
}

/** The konbini's fridges: a low electric hum and the fans' soft hiss. */
export const startFridges = () =>
  loop((ctx, out) => {
    const hum = ctx.createOscillator();
    hum.frequency.value = 100;
    const hum2 = ctx.createOscillator();
    hum2.frequency.value = 50;
    const hg = ctx.createGain();
    hg.gain.value = 0.25;
    hum.connect(hg).connect(out);
    hum2.connect(out);
    const fan = noiseSource(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const fg = ctx.createGain();
    fg.gain.value = 1.4;
    fan.connect(lp).connect(fg).connect(out);
    return { nodes: [hum, hum2, fan] };
  }, 0.03);

/** A kitchen: oil sizzling, a pot on the boil. */
export const startKitchen = () =>
  loop((ctx, out) => {
    const sizzle = noiseSource(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3500;
    const crackle = ctx.createGain();
    crackle.gain.value = 0.6;
    const flicker = ctx.createOscillator();
    flicker.frequency.value = 13;
    const fd = ctx.createGain();
    fd.gain.value = 0.4;
    flicker.connect(fd).connect(crackle.gain);
    sizzle.connect(hp).connect(crackle).connect(out);
    const boil = noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 380;
    bp.Q.value = 3;
    const bg = ctx.createGain();
    bg.gain.value = 1.5;
    boil.connect(bp).connect(bg).connect(out);
    return { nodes: [sizzle, flicker, boil] };
  }, 0.035);

/** A bus's diesel: a low rumble that rises as it pulls away. */
export const startDiesel = () =>
  loop((ctx, out) => {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    lp.Q.value = 1.5;
    lp.connect(out);
    const a = ctx.createOscillator();
    a.type = "sawtooth";
    a.frequency.value = 32;
    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.value = 16;
    const sg = ctx.createGain();
    sg.gain.value = 0.5;
    a.connect(lp);
    sub.connect(sg).connect(lp);
    return {
      nodes: [a, sub],
      work: (w, t) => {
        a.frequency.setTargetAtTime(32 + 30 * w, t, 0.3);
        sub.frequency.setTargetAtTime(16 + 15 * w, t, 0.3);
        lp.frequency.setTargetAtTime(220 + 380 * w, t, 0.3);
      },
    };
  }, 0.09);

/** A train's motors: a whine that climbs with its speed, and the gears' hum. */
export const startMotor = () =>
  loop((ctx, out) => {
    const whine = ctx.createOscillator();
    whine.type = "sine";
    whine.frequency.value = 180;
    const wg = ctx.createGain();
    wg.gain.value = 0.35;
    whine.connect(wg).connect(out);
    const gear = ctx.createOscillator();
    gear.type = "triangle";
    gear.frequency.value = 90;
    gear.connect(out);
    return {
      nodes: [whine, gear],
      work: (w, t) => {
        whine.frequency.setTargetAtTime(180 + 900 * w, t, 0.3);
        gear.frequency.setTargetAtTime(90 + 300 * w, t, 0.3);
      },
    };
  }, 0.05);

// --- the line and the road ------------------------------------------------------------------

/** A wheel over a rail joint: the "gatan" of a train going by. */
export function railJoint(distance: number, speed: number) {
  const v = voice(Math.min(1, 0.3 + speed / 10), distance, 40, 0.5);
  if (!v) return;
  toneHit(v, { frequency: 90, sweepTo: 55, duration: 0.09, gain: 0.25, type: "sine" });
  noiseHit(v, { frequency: 900, duration: 0.05, gain: 0.08, q: 1.2 });
}

/** The level crossing's bell: one strike, high or low by turns (kan, kan). */
export function crossingBell(distance: number, high: boolean) {
  const v = voice(0.9, distance, 60, 0.8);
  if (!v) return;
  bell(v, high ? 760 : 680, 0, 0.06, 0.45);
}

/** A train's doors: the chime, then the doors sliding. */
export function trainDoors(distance: number, opening: boolean) {
  const v = voice(0.9, distance, 30, 2);
  if (!v) return;
  bell(v, 1568, 0, 0.05, 0.4);
  bell(v, 1318.5, 0.25, 0.05, 0.4);
  bell(v, 1568, 0.5, 0.05, 0.5);
  noiseHit(v, { frequency: opening ? 900 : 700, sweepTo: opening ? 500 : 400, duration: 0.7, gain: 0.04, q: 0.8, delay: 0.7 });
}

/** A bus's doors: the air's hiss as they fold, and a ding. */
export function busDoors(distance: number) {
  const v = voice(0.9, distance, 30, 2);
  if (!v) return;
  noiseHit(v, { frequency: 3000, sweepTo: 1800, duration: 0.5, gain: 0.08, q: 0.7 });
  bell(v, 1046.5, 0.6, 0.05, 0.6);
}

/** An espresso machine's steam wand. */
export function steamWand(distance?: number) {
  const v = voice(0.8, distance, 10, 2);
  if (!v) return;
  noiseHit(v, { frequency: 5000, duration: 1.4, gain: 0.05, q: 0.6, attack: 0.15 });
}

// --- paying -----------------------------------------------------------------------------

/** The register: the scanner's beep, and the coins into the tray. */
export function register(distance?: number) {
  const v = voice(0.8, distance, 10, 1.4);
  if (!v) return;
  toneHit(v, { frequency: 2730, duration: 0.09, gain: 0.05, type: "square", attack: 0.002 });
  bell(v, 4100, 0.45, 0.03, 0.12);
  bell(v, 3700, 0.55, 0.025, 0.12);
  noiseHit(v, { frequency: 2600, duration: 0.05, gain: 0.04, q: 1.5, delay: 0.62 });
}

/** The ATM: its keys, a whir, and the notes counted out. */
export function atm(distance?: number) {
  const v = voice(0.8, distance, 8, 2.4);
  if (!v) return;
  for (let i = 0; i < 4; i++) toneHit(v, { frequency: 1500, duration: 0.05, gain: 0.03, type: "square", delay: i * 0.16 });
  noiseHit(v, { frequency: 600, duration: 0.9, gain: 0.035, q: 1.1, delay: 0.75, attack: 0.08 });
  for (let i = 0; i < 6; i++) noiseHit(v, { frequency: 3200, duration: 0.025, gain: 0.03, q: 2, delay: 0.9 + i * 0.09 });
}
