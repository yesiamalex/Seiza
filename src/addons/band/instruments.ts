import { sfxOutput } from "../../audio/sfx";
import { noiseHit, toneHit, voice, type Voice } from "../sound";

export const INSTRUMENTS = ["drums", "keys", "guitar", "lightstick"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const INSTRUMENT_LABELS: Record<Instrument, [string, string]> = {
  drums: ["Drum pad", "ドラムパッド"],
  keys: ["Keys", "キーボード"],
  guitar: ["Guitar", "ギター"],
  lightstick: ["Light stick", "ペンライト"],
};

export const LIGHT_COLORS = ["#ff4fa3", "#4fb2ff", "#59ff8a", "#ffe14f", "#b36bff", "#ff8a3d", "#ffffff"] as const;

/** The pads, left to right in two rows of four (back row first). */
export const DRUM_PADS: { label: string; key: string }[] = [
  { label: "Crash", key: "Q" },
  { label: "Hi tom", key: "W" },
  { label: "Lo tom", key: "E" },
  { label: "Open hat", key: "R" },
  { label: "Kick", key: "A" },
  { label: "Snare", key: "S" },
  { label: "Clap", key: "D" },
  { label: "Hat", key: "F" },
];

/** A piano octave and one more C, on the keys a DAW uses. */
export const KEY_LAYOUT: { semitone: number; key: string; black: boolean }[] = [
  ["A", false], ["W", true], ["S", false], ["E", true], ["D", false], ["F", false], ["T", true],
  ["G", false], ["Y", true], ["H", false], ["U", true], ["J", false], ["K", false],
].map(([key, black], semitone) => ({ semitone, key: key as string, black: black as boolean }));
export const KEYS_BASE = 60;
export const KEYS_RANGE: [number, number] = [36, 96];

export const CHORDS: { name: string; key: string; notes: number[] }[] = [
  { name: "C", key: "A", notes: [48, 52, 55, 60, 64] },
  { name: "G", key: "S", notes: [43, 47, 50, 55, 59, 67] },
  { name: "Am", key: "D", notes: [45, 52, 57, 60, 64] },
  { name: "F", key: "F", notes: [41, 48, 53, 57, 60, 65] },
  { name: "Em", key: "G", notes: [40, 47, 52, 55, 59, 64] },
  { name: "D", key: "H", notes: [50, 57, 62, 66] },
];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
/** Bands carry further than footsteps. */
const FALLOFF = 45;

export function playDrum(pad: number, distance?: number) {
  const v = voice(1, distance, FALLOFF);
  if (!v) return;
  switch (pad) {
    case 0: // crash
      noiseHit(v, { frequency: 5500, duration: 1.3, gain: 0.35, type: "highpass" });
      noiseHit(v, { frequency: 9000, duration: 0.5, gain: 0.2, type: "bandpass", q: 2 });
      break;
    case 1: // hi tom
      toneHit(v, { frequency: 240, sweepTo: 150, duration: 0.28, gain: 0.7 });
      noiseHit(v, { frequency: 1500, duration: 0.05, gain: 0.15 });
      break;
    case 2: // lo tom
      toneHit(v, { frequency: 150, sweepTo: 88, duration: 0.36, gain: 0.8 });
      noiseHit(v, { frequency: 900, duration: 0.05, gain: 0.15 });
      break;
    case 3: // open hat
      noiseHit(v, { frequency: 8000, duration: 0.32, gain: 0.28, type: "highpass" });
      break;
    case 4: // kick
      toneHit(v, { frequency: 155, sweepTo: 42, duration: 0.42, gain: 1 });
      noiseHit(v, { frequency: 3000, duration: 0.02, gain: 0.25 });
      break;
    case 5: // snare
      noiseHit(v, { frequency: 1900, duration: 0.2, gain: 0.6, q: 0.6 });
      toneHit(v, { frequency: 195, sweepTo: 160, duration: 0.11, gain: 0.45, type: "triangle" });
      break;
    case 6: // clap: a few quick slaps and a tail
      for (const delay of [0, 0.011, 0.023]) noiseHit(v, { frequency: 1200, duration: 0.03, gain: 0.5, q: 1.2, delay });
      noiseHit(v, { frequency: 1100, duration: 0.2, gain: 0.35, q: 1, delay: 0.034 });
      break;
    default: // closed hat
      noiseHit(v, { frequency: 9000, duration: 0.05, gain: 0.3, type: "highpass" });
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

// --- the guitar: plucked strings ---------------------------------------------------
// Karplus-Strong: a burst of noise round a short loop, averaged as it goes,
// rings like a string at the loop's pitch. Rendered once per note and kept.

const plucks = new Map<string, AudioBuffer>();
function pluck(ctx: AudioContext, midi: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${midi}`;
  const cached = plucks.get(key);
  if (cached) return cached;
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * 1.8);
  const buffer = ctx.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(rate / hz(midi)));
  const loop = new Float32Array(period);
  for (let i = 0; i < period; i++) loop[i] = Math.random() * 2 - 1;
  // Higher strings die away faster, like real ones.
  const decay = 0.996 - Math.min(0.006, (midi - 40) * 0.00008);
  for (let i = 0; i < length; i++) {
    const j = i % period;
    const next = loop[(j + 1) % period];
    out[i] = loop[j];
    loop[j] = decay * 0.5 * (loop[j] + next);
  }
  plucks.set(key, buffer);
  return buffer;
}

function strum(v: Voice, notes: number[]) {
  notes.forEach((midi, i) => {
    const source = v.ctx.createBufferSource();
    source.buffer = pluck(v.ctx, midi);
    const gain = v.ctx.createGain();
    gain.gain.value = 0.3;
    source.connect(gain).connect(v.out);
    source.start(v.t + i * 0.014);
  });
}

export function playChord(chord: number, distance?: number) {
  const notes = CHORDS[chord]?.notes;
  if (!notes) return;
  const v = voice(1, distance, FALLOFF);
  if (v) strum(v, notes);
}

/** Any musician's note, by instrument. */
export function playNote(instrument: Instrument, note: number, distance?: number) {
  if (instrument === "drums") playDrum(note, distance);
  else if (instrument === "keys") playKey(note, distance);
  else if (instrument === "guitar") playChord(note, distance);
}

/** Warms the guitar's strings, so the first strum doesn't stall a frame. */
export function prepareGuitar() {
  const output = sfxOutput();
  if (!output) return;
  for (const chord of CHORDS) for (const midi of chord.notes) pluck(output.ctx, midi);
}
