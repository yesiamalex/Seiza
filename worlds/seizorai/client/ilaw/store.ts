// The conversation with Ilaw-san, for this visitor only. Nothing here is
// sent anywhere or saved: it lives in this page and is gone on reload.
import { useSyncExternalStore } from "react";
import { skyState } from "../../../../src/sky/skyState";
import { dayTotals, lessonNow, live } from "../live";
import { answer, type LiveReader, type Reply } from "./brain";
import { STARTERS, type Place } from "./knowledge";

export interface Message {
  id: number;
  from: "you" | "ilaw";
  text: string;
  reply?: Reply;
}

interface ChatState {
  open: boolean;
  messages: Message[];
}

const GREETING: Reply = {
  text: "Kumusta! Konnichiwa! I'm Ilaw-san, Seizorai's guide. Ask me about the sun, the wind, the battery, or the town, or ask for a tour.",
  suggestions: STARTERS.slice(0, 4),
  via: "chat",
};

let state: ChatState = { open: false, messages: [{ id: 0, from: "ilaw", text: GREETING.text, reply: GREETING }] };
let nextId = 1;
const listeners = new Set<() => void>();
const MAX_MESSAGES = 40;
/** Long enough for a real question, short enough that nobody pastes an essay. */
export const MAX_QUESTION = 200;

function set(next: ChatState) {
  state = next;
  for (const l of listeners) l();
}

const WEATHER: Record<string, string> = { clear: "clear", partly: "partly cloudy", overcast: "overcast", rain: "raining", typhoon: "a typhoon" };

/** The live plant, as Ilaw-san reads it. */
export const liveReader: LiveReader = {
  now: () => live.now,
  lesson: lessonNow,
  co2TodayT: () => (live.now ? dayTotals().co2AvoidedT : null),
  weather: () => (skyState.weatherState ? WEATHER[skyState.weatherState.type] ?? null : null),
};

export function setChatOpen(open: boolean) {
  if (open !== state.open) set({ ...state, open });
}

export function ask(question: string) {
  const q = question.trim().slice(0, MAX_QUESTION);
  if (!q) return;
  const reply = answer(q, liveReader);
  const messages = [...state.messages, { id: nextId++, from: "you" as const, text: q }, { id: nextId++, from: "ilaw" as const, text: reply.text, reply }];
  set({ open: true, messages: messages.slice(-MAX_MESSAGES) });
}

/** The latest thing Ilaw-san said. */
export function lastReply(): Reply {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const r = state.messages[i].reply;
    if (r) return r;
  }
  return GREETING;
}

// "Take me there": the world's warp, handed in by the Scene.
let warpTo: ((at: [number, number, number]) => void) | null = null;
export function setWarp(fn: typeof warpTo) {
  warpTo = fn;
}
export function goTo(place: Place) {
  warpTo?.(place.at);
}

export function useChat(): ChatState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

export function getChat(): ChatState {
  return state;
}
