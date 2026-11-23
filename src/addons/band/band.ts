import { createStore } from "../store";
import { oneOf, readNumber, sendAddonEvent, type AddonEvent } from "../bus";
import { holdKey, INSTRUMENTS, KEYS_RANGE, LIGHT_COLORS, noteCount, playNote, type Instrument } from "./instruments";

/**
 * Band mode's state. Notes are events, played by every client from its own
 * synthesizer at the musician's spot in the room, so a note costs a few
 * bytes and no audio is streamed. What someone holds is re-announced when
 * anyone new arrives.
 */
export interface LocalMusician {
  instrument: Instrument | null;
  /** Index into LIGHT_COLORS. */
  color: number;
  /** A light stick swaying overhead. */
  waving: boolean;
  /** A light stick in each hand. */
  pair: boolean;
  /** The play panel is open: keys play notes instead of moving you. */
  playing: boolean;
  /** Keys: octaves up or down from middle C. */
  octave: number;
  /** The Band menu is open, so the instrument steps out of its way. */
  menuOpen: boolean;
}

export const band = createStore<LocalMusician>({ instrument: null, color: 0, waving: false, pair: false, playing: false, octave: 0, menuOpen: false });

export interface RemoteMusician {
  instrument: Instrument | null;
  color: number;
  waving: boolean;
  pair: boolean;
  /** The last note, for the hand that plays it. */
  note: { n: number; at: number } | null;
}
export const remoteMusicians = new Map<string, RemoteMusician>();
/** This visitor's own last note, for their hands. */
export const localNote = { note: null as { n: number; at: number } | null };
/** When a tap last landed on this visitor's instrument (performance.now()),
 *  so the same double-tap doesn't also walk them across the floor. */
export const tapped = { at: -Infinity };

export function announceBand() {
  const { instrument, color, waving, pair } = band.get();
  sendAddonEvent("band", { k: "lo", i: instrument ?? "", c: color, wv: waving ? 1 : 0, ...(pair ? { p2: 1 } : {}) });
}

export function setInstrument(instrument: Instrument | null) {
  releaseAll();
  band.set((s) => ({ ...s, instrument, playing: instrument !== null && instrument !== "lightstick" ? s.playing : false, waving: instrument === "lightstick" && s.waving }));
  announceBand();
}

export function setLightColor(color: number) {
  band.set((s) => ({ ...s, color }));
  announceBand();
}

export function setWaving(waving: boolean) {
  band.set((s) => ({ ...s, waving }));
  announceBand();
}

export function setPair(pair: boolean) {
  band.set((s) => ({ ...s, pair }));
  announceBand();
}

export function setPlaying(playing: boolean) {
  if (!playing) releaseAll();
  band.set((s) => ({ ...s, playing }));
}

export function resetBand() {
  releaseAll();
  band.set((s) => ({ ...s, instrument: null, waving: false, playing: false }));
  remoteMusicians.clear();
  localNote.note = null;
}

/** Keys held down here, each with its release. */
const held = new Map<number, () => void>();

/**
 * Plays a note here and sends it to the room. On the keys, `hold` keeps it
 * ringing until release(note), so a chord's notes ring together; any
 * number can be down at once.
 */
export function play(note: number, hold = false) {
  const { instrument } = band.get();
  if (!instrument || instrument === "lightstick" || !validNote(instrument, note)) return;
  if (instrument === "keys" && hold) {
    held.get(note)?.();
    held.set(note, holdKey(note));
  } else playNote(instrument, note);
  localNote.note = { n: note, at: performance.now() / 1000 };
  sendAddonEvent("band", { k: "n", n: note, ...(instrument === "keys" && hold ? { h: 1 } : {}) });
}

/** Lets a held key go, here and for the room. */
export function release(note: number) {
  const stop = held.get(note);
  if (!stop) return;
  held.delete(note);
  stop();
  sendAddonEvent("band", { k: "f", n: note });
}

/** Lets every held key go (the instrument changed, or playing stopped). */
export function releaseAll() {
  for (const note of [...held.keys()]) release(note);
}

export function validNote(instrument: Instrument, note: number) {
  if (!Number.isInteger(note)) return false;
  if (instrument === "lightstick") return false;
  if (instrument === "keys") return note >= KEYS_RANGE[0] && note <= KEYS_RANGE[1];
  return note >= 0 && note < noteCount(instrument);
}

export type BandEvent =
  | { k: "hi" }
  | { k: "lo"; instrument: Instrument | null; color: number; waving: boolean; pair: boolean }
  | { k: "n"; note: number; hold: boolean }
  | { k: "f"; note: number };

export function parseBandEvent(data: AddonEvent): BandEvent | null {
  if (data.k === "hi") return { k: "hi" };
  if (data.k === "lo") {
    const instrument = data.i === "" ? null : oneOf(data.i, INSTRUMENTS);
    const color = readNumber(data.c, 0, LIGHT_COLORS.length - 1);
    if ((instrument === null && data.i !== "") || color === null) return null;
    return { k: "lo", instrument, color: Math.round(color), waving: data.wv === 1, pair: data.p2 === 1 };
  }
  if (data.k === "n" || data.k === "f") {
    const note = readNumber(data.n, 0, 127);
    if (note === null) return null;
    return data.k === "n" ? { k: "n", note: Math.round(note), hold: data.h === 1 } : { k: "f", note: Math.round(note) };
  }
  return null;
}

export function musicianOf(id: string): RemoteMusician {
  let m = remoteMusicians.get(id);
  if (!m) remoteMusicians.set(id, (m = { instrument: null, color: 0, waving: false, pair: false, note: null }));
  return m;
}
