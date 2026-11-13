// Seinag's campus plant, running live on the exact time and weather the sky
// shows (Seiza's skyState), as Seizora's does: the dashboard, the cards,
// and the guides all read from here, so nothing can disagree. Nothing is
// shared over the network: every visitor runs the same model on the same
// sky, so they see the same numbers.
import { skyState } from "../../../src/sky/skyState";
import { philippineTime, scheduledWeather, WeatherState, type WeatherType } from "../../../src/sky/weather";
import { DEFAULT_CONTROLS, GRID_EMISSION_FACTOR, type BatteryMode, type Controls, type Microgrid, type Snapshot } from "../../seizora/sim/energy";
import type { WorldStateValue } from "../../../src/multiplayer/types";
import { newCampusPlant, SITE } from "./plant";

/** One chart sample per this many minutes. */
export const SAMPLE_MINUTES = 10;
const HISTORY_SAMPLES = (24 * 60) / SAMPLE_MINUTES;
/** A jump in the sky's time bigger than this re-runs the warm-up. */
const JUMP_MS = 3 * 3600_000;

/** World state keys for the solar station's console: shared by everyone in
 *  the room, like Seizora's control room. */
export const KEYS = {
  solar: "seinag.solar",
  battery: "seinag.battery",
  grid: "seinag.grid",
  batteryMode: "seinag.batteryMode",
} as const;
const BATTERY_MODES: BatteryMode[] = ["auto", "charge", "hold", "discharge"];

/** The plant's switches from the room's world state: rooftop solar,
 *  battery, and grid tie on, and the battery on auto, unless someone has
 *  changed them at the console. No perovskite and no wind here. */
export function controlsFrom(state: Record<string, WorldStateValue>): Controls {
  const on = (key: string) => (typeof state[key] === "boolean" ? (state[key] as boolean) : true);
  const mode = state[KEYS.batteryMode];
  return {
    ...DEFAULT_CONTROLS,
    silicon: on(KEYS.solar),
    perovskite: false,
    wind: false,
    battery: on(KEYS.battery),
    gridConnected: on(KEYS.grid),
    batteryMode: BATTERY_MODES.includes(mode as BatteryMode) ? (mode as BatteryMode) : "auto",
    elNino: false,
  };
}

export const live = {
  plant: newCampusPlant() as Microgrid,
  now: null as Snapshot | null,
  history: [] as Snapshot[],
  controls: controlsFrom({}),
};

let lastSimMs = 0;
let sinceSample = 0;

function record(snapshot: Snapshot, minutes: number) {
  live.now = snapshot;
  sinceSample += minutes;
  if (sinceSample >= SAMPLE_MINUTES || live.history.length === 0) {
    sinceSample = 0;
    live.history.push(snapshot);
    if (live.history.length > HISTORY_SAMPLES) live.history.shift();
  }
}

function warmUp(simMs: number, current: WeatherType) {
  live.plant = newCampusPlant();
  live.history = [];
  sinceSample = 0;
  const fixed = current !== scheduledWeather(new Date(simMs)) ? current : null;
  const weather = new WeatherState(fixed ?? scheduledWeather(new Date(simMs - 24 * 3600_000)));
  for (let t = simMs - 24 * 3600_000; t < simMs; t += SAMPLE_MINUTES * 60_000) {
    const date = new Date(t);
    weather.setType(fixed ?? scheduledWeather(date));
    weather.step(SAMPLE_MINUTES, t / 60_000);
    const { dayOfYear, hour } = philippineTime(date);
    record(live.plant.step(SAMPLE_MINUTES, dayOfYear, hour, SITE, weather, live.controls), SAMPLE_MINUTES);
  }
}

/** Advances the plant to the sky's current time. Called once a frame. */
export function stepLive(realSeconds: number) {
  const weather = skyState.weatherState;
  if (!skyState.active || !weather) return;
  const simMs = skyState.simMs;
  const simDelta = simMs - lastSimMs;
  if (live.history.length === 0 || Math.abs(simDelta) > JUMP_MS || simDelta < -60_000) {
    warmUp(simMs, weather.type);
    lastSimMs = simMs;
    return;
  }
  lastSimMs = simMs;
  // A held sky stands still, but the plant keeps running at that hour.
  const minutes = simDelta <= 0 ? realSeconds / 60 : simDelta / 60_000;
  if (minutes <= 0) return;
  record(live.plant.step(Math.min(minutes, 30), skyState.dayOfYear, skyState.hour, SITE, weather, live.controls), minutes);
}

/** The last 24 hours, added up. */
export function dayTotals() {
  const hours = SAMPLE_MINUTES / 60;
  let solarMwh = 0, loadMwh = 0, importMwh = 0;
  for (const s of live.history) {
    solarMwh += s.siliconMw * hours;
    loadMwh += s.loadMw * hours;
    importMwh += Math.max(0, s.gridMw) * hours;
  }
  return {
    solarMwh,
    loadMwh,
    /** Of what the campus used, the share that didn't come from the grid. */
    ownShare: loadMwh > 0 ? Math.min(1, Math.max(0, 1 - importMwh / loadMwh)) : 0,
    co2AvoidedT: solarMwh * GRID_EMISSION_FACTOR,
  };
}
