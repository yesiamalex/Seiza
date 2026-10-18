// Together gestures on this visitor's side: asking someone nearby for a
// handshake, high five, fist bump, dap, hug, or slow dance, answering when asked, and playing the
// gesture once both have said yes. The room server keeps the score (see
// TOGETHER in src/multiplayer/types.ts and worker/room.ts): it only lets a
// together gesture play right after a mutual yes, checks distance, and
// limits how often anyone can ask. This module is the friendly side of
// that: prompts, notices, and turning requests away without a prompt when
// this visitor has blocked the asker or isn't taking requests.
import { useSyncExternalStore } from "react";
import { isPlayerBlocked } from "../multiplayer/playerFilter";
import { isTogetherGesture, TOGETHER, type ClientMessage, type ServerMessage, type TogetherGesture } from "../multiplayer/types";

export interface TogetherRequest {
  /** Server-assigned; empty until the server has confirmed an ask. */
  id: string;
  /** The other person. */
  peer: string;
  gesture: TogetherGesture;
  at: number;
}

export interface TogetherStart {
  gesture: TogetherGesture;
  partner: string;
  /** The asker leads, the other follows (it matters for the slow dance). */
  role: "lead" | "follow";
}

export const TOGETHER_LABELS: Record<TogetherGesture, { label: string; ask: string }> = {
  handshake: { label: "Handshake", ask: "a handshake" },
  highfive: { label: "High five", ask: "a high five" },
  hug: { label: "Hug", ask: "a hug" },
  fistbump: { label: "Fist bump", ask: "a fist bump" },
  dap: { label: "Dap", ask: "a dap" },
  slowdance: { label: "Slow dance", ask: "a slow dance" },
};

/** A world's own say over requests (Seilaya: a refuge, a facilitator's
 *  pause). "unavailable" turns a request away without a prompt. */
export type TogetherPolicy = (from: string, gesture: TogetherGesture) => "ask" | "unavailable";

const ALLOW_KEY = "seiza.together.allow";
function loadAllow(): boolean {
  try {
    return localStorage.getItem(ALLOW_KEY) !== "false";
  } catch {
    return true;
  }
}

const state = {
  incoming: [] as TogetherRequest[],
  outgoing: null as TogetherRequest | null,
  notices: [] as { id: number; text: string }[],
  /** Whether others may ask this visitor (kept on this device). */
  allow: loadAllow(),
};
export type TogetherState = typeof state;

let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  for (const listener of listeners) listener();
}

/** Re-renders on any change. */
export function useTogether(): TogetherState {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version
  );
  return state;
}
export const getTogether = (): TogetherState => state;

let send: ((message: ClientMessage) => void) | null = null;
let nameOf: (id: string) => string = () => "Someone";
let policy: TogetherPolicy | null = null;
const startHandlers = new Set<(start: TogetherStart) => void>();
const endHandlers = new Set<(partner: string) => void>();

/** App wires these once: how to reach the room server, and names. */
export function setTogetherConnection(sender: ((message: ClientMessage) => void) | null, names: (id: string) => string) {
  send = sender;
  nameOf = names;
}

/** For a world's own rules on top of this visitor's. Pass null to clear. */
export function setTogetherPolicy(next: TogetherPolicy | null) {
  policy = next;
}

/** Called when a together gesture starts (App plays it; a world may also
 *  want to know, as Seilaya does to keep the partner visible). */
export function onTogetherStart(handler: (start: TogetherStart) => void): () => void {
  startHandlers.add(handler);
  return () => startHandlers.delete(handler);
}

/** Called when a lasting together gesture (the slow dance) ends because the
 *  partner stopped or left: App stops this visitor's side too. */
export function onTogetherEnd(handler: (partner: string) => void): () => void {
  endHandlers.add(handler);
  return () => endHandlers.delete(handler);
}

let noticeId = 0;
function notify(text: string) {
  const notice = { id: ++noticeId, text };
  state.notices = [...state.notices.slice(-1), notice];
  emit();
  setTimeout(() => {
    state.notices = state.notices.filter((n) => n.id !== notice.id);
    emit();
  }, 5000);
}

export function setAllowRequests(allow: boolean) {
  state.allow = allow;
  try {
    localStorage.setItem(ALLOW_KEY, String(allow));
  } catch {
    // Storage off: the choice lasts for this visit.
  }
  emit();
}

let outgoingTimer: ReturnType<typeof setTimeout> | null = null;

/** Asks `peer` for a together gesture. */
export function askTogether(peer: string, gesture: TogetherGesture) {
  if (!send || state.outgoing) return;
  state.outgoing = { id: "", peer, gesture, at: Date.now() };
  send({ type: "togetherAsk", to: peer, gesture });
  // The server ends it after TOGETHER.requestSeconds; this is only a
  // backstop in case that message never arrives.
  if (outgoingTimer) clearTimeout(outgoingTimer);
  outgoingTimer = setTimeout(() => {
    if (!state.outgoing || state.outgoing.peer !== peer) return;
    state.outgoing = null;
    notify(`No answer from ${nameOf(peer)}.`);
  }, (TOGETHER.requestSeconds + 3) * 1000);
  emit();
}

export function cancelTogether() {
  const request = state.outgoing;
  if (!request) return;
  if (request.id) send?.({ type: "togetherCancel", id: request.id });
  state.outgoing = null;
  emit();
}

/** Answers a request. `unavailable` declines without saying so (a world
 *  turning requests away for someone just blocked, say). */
export function answerTogether(id: string, accept: boolean, unavailable = false) {
  const request = state.incoming.find((r) => r.id === id);
  if (!request) return;
  state.incoming = state.incoming.filter((r) => r.id !== id);
  send?.({ type: "togetherAnswer", id, accept, ...(unavailable && !accept ? { unavailable: true } : {}) });
  emit();
}

/** A room server message about together gestures. Returns whether it was one. */
export function receiveTogether(message: ServerMessage): boolean {
  switch (message.type) {
    case "togetherSent": {
      if (state.outgoing && !state.outgoing.id && state.outgoing.peer === message.to) {
        state.outgoing = { ...state.outgoing, id: message.id };
        emit();
      }
      return true;
    }
    case "togetherAsked": {
      if (!isTogetherGesture(message.gesture) || typeof message.id !== "string") return true;
      const turnAway =
        isPlayerBlocked(message.from) ||
        !state.allow ||
        state.incoming.length >= 3 ||
        state.incoming.some((r) => r.peer === message.from) ||
        (policy ? policy(message.from, message.gesture) === "unavailable" : false);
      if (turnAway) {
        send?.({ type: "togetherAnswer", id: message.id, accept: false, unavailable: true });
        return true;
      }
      const request: TogetherRequest = { id: message.id, peer: message.from, gesture: message.gesture, at: Date.now() };
      state.incoming = [...state.incoming, request];
      setTimeout(() => {
        // No answer means no: the prompt goes, and the server lets it lapse.
        if (!state.incoming.some((r) => r.id === request.id)) return;
        state.incoming = state.incoming.filter((r) => r.id !== request.id);
        emit();
      }, TOGETHER.requestSeconds * 1000);
      emit();
      return true;
    }
    case "togetherClosed": {
      const before = state.incoming.length;
      state.incoming = state.incoming.filter((r) => r.id !== message.id);
      const mine = state.outgoing && (state.outgoing.id === message.id || (!state.outgoing.id && message.reason === "unavailable"));
      if (mine && state.outgoing) {
        const peer = state.outgoing.peer;
        state.outgoing = null;
        if (outgoingTimer) clearTimeout(outgoingTimer);
        notify(
          message.reason === "declined"
            ? `${nameOf(peer)} said no thanks. That's okay.`
            : message.reason === "expired"
              ? `No answer from ${nameOf(peer)}.`
              : `${nameOf(peer)} isn't available for that right now.`
        );
      } else if (state.incoming.length !== before) emit();
      return true;
    }
    case "togetherStart": {
      if (!isTogetherGesture(message.gesture)) return true;
      state.incoming = state.incoming.filter((r) => r.id !== message.id);
      if (state.outgoing?.id === message.id) {
        state.outgoing = null;
        if (outgoingTimer) clearTimeout(outgoingTimer);
      }
      emit();
      const role = message.role === "follow" ? "follow" : "lead";
      for (const handler of startHandlers) handler({ gesture: message.gesture, partner: message.partner, role });
      return true;
    }
    case "togetherEnded": {
      for (const handler of endHandlers) handler(message.partner);
      return true;
    }
    default:
      return false;
  }
}

/** Others in reach of this visitor, nearest first: who can be asked. */
export function nearbyPeople<T extends { id: string; position: [number, number, number] }>(players: Record<string, T>, selfId: string | null, self: [number, number, number]): T[] {
  return Object.values(players)
    .filter((p) => p.id !== selfId && !isPlayerBlocked(p.id))
    .map((p) => ({ p, d: Math.hypot(p.position[0] - self[0], p.position[2] - self[2]) }))
    .filter(({ d }) => d <= TOGETHER.reach)
    .sort((a, b) => a.d - b.d)
    .map(({ p }) => p);
}
