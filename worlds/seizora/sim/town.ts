/**
 * The town Seizora's microgrid serves, built from what its people switch
 * on, hour by hour, so the load has homes and appliances behind it instead
 * of an invented curve.
 *
 * The town is illustrative, not a census: a provincial coastal town in
 * Cebu with TOWN.homes homes (single-storey houses, 4.1 people each, the
 * national average) and the places a town that size has: a school, a
 * health centre, shops and eateries, a water pumping station, and street
 * lights. That's about 29,000 people. The appliance mix and schedules are
 * assumptions; what anchors them is:
 * - A home uses 140 to 180 kWh a month, depending on the weather: a little
 *   under the 200 kWh household Meralco quotes its Metro Manila rates for
 *   (Daily Tribune, 2024), as suits a provincial town.
 * - Hot, clear weather raises it about a quarter over cool, rainy weather,
 *   mostly through fans and air conditioning, inside the 10 to 40% rise in
 *   residential use Meralco expects in summer (GMA News, 2021).
 * - A 1 HP non-inverter air conditioner draws about 850 to 1,000 W (Teko,
 *   2024), and one home in four has one.
 */
import { L } from "../../../src/i18n/lang";

export type Use = "cooling" | "lighting" | "refrigeration" | "cooking" | "media" | "chores" | "community";

export const USE_LABELS: Record<Use, string> = {
  cooling: "Fans and aircon",
  lighting: "Lighting",
  refrigeration: "Refrigerators",
  cooking: "Rice cookers",
  media: "TV, phones, Wi-Fi",
  chores: "Laundry, iron, pumps",
  community: "School, clinic, shops, water, street lights",
};

const USE_LABELS_JA: Record<Use, string> = {
  cooling: "扇風機とエアコン",
  lighting: "照明",
  refrigeration: "冷蔵庫",
  cooking: "炊飯器",
  media: "テレビ、スマホ、Wi-Fi",
  chores: "洗濯、アイロン、ポンプ",
  community: "学校、診療所、店、水道、街灯",
};

/** A use's label in the visitor's language. */
export function useLabel(use: Use): string {
  return L(USE_LABELS[use], USE_LABELS_JA[use]);
}

/** The temperature the schedules below describe; hotter hours run more of
 *  the heat-sensitive appliances, cooler ones fewer. */
const REFERENCE_C = 28;

interface Appliance {
  label: string;
  use: Use;
  /** Power while running, in watts. */
  watts: number;
  /** Average number in a home: ownership times how many an owner has. */
  perHome: number;
  /** Share of them running in each hour, 0:00 to 23:00, at REFERENCE_C. */
  schedule: number[];
  /** Change in use per °C above REFERENCE_C (fans and aircon run longer,
   *  a refrigerator's compressor cycles more). */
  perDegree?: number;
}

/** Fills a 24-hour schedule from [fromHour, toHour inclusive, share] runs;
 *  hours not listed are `rest`. */
function hours(rest: number, ...runs: [number, number, number][]): number[] {
  const out = new Array(24).fill(rest);
  for (const [from, to, share] of runs) for (let h = from; h <= to; h++) out[h] = share;
  return out;
}

export const APPLIANCES: Appliance[] = [
  // Five LED bulbs, on from dusk until bedtime.
  { label: "LED lights", use: "lighting", watts: 10, perHome: 6, schedule: hours(0.06, [5, 5, 0.35], [6, 6, 0.2], [17, 17, 0.4], [18, 18, 0.85], [19, 20, 0.95], [21, 21, 0.8], [22, 22, 0.45], [23, 23, 0.15]) },
  // Stand and ceiling fans: the main way a Philippine home keeps cool, and
  // they run through the night.
  { label: "Electric fans", use: "cooling", watts: 55, perHome: 2.2, perDegree: 0.06, schedule: hours(0.3, [0, 5, 0.7], [6, 6, 0.4], [10, 11, 0.45], [12, 16, 0.6], [17, 17, 0.55], [18, 21, 0.7], [22, 23, 0.75]) },
  // A 1 HP window unit in one home in four, mostly for sleeping.
  { label: "Aircon (1 HP)", use: "cooling", watts: 900, perHome: 0.25, perDegree: 0.12, schedule: hours(0.03, [0, 4, 0.55], [5, 5, 0.35], [6, 6, 0.1], [12, 12, 0.08], [13, 16, 0.15], [17, 19, 0.12], [20, 20, 0.3], [21, 21, 0.5], [22, 23, 0.6]) },
  // Refrigerators average about 45 W over a day as the compressor cycles.
  { label: "Refrigerators", use: "refrigeration", watts: 45, perHome: 0.7, perDegree: 0.025, schedule: hours(1) },
  { label: "Televisions", use: "media", watts: 70, perHome: 0.9, schedule: hours(0.02, [6, 6, 0.15], [7, 7, 0.2], [8, 11, 0.1], [12, 12, 0.25], [13, 16, 0.15], [17, 17, 0.3], [18, 18, 0.55], [19, 20, 0.65], [21, 21, 0.5], [22, 22, 0.25], [23, 23, 0.08]) },
  // Rice for breakfast, lunch, and dinner.
  { label: "Rice cookers", use: "cooking", watts: 600, perHome: 0.75, schedule: hours(0, [5, 5, 0.25], [6, 6, 0.12], [10, 10, 0.12], [11, 11, 0.22], [16, 16, 0.08], [17, 17, 0.18], [18, 18, 0.12]) },
  // A Wi-Fi router and phone chargers.
  { label: "Phones and Wi-Fi", use: "media", watts: 25, perHome: 1, schedule: hours(0.8, [18, 22, 1.3]) },
  // Washing machine, flat iron, and a small water pump, in the morning.
  { label: "Laundry, iron, pump", use: "chores", watts: 400, perHome: 0.5, schedule: hours(0.01, [7, 11, 0.12], [14, 16, 0.06]) },
];

/** The town's other buildings, in kW at full use, with their own hours. */
export const COMMUNITY: { label: string; kw: number; schedule: number[]; perDegree?: number }[] = [
  // Classrooms' lights and fans and a computer room, on school days.
  { label: "School", kw: 80, perDegree: 0.03, schedule: hours(0.03, [7, 7, 0.5], [8, 11, 1], [12, 12, 0.8], [13, 15, 1], [16, 16, 0.5]) },
  // Vaccine refrigerators all day and night; clinic hours by day.
  { label: "Health centre", kw: 45, schedule: hours(0.55, [8, 16, 1]) },
  // Stores' refrigerators, eateries, and the market.
  { label: "Shops and eateries", kw: 250, perDegree: 0.04, schedule: hours(0.15, [6, 6, 0.4], [7, 11, 0.7], [12, 13, 0.8], [14, 16, 0.7], [17, 20, 1], [21, 21, 0.6], [22, 22, 0.3]) },
  // Pumping the town's water up to its tank, mornings and late afternoons.
  { label: "Water pumping", kw: 60, schedule: hours(0.2, [4, 8, 1], [16, 19, 0.8]) },
  { label: "Street lights", kw: 15, schedule: hours(0, [0, 5, 1], [18, 23, 1]) },
];

export const TOWN = {
  homes: 7000,
  /** People per home: the national average (PSA, 2020 census). */
  peoplePerHome: 4.1,
};

export interface TownLoad {
  /** The whole town, in MW. */
  totalMw: number;
  /** The same, split by what it's for. */
  byUse: Record<Use, number>;
  /** One average home's draw now, in kW. */
  perHomeKw: number;
}

const heat = (perDegree: number | undefined, tempC: number) =>
  perDegree ? Math.max(0.3, Math.min(2.5, 1 + perDegree * (tempC - REFERENCE_C))) : 1;

/** What the town draws at an hour of the day and an air temperature. */
export function townLoad(hour: number, tempC: number): TownLoad {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const byUse: Record<Use, number> = { cooling: 0, lighting: 0, refrigeration: 0, cooking: 0, media: 0, chores: 0, community: 0 };
  let homeW = 0;
  for (const a of APPLIANCES) {
    const w = a.watts * a.perHome * Math.min(1, a.schedule[h] * heat(a.perDegree, tempC));
    byUse[a.use] += (w * TOWN.homes) / 1e6;
    homeW += w;
  }
  for (const c of COMMUNITY) byUse.community += (c.kw * Math.min(1, c.schedule[h] * heat(c.perDegree, tempC))) / 1000;
  const totalMw = Object.values(byUse).reduce((sum, v) => sum + v, 0);
  return { totalMw, byUse, perHomeKw: homeW / 1000 };
}

/**
 * The town's highest hour on a hot, clear day (the engine's clear-day
 * temperatures in Cebu): the peak the plant and its battery are sized
 * against. Computed rather than set, so it always matches the town above.
 */
export function designPeakMw(tempAt: (hour: number) => number): number {
  let peak = 0;
  for (let h = 0; h < 24; h++) peak = Math.max(peak, townLoad(h, tempAt(h + 0.5)).totalMw);
  return peak;
}
