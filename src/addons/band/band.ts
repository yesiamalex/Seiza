import { createStore } from "../store";
import { oneOf, readNumber, sendAddonEvent, type AddonEvent } from "../bus";
import { INSTRUMENTS, KEYS_RANGE, LIGHT_COLORS, noteCount, playNote, type Instrument } from "./instruments";

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
  /** The play panel is open: keys play notes instead of moving you. */
  playing: boolean;
  /** Keys: octaves up or down from middle C. */
  octave: number;
  /** The Band menu is open, so the instrument steps out of its way. */
  menuOpen: boolean;
}

export const band = createStore<LocalMusician>({ instrument: null, color: 0, waving: false, playing: false, octave: 0, menuOpen: false });

export interface RemoteMusician {
  instrument: Instrument | null;
  color: number;
  waving: boolean;
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
  const { instrument, color, waving } = band.get();
  sendAddonEvent("band", { k: "lo", i: instrument ?? "", c: color, wv: waving ? 1 : 0 });
}

export function setInstrument(instrument: Instrument | null) {
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

export function setPlaying(playing: boolean) {
  band.set((s) => ({ ...s, playing }));
}

export function resetBand() {
  band.set((s) => ({ ...s, instrument: null, waving: false, playing: false }));
  remoteMusicians.clear();
  localNote.note = null;
}

/** Plays a note here and sends it to the room. */
export function play(note: number) {
  const { instrument } = band.get();
  if (!instrument || instrument === "lightstick" || !validNote(instrument, note)) return;
  playNote(instrument, note);
  localNote.note = { n: note, at: performance.now() / 1000 };
  sendAddonEvent("band", { k: "n", n: note });
}

export function validNote(instrument: Instrument, note: number) {
  if (!Number.isInteger(note)) return false;
  if (instrument === "lightstick") return false;
  if (instrument === "keys") return note >= KEYS_RANGE[0] && note <= KEYS_RANGE[1];
  return note >= 0 && note < noteCount(instrument);
}

export type BandEvent = { k: "hi" } | { k: "lo"; instrument: Instrument | null; color: number; waving: boolean } | { k: "n"; note: number };

export function parseBandEvent(data: AddonEvent): BandEvent | null {
  if (data.k === "hi") return { k: "hi" };
  if (data.k === "lo") {
    const instrument = data.i === "" ? null : oneOf(data.i, INSTRUMENTS);
    const color = readNumber(data.c, 0, LIGHT_COLORS.length - 1);
    if ((instrument === null && data.i !== "") || color === null) return null;
    return { k: "lo", instrument, color: Math.round(color), waving: data.wv === 1 };
  }
  if (data.k === "n") {
    const note = readNumber(data.n, 0, 127);
    return note === null ? null : { k: "n", note: Math.round(note) };
  }
  return null;
}

export function musicianOf(id: string): RemoteMusician {
  let m = remoteMusicians.get(id);
  if (!m) remoteMusicians.set(id, (m = { instrument: null, color: 0, waving: false, note: null }));
  return m;
}
