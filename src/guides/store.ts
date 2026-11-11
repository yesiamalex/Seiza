/**
 * Conversations with a world's guides, for this visitor only. Nothing here
 * is sent anywhere or saved: it lives in this page and is gone on reload.
 *
 * A world registers its guides (registerGuide), and the HUD (GuideHud),
 * the headset panel (GuideXr), and each guide in the world (Guide) read
 * the same store, so they never disagree.
 */
import { useSyncExternalStore } from "react";
import type { Brain, Place, Reply } from "./brain";

export interface GuideInfo {
  id: string;
  name: string;
  brain: Brain;
}

export interface Message {
  id: number;
  from: "you" | "guide";
  text: string;
  reply?: Reply;
}

interface GuideState {
  guides: GuideInfo[];
  /** Who the visitor is talking to, or null. */
  open: string | null;
  threads: Record<string, Message[]>;
  /** A guide walking the visitor somewhere (Guide.tsx), or null. */
  leading: { guide: string; place: Place } | null;
}

let state: GuideState = { guides: [], open: null, threads: {}, leading: null };
let nextId = 1;
const listeners = new Set<() => void>();
const MAX_MESSAGES = 40;
/** Long enough for a real question, short enough that nobody pastes an essay. */
export const MAX_QUESTION = 200;

function set(next: Partial<GuideState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function say(guide: string, messages: Message[]) {
  set({ threads: { ...state.threads, [guide]: [...(state.threads[guide] ?? []), ...messages].slice(-MAX_MESSAGES) } });
}

/** A world's guides. Call once when the world's code starts; null clears. */
export function registerGuides(guides: GuideInfo[] | null) {
  state = { guides: guides ?? [], open: null, threads: {}, leading: null };
  for (const g of guides ?? []) {
    const hello = g.brain.greeting();
    state.threads[g.id] = [{ id: nextId++, from: "guide", text: hello.text, reply: hello }];
  }
  for (const l of listeners) l();
}

export function openGuide(id: string | null) {
  if (id !== state.open) set({ open: id });
}

export function ask(guideId: string, question: string) {
  const guide = state.guides.find((g) => g.id === guideId);
  const q = question.trim().slice(0, MAX_QUESTION);
  if (!guide || !q) return;
  const reply = guide.brain.answer(q);
  say(guideId, [
    { id: nextId++, from: "you", text: q },
    { id: nextId++, from: "guide", text: reply.text, reply },
  ]);
}

/** A line from a guide, not in answer to anything ("Here we are!"). */
export function guideSays(guideId: string, reply: Reply) {
  say(guideId, [{ id: nextId++, from: "guide", text: reply.text, reply }]);
}

/** Asks a guide to walk the visitor to a place. */
export function lead(guideId: string, place: Place) {
  set({ leading: { guide: guideId, place } });
}

export function stopLeading() {
  if (state.leading) set({ leading: null });
}

// "Take me there": the world's warp, handed in by the world's Scene.
let warpTo: ((at: [number, number, number]) => void) | null = null;
export function setGuideWarp(fn: typeof warpTo) {
  warpTo = fn;
}
export function goTo(place: Place) {
  stopLeading();
  warpTo?.(place.at);
}

export function useGuides(): GuideState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

export function getGuides(): GuideState {
  return state;
}

/** The latest thing a guide said. */
export function lastReply(guideId: string): Reply | null {
  const thread = state.threads[guideId] ?? [];
  for (let i = thread.length - 1; i >= 0; i--) if (thread[i].reply) return thread[i].reply!;
  return null;
}
