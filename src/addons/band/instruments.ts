import { sfxOutput } from "../../audio/sfx";
import { noiseHit, toneHit, voice, type Voice } from "../sound";

export const INSTRUMENTS = ["drums", "kit", "keys", "guitar", "electric", "bass", "lightstick"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const INSTRUMENT_LABELS: Record<Instrument, [string, string]> = {
  drums: ["Drum pad", "ドラムパッド"],
  kit: ["Drum kit", "ドラムセット"],
  keys: ["Keys", "キーボード"],
  guitar: ["Guitar", "ギター"],
  electric: ["Lead guitar", "エレキギター"],
  bass: ["Bass", "ベース"],
  lightstick: ["Light stick", "ペンライト"],
};

/** The instruments worn on the chest, played with a strum and a fret hand. */
export const WORN = ["guitar", "electric", "bass"] as const;
export type Worn = (typeof WORN)[number];
export const isWorn = (i: Instrument | null): i is Worn => (WORN as readonly string[]).includes(i ?? "");

export const LIGHT_COLORS = ["#ff4fa3", "#4fb2ff", "#59ff8a", "#ffe14f", "#b36bff", "#ff8a3d", "#ffffff"] as const;

export interface Pad {
  label: string;
  key: string;
}

/** The pads, left to right in two rows of four (back row first). */
export const DRUM_PADS: Pad[] = [
  { label: "Crash", key: "Q" },
  { label: "Hi tom", key: "W" },
  { label: "Lo tom", key: "E" },
  { label: "Open hat", key: "R" },
  { label: "Kick", key: "A" },
  { label: "Snare", key: "S" },
  { label: "Clap", key: "D" },
  { label: "Hat", key: "F" },
];

/** A drum kit's pieces, the bottom row the groove (kick, snare, hats). */
export const KIT_PIECES: Pad[] = [
  { label: "Crash", key: "Q" },
  { label: "Hi tom", key: "W" },
  { label: "Mid tom", key: "E" },
  { label: "Floor tom", key: "R" },
  { label: "Ride", key: "T" },
  { label: "Kick", key: "A" },
  { label: "Snare", key: "S" },
  { label: "Hi-hat", key: "D" },
  { label: "Open hat", key: "F" },
  { label: "Rim", key: "G" },
  { label: "Splash", key: "Z" },
  { label: "China", key: "X" },
  { label: "Cowbell", key: "C" },
];
export const KIT = { crash: 0, hiTom: 1, midTom: 2, floorTom: 3, ride: 4, kick: 5, snare: 6, hat: 7, openHat: 8, rim: 9, splash: 10, china: 11, cowbell: 12 } as const;

/** An octave and a half, C up to the F above the next C, on the keys
 *  music software's typing keyboard uses (A to K, then O L P ; '). */
export const KEY_LAYOUT: { semitone: number; key: string; black: boolean }[] = [
  ["A", false], ["W", true], ["S", false], ["E", true], ["D", false], ["F", false], ["T", true],
  ["G", false], ["Y", true], ["H", false], ["U", true], ["J", false], ["K", false],
  ["O", true], ["L", false], ["P", true], [";", false], ["'", false],
].map(([key, black], semitone) => ({ semitone, key: key as string, black: black as boolean }));
export const KEYS_BASE = 60;
export const KEYS_RANGE: [number, number] = [36, 96];

/**
 * Twelve chords in standard-tuning voicings: the six most songs start with
 * on the home row, and six more above them for the turns between.
 */
export const CHORDS: { name: string; key: string; notes: number[]; root: number }[] = [
  { name: "C", key: "A", notes: [48, 52, 55, 60, 64], root: 36 },
  { name: "G", key: "S", notes: [43, 47, 50, 55, 59, 67], root: 31 },
  { name: "Am", key: "D", notes: [45, 52, 57, 60, 64], root: 33 },
  { name: "F", key: "F", notes: [41, 48, 53, 57, 60, 65], root: 29 },
  { name: "Em", key: "G", notes: [40, 47, 52, 55, 59, 64], root: 28 },
  { name: "D", key: "H", notes: [50, 57, 62, 66], root: 38 },
  { name: "A", key: "Q", notes: [45, 52, 57, 61, 64], root: 33 },
  { name: "E", key: "W", notes: [40, 47, 52, 56, 59, 64], root: 28 },
  { name: "Dm", key: "E", notes: [50, 57, 62, 65], root: 38 },
  { name: "Bm", key: "R", notes: [47, 54, 59, 62, 66], root: 35 },
  { name: "Cmaj7", key: "T", notes: [48, 52, 55, 59, 64], root: 36 },
  { name: "G7", key: "Y", notes: [43, 47, 50, 55, 59, 65], root: 31 },
];

/**
 * The lead guitar: six power chords for riffs on the home row, and six
 * notes of E minor pentatonic above them for a lead line, which every
 * power chord here sits under.
 */
export const ELECTRIC: { label: string; key: string; notes: number[] }[] = [
  { label: "E5", key: "A", notes: [40, 47, 52] },
  { label: "G5", key: "S", notes: [43, 50, 55] },
  { label: "A5", key: "D", notes: [45, 52, 57] },
  { label: "C5", key: "F", notes: [48, 55, 60] },
  { label: "D5", key: "G", notes: [50, 57, 62] },
  { label: "B5", key: "H", notes: [47, 54, 59] },
  { label: "E", key: "Q", notes: [64] },
  { label: "G", key: "W", notes: [67] },
  { label: "A", key: "E", notes: [69] },
  { label: "B", key: "R", notes: [71] },
  { label: "D", key: "T", notes: [74] },
  { label: "E'", key: "Y", notes: [76] },
];

/** The bass plays each chord's root, an octave and more down: the same
 *  pads as the guitar's, so the two lock together. */
export const BASS: Pad[] = CHORDS.map((c) => ({ label: c.name, key: c.key }));

/** Every instrument played from pads, its pads in order (a note is an index). */
export const PADS: Partial<Record<Instrument, Pad[]>> = {
  drums: DRUM_PADS,
  kit: KIT_PIECES,
  guitar: CHORDS.map((c) => ({ label: c.name, key: c.key })),
  electric: ELECTRIC,
  bass: BASS,
};
/** How many pads a row, on screen. */
export const PAD_COLUMNS: Partial<Record<Instrument, number>> = { drums: 4, kit: 5, guitar: 6, electric: 6, bass: 6 };

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
/** Bands carry further than footsteps. */
const FALLOFF = 45;

export function playDrum(pad: number, distance?: number) {
  const v = voice(1, distance, FALLOFF);
  if (!v) return;
  switch (pad) {
    case 0: // crash
      crash(v);
      break;
    case 1: // hi tom
      tom(v, 240);
      break;
    case 2: // lo tom
      tom(v, 150);
      break;
    case 3: // open hat
      noiseHit(v, { frequency: 8000, duration: 0.32, gain: 0.28, type: "highpass" });
      break;
    case 4: // kick
      kick(v);
      break;
    case 5: // snare
      snare(v);
      break;
    case 6: // clap: a few quick slaps and a tail
      for (const delay of [0, 0.011, 0.023]) noiseHit(v, { frequency: 1200, duration: 0.03, gain: 0.5, q: 1.2, delay });
      noiseHit(v, { frequency: 1100, duration: 0.2, gain: 0.35, q: 1, delay: 0.034 });
      break;
    default: // closed hat
      noiseHit(v, { frequency: 9000, duration: 0.05, gain: 0.3, type: "highpass" });
  }
}

const kick = (v: Voice) => {
  toneHit(v, { frequency: 150, sweepTo: 40, duration: 0.45, gain: 1 });
  noiseHit(v, { frequency: 3000, duration: 0.02, gain: 0.25 });
};
const snare = (v: Voice) => {
  noiseHit(v, { frequency: 1900, duration: 0.22, gain: 0.6, q: 0.6 });
  toneHit(v, { frequency: 195, sweepTo: 160, duration: 0.11, gain: 0.45, type: "triangle" });
};
const tom = (v: Voice, f: number) => {
  toneHit(v, { frequency: f, sweepTo: f * 0.62, duration: 0.3 + 60 / f, gain: 0.75 });
  noiseHit(v, { frequency: f * 6, duration: 0.05, gain: 0.15 });
};
const crash = (v: Voice) => {
  noiseHit(v, { frequency: 5500, duration: 1.4, gain: 0.35, type: "highpass" });
  noiseHit(v, { frequency: 9000, duration: 0.5, gain: 0.2, type: "bandpass", q: 2 });
};

/** Two square tones a little over a fifth apart, through a narrow band,
 *  the way the classic drum machines made one. */
const cowbell = (v: Voice) => {
  const band = v.ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2600;
  band.Q.value = 1.2;
  band.connect(v.out);
  for (const frequency of [562, 845]) toneHit({ ...v, out: band }, { frequency, duration: 0.32, gain: 0.6, type: "square" });
};

/** A real kit: its own toms and cymbals, a deeper kick, a ride's ping. */
export function playKit(piece: number, distance?: number) {
  const v = voice(1, distance, FALLOFF);
  if (!v) return;
  switch (piece) {
    case KIT.crash:
      crash(v);
      break;
    case KIT.hiTom:
      tom(v, 260);
      break;
    case KIT.midTom:
      tom(v, 190);
      break;
    case KIT.floorTom:
      tom(v, 115);
      break;
    case KIT.ride:
      // A bell's ping over a wash.
      toneHit(v, { frequency: 3520, duration: 0.6, gain: 0.07, type: "triangle" });
      toneHit(v, { frequency: 5280, duration: 0.4, gain: 0.04, type: "sine" });
      noiseHit(v, { frequency: 7000, duration: 0.9, gain: 0.16, type: "highpass" });
      break;
    case KIT.kick:
      toneHit(v, { frequency: 120, sweepTo: 36, duration: 0.5, gain: 0.92 });
      noiseHit(v, { frequency: 2500, duration: 0.025, gain: 0.3 });
      break;
    case KIT.snare:
      snare(v);
      noiseHit(v, { frequency: 4500, duration: 0.14, gain: 0.25, type: "highpass" });
      break;
    case KIT.openHat:
      noiseHit(v, { frequency: 8000, duration: 0.4, gain: 0.3, type: "highpass" });
      break;
    case KIT.rim:
      toneHit(v, { frequency: 1700, duration: 0.05, gain: 0.35, type: "square" });
      noiseHit(v, { frequency: 3000, duration: 0.03, gain: 0.3, q: 3 });
      break;
    case KIT.splash:
      // Small and quick: bright, gone in half a second.
      noiseHit(v, { frequency: 7500, duration: 0.55, gain: 0.32, type: "highpass" });
      noiseHit(v, { frequency: 11000, duration: 0.25, gain: 0.18, type: "bandpass", q: 1.5 });
      break;
    case KIT.china:
      // Trashy: a narrow, honking band over the wash, and a long tail.
      noiseHit(v, { frequency: 3200, duration: 1.2, gain: 0.32, type: "bandpass", q: 4 });
      noiseHit(v, { frequency: 6000, duration: 1.0, gain: 0.22, type: "highpass" });
      toneHit(v, { frequency: 410, duration: 0.5, gain: 0.05, type: "square" });
      break;
    case KIT.cowbell:
      cowbell(v);
      break;
    default: // closed hat
      noiseHit(v, { frequency: 9500, duration: 0.05, gain: 0.32, type: "highpass" });
  }
}

/** An electric-piano-ish note: two sines a little apart and a soft bell. */
export function playKey(midi: number, distance?: number) {
  const v = voice(0.9, distance, FALLOFF);
  if (!v) return;
  const f = hz(midi);
  toneHit(v, { frequency: f, duration: 1.6, gain: 0.32, type: "triangle", attack: 0.006 });
  toneHit(v, { frequency: f, duration: 1.2, gain: 0.18, type: "sine", detune: 7 });
  toneHit(v, { frequency: f * 4, duration: 0.35, gain: 0.04, type: "sine" });
}

// --- strings: plucked, for the guitars and the bass ----------------------------------
// Karplus-Strong: a burst of noise round a short loop, averaged as it goes
// (a low-pass inside the loop, so it darkens as it rings, as a string
// does), rings at the loop's pitch. Rendered once per note and kept.
// Then each instrument's own body: an acoustic's resonant box, an amp
// and its speaker cabinet, a bass's growl and weight.

interface Pluck {
  /** Seconds more ring than a guitar string's. */
  sustain?: number;
  /** How rounded the attack is, 0 a pick's snap to 1 a thumb's thud: the
   *  burst smoothed before it starts round the loop. */
  soft?: number;
}

const plucks = new Map<string, AudioBuffer>();
function pluck(ctx: AudioContext, midi: number, { sustain = 0, soft = 0 }: Pluck = {}): AudioBuffer {
  const key = `${ctx.sampleRate}:${midi}:${sustain}:${soft}`;
  const cached = plucks.get(key);
  if (cached) return cached;
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * (1.8 + sustain));
  const buffer = ctx.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(rate / hz(midi)));
  const loop = new Float32Array(period);
  for (let i = 0; i < period; i++) loop[i] = Math.random() * 2 - 1;
  // Plucked a fifth of the way along, as a string usually is: that point's
  // harmonics cancel, which is most of what makes it sound plucked.
  const at = Math.max(1, Math.round(period * 0.2));
  const picked = loop.map((x, i) => x - loop[(i + at) % period] * 0.9);
  for (let pass = 0; pass < Math.round(soft * 6); pass++) for (let i = 0; i < period; i++) picked[i] = (picked[i] + picked[(i + 1) % period]) * 0.5;
  loop.set(picked);
  // Higher strings die away faster, like real ones; `sustain` holds them longer.
  const decay = Math.min(0.9995, 0.996 - Math.min(0.006, (midi - 40) * 0.00008) + sustain * 0.0015);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const j = i % period;
    const next = loop[(j + 1) % period];
    out[i] = loop[j];
    peak = Math.max(peak, Math.abs(out[i]));
    loop[j] = decay * 0.5 * (loop[j] + next);
  }
  // Every note as loud as every other, however its burst came out, dying
  // away as a string does (low notes barely decay in the loop alone) and
  // faded right out before the buffer ends, so it never clicks off.
  const tau = (0.7 + sustain * 0.7) * rate;
  const fade = Math.floor(rate * 0.12);
  if (peak > 0) for (let i = 0; i < length; i++) out[i] *= (Math.exp(-i / tau) * Math.min(1, (length - i) / fade)) / peak;
  plucks.set(key, buffer);
  return buffer;
}

/** Each note of `notes` plucked into `to`, `spread` seconds apart (a strum). */
function strum(v: Voice, notes: number[], to: AudioNode, gain: number, spread: number, options: Pluck = {}, delay = 0, rate = 1) {
  return notes.map((midi, i) => {
    const source = v.ctx.createBufferSource();
    source.buffer = pluck(v.ctx, midi, options);
    source.playbackRate.value = rate;
    const g = v.ctx.createGain();
    g.gain.value = gain;
    source.connect(g).connect(to);
    source.start(v.t + delay + i * spread);
    return source;
  });
}

const filter = (ctx: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7, gain = 0) => {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
};
/** Nodes wired one into the next; returns the first. */
const chain = (...nodes: AudioNode[]) => {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[0];
};

/** The acoustic: steel strings over a wooden box, which booms a little
 *  low down and rings in the upper mids, and the pick's tick first. */
export function playChord(chord: number, distance?: number) {
  const notes = CHORDS[chord]?.notes;
  if (!notes) return;
  const v = voice(1, distance, FALLOFF);
  if (!v) return;
  const body = chain(filter(v.ctx, "peaking", 105, 1.2, 5), filter(v.ctx, "peaking", 230, 1.4, 2.5), filter(v.ctx, "peaking", 2800, 1, 2), filter(v.ctx, "highshelf", 5000, 0.7, -6), v.out);
  strum(v, notes, body, 0.48, 0.016);
  noiseHit(v, { frequency: 3500, duration: 0.025, gain: 0.07, q: 1.5 });
}

const curves = new Map<string, Float32Array>();
/** A waveshaper's curve: `drive` how hard it's pushed, `lean` how lopsided
 *  (a valve amp's even harmonics); soft at the edges either way. */
function shaper(drive: number, lean = 0) {
  const key = `${drive}:${lean}`;
  let curve = curves.get(key);
  if (!curve) {
    const n = 2048;
    curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive + lean) - Math.tanh(lean);
    }
    curves.set(key, curve);
  }
  return curve as Float32Array<ArrayBuffer>;
}

/**
 * The lead guitar, as a rock rig is: the strings into a tight low cut, an
 * overdriven valve amp (oversampled, so the fizz doesn't alias), a mid
 * shape (scooped for chords, pushed for a lead), a presence lift, and a
 * speaker cabinet rolling the top off. A power chord is double-tracked, a
 * second strum a hair later and a few cents up, for its width; a lead note
 * holds, with vibrato coming in as it rings.
 */
export function playElectric(note: number, distance?: number) {
  const spec = ELECTRIC[note];
  if (!spec) return;
  const v = voice(0.7, distance, FALLOFF);
  if (!v) return;
  const lead = spec.notes.length === 1;
  const amp = v.ctx.createWaveShaper();
  amp.curve = shaper(lead ? 5 : 6, 0.2);
  amp.oversample = "4x";
  const level = v.ctx.createGain();
  level.gain.value = lead ? 0.6 : 0.5;
  const input = chain(
    filter(v.ctx, "highpass", lead ? 150 : 90),
    amp,
    // Chords: chunk low down and a little scoop; a lead: the mids pushed.
    filter(v.ctx, "peaking", lead ? 900 : 220, lead ? 0.9 : 0.8, lead ? 4 : 3),
    filter(v.ctx, "peaking", lead ? 2200 : 600, 0.9, lead ? 2 : -2),
    filter(v.ctx, "peaking", 1800, 1, lead ? 0 : 2),
    // The cabinet: a speaker rolls off the fizz above a few kHz.
    filter(v.ctx, "lowpass", lead ? 3800 : 3000, 0.9),
    filter(v.ctx, "lowpass", 5200, 0.6),
    filter(v.ctx, "highpass", 70),
    level,
    v.out
  );
  const sustain = { sustain: lead ? 1.2 : 0.4 };
  const sources = strum(v, spec.notes, input, lead ? 0.9 : 0.6, lead ? 0 : 0.007, sustain);
  if (!lead) strum(v, spec.notes, input, 0.45, 0.007, sustain, 0.012, Math.pow(2, 6 / 1200));
  if (lead) {
    // Vibrato: the pitch wavering a little, a beat after the note starts.
    const lfo = v.ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = v.ctx.createGain();
    depth.gain.setValueAtTime(0, v.t);
    depth.gain.linearRampToValueAtTime(0.012, v.t + 0.35);
    lfo.connect(depth);
    for (const s of sources) depth.connect(s.playbackRate);
    lfo.start(v.t);
    lfo.stop(v.t + 2.6);
  }
}

/**
 * The bass: a thick string plucked with a soft thumb, warmed by a little
 * saturation, through a low-pass that opens on the pluck and closes as it
 * rings, a lift round 90 Hz for the weight in the chest and round 220 for
 * the growl (the harmonics a laptop or phone can play, so the note is
 * heard where its fundamental can't be), and a sine at the root under it.
 * The old one was nearly all sine, which small speakers barely play.
 */
export function playBass(note: number, distance?: number) {
  const root = CHORDS[note]?.root;
  if (root === undefined) return;
  const v = voice(1, distance, FALLOFF);
  if (!v) return;
  const warm = v.ctx.createWaveShaper();
  warm.curve = shaper(1.6, 0.1);
  warm.oversample = "2x";
  const tone = filter(v.ctx, "lowpass", 1200, 1.4);
  tone.frequency.setValueAtTime(1200, v.t);
  tone.frequency.exponentialRampToValueAtTime(350, v.t + 0.4);
  const level = v.ctx.createGain();
  level.gain.value = 0.8;
  const input = chain(warm, tone, filter(v.ctx, "peaking", 90, 1, 5), filter(v.ctx, "peaking", 220, 1.2, 3), filter(v.ctx, "highpass", 30), level, v.out);
  strum(v, [root], input, 0.8, 0, { sustain: 0.8, soft: 0.6 });
  toneHit(v, { frequency: hz(root), duration: 1.3, gain: 0.22, attack: 0.008 });
  // The thumb's thump on the string.
  noiseHit(v, { frequency: 700, duration: 0.03, gain: 0.05, q: 0.8 });
}

/** Any musician's note, by instrument. */
export function playNote(instrument: Instrument, note: number, distance?: number) {
  if (instrument === "drums") playDrum(note, distance);
  else if (instrument === "kit") playKit(note, distance);
  else if (instrument === "keys") playKey(note, distance);
  else if (instrument === "guitar") playChord(note, distance);
  else if (instrument === "electric") playElectric(note, distance);
  else if (instrument === "bass") playBass(note, distance);
}

/** How many notes an instrument has (keys excepted, which go by MIDI). */
export function noteCount(instrument: Instrument): number {
  return PADS[instrument]?.length ?? 0;
}

/** Warms the strings, so the first strum doesn't stall a frame. */
export function prepareGuitar() {
  const output = sfxOutput();
  if (!output) return;
  for (const chord of CHORDS) {
    for (const midi of chord.notes) pluck(output.ctx, midi);
    pluck(output.ctx, chord.root, { sustain: 0.8, soft: 0.6 });
  }
  for (const e of ELECTRIC) for (const midi of e.notes) pluck(output.ctx, midi, { sustain: e.notes.length === 1 ? 1.2 : 0.4 });
}
