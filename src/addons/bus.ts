import { MAX_ADDON_EVENT_CHARS, type AddonMode } from "../multiplayer/types";

/**
 * The room modes' own channel: small events (a swing, a hit, a note) that
 * the room server relays to everyone else while that mode is on, without
 * reading them. Every event comes from another browser, so each handler
 * checks every field it uses.
 */
export type AddonEvent = Record<string, unknown>;
type Handler = (from: string, data: AddonEvent) => void;

const handlers: Record<AddonMode, Set<Handler>> = { fantasy: new Set(), band: new Set() };
let sender: ((mode: AddonMode, data: AddonEvent) => void) | null = null;

/** App's side: where outgoing events go (the room socket), or null. */
export function connectAddonBus(send: ((mode: AddonMode, data: AddonEvent) => void) | null) {
  sender = send;
}

export function sendAddonEvent(mode: AddonMode, data: AddonEvent) {
  sender?.(mode, data);
}

/** Receives a mode's events from everyone else. Returns the unsubscribe. */
export function onAddonEvent(mode: AddonMode, handler: Handler): () => void {
  handlers[mode].add(handler);
  return () => handlers[mode].delete(handler);
}

/** The socket's side: hands an event to its mode, if anything listens. */
export function deliverAddonEvent(from: unknown, mode: unknown, data: unknown) {
  if (typeof from !== "string" || (mode !== "fantasy" && mode !== "band")) return;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return;
  if (handlers[mode].size === 0) return;
  try {
    if (JSON.stringify(data).length > MAX_ADDON_EVENT_CHARS) return;
  } catch {
    return;
  }
  for (const handler of handlers[mode]) {
    try {
      handler(from, data as AddonEvent);
    } catch (error) {
      console.warn(`[seiza] A ${mode} mode event handler failed.`, error);
    }
  }
}

// Field readers for events from other browsers: anything malformed reads
// as missing.
export const readString = (v: unknown, max = 32) => (typeof v === "string" && v.length <= max ? v : null);
export const readNumber = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
export function readVector(v: unknown, limit = 1e4): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = v.map((n) => readNumber(n, -limit, limit));
  return out.every((n) => n !== null) ? (out as [number, number, number]) : null;
}
export function oneOf<T extends string>(v: unknown, options: readonly T[]): T | null {
  return typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : null;
}
