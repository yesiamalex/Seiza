// The plant, running live in the world: Seizora's microgrid (sim/energy.ts)
// stepped every frame on the exact time and weather the sky shows (Seiza's
// skyState), with the switches from the room's shared world state. Every
// display, readout, and turbine reads from here, so nothing can disagree.
import { skyState } from "../../../src/sky/skyState";
import { philippineTime, scheduledWeather, SITES, WeatherState, type WeatherType } from "../../../src/sky/weather";
import type { LightZone, WorldStateValue } from "../../../src/multiplayer/types";
import { DEFAULT_CONTROLS, GRID_EMISSION_FACTOR, Microgrid, PLANT, type BatteryMode, type Controls, type Encapsulation, type Snapshot } from "../sim/energy";
import { cloudyGhi } from "../../../src/sky/weather";
import { TOWN, townLoad } from "../sim/town";
import { L } from "../../../src/i18n/lang";

/** Matches "site" in worlds/seizorai/world/world.json. */
export const SITE = SITES.cebu;
/** One chart sample per this many minutes of plant time. */
export const SAMPLE_MINUTES = 10;
const HISTORY_SAMPLES = (24 * 60) / SAMPLE_MINUTES;
/** A jump in the sky's time bigger than this (an editor picking a new
 *  time) re-runs the warm-up rather than integrating across the gap. */
const JUMP_MS = 3 * 3600_000;

// --- the shared switches --------------------------------------------------------

/** World state keys for the control room's switches. */
export const KEYS = {
  silicon: "breaker.silicon",
  perovskite: "breaker.perovskite",
  wind: "breaker.wind",
  battery: "breaker.battery",
  grid: "breaker.grid",
  batteryMode: "battery.mode",
  seal: "perovskite.seal",
  elNino: "climate.elNino",
} as const;

const BATTERY_MODES: BatteryMode[] = ["auto", "charge", "hold", "discharge"];
const SEALS: Encapsulation[] = ["glass", "edge", "none"];

/** The plant's controls from the room's world state, with defaults for
 *  anything nobody has set. */
export function controlsFrom(state: Record<string, WorldStateValue>): Controls {
  const on = (key: string, fallback: boolean) => (typeof state[key] === "boolean" ? (state[key] as boolean) : fallback);
  const mode = state[KEYS.batteryMode];
  const seal = state[KEYS.seal];
  return {
    silicon: on(KEYS.silicon, DEFAULT_CONTROLS.silicon),
    perovskite: on(KEYS.perovskite, DEFAULT_CONTROLS.perovskite),
    wind: on(KEYS.wind, DEFAULT_CONTROLS.wind),
    battery: on(KEYS.battery, DEFAULT_CONTROLS.battery),
    gridConnected: on(KEYS.grid, DEFAULT_CONTROLS.gridConnected),
    batteryMode: BATTERY_MODES.includes(mode as BatteryMode) ? (mode as BatteryMode) : DEFAULT_CONTROLS.batteryMode,
    encapsulation: SEALS.includes(seal as Encapsulation) ? (seal as Encapsulation) : DEFAULT_CONTROLS.encapsulation,
    elNino: on(KEYS.elNino, DEFAULT_CONTROLS.elNino),
  };
}

// --- the scenario, in words -------------------------------------------------------

/** The town, in one line for a display. */
export function townLine(): string {
  const people = Math.round((TOWN.homes * TOWN.peoplePerHome) / 1000);
  return L(
    `${TOWN.homes.toLocaleString("en")} homes · about ${people},000 people · school, clinic, shops`,
    `${TOWN.homes.toLocaleString("en")}世帯 · 約${people},000人 · 学校、診療所、店`
  );
}

/** The scenario the plant is running: the climate and the weather now. */
export function scenarioLabel(): string {
  const s = live.now;
  const climate = live.controls.elNino ? L("El Niño 2026", "エルニーニョ2026") : L("Normal year", "平年");
  if (!s) return climate;
  const weather = skyState.weatherState ? weatherName(skyState.weatherState.type) : "";
  return `${climate} · ${weather} · ${s.ambient.toFixed(0)} °C`;
}

function weatherName(type: WeatherType): string {
  return L(
    { clear: "clear", partly: "partly cloudy", overcast: "overcast", rain: "rain", typhoon: "typhoon" }[type],
    { clear: "晴れ", partly: "晴れ時々曇り", overcast: "曇り", rain: "雨", typhoon: "台風" }[type]
  );
}

/** What one average home is drawing now, and how many homes are dark in a
 *  rotating brownout or island-mode shedding. */
export function homesNow(): { perHomeKw: number; dark: number } {
  const s = live.now;
  if (!s) return { perHomeKw: 0, dark: 0 };
  const town = townLoad(s.hour, s.ambient);
  // Unserved load, as homes: what's dropped is spread over the town's mix.
  const dark = s.unservedMw > 0.001 ? Math.min(TOWN.homes, Math.round((s.unservedMw / town.totalMw) * TOWN.homes)) : 0;
  return { perHomeKw: town.perHomeKw, dark };
}

// --- the running plant ----------------------------------------------------------

export const live = {
  grid: new Microgrid(),
  /** The latest state of the plant, or null before the sky has started. */
  now: null as Snapshot | null,
  /** The last 24 hours of plant time, one sample per SAMPLE_MINUTES. */
  history: [] as Snapshot[],
  controls: { ...DEFAULT_CONTROLS } as Controls,
  /** Whether the sky's time is moving (false while an editor holds it). */
  held: false,
  /** The room's light switches, which the glow outlines follow. */
  lights: { hall: true, classroom: true, pond: true, camp: true } as Record<LightZone, boolean>,
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

/**
 * Runs the plant over the 24 hours before the sky's current time, so a
 * visitor arriving now sees the same battery charge and history as one who
 * has been here all day. The weather follows the shared schedule, or holds
 * the current type if an editor has fixed one (it differs from the
 * schedule), which is what the sky did too.
 */
function warmUp(simMs: number, current: WeatherType) {
  live.grid = new Microgrid();
  live.history = [];
  sinceSample = 0;
  const fixed = current !== scheduledWeather(new Date(simMs)) ? current : null;
  const weather = new WeatherState(fixed ?? scheduledWeather(new Date(simMs - 24 * 3600_000)));
  for (let t = simMs - 24 * 3600_000; t < simMs; t += SAMPLE_MINUTES * 60_000) {
    const date = new Date(t);
    weather.setType(fixed ?? scheduledWeather(date));
    weather.step(SAMPLE_MINUTES, t / 60_000);
    const { dayOfYear, hour } = philippineTime(date);
    record(live.grid.step(SAMPLE_MINUTES, dayOfYear, hour, SITE, weather, live.controls), SAMPLE_MINUTES);
  }
  // The warm-up's own log is history the visitor didn't see happen.
  live.grid.events = [];
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
  // A held sky stands still, but the plant keeps running at that hour in
  // real time, so a class can watch noon charge the battery.
  live.held = simDelta <= 0;
  const minutes = live.held ? realSeconds / 60 : simDelta / 60_000;
  if (minutes <= 0) return;
  record(live.grid.step(Math.min(minutes, 30), skyState.dayOfYear, skyState.hour, SITE, weather, live.controls), minutes);
}

// --- what the displays show -----------------------------------------------------------

export interface DayTotals {
  generatedMwh: number;
  loadMwh: number;
  importedMwh: number;
  exportedMwh: number;
  unservedMwh: number;
  /** Share of the load served from the plant's own sun, wind, and battery. */
  renewableShare: number;
  co2AvoidedT: number;
}

/** Totals over the last 24 hours of plant time, from the chart's samples. */
export function dayTotals(): DayTotals {
  const h = SAMPLE_MINUTES / 60;
  let generated = 0, load = 0, imported = 0, exported = 0, unserved = 0;
  for (const s of live.history) {
    generated += (s.siliconMw + s.perovskiteMw + s.windMw) * h;
    load += (s.loadMw - s.unservedMw) * h;
    imported += Math.max(0, s.gridMw) * h;
    exported += Math.max(0, -s.gridMw) * h;
    unserved += s.unservedMw * h;
  }
  return {
    generatedMwh: generated,
    loadMwh: load,
    importedMwh: imported,
    exportedMwh: exported,
    unservedMwh: unserved,
    renewableShare: load > 0.01 ? Math.max(0, load - imported) / load : 0,
    co2AvoidedT: generated * GRID_EMISSION_FACTOR,
  };
}

/** How fast a turbine's rotor turns, in revolutions per minute, for the
 *  power it's making: still when it makes none (calm, feathered, or its
 *  breaker open), and from about 10 to 20 rpm as output rises, the range of
 *  a variable-speed 1.5 MW turbine (GE 1.5 MW data). The garden's models
 *  turn at the full-size rate. */
export function rotorRpm(): number {
  const s = live.now;
  if (!s || !live.controls.wind || s.turbinesFeathered || s.windMw <= 0) return 0;
  const fraction = s.windMw / (PLANT.turbines * PLANT.turbineMw);
  return 10 + 10 * Math.cbrt(fraction);
}

/**
 * One line on what the plant is doing right now and why: the lesson the
 * numbers are showing. The first rule that fits wins.
 */
export function lessonNow(): string {
  const s = live.now;
  if (!s) return L("Waiting for the sky.", "空の準備を待っています。");
  const c = live.controls;
  const solar = s.siliconMw + s.perovskiteMw;
  if (!c.gridConnected && s.unservedMw > 0.05)
    return L(
      `Island mode: ${s.unservedMw.toFixed(2)} MW of homes are dark. Only sun, wind, and the battery can serve them now.`,
      `自立運転:${s.unservedMw.toFixed(2)} MW分の家が停電しています。今は太陽と風と蓄電池だけが頼りです。`
    );
  if (!c.gridConnected) return L("Island mode: cut off from the main grid, the plant must match the load by itself.", "自立運転:本線の系統から切り離され、発電所だけで需要に合わせなければなりません。");
  if (s.gridAlert && s.unservedMw > 0.01)
    return L(
      `El Niño grid alert: the main grid can give only ${s.gridLimitMw.toFixed(2)} MW, so about ${homesNow().dark.toLocaleString("en")} homes are in a rotating brownout. Stored sunlight in the battery is what keeps the rest lit.`,
      `エルニーニョの系統警報:本線の系統は${s.gridLimitMw.toFixed(2)} MWしか送れないので、約${homesNow().dark.toLocaleString("en")}世帯が計画停電中です。残りの明かりを保っているのは、蓄電池にためた太陽の光です。`
    );
  if (s.gridAlert)
    return L(
      `El Niño grid alert: the main grid is short in the heat and can give only ${s.gridLimitMw.toFixed(2)} MW. Solar and the battery are covering the rest, so no home is dark.`,
      `エルニーニョの系統警報:暑さで本線の系統が足りず、${s.gridLimitMw.toFixed(2)} MWしか送れません。残りは太陽光と蓄電池がまかなっているので、停電している家はありません。`
    );
  if (s.turbinesFeathered) return L("Typhoon winds: the turbines feather their blades and brake to survive. They make nothing in a storm.", "台風の風:タービンは羽根を風に沿わせ、ブレーキをかけて身を守ります。嵐の中では発電しません。");
  if (s.sunElevation <= 0 && s.batteryMw > 0.05) return L("Night: no solar at all. The battery is covering the evening peak with sunlight stored earlier.", "夜:太陽光はゼロです。昼にためた太陽の光で、蓄電池が夕方のピークを支えています。");
  if (s.sunElevation <= 0) return L("Night: no solar at all. Wind, the battery, and the main grid carry the load.", "夜:太陽光はゼロです。風と蓄電池と本線の系統が需要を支えています。");
  if (s.batteryMw < -0.05 && solar > s.loadMw) return L("Surplus sun: what the town can't use right now is charging the battery for the evening.", "太陽の余り:町が今使いきれない分で、夕方のために蓄電池を充電しています。");
  if (s.cellTemp > 50 && s.poa > 600)
    return L(
      `Hot panels: the cells are at ${s.cellTemp.toFixed(0)} °C. Silicon loses about 0.35% of its output per degree; perovskite about half that.`,
      `熱いパネル:セルは${s.cellTemp.toFixed(0)} °Cです。シリコンは1度ごとに出力が約0.35%下がり、ペロブスカイトはその約半分です。`
    );
  if (s.cloud > 0.7) {
    // Kasten and Czeplak's cloud factor, the same one the sky uses.
    const share = Math.round(cloudyGhi(100, s.cloud));
    return L(
      `Heavy cloud: about ${share}% of the clear-sky sunlight gets through (a quarter under full overcast), and solar output falls with it.`,
      `厚い雲:晴天時の日射の約${share}%しか届かず(全面の曇りでは4分の1)、太陽光の出力もそれに合わせて下がります。`
    );
  }
  if (s.sunElevation < 15) return L("Low sun: its light crosses more air and strikes the panels at a slant, so output is small.", "低い太陽:光がより多くの空気を通り、パネルに斜めに当たるので、出力は小さくなります。");
  const windRating = PLANT.turbines * PLANT.turbineMw;
  if (s.windMw > 0.5 * windRating && s.windMw < 0.98 * windRating)
    return L("Strong wind: the power in the wind grows with the cube of its speed, so a little more wind means much more power.", "強い風:風のエネルギーは風速の3乗で増えるので、風が少し強まるだけで電力はぐっと増えます。");
  if (s.windMw >= 0.98 * windRating)
    return L("Full wind power: past 12 m/s the turbines pitch their blades to hold their rating, so more wind adds nothing.", "風力が定格に:12 m/sを超えるとタービンは羽根の角度を変えて定格を保つので、風が強まっても増えません。");
  if (s.gridMw < -0.05) return L("Exporting: the plant makes more than the town needs and sends the rest to the main grid.", "送電中:町が必要とする以上に発電していて、残りを本線の系統に送っています。");
  if (c.elNino && s.ambient >= 32)
    return L(
      `El Niño heat: at ${s.ambient.toFixed(0)} °C, fans and aircon run longer, and the town draws more than on a cooler day.`,
      `エルニーニョの暑さ:${s.ambient.toFixed(0)} °Cでは扇風機とエアコンが長く動き、涼しい日より町の需要が増えます。`
    );
  return L("A normal hour: sun, wind, and the battery share the load, and the main grid fills any gap.", "ふだんの時間:太陽と風と蓄電池で需要を分け合い、足りない分は本線の系統が補います。");
}
