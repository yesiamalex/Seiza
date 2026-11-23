import { sfxOutput } from "../../audio/sfx";
import { noiseHit, toneHit, voice, type Voice } from "../sound";

export const INSTRUMENTS = ["drums", "kit", "taiko", "keys", "kulintang", "guitar", "electric", "bass", "shaker", "lightstick"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const INSTRUMENT_LABELS: Record<Instrument, [string, string]> = {
  drums: ["Drum pad", "ドラムパッド"],
  kit: ["Drum kit", "ドラムセット"],
  taiko: ["Taiko", "和太鼓"],
  keys: ["Keys", "キーボード"],
  kulintang: ["Kulintang", "クリンタン"],
  guitar: ["Guitar", "ギター"],
  electric: ["Lead guitar", "エレキギター"],
  bass: ["Bass", "ベース"],
  shaker: ["Shaker", "シェイカー"],
  lightstick: ["Light stick", "ペンライト"],
};

/** The instruments worn on the chest, played with a strum and a fret hand. */
export const WORN = ["guitar", "electric", "bass"] as const;
export type Worn = (typeof WORN)[number];
export const isWorn = (i: Instrument | null): i is Worn => (WORN as readonly string[]).includes(i ?? "");

/** The instruments that stand on the floor in front of their player (a
 *  pad, a keyboard, a kit, a row of gongs, a taiko): set up where they
 *  are, and left there, so their player stays at them while they're out
 *  (PlayerRig's `rooted`). */
export const STANDS = ["drums", "kit", "keys", "kulintang", "taiko"] as const;
export const isStand = (i: Instrument | null) => (STANDS as readonly string[]).includes(i ?? "");

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

/**
 * The kulintang: a row of eight small bossed gongs, the melody of a
 * Maguindanao and Maranao gong ensemble, struck with two light mallets.
 * Each set is tuned by ear and none matches a Western scale; this one is
 * pentatonic (D E G A C D E G), so any gongs struck together, or one after
 * another, sound right.
 */
export const GONGS = [62, 64, 67, 69, 72, 74, 76, 79];

/** The taiko: the drum's face (don) with either hand, and its rim (ka),
 *  left to right as they lie under the hands: ka, don, don, ka. */
export const TAIKO = { kaLeft: 0, donLeft: 1, donRight: 2, kaRight: 3 } as const;
export const TAIKO_PADS: Pad[] = [
  { label: "Ka", key: "D" },
  { label: "Don", key: "F" },
  { label: "Don", key: "J" },
  { label: "Ka", key: "K" },
];

/** The shaker: a shake on the beat, and a softer one between. */
export const SHAKER_PADS: Pad[] = [
  { label: "Shake", key: "F" },
  { label: "Soft", key: "J" },
];

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

/**
 * Single strings, for a melody: the fret hand holds a chord (the last one
 * strummed, or fretted with Shift), and keys 1 to 6 pick its strings, low
 * to high, an octave up past its top string. The bass picks the root, its
 * fifth, the octave, and the fifth above, for the lines bassists walk. A
 * pick is note PICK_BASE + chord × 6 + string, so it travels as any note
 * does.
 */
export const PICK_BASE = 20;
export const STRINGS: Record<Worn, number> = { guitar: 6, electric: 6, bass: 4 };
export const PICK_KEYS = ["1", "2", "3", "4", "5", "6"];
const BASS_PICKS = [0, 7, 12, 19];
export const pickNote = (chord: number, string: number) => PICK_BASE + chord * 6 + string;
export const unpick = (note: number) => (note >= PICK_BASE ? { chord: Math.floor((note - PICK_BASE) / 6), string: (note - PICK_BASE) % 6 } : null);
/** The chord a note is played from: itself, or the one a pick is from. */
export const chordOf = (note: number) => unpick(note)?.chord ?? note;
/** Chords a pick can be from: the guitar's and bass's twelve, the lead's six power chords. */
export const pickable = (instrument: Worn, chord: number) => Number.isInteger(chord) && chord >= 0 && chord < (instrument === "electric" ? 6 : CHORDS.length);

/** The MIDI note a string picks from a chord, or null if there's no such string. */
export function pickedMidi(instrument: Worn, chord: number, string: number): number | null {
  if (!pickable(instrument, chord) || !Number.isInteger(string) || string < 0 || string >= STRINGS[instrument]) return null;
  if (instrument === "bass") return CHORDS[chord].root + BASS_PICKS[string];
  const notes = instrument === "guitar" ? CHORDS[chord].notes : ELECTRIC[chord].notes;
  return notes[string % notes.length] + 12 * Math.floor(string / notes.length);
}

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export const noteName = (midi: number) => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);

/** Every instrument played from pads, its pads in order (a note is an index). */
export const PADS: Partial<Record<Instrument, Pad[]>> = {
  drums: DRUM_PADS,
  kit: KIT_PIECES,
  guitar: CHORDS.map((c) => ({ label: c.name, key: c.key })),
  electric: ELECTRIC,
  bass: BASS,
  kulintang: GONGS.map((midi, i) => ({ label: noteName(midi), key: "ASDFGHJK"[i] })),
  taiko: TAIKO_PADS,
  shaker: SHAKER_PADS,
};
/** How many pads a row, on screen. */
export const PAD_COLUMNS: Partial<Record<Instrument, number>> = { drums: 4, kit: 5, guitar: 6, electric: 6, bass: 6, kulintang: 8, taiko: 4, shaker: 2 };

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

/** The longest a held key rings before it lets go by itself. */
export const KEY_HOLD_SECONDS = 8;

/**
 * An electric-piano-ish note that rings while its key is held, as a real
 * one does: two tones a little apart and a soft bell, struck, then fading
 * slowly toward a quiet sustain, and damped quickly on release. Several
 * held at once mix into a chord. Returns the release; it lets go by
 * itself after KEY_HOLD_SECONDS.
 */
export function holdKey(midi: number, distance?: number): () => void {
  const v = voice(0.9, distance, FALLOFF, KEY_HOLD_SECONDS + 1);
  if (!v) return () => {};
  const { ctx, t } = v;
  const f = hz(midi);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(1, t + 0.006);
  // Toward a quiet sustain: about a third of the way down in half a second.
  env.gain.setTargetAtTime(0.22, t + 0.01, 0.9);
  env.connect(v.out);
  const oscillators = (
    [
      [f, "triangle", 0.32, 0],
      [f, "sine", 0.18, 7],
    ] as const
  ).map(([frequency, type, gain, detune]) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(env);
    osc.start(t);
    return osc;
  });
  // The bell on the strike only.
  toneHit(v, { frequency: f * 4, duration: 0.35, gain: 0.04, type: "sine" });
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const now = ctx.currentTime;
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), now);
    env.gain.setTargetAtTime(0.0001, now, 0.07);
    for (const osc of oscillators) osc.stop(now + 0.6);
  };
  setTimeout(release, KEY_HOLD_SECONDS * 1000);
  return release;
}

/** A key tapped rather than held: struck, and let go after a moment. */
export function playKey(midi: number, distance?: number) {
  setTimeout(holdKey(midi, distance), 1100);
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
  if (notes) acoustic(notes, distance);
}

function acoustic(notes: number[], distance?: number) {
  const v = voice(1, distance, FALLOFF);
  if (!v) return;
  const single = notes.length === 1;
  const body = chain(filter(v.ctx, "peaking", 105, 1.2, 5), filter(v.ctx, "peaking", 230, 1.4, 2.5), filter(v.ctx, "peaking", 2800, 1, 2), filter(v.ctx, "highshelf", 5000, 0.7, -6), v.out);
  // One string picked rings a little louder than each of a strum's.
  strum(v, notes, body, single ? 0.75 : 0.48, 0.016);
  noiseHit(v, { frequency: 3500, duration: 0.025, gain: single ? 0.045 : 0.07, q: 1.5 });
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
  if (spec) amped(spec.notes, distance);
}

function amped(notes: number[], distance?: number) {
  const v = voice(0.7, distance, FALLOFF);
  if (!v) return;
  const lead = notes.length === 1;
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
  const sources = strum(v, notes, input, lead ? 0.9 : 0.6, lead ? 0 : 0.007, sustain);
  if (!lead) strum(v, notes, input, 0.45, 0.007, sustain, 0.012, Math.pow(2, 6 / 1200));
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
  if (root !== undefined) bassNote(root, distance);
}

function bassNote(root: number, distance?: number) {
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

/**
 * A gong of the kulintang: a bossed gong rings near a pure tone, with a
 * soft second partial a little off the octave and a quick, higher third,
 * and it rings long; the mallet's padded tap first.
 */
export function playGong(gong: number, distance?: number) {
  const midi = GONGS[gong];
  if (midi === undefined) return;
  const v = voice(0.85, distance, FALLOFF, 3);
  if (!v) return;
  const f = hz(midi);
  toneHit(v, { frequency: f, sweepTo: f * 0.996, duration: 2.2, gain: 0.5 });
  toneHit(v, { frequency: f * 2.01, duration: 0.9, gain: 0.14 });
  toneHit(v, { frequency: f * 2.76, duration: 0.4, gain: 0.07 });
  noiseHit(v, { frequency: 1600, duration: 0.02, gain: 0.07, q: 1.2 });
}

/** The taiko: a deep, long don on the face, a dry wooden ka on the rim. */
export function playTaiko(note: number, distance?: number) {
  const v = voice(1, distance, FALLOFF, 2);
  if (!v) return;
  if (note === TAIKO.donLeft || note === TAIKO.donRight) {
    toneHit(v, { frequency: 92, sweepTo: 64, duration: 1.1, gain: 1 });
    toneHit(v, { frequency: 180, sweepTo: 138, duration: 0.3, gain: 0.35, type: "triangle" });
    noiseHit(v, { frequency: 500, duration: 0.09, gain: 0.35, q: 0.7 });
  } else {
    toneHit(v, { frequency: 1250, duration: 0.05, gain: 0.28, type: "triangle" });
    noiseHit(v, { frequency: 2600, duration: 0.04, gain: 0.45, q: 3 });
  }
}

/** The shaker: seeds hitting the shell, a rattle of two quick grains. */
export function playShaker(note: number, distance?: number) {
  const v = voice(1, distance, FALLOFF);
  if (!v) return;
  const g = note === 0 ? 1 : 0.5;
  noiseHit(v, { frequency: 6500, duration: 0.06, gain: 0.3 * g, q: 1.4 });
  noiseHit(v, { frequency: 8200, duration: 0.05, gain: 0.18 * g, q: 1.2, delay: 0.018 });
}

/** One string picked (see PICK_BASE), on whichever worn instrument. */
export function playPick(instrument: Worn, note: number, distance?: number) {
  const pick = unpick(note);
  const midi = pick ? pickedMidi(instrument, pick.chord, pick.string) : null;
  if (midi === null) return;
  if (instrument === "guitar") acoustic([midi], distance);
  else if (instrument === "electric") amped([midi], distance);
  else bassNote(midi, distance);
}

/** Any musician's note, by instrument. */
export function playNote(instrument: Instrument, note: number, distance?: number) {
  if (isWorn(instrument) && note >= PICK_BASE) playPick(instrument, note, distance);
  else if (instrument === "drums") playDrum(note, distance);
  else if (instrument === "kit") playKit(note, distance);
  else if (instrument === "keys") playKey(note, distance);
  else if (instrument === "guitar") playChord(note, distance);
  else if (instrument === "electric") playElectric(note, distance);
  else if (instrument === "bass") playBass(note, distance);
  else if (instrument === "kulintang") playGong(note, distance);
  else if (instrument === "taiko") playTaiko(note, distance);
  else if (instrument === "shaker") playShaker(note, distance);
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
  // And every string a pick can sound, each the way its instrument plucks.
  for (const kind of WORN)
    for (let chord = 0; chord < CHORDS.length; chord++)
      for (let string = 0; string < STRINGS[kind]; string++) {
        const midi = pickedMidi(kind, chord, string);
        if (midi !== null) pluck(output.ctx, midi, kind === "bass" ? { sustain: 0.8, soft: 0.6 } : kind === "electric" ? { sustain: 1.2 } : {});
      }
}
