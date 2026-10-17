// Seilaya's safety tools, for this visitor: their personal space, who
// they've blocked, whether they've stepped out to Kanlungan, and their
// pronouns, plus Seilaya's own say over together gestures.
//
// The together gestures themselves (handshake, high five, hug, each only
// after the other person's yes) are Seiza's, in every world: see
// src/interactions/together.ts, with the room server enforcing consent,
// distance, and how often anyone may ask. Seilaya adds to that: requests
// are turned away without a prompt from someone this visitor blocked,
// while they're in Kanlungan, or while a facilitator has paused them; and
// the partner stays visible through personal space while the gesture plays.
//
// Everything stays with this visitor. Settings are kept on this device;
// blocks last for this visit (player ids change every visit). Pronouns
// travel as private messages to each person, over the room's relay, which
// forwards them without reading them, and are one of a fixed list, checked
// on arrival, so nothing anyone types ever travels privately.
//
// Facilitators are the room's editors (or admins, where the deployment has
// an admin key): they can pause requests for everyone, set a minimum
// personal space, post a short notice, and show a card to the whole room,
// all through Seiza's shared world state, which the server lets only
// editors change.
import { useSyncExternalStore } from "react";
import {
  askTogether,
  answerTogether,
  cancelTogether,
  getTogether,
  onTogetherStart,
  setTogetherPolicy,
  TOGETHER_LABELS,
} from "../../../src/interactions/together";
import { TOGETHER as TOGETHER_RULES, TOGETHER_GESTURES, type PlayerState, type TogetherGesture } from "../../../src/multiplayer/types";
import { onWorldMessage } from "../../../src/worlds/WorldExtension";

// --- what a world's code gets from Seiza (set by the Scene each render) ---------

export interface SeizaApi {
  selfId: string | null;
  players: Record<string, PlayerState>;
  getSelfPosition: () => [number, number, number];
  playGesture: (name: string) => void;
  warp: (position: [number, number, number]) => void;
  faceToward: (x: number, z: number) => void;
  sendWorldMessage: (to: string, data: unknown) => void;
  setPlayerFilter: (filter: { hidden?: Iterable<string>; blocked?: Iterable<string> } | null) => void;
  canEdit: boolean;
  worldState: Record<string, unknown>;
  setWorldState: (key: string, value: string | number | boolean) => void;
}

let api: SeizaApi | null = null;
export function setApi(next: SeizaApi) {
  api = next;
}

// --- the together gestures (Seiza's) --------------------------------------------------

export type Together = TogetherGesture;
export const TOGETHER: { name: Together; label: string; ask: string }[] = TOGETHER_GESTURES.map((name) => ({ name, ...TOGETHER_LABELS[name] }));
/** How close two people must be to ask (Seiza's rule). */
export const REACH = TOGETHER_RULES.reach;
export const REQUEST_SECONDS = TOGETHER_RULES.requestSeconds;
/** How long the two people stay visible to each other through a personal
 *  space bubble, so each can see the gesture they agreed to. */
const TOGETHER_MS = 6_000;

// --- settings, kept on this device ----------------------------------------------------

export interface Settings {
  /** Personal space radius in metres; 0 is off. */
  bubble: number;
  pronouns: string;
  /** Whether this visitor has read and agreed to the code of conduct. */
  agreed: boolean;
}
export const BUBBLE_CHOICES = [0, 1, 1.5, 2];
const SETTINGS_KEY = "seilaya.settings.v1";
const DEFAULT_SETTINGS: Settings = { bubble: 1, pronouns: "", agreed: false };

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Settings> | null;
    if (!saved) return { ...DEFAULT_SETTINGS };
    return {
      bubble: BUBBLE_CHOICES.includes(Number(saved.bubble)) ? Number(saved.bubble) : DEFAULT_SETTINGS.bubble,
      pronouns: cleanPronouns(saved.pronouns),
      agreed: saved.agreed === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    // Private mode or storage off: the settings last for this visit only.
  }
}

/** The pronouns a visitor can show. A fixed list, not free text, so the
 *  tag can never carry anyone's own words (see the top of this file). */
export const PRONOUNS = ["she/her", "he/him", "they/them"] as const;
/** A value from the list, or "" for none. Anything else is dropped. */
export function cleanPronouns(value: unknown): string {
  return typeof value === "string" && (PRONOUNS as readonly string[]).includes(value) ? value : "";
}

// --- the state -----------------------------------------------------------------------------

export interface Notice {
  id: number;
  text: string;
  at: number;
}
export type CardKey =
  | "welcome"
  | "conduct"
  | "safety"
  | "help"
  | "safespaces"
  | "gad"
  | "sogiesc"
  | "cpted"
  | "refuge"
  | "women"
  | "data"
  | "quiz"
  | "bystander";

export const state = {
  settings: loadSettings(),
  /** Blocked for this visit: not seen, not heard, their chat hidden. */
  blocked: new Set<string>(),
  /** Inside this visitor's personal space right now (and so not drawn). */
  inBubble: new Set<string>(),
  /** Others within REACH, to offer together gestures with. */
  nearby: [] as string[],
  inRefuge: false,
  /** Others' pronouns, as each of them shared them with this visitor. */
  pronouns: new Map<string, string>(),
  /** The person this visitor is doing a together gesture with right now. */
  together: null as { peer: string; until: number } | null,
  notices: [] as Notice[],
  panelOpen: false,
  card: null as CardKey | null,
};

let version = 0;
const listeners = new Set<() => void>();
export function emit() {
  version++;
  for (const listener of listeners) listener();
}
/** Re-renders on any change to the state above. */
export function useSafety() {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version
  );
  return state;
}

export function updateSettings(patch: Partial<Settings>) {
  const before = state.settings.pronouns;
  state.settings = { ...state.settings, ...patch, pronouns: cleanPronouns(patch.pronouns ?? state.settings.pronouns) };
  saveSettings();
  if (state.settings.pronouns !== before) sharePronouns();
  applyFilter();
  emit();
}

let noticeId = 0;
export function notify(text: string) {
  const notice = { id: ++noticeId, text, at: Date.now() };
  state.notices = [...state.notices.slice(-2), notice];
  emit();
  setTimeout(() => {
    state.notices = state.notices.filter((n) => n.id !== notice.id);
    emit();
  }, 5000);
}

const CARD_KEYS: CardKey[] = ["welcome", "conduct", "safety", "help", "safespaces", "gad", "sogiesc", "cpted", "refuge", "women", "data", "quiz", "bystander"];
export const isCardKey = (v: unknown): v is CardKey => CARD_KEYS.includes(v as CardKey);

export function openCard(card: CardKey | null) {
  state.card = card;
  emit();
}

// --- what facilitators set for the whole room -------------------------------------------

/** Shared world state keys (Seiza's server lets only editors change them). */
export const ROOM_KEYS = { paused: "seilaya.paused", minSpace: "seilaya.minSpace", notice: "seilaya.notice", show: "seilaya.show" } as const;

/** A facilitator's notice, as shown: plain text with control and
 *  direction-override characters removed. */
export function cleanNotice(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 64);
}

export function roomSettings() {
  const ws = api?.worldState ?? {};
  const min = Number(ws[ROOM_KEYS.minSpace]);
  return {
    paused: ws[ROOM_KEYS.paused] === true,
    minSpace: BUBBLE_CHOICES.includes(min) ? min : 0,
    notice: cleanNotice(ws[ROOM_KEYS.notice]),
  };
}

/** Whether this visitor is a facilitator: the room's editors and admins. */
export const isFacilitator = () => !!api?.canEdit;

/** The personal space in effect: this visitor's own, or the room's
 *  minimum if a facilitator set a larger one. */
export const effectiveBubble = () => Math.max(state.settings.bubble, roomSettings().minSpace);

export function setRoom(key: (typeof ROOM_KEYS)[keyof typeof ROOM_KEYS], value: string | number | boolean) {
  if (!api?.canEdit) return;
  api.setWorldState(key, value);
}

/** Shows a card to everyone in the room (a facilitator's choice). */
let shown = 0;
export function showToEveryone(card: CardKey) {
  shown = (shown + 1) % 1000;
  setRoom(ROOM_KEYS.show, `${card}:${Date.now() % 100000}:${shown}`);
}

export const nameOf = (id: string) => api?.players[id]?.displayName ?? "Someone";
/** Everyone in the room but this visitor. */
export const others = () => (api ? Object.keys(api.players).filter((id) => id !== api!.selfId) : []);

// --- who this visitor sees and hears ---------------------------------------------------------

/** Pushes this visitor's choices to Seiza's per-viewer filter. */
export function applyFilter() {
  if (!api) return;
  const together = state.together && state.together.until > Date.now() ? state.together.peer : null;
  const hidden = [...state.inBubble].filter((id) => id !== together);
  const blocked = state.inRefuge ? others() : [...state.blocked];
  api.setPlayerFilter({ hidden, blocked });
}

/** Turns away any request waiting from these people, without saying why. */
function dismissRequests(from: (id: string) => boolean) {
  for (const request of [...getTogether().incoming]) if (from(request.peer)) answerTogether(request.id, false, true);
}

export function block(id: string) {
  state.blocked.add(id);
  dismissRequests((peer) => peer === id);
  if (getTogether().outgoing?.peer === id) cancelTogether();
  applyFilter();
  notify(`${nameOf(id)} is blocked for this visit. You won't see or hear them, and they can't ask you for anything.`);
}

export function unblock(id: string) {
  state.blocked.delete(id);
  applyFilter();
  notify(`${nameOf(id)} is unblocked.`);
}

// --- Kanlungan, the refuge -------------------------------------------------------------------

/** The refuge mat in the garden's back corner (see Exhibits.tsx). */
export const REFUGE_SPOT: [number, number, number] = [-7, 0, 34.4];
let beforeRefuge: [number, number, number] | null = null;

export function stepOut() {
  if (!api || state.inRefuge) return;
  beforeRefuge = [...api.getSelfPosition()];
  state.inRefuge = true;
  dismissRequests(() => true);
  if (getTogether().outgoing) cancelTogether();
  api.warp(REFUGE_SPOT);
  applyFilter();
  state.panelOpen = false;
  emit();
}

export function returnFromRefuge(goBack: boolean) {
  if (!api || !state.inRefuge) return;
  state.inRefuge = false;
  if (goBack && beforeRefuge) api.warp(beforeRefuge);
  beforeRefuge = null;
  applyFilter();
  emit();
}

// --- together gestures: Seilaya's say ---------------------------------------------------------

/** Seiza asks this before prompting: requests are turned away without a
 *  prompt from someone blocked, while stepped out, or while paused. */
function policy(from: string): "ask" | "unavailable" {
  if (state.blocked.has(from) || state.inRefuge || roomSettings().paused) return "unavailable";
  return "ask";
}

/** Why this visitor can't ask `peer` right now, or null if they can. */
export function cannotAsk(peer: string): string | null {
  if (roomSettings().paused) return "The facilitator has paused requests for now.";
  if (state.inRefuge) return "Return from Kanlungan first.";
  if (state.blocked.has(peer)) return "You've blocked them.";
  if (getTogether().outgoing) return "Waiting for an answer to your last request.";
  if (!state.nearby.includes(peer)) return `Stand within ${REACH} m of them to ask.`;
  return null;
}

export function ask(peer: string, gesture: Together) {
  const reason = cannotAsk(peer);
  if (reason) {
    notify(reason);
    return;
  }
  askTogether(peer, gesture);
}

/** While the gesture plays, keep the partner visible through personal space. */
function onStart(peer: string) {
  state.together = { peer, until: Date.now() + TOGETHER_MS };
  applyFilter();
  emit();
  setTimeout(() => {
    if (state.together?.peer === peer && state.together.until <= Date.now()) {
      state.together = null;
      applyFilter();
      emit();
    }
  }, TOGETHER_MS + 50);
}

// --- private messages: pronouns only ---------------------------------------------------------

/** On the wire: a namespaced, versioned message. Anything else is ignored. */
type Message = { t: "pron"; p: string };
const NS = "seilaya/1";

function send(to: string, message: Message) {
  api?.sendWorldMessage(to, { ns: NS, ...message });
}

/** Pronoun updates a person may send: one every this many ms. */
const PRONOUN_INTERVAL_MS = 2_000;
const pronounAt = new Map<string, number>();

function handle(from: string, data: unknown) {
  if (typeof data !== "object" || data === null || (data as { ns?: unknown }).ns !== NS) return;
  // Only from someone actually in the room.
  if (!api?.players[from] || from === api.selfId) return;
  const m = data as Record<string, unknown>;
  if (m.t !== "pron") return;
  const now = Date.now();
  if (now - (pronounAt.get(from) ?? 0) < PRONOUN_INTERVAL_MS) return;
  pronounAt.set(from, now);
  const pronouns = cleanPronouns(m.p);
  if (pronouns) state.pronouns.set(from, pronouns);
  else state.pronouns.delete(from);
  emit();
}

// --- pronouns ---------------------------------------------------------------------------------

/** Sends this visitor's pronouns to one person, or to everyone. Sent even
 *  when empty, so clearing them clears the tag others see. */
export function sharePronouns(to?: string) {
  const p = state.settings.pronouns;
  for (const id of to ? [to] : others()) send(id, { t: "pron", p });
}

// --- keeping up with the room ---------------------------------------------------------------

let unsubscribe: (() => void)[] | null = null;
export function startListening() {
  if (unsubscribe) return;
  setTogetherPolicy(policy);
  unsubscribe = [onWorldMessage(handle), onTogetherStart(({ partner }) => onStart(partner))];
}
export function stopListening() {
  for (const off of unsubscribe ?? []) off();
  unsubscribe = null;
  setTogetherPolicy(null);
  api?.setPlayerFilter(null);
}

/** When people join and leave: share pronouns with newcomers, forget those
 *  who left, and keep the refuge covering everyone. */
let known = new Set<string>();
export function onPlayersChanged() {
  if (!api?.selfId) return;
  const now = new Set(others());
  for (const id of now) if (!known.has(id) && state.settings.pronouns) sharePronouns(id);
  for (const id of known) {
    if (now.has(id)) continue;
    state.pronouns.delete(id);
    state.blocked.delete(id);
    state.inBubble.delete(id);
    pronounAt.delete(id);
  }
  known = now;
  applyFilter();
  emit();
}
