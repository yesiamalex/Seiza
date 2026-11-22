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
];
export const KIT = { crash: 0, hiTom: 1, midTom: 2, floorTom: 3, ride: 4, kick: 5, snare: 6, hat: 7, openHat: 8, rim: 9 } as const;

/** A piano octave and one more C, on the keys a DAW uses. */
export const KEY_LAYOUT: { semitone: number; key: string; black: boolean }[] = [
  ["A", false], ["W", true], ["S", false], ["E", true], ["D", false], ["F", false], ["T", true],
  ["G", false], ["Y", true], ["H", false], ["U", true], ["J", false], ["K", false],
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
      toneHit(v, { frequency: 120, sweepTo: 36, duration: 0.5, gain: 1.1 });
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
// Karplus-Strong: a burst of noise round a short loop, averaged as it goes,
// rings like a string at the loop's pitch. Rendered once per note and kept.

const plucks = new Map<string, AudioBuffer>();
function pluck(ctx: AudioContext, midi: number, sustain = 0): AudioBuffer {
  const key = `${ctx.sampleRate}:${midi}:${sustain}`;
  const cached = plucks.get(key);
  if (cached) return cached;
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * (1.8 + sustain));
  const buffer = ctx.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(rate / hz(midi)));
  const loop = new Float32Array(period);
  for (let i = 0; i < period; i++) loop[i] = Math.random() * 2 - 1;
  // Higher strings die away faster, like real ones; `sustain` holds them longer.
  const decay = Math.min(0.9995, 0.996 - Math.min(0.006, (midi - 40) * 0.00008) + sustain * 0.0015);
  for (let i = 0; i < length; i++) {
    const j = i % period;
    const next = loop[(j + 1) % period];
    out[i] = loop[j];
    loop[j] = decay * 0.5 * (loop[j] + next);
  }
  plucks.set(key, buffer);
  return buffer;
}

function strum(v: Voice, notes: number[], to: AudioNode = v.out, gain = 0.3, spread = 0.014, sustain = 0) {
  return notes.map((midi, i) => {
    const source = v.ctx.createBufferSource();
    source.buffer = pluck(v.ctx, midi, sustain);
    const g = v.ctx.createGain();
    g.gain.value = gain;
    source.connect(g).connect(to);
    source.start(v.t + i * spread);
    return source;
  });
}

export function playChord(chord: number, distance?: number) {
  const notes = CHORDS[chord]?.notes;
  if (!notes) return;
  const v = voice(1, distance, FALLOFF);
  if (v) strum(v, notes);
}

let drive: Float32Array | null = null;
/** An overdriven amp's curve: soft at the edges, hard in the middle. */
function overdrive() {
  if (drive) return drive;
  const n = 1024;
  drive = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    drive[i] = Math.tanh(x * 6) * 0.8;
  }
  return drive;
}

/** The lead guitar: strings through an overdriven amp and its cabinet
 *  (a low-pass); a lead note held, with vibrato coming in as it rings. */
export function playElectric(note: number, distance?: number) {
  const spec = ELECTRIC[note];
  if (!spec) return;
  const v = voice(0.85, distance, FALLOFF);
  if (!v) return;
  const amp = v.ctx.createWaveShaper();
  amp.curve = overdrive() as Float32Array<ArrayBuffer>;
  const cabinet = v.ctx.createBiquadFilter();
  cabinet.type = "lowpass";
  cabinet.frequency.value = spec.notes.length > 1 ? 2600 : 3400;
  amp.connect(cabinet).connect(v.out);
  const lead = spec.notes.length === 1;
  const sources = strum(v, spec.notes, amp, lead ? 0.5 : 0.36, lead ? 0 : 0.006, lead ? 1.2 : 0.4);
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

/** The bass: a low plucked string, a sine under it for weight, its top
 *  rolled off. */
export function playBass(note: number, distance?: number) {
  const root = CHORDS[note]?.root;
  if (root === undefined) return;
  const v = voice(1, distance, FALLOFF);
  if (!v) return;
  const tone = v.ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 900;
  tone.connect(v.out);
  strum(v, [root], tone, 0.7, 0, 0.6);
  toneHit(v, { frequency: hz(root), duration: 1.1, gain: 0.35, attack: 0.01 });
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
    pluck(output.ctx, chord.root, 0.6);
  }
  for (const e of ELECTRIC) for (const midi of e.notes) pluck(output.ctx, midi, e.notes.length === 1 ? 1.2 : 0.4);
}
