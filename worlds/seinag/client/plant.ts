// Seinag's hypothetical campus solar, as a plant: the rooftop arrays
// (world/solar.json, placed by scripts/place-panels.mjs), a battery, and
// the campus's own demand, run on Seizora's plant model
// (worlds/seizora/sim/energy.ts) with the same physics: sun position,
// clouds, panel temperature, inverter and wiring losses.
//
// Nothing here is UPOU's real plan or real meter data. The arrays are sized
// by what fits on the roofs in the model; the campus load is an assumed
// office-and-classroom profile. They're there to learn from.
import { ambientTemperature, SITES } from "../../../src/sky/weather";
import { Microgrid, type PlantSpec } from "../../seizora/sim/energy";
import solar from "../world/solar.json";

/** UPOU is in Los Baños, Laguna: Metro Manila's sky is the nearest site. */
export const SITE = SITES.manila;

const moduleCount = Object.values(solar.arrays).reduce((n, a) => n + a.modules.length, 0);
/** The rooftop arrays' peak, in MW, from the modules that fit. */
export const ROOFTOP_MWP = (moduleCount * solar.module.wp) / 1e6;

/** Day of the week for a day of 2026 (1 = Thursday 1 January): 0 is Monday. */
export function weekday(dayOfYear: number): number {
  return (dayOfYear - 1 + 3) % 7;
}

/**
 * The campus's demand, in MW, at an hour, an air temperature, and a day of
 * the year: an assumed week for offices, classrooms, and a few labs. A
 * night base of lights, servers, and security; a working day from 7 to 6
 * on weekdays; and aircon that rises with the heat. About 0.25 MW at a hot
 * weekday mid-afternoon. On Saturdays and Sundays only the base runs, so the
 * roofs make more than the campus uses and the battery fills.
 */
export function campusLoad(hour: number, ambient: number, dayOfYear = 82): number {
  const base = 0.045;
  if (weekday(dayOfYear) >= 5) return base + Math.max(0, ambient - 28) * 0.002;
  const working = hour >= 7 && hour < 18 ? 1 : hour >= 6 && hour < 7 ? hour - 6 : hour >= 18 && hour < 20 ? (20 - hour) / 2 : 0;
  // Lunch dips a little; the afternoon is the hottest and busiest.
  const shape = 0.1 + 0.03 * Math.sin(((hour - 9) / 9) * Math.PI);
  const cooling = Math.max(0, ambient - 24) * 0.009;
  return base + working * (shape + cooling);
}

export const CAMPUS: PlantSpec = {
  siliconMwp: ROOFTOP_MWP,
  perovskiteMwp: 0,
  turbines: 0,
  turbineMw: 0,
  batteryMwh: 0.2,
  batteryMw: 0.1,
  // The busiest hour on a hot, clear day.
  peakLoadMw: Math.max(...Array.from({ length: 48 }, (_, i) => campusLoad(i / 2, ambientTemperature(i / 2, SITE, 1.5)))),
};

export function newCampusPlant(): Microgrid {
  return new Microgrid(CAMPUS, campusLoad);
}
