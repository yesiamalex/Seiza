import { useSyncExternalStore } from "react";
import { skyState } from "../sky/skyState";
import { ambientTemperature, SITES } from "../sky/weather";

/**
 * Heat reactions: a long walk in the midday sun tells on an avatar, the
 * way a long kneel in seiza does (seizaEndurance.ts). The heat index comes
 * from the sky's own temperature and humidity at its time of day; walking
 * builds a heat load, faster the hotter it is, slower in shade; resting
 * and cooler hours bring it down. As it builds, the avatar sweats, then
 * pants and tires, then frowns and slows. Every client works it out for
 * every avatar from how they move, so it costs the room nothing; only
 * whether someone has it switched off travels (heatCalm, like calm).
 *
 * For an urbanity walk this puts the virtual walk beside the real one:
 * the same hours that are hard on the street are hard here.
 */

/** The heat index in °C (Rothfusz's regression, the NWS one PAGASA uses),
 *  from air temperature in °C and relative humidity in percent. Below
 *  27 °C the regression doesn't hold, and the air temperature stands. */
export function heatIndexC(tempC: number, humidity: number): number {
  if (tempC < 27) return tempC;
  const t = tempC * 1.8 + 32;
  const r = humidity;
  const f = -42.379 + 2.04901523 * t + 10.14333127 * r - 0.22475541 * t * r - 0.00683783 * t * t - 0.05481717 * r * r + 0.00122874 * t * t * r + 0.00085282 * t * r * r - 0.00000199 * t * t * r * r;
  return (f - 32) / 1.8;
}

export type HeatLevel = "fine" | "caution" | "extreme-caution" | "danger" | "extreme-danger";
/** PAGASA's heat index classification. */
export function heatLevel(hi: number): HeatLevel {
  return hi >= 52 ? "extreme-danger" : hi >= 42 ? "danger" : hi >= 33 ? "extreme-caution" : hi >= 27 ? "caution" : "fine";
}
export const HEAT_LEVEL_LABELS: Record<HeatLevel, [string, string]> = {
  fine: ["Comfortable", "快適"],
  caution: ["Caution", "注意"],
  "extreme-caution": ["Extreme caution", "厳重注意"],
  danger: ["Danger", "危険"],
  "extreme-danger": ["Extreme danger", "極めて危険"],
};

/** The heat index now: the sky's (its site, hour, and weather), or, in a
 *  world with a fixed sky, Manila's at this real hour. */
export function currentHeatIndex(): number {
  if (skyState.active && skyState.temperature !== null) return heatIndexC(skyState.temperature, skyState.weatherState?.humidity ?? 70);
  const now = new Date();
  const hour = (now.getUTCHours() + 8 + now.getUTCMinutes() / 60) % 24;
  return heatIndexC(ambientTemperature(hour, SITES.manila, 1), 70);
}

export interface HeatInput {
  /** Metres a second the avatar is covering. */
  speed: number;
  /** Under a roof or shade. */
  shaded: boolean;
  /** Pedalling or pushing a board counts as hard work; a moped as none. */
  effort: number;
  hi: number;
}

/** A walk at 42 °C in the open fills the load in about a minute; at 35 °C,
 *  about two. Resting empties it in a minute, faster in shade. */
export function stepHeat(load: number, input: HeatInput, dt: number): number {
  const moving = input.speed > 0.4;
  const hot = Math.max(0, (input.hi - 27) / 15);
  let rate: number;
  if (moving && hot > 0) rate = (hot * input.effort * (input.speed > 4 ? 1.6 : 1) * (input.shaded ? 0.35 : 1)) / 60;
  else rate = -(input.shaded || input.hi < 27 ? 1 / 35 : 1 / 60);
  return Math.max(0, Math.min(1, load + rate * dt));
}

/** 0 fine, 1 sweating, 2 panting, 3 frowning and slowing down. */
export type HeatStage = 0 | 1 | 2 | 3;
export const heatStage = (load: number): HeatStage => (load >= 0.8 ? 3 : load >= 0.55 ? 2 : load >= 0.3 ? 1 : 0);
export const heatExpression = (stage: HeatStage): string | undefined => (stage === 3 ? "angry" : stage === 2 ? "sad" : undefined);
/** How fast someone walks with this load: down to 0.6 at the worst. */
export const heatSpeed = (load: number) => 1 - 0.4 * Math.max(0, Math.min(1, (load - 0.55) / 0.45));

// --- the load of every avatar, shared by the scene and the screen -------------

export const LOCAL_HEAT = "local";
const stages = new Map<string, HeatStage>();
const loads = new Map<string, number>();
const listeners = new Set<() => void>();

export function setHeat(id: string, load: number) {
  loads.set(id, load);
  const stage = heatStage(load);
  if (stages.get(id) !== stage) {
    stages.set(id, stage);
    listeners.forEach((l) => l());
  }
}
export const heatLoad = (id: string) => loads.get(id) ?? 0;
export function forgetHeat(id: string) {
  loads.delete(id);
  if (stages.delete(id)) listeners.forEach((l) => l());
}

/** One avatar's stage, re-rendering only when it changes. */
export function useHeatStage(id: string): HeatStage {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => stages.get(id) ?? 0,
    () => 0
  );
}

// --- a drink of water, and fainting --------------------------------------------

/** A drink takes this much off your heat load, once every so often. */
const DRINK = 0.35;
export const DRINK_COOLDOWN_MS = 20_000;
let pendingCool = 0;
let lastDrink = -Infinity;
/** Drinks some water, if it's been long enough since the last: true if so. */
export function drinkWater(): boolean {
  const now = performance.now();
  if (now - lastDrink < DRINK_COOLDOWN_MS) return false;
  lastDrink = now;
  pendingCool += DRINK;
  // You're seen to drink, here and by the room (DrinkLayer).
  drinkers.set("local", now);
  consuming.set("local", "water");
  tellRoom?.("water");
  return true;
}

/** Something to drink or eat, in your hand while you have it (DrinkLayer
 *  makes each): a world's shops and tables hand these out. */
export type Consumable = "water" | "tea" | "coffeeCan" | "cup" | "onigiri" | "sandwich" | "meal";
export const CONSUMABLES: readonly Consumable[] = ["water", "tea", "coffeeCan", "cup", "onigiri", "sandwich", "meal"];
export const isFood = (item: Consumable) => item === "onigiri" || item === "sandwich" || item === "meal";
/** How long having one takes, from reaching for it to the last of the sigh. */
export const CONSUME_SECONDS = 4.6;

/**
 * Has something (bought, or from a table): seen by the room, as a drink of
 * water is. A drink cools you too, if your last was long enough ago. False
 * if you're still busy with the last one.
 */
export function consume(item: Consumable): boolean {
  const now = performance.now();
  const since = drinkers.get("local");
  if (since !== undefined && now - since < CONSUME_SECONDS * 1000) return false;
  if (!isFood(item) && now - lastDrink >= DRINK_COOLDOWN_MS) {
    lastDrink = now;
    pendingCool += DRINK;
  }
  drinkers.set("local", now);
  consuming.set("local", item);
  tellRoom?.(item);
  return true;
}

/** Whether you're still having the last one (so a shop doesn't take your
 *  money for something you can't hold yet). */
export function busyConsuming(): boolean {
  const since = drinkers.get("local");
  return since !== undefined && performance.now() - since < CONSUME_SECONDS * 1000;
}

/** Who's drinking, by avatar key ("local" for you, else a player's id),
 *  since when (performance.now): DrinkLayer puts a bottle in their hand. */
export const drinkers = new Map<string, number>();
/** And what each is having (water, unless said). */
export const consuming = new Map<string, Consumable>();
let tellRoom: ((item: Consumable) => void) | null = null;
/** App connects the room socket here, so the room sees you drink. */
export const connectDrinks = (send: ((item: Consumable) => void) | null) => {
  tellRoom = send;
};
/** Someone else in the room had a drink (or something to eat). */
export function seeDrink(id: string, item?: string) {
  drinkers.set(id, performance.now());
  consuming.set(id, CONSUMABLES.includes(item as Consumable) ? (item as Consumable) : "water");
}
export const drinkReadyIn = () => Math.max(0, DRINK_COOLDOWN_MS - (performance.now() - lastDrink));
/** Cools your load by this much on its next tick (fainting rests you most of the way). */
export function coolBy(amount: number) {
  pendingCool += amount;
}
/** What's waiting to come off your load (HeatLayer takes it each tick). */
export function takeCool(): number {
  const c = pendingCool;
  pendingCool = 0;
  return c;
}

/** Fainting at a full load: "dark" while the screen goes, "wake" while you
 *  come to somewhere cool (HeatChip's FaintOverlay), then back to "none". */
export type FaintPhase = "none" | "dark" | "wake";
let faint: FaintPhase = "none";
const faintListeners = new Set<() => void>();
export const faintPhase = () => faint;
export function setFaint(next: FaintPhase) {
  if (faint === next) return;
  faint = next;
  for (const f of faintListeners) f();
}
export function onFaintChange(f: () => void) {
  faintListeners.add(f);
  return () => {
    faintListeners.delete(f);
  };
}

// --- shade: worlds mark their roofs ------------------------------------------

/** Covered ground a world declares (a roofed walkway, a tree's canopy): a
 *  test of whether a point on the ground is under it. Returns the removal. */
type ShadeTest = (x: number, z: number) => boolean;
const shades = new Set<ShadeTest>();
export function addShade(covers: ShadeTest) {
  shades.add(covers);
  return () => {
    shades.delete(covers);
  };
}
export const inDeclaredShade = (x: number, z: number) => [...shades].some((covers) => covers(x, z));

// --- the viewer's own switch (as useSeizaReactions) ---------------------------

const KEY = "seiza-heat-reactions";
let heatOn = (() => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
})();
const switchListeners = new Set<() => void>();

/** Whether this viewer's own avatar feels the heat. On unless turned off. */
export function useHeatReactions(): boolean {
  return useSyncExternalStore(
    (l) => {
      switchListeners.add(l);
      return () => switchListeners.delete(l);
    },
    () => heatOn,
    () => true
  );
}
export const heatReactionsOn = () => heatOn;
export function setHeatReactions(on: boolean) {
  heatOn = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Not remembered in a private window.
  }
  switchListeners.forEach((l) => l());
}
