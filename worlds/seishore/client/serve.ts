// Where what you order is brought: every place at every table in town (the
// café's, the family restaurant's, and Nishi-machi's kissaten and SeaBurger
// upstairs), and what's been put down at each. An order goes to the place
// nearest you, replacing whatever was there; you eat or drink it from the
// table. Away from any table, it's simply handed to you.
import { useSyncExternalStore } from "react";
import type { Consumable } from "../../../src/avatar/heat";

/** A place at a table: where a dish is set down. */
export interface Place {
  id: string;
  at: [number, number, number];
}

/** How what's brought looks: a cup and saucer, a plate, or a tray (the burger shop's). */
export type Dish = "cup" | "plate" | "tray";

export interface Served {
  place: string;
  at: [number, number, number];
  item: Consumable;
  dish: Dish;
  /** What it is, for the caption when you have it. */
  name: [string, string];
}

let places: Place[] = [];
const served = new Map<string, Served>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const l of listeners) l();
};

/** The places a part of town has (each scene adds its own, under its own key). */
const byScene = new Map<string, Place[]>();
export function setPlaces(scene: string, list: Place[] | null): void {
  if (list) byScene.set(scene, list);
  else byScene.delete(scene);
  places = [...byScene.values()].flat();
}

/** Where you are, as the scene last saw you (the camera's feet). */
const self = { x: 0, z: 0 };
export function setSelf(x: number, z: number): void {
  self.x = x;
  self.z = z;
}

/** How near a table has to be for an order to be brought to it. */
export const SERVE_REACH = 4;

/** The nearest place to (x, z) within reach, or null. */
export function nearestPlace(x: number, z: number, reach = SERVE_REACH): Place | null {
  let best: Place | null = null;
  let bestD = reach;
  for (const p of places) {
    const d = Math.hypot(p.at[0] - x, p.at[2] - z);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best;
}

/** Brings an order to the place nearest you (replacing what's there). False if no table is near. */
export function serveNearYou(item: Consumable, dish: Dish, name: [string, string]): boolean {
  const place = nearestPlace(self.x, self.z);
  if (!place) return false;
  served.set(place.id, { place: place.id, at: place.at, item, dish, name });
  changed();
  return true;
}

/** Takes what's been served at a place (to eat it): gone from the table. */
export function takeServed(place: string): Served | null {
  const s = served.get(place) ?? null;
  if (s) {
    served.delete(place);
    changed();
  }
  return s;
}

/** Everything on the tables now; re-renders when it changes. */
export function useServed(): Served[] {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version
  );
  return [...served.values()];
}

/** Clears the tables (leaving the world). */
export function clearServed(): void {
  served.clear();
  changed();
}
