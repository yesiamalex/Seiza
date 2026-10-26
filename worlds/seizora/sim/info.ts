// Seizora's info cards, opened by clicking an exhibit or a board: an
// illustration and a short explanation for each part of the plant, written
// for visitors rather than engineers.
// The illustrations are inline SVG, so nothing is downloaded. Every figure
// in a card matches the model (sim/energy.ts, src/sky/weather.ts), and each
// card lists the sources it rests on (sim/references.ts).
import {
  BATTERY_ONE_WAY_EFFICIENCY,
  CUT_IN,
  CUT_OUT,
  loadFraction,
  PEROVSKITE,
  PLANT,
  RATED_SPEED,
  SILICON,
  SOC_MAX,
  SOC_MIN,
  turbinePower,
  EL_NINO,
  PEAK_SHAVE_FRACTION,
  type Snapshot,
} from "./energy";
import type { RefKey } from "./references";
import { TOWN, townLoad, USE_LABELS, type Use } from "./town";

export type InfoKey = "sky" | "silicon" | "perovskite" | "wind" | "battery" | "grid" | "load" | "elnino" | "layers" | "degradation";

/** What a card's live parts read: the plant now, its switches, and its
 *  last 24 hours. */
export interface LiveContext {
  now: Snapshot;
  gridConnected: boolean;
  windBreaker: boolean;
  batteryMode: string;
  encapsulation: string;
  day: { renewableShare: number; co2AvoidedT: number; unservedMwh: number };
  /** The last 24 hours of plant time, oldest first, one sample per
   *  `sampleHours`: what the plant already keeps for the big display. */
  history: Snapshot[];
  sampleHours: number;
  /** The turbines' rotor speed now, in rpm. */
  rpm: number;
}

/** A card's 24-hour mini chart: one value per sample of the history. */
export interface Trend {
  label: string;
  value: (s: Snapshot) => number;
  unit: string;
  color: string;
  /** A fixed scale; otherwise it fits the data. */
  min?: number;
  max?: number;
  digits?: number;
}

/** One live reading on a card: a label and its value. */
export type Stat = [label: string, value: string];

export interface InfoCard {
  title: string;
  art: string;
  /** The illustration drawn from the plant's live state, when it has one;
   *  `art` is shown until the plant has started. */
  liveArt?: (live: LiveContext) => string;
  /** Live readings shown under the illustration, refreshed while open. */
  liveStats?: (live: LiveContext) => Stat[];
  /** The last 24 hours of one reading, as a mini chart. */
  liveTrend?: Trend;
  body: string[];
  try?: string;
  sources: RefKey[];
}

const svg = (inner: string) => `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" role="img">${inner}</svg>`;

/** The battery, filled to its charge, with what it's doing. */
function batteryArt(soc: number, batteryMw: number): string {
  const fill = Math.max(0, Math.min(1, soc)) * 184;
  const state = batteryMw < -0.01 ? `charging at ${(-batteryMw).toFixed(2)} MW` : batteryMw > 0.01 ? `discharging at ${batteryMw.toFixed(2)} MW` : "idle";
  return svg(`
      <rect width="320" height="200" fill="#efeaf8"/>
      <rect x="60" y="50" width="200" height="100" rx="10" fill="#fff" stroke="#7d55e8" stroke-width="4"/>
      <rect x="260" y="85" width="12" height="30" fill="#7d55e8"/>
      <rect x="68" y="58" width="${fill.toFixed(1)}" height="84" rx="6" fill="#b78cff"/>
      <text x="160" y="106" font-size="22" font-weight="700" text-anchor="middle" fill="#3a2780">${Math.round(soc * 100)}%</text>
      <text x="160" y="40" font-size="12" text-anchor="middle" fill="#5a3bb0">${state}</text>
      <text x="60" y="175" font-size="11">stores the midday surplus for the evening peak</text>`);
}

const mw = (v: number) => `${v.toFixed(2)} MW`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const mwh = (v: number) => `${v.toFixed(1)} MWh`;
/** Energy over the history, in MWh, from a power reading in MW. */
const energyOf = (c: LiveContext, f: (s: Snapshot) => number) => c.history.reduce((t, s) => t + f(s), 0) * c.sampleHours;
const peakOf = (c: LiveContext, f: (s: Snapshot) => number) => c.history.reduce((m, s) => Math.max(m, f(s)), 0);
/** Share of its rating a source averaged over the history. */
const capacityFactor = (c: LiveContext, f: (s: Snapshot) => number, rating: number) =>
  c.history.length ? energyOf(c, f) / (rating * c.history.length * c.sampleHours) : 0;
const duration = (hours: number) => {
  if (!Number.isFinite(hours) || hours > 48) return "over 2 days";
  const minutes = Math.round(hours * 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};
const healthLost = (c: LiveContext) => (c.history.length ? Math.max(0, c.history[0].perovskiteHealth - c.now.perovskiteHealth) : 0);
/** Output lost to heat at this cell temperature, by the model's own
 *  temperature coefficient. */
const heatLoss = (cellTemp: number, tech: typeof SILICON) => Math.max(0, -tech.tempCoeff * (cellTemp - 25));
/** One average home's use over the last 24 hours, in kWh, from the town
 *  model at each sample's hour and temperature. */
const homeKwh = (c: LiveContext) => c.history.reduce((sum, s) => sum + townLoad(s.hour, s.ambient).perHomeKw * c.sampleHours, 0);
/** Homes dark now: unserved load as a share of the town. */
const homesDark = (now: Snapshot) =>
  now.unservedMw > 0.001 ? Math.min(TOWN.homes, Math.round((now.unservedMw / Math.max(0.001, townLoad(now.hour, now.ambient).totalMw)) * TOWN.homes)) : 0;
const homes = (n: number) => `${n.toLocaleString("en")} home${n === 1 ? "" : "s"}`;

// The model's own curves, drawn once: the community's load through a day,
// and the wind farm's power against wind speed.
const LOAD_X = (hour: number) => 20 + (hour / 24) * 280;
const LOAD_Y = (mwValue: number) => 160 - (mwValue / PLANT.peakLoadMw) * 120;
const LOAD_CURVE = Array.from({ length: 49 }, (_, i) => `${LOAD_X(i / 2).toFixed(1)},${LOAD_Y(PLANT.peakLoadMw * loadFraction(i / 2)).toFixed(1)}`).join(" ");
const WIND_RATED = PLANT.turbines * PLANT.turbineMw;
const WIND_X = (speed: number) => 30 + Math.min(speed, 30) * 9;
const WIND_Y = (mwValue: number) => 160 - (mwValue / WIND_RATED) * 115;
const WIND_CURVE = Array.from({ length: 61 }, (_, i) => {
  const v = i / 2;
  const p = v >= CUT_OUT ? 0 : PLANT.turbines * turbinePower(PLANT.turbineMw, v);
  return `${WIND_X(v).toFixed(1)},${WIND_Y(p).toFixed(1)}`;
}).join(" ");

function loadArt(now?: Snapshot): string {
  const x = now ? LOAD_X(now.hour) : 0;
  const marker = now
    ? `<line x1="${x.toFixed(1)}" y1="35" x2="${x.toFixed(1)}" y2="160" stroke="#e8913a" stroke-dasharray="4 4"/>
       <circle cx="${x.toFixed(1)}" cy="${LOAD_Y(now.loadMw).toFixed(1)}" r="6" fill="#e8913a"/>
       <text x="${Math.min(x + 8, 236).toFixed(1)}" y="30" font-size="11" fill="#b5631a">now ${now.loadMw.toFixed(2)} MW</text>`
    : "";
  return svg(`
      <rect width="320" height="200" fill="#fbf6ee"/>
      <line x1="20" y1="160" x2="300" y2="160" stroke="#bbb"/>
      <polyline points="${LOAD_CURVE}" fill="none" stroke="#333" stroke-width="3"/>
      ${marker}
      <text x="232" y="46" font-size="11" text-anchor="end">evening peak</text>
      <text x="14" y="178" font-size="10">midnight</text><text x="148" y="178" font-size="10">noon</text><text x="270" y="178" font-size="10">midnight</text>`);
}

function windArt(now?: Snapshot, braked = false): string {
  const at = now ? (braked || now.turbinesFeathered ? 0 : now.windMw) : 0;
  const x = now ? WIND_X(now.windSpeed) : 0;
  const marker = now
    ? `<circle cx="${x.toFixed(1)}" cy="${WIND_Y(at).toFixed(1)}" r="6" fill="#1d9f80"/>
       <text x="${Math.min(x + 8, 226).toFixed(1)}" y="${(WIND_Y(at) - 8).toFixed(1)}" font-size="11" fill="#126b56">now ${now.windSpeed.toFixed(1)} m/s</text>`
    : "";
  return svg(`
      <rect width="320" height="200" fill="#e7f4ef"/>
      <line x1="30" y1="160" x2="300" y2="160" stroke="#9bb"/>
      <polyline points="${WIND_CURVE}" fill="none" stroke="#2f5d52" stroke-width="3"/>
      ${marker}
      <text x="${WIND_X(CUT_IN) - 12}" y="178" font-size="10">${CUT_IN}</text>
      <text x="${WIND_X(RATED_SPEED) - 6}" y="178" font-size="10">${RATED_SPEED}</text>
      <text x="${WIND_X(CUT_OUT) - 6}" y="178" font-size="10">${CUT_OUT}</text>
      <text x="246" y="194" font-size="10">wind, m/s</text>
      <text x="34" y="38" font-size="11">${WIND_RATED} MW, both turbines</text>`);
}

export const INFO: Record<InfoKey, InfoCard> = {
  sky: {
    title: "The sun, the sky, and the weather",
    art: svg(`
      <defs><linearGradient id="s1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3e7bd6"/><stop offset="1" stop-color="#f6c793"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#s1)"/>
      <path d="M20 170 Q160 10 300 170" fill="none" stroke="#fff" stroke-dasharray="5 6" stroke-width="2"/>
      <circle cx="160" cy="62" r="18" fill="#fff4cf"/>
      <line x1="160" y1="80" x2="160" y2="170" stroke="#fff4cf" stroke-width="2"/>
      <rect y="170" width="320" height="30" fill="#2c4a2c"/>
      <text x="168" y="130" fill="#fff" font-size="12">about 1,000 W/m² at noon</text>
      <text x="16" y="160" fill="#fff" font-size="11">sunrise</text><text x="262" y="160" fill="#fff" font-size="11">sunset</text>`),
    body: [
      "Sunlight arriving on the ground is measured in watts per square metre. A clear tropical noon gives about 1,000 W/m²; a low sun gives far less, because its light crosses more atmosphere and strikes the ground at a slant.",
      "Clouds cut it further: full overcast lets through only about a quarter. The sky here follows the same weather engine as the world around you, so what you see overhead is what the panels are getting.",
    ],
    liveStats: ({ now }) => [
      ["Sun", now.sunElevation > 0 ? `${now.sunElevation.toFixed(0)}° up` : "below the horizon"],
      ["Sunlight", `${now.ghi.toFixed(0)} W/m²`],
      ["Cloud", pct(now.cloud)],
      ["Air", `${now.ambient.toFixed(0)} °C, ${now.humidity.toFixed(0)}% humid`],
    ],
    liveTrend: { label: "Sunlight", value: (s) => s.ghi, unit: "W/m²", color: "#e8913a", min: 0, max: 1100, digits: 0 },
    try: "At the control room console, press 12:00 and then Rain, and watch the irradiance and the solar output fall together.",
    sources: ["duffie2013", "haurwitz1945", "reno2012", "kasten1980", "pagasa"],
  },
  silicon: {
    title: "Silicon solar panels",
    art: svg(`
      <rect width="320" height="200" fill="#dceaf7"/>
      <circle cx="270" cy="40" r="20" fill="#ffd36b"/>
      <g transform="translate(60 90) skewX(-20)">
        ${Array.from({ length: 4 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${c * 26}" y="${r * 18}" width="24" height="16" fill="#1d3a7a" stroke="#9fb6d9"/>`).join("")).join("")}
      </g>
      <line x1="80" y1="164" x2="80" y2="185" stroke="#666" stroke-width="4"/><line x1="200" y1="164" x2="200" y2="185" stroke="#666" stroke-width="4"/>
      <path d="M250 55 L180 100" stroke="#ffb000" stroke-width="3" marker-end="url(#a)"/>
      <defs><marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="#ffb000"/></marker></defs>`),
    body: [
      "Most solar panels today are made of crystalline silicon. Light knocks electrons loose in the silicon, and the panel's built-in electric field pushes them out as current.",
      "Panels lose about 0.35% of their output for every degree they run above 25 °C, and in Philippine sun they often run at 55 to 65 °C. That is why a cool, bright morning can beat a hot afternoon. Wiring, dust, and the inverter take roughly another 17%.",
      "This farm is 3.6 MW peak, tilted 15° toward the south; the rows in the garden stand in for it, since the real thing would cover about 4 hectares. Over a year, a well-placed panel in Metro Manila makes about 1,400 kWh for each kW of its rating.",
    ],
    liveStats: (c) => [
      ["Output", `${mw(c.now.siliconMw)} of ${PLANT.siliconMwp}`],
      ["Last 24 h", mwh(energyOf(c, (s) => s.siliconMw))],
      ["Peak, 24 h", mw(peakOf(c, (s) => s.siliconMw))],
      ["Capacity factor", pct(capacityFactor(c, (s) => s.siliconMw, PLANT.siliconMwp))],
      ["Cells", `${c.now.cellTemp.toFixed(0)} °C, ${c.now.poa.toFixed(0)} W/m²`],
      ["Lost to heat", pct(heatLoss(c.now.cellTemp, SILICON))],
    ],
    liveTrend: { label: "Silicon output", value: (s) => s.siliconMw, unit: "MW", color: "#3b7bff", min: 0, max: PLANT.siliconMwp },
    try: "Press 10:00 and then 14:00 with Clear weather, and compare the cell temperature and the output on the big display.",
    sources: ["dupre2015", "duffie2013", "dobos2014", "doeSolar"],
  },
  perovskite: {
    title: "The perovskite pilot row",
    art: svg(`
      <rect width="320" height="200" fill="#f4ece6"/>
      <g transform="translate(40 40)">
        <rect width="240" height="22" fill="#bfe8f2"/><text x="8" y="15" font-size="11">glass</text>
        <rect y="26" width="240" height="14" fill="#8cc9ef"/>
        <rect y="44" width="240" height="14" fill="#ececf2"/>
        <rect y="62" width="240" height="26" fill="#7a3a24"/><text x="8" y="80" font-size="11" fill="#fff">perovskite absorber, under a micrometre</text>
        <rect y="92" width="240" height="14" fill="#a98ad0"/>
        <rect y="110" width="240" height="14" fill="#e3b85a"/>
      </g>`),
    body: [
      "Perovskites are crystals that absorb sunlight very strongly, so a layer thinner than a thousandth of a millimetre does the work of thick silicon. They can be printed at low temperature onto glass or flexible film, which is why Japan is developing lightweight, flexible perovskite panels for walls, roofs, and places silicon can't go, and plans about 20 GW of them by 2040.",
      "They also lose less to heat than silicon: about 0.17% per degree instead of 0.35%. Their weakness is durability: moisture, oxygen, heat, and light break them down. This pilot row loses a little output with every humid hour, depending on how well it is sealed.",
    ],
    liveStats: (c) => [
      ["Output", `${mw(c.now.perovskiteMw)} of ${PLANT.perovskiteMwp}`],
      ["Last 24 h", mwh(energyOf(c, (s) => s.perovskiteMw))],
      ["Health", `${(c.now.perovskiteHealth * 100).toFixed(2)}%`],
      ["Health lost, 24 h", `${(healthLost(c) * 100).toFixed(3)} points`],
      ["Seal", c.encapsulation],
      ["Lost to heat", pct(heatLoss(c.now.cellTemp, PEROVSKITE))],
    ],
    liveTrend: { label: "Pilot row output", value: (s) => s.perovskiteMw, unit: "MW", color: "#a8492b", min: 0, max: PLANT.perovskiteMwp },
    try: "Set the seal to None, press Rain and Run 360×, and watch the pilot's health fall on the big display.",
    sources: ["green2014", "jost2020", "boyd2019", "meti2024"],
  },
  wind: {
    title: "Wind turbines",
    art: windArt(),
    liveArt: ({ now, windBreaker }) => windArt(now, !windBreaker),
    liveStats: (c) => [
      ["Wind", `${c.now.windSpeed.toFixed(1)} m/s`],
      ["Output", `${mw(c.now.windMw)} of ${WIND_RATED}`],
      [
        "Rotors",
        !c.windBreaker
          ? "braked (breaker open)"
          : c.now.turbinesFeathered
            ? "feathered, past cut-out"
            : c.now.windMw > 0
              ? `${c.rpm.toFixed(1)} rpm`
              : "idle, below cut-in",
      ],
      ["Last 24 h", mwh(energyOf(c, (s) => s.windMw))],
      ["Capacity factor", pct(capacityFactor(c, (s) => s.windMw, WIND_RATED))],
    ],
    liveTrend: { label: "Wind output", value: (s) => s.windMw, unit: "MW", color: "#1d9f80", min: 0, max: WIND_RATED },
    body: [
      "The power carried by the wind rises with the cube of its speed: double the wind, eight times the power. A turbine makes nothing below about 3.5 m/s, follows that cube up to about 12 m/s, then turns its blades to hold its full rating; when the wind averages over 25 m/s it feathers them and brakes to protect itself.",
      "That is why a typhoon, for all its wind, produces nothing here. The two turbines are 1.5 MW each. The ones in the garden are scale models: a real 1.5 MW turbine has a rotor about 77 m across on a tower about 80 m tall, turning at 10 to 20 rpm.",
    ],
    try: "Press Typhoon on the console, then look out at the turbines in the garden.",
    sources: ["manwell2009", "ge15"],
  },
  battery: {
    title: "Battery storage",
    art: batteryArt(0.6, 0),
    liveArt: ({ now }) => batteryArt(now.soc, now.batteryMw),
    liveStats: (c) => {
      const { now } = c;
      const energy = PLANT.batteryMwh;
      // At the current rate, by the model's own limits and one-way losses.
      const eta =
        now.batteryMw > 0.01
          ? `lasts ${duration(((now.soc - SOC_MIN) * energy * BATTERY_ONE_WAY_EFFICIENCY) / now.batteryMw)}`
          : now.batteryMw < -0.01
            ? `full in ${duration(((SOC_MAX - now.soc) * energy) / (-now.batteryMw * BATTERY_ONE_WAY_EFFICIENCY))}`
            : "holding";
      return [
        ["Stored", `${(now.soc * energy).toFixed(1)} of ${energy} MWh`],
        ["Power", now.batteryMw < -0.01 ? `charging ${mw(-now.batteryMw)}` : now.batteryMw > 0.01 ? `giving ${mw(now.batteryMw)}` : "idle"],
        ["At this rate", eta],
        ["Taken in, 24 h", mwh(energyOf(c, (s) => Math.max(0, -s.batteryMw)))],
        ["Given back, 24 h", mwh(energyOf(c, (s) => Math.max(0, s.batteryMw)))],
        ["Mode", c.batteryMode],
      ];
    },
    liveTrend: { label: "Charge", value: (s) => s.soc * 100, unit: "%", color: "#8a5fe0", min: 0, max: 100, digits: 0 },
    body: [
      `The battery holds 6 MWh and can charge or discharge at up to 3 MW. In Auto, it stores whatever the plant makes beyond the load. On the grid it saves that energy for the evening peak: it covers only the part of the load above about ${(PEAK_SHAVE_FRACTION * PLANT.peakLoadMw).toFixed(1)} MW (65% of the town's design peak), so its charge lasts through the evening while the main grid supplies the rest. In an El Niño grid alert it also covers whatever the grid can't. Cut off from the grid, it covers all it can.`,
      "About 15% of the energy is lost on the round trip (85% comes back, typical of large lithium-ion systems), and the battery is kept between 10% and 95% full to protect it.",
    ],
    try: "Press 18:00 and open the Grid tie breaker, and see how long the battery carries the evening.",
    sources: ["cole2019", "eia2021"],
  },
  grid: {
    title: "The main grid and island mode",
    art: svg(`
      <rect width="320" height="200" fill="#eef1f7"/>
      ${[40, 140, 240].map((x) => `<path d="M${x} 180 L${x + 20} 40 L${x + 40} 180 M${x + 6} 120 L${x + 34} 120 M${x + 12} 80 L${x + 28} 80" stroke="#55607a" stroke-width="3" fill="none"/>`).join("")}
      <path d="M60 60 Q110 90 160 60 Q210 90 260 60" stroke="#55607a" fill="none" stroke-width="2"/>`),
    body: [
      "Connected to the main grid, the plant exports its surplus and imports any shortfall, so the lights never go out. Island mode is a community running on its own, as it would after a typhoon cuts the lines.",
      "In island mode, whatever the plant and battery can't supply has to be shed. Many smaller Philippine islands are not on the main grid at all: the National Power Corporation runs their power plants, nearly all on diesel, and is adding solar and batteries to burn less fuel.",
      "Every MWh the plant makes instead of the main grid avoids about 0.71 tonnes of CO₂, the grid's emission factor for Luzon and the Visayas.",
      "The main grid can run short too. In the El Niño heat of April and May 2024 it went on red alert in the afternoons and evenings, and towns took turns in rotating brownouts. The El Niño 2026 switch on the console brings that here.",
    ],
    liveStats: ({ now, gridConnected, day }) => [
      ["Grid tie", gridConnected ? (now.gridAlert ? `on alert: ${mw(now.gridLimitMw)} max` : "connected") : "island mode"],
      [
        "Now",
        !gridConnected
          ? now.unservedMw > 0.005
            ? `shedding ${mw(now.unservedMw)}`
            : "all load served"
          : now.gridMw > 0.005
            ? `importing ${mw(now.gridMw)}`
            : now.gridMw < -0.005
              ? `exporting ${mw(-now.gridMw)}`
              : "balanced",
      ],
      ["Own share, 24 h", pct(day.renewableShare)],
      ["CO₂ avoided, 24 h", `${day.co2AvoidedT.toFixed(1)} t`],
    ],
    liveTrend: { label: "From the grid (below the line: exported)", value: (s) => s.gridMw, unit: "MW", color: "#55607a" },
    try: "Press 00:00 and Rain, then open the Grid tie and Wind breakers.",
    sources: ["npc2025", "doeNgef", "inquirer2024"],
  },
  load: {
    title: "The town: who uses the power",
    art: loadArt(),
    liveArt: ({ now }) => loadArt(now),
    liveStats: (c) => {
      const { now } = c;
      const own = Math.max(0, now.loadMw - Math.max(0, now.gridMw) - now.unservedMw);
      const town = townLoad(now.hour, now.ambient);
      const kwh = homeKwh(c);
      // What it's going to right now, biggest first.
      const uses = (Object.entries(town.byUse) as [Use, number][]).sort((a, b) => b[1] - a[1]).slice(0, 4);
      return [
        ["Town now", `${mw(now.loadMw)} (design peak ${mw(PLANT.peakLoadMw)})`],
        ["One home now", `${(town.perHomeKw * 1000).toFixed(0)} W at ${now.ambient.toFixed(0)} °C`],
        ["One home, 24 h", `${kwh.toFixed(1)} kWh (≈ ${(kwh * 30.4).toFixed(0)} kWh a month)`],
        ["From the plant now", now.loadMw > 0 ? pct(own / now.loadMw) : "–"],
        ...uses.map(([use, value]): Stat => [USE_LABELS[use], `${mw(value)} (${pct(value / Math.max(0.001, town.totalMw))})`]),
        ["Homes dark now", homesDark(now) ? homes(homesDark(now)) : "none"],
      ];
    },
    body: [
      `The plant serves a provincial coastal town in Cebu: ${TOWN.homes.toLocaleString("en")} homes, about ${Math.round((TOWN.homes * TOWN.peoplePerHome) / 1000)},000 people at ${TOWN.peoplePerHome} per home (the national average), plus a school, a health centre, shops and eateries, a water pumping station, and street lights.`,
      "A typical home here has six LED bulbs, two electric fans, a television, a rice cooker, phones, and Wi-Fi; seven homes in ten have a refrigerator, and one in four a 1 HP aircon. That comes to about 140 to 180 kWh a month, depending on the weather: a little under the 200 kWh household Meralco quotes its Metro Manila rates for, as suits a provincial town.",
      "Heat drives it. On a hot, clear day the town uses about a quarter more than on a cool, rainy one, mostly through fans and aircon, inside the 10 to 40% rise Meralco expects in summer. And the biggest demand comes in the evening, as the sun sets, which is the whole reason for the battery.",
      "The mix and schedules are the model's assumptions, calibrated to those figures, not a survey of a real town. The curve is the town's own on a 28 °C day, with the load right now marked.",
    ],
    try: "Press 14:00 with Clear weather, then 14:00 with Rain, and compare one home's draw and the fans-and-aircon share.",
    sources: ["psa2020", "tribune2024", "gma2021", "teko2024"],
  },
  elnino: {
    title: "El Niño 2026",
    art: svg(`
      <rect width="320" height="200" fill="#f6e3c4"/>
      <circle cx="250" cy="52" r="30" fill="#f2a531"/>
      ${Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return `<line x1="${(250 + Math.cos(a) * 38).toFixed(1)}" y1="${(52 + Math.sin(a) * 38).toFixed(1)}" x2="${(250 + Math.cos(a) * 50).toFixed(1)}" y2="${(52 + Math.sin(a) * 50).toFixed(1)}" stroke="#f2a531" stroke-width="5"/>`;
      }).join("")}
      <rect y="140" width="320" height="60" fill="#c99a5b"/>
      <path d="M20 160 l30 10 l-12 18 M90 150 l20 22 l25 -6 M170 160 l-12 24 M210 150 l26 18 l-8 22 M280 162 l-22 20" stroke="#8a6232" stroke-width="3" fill="none"/>
      <rect x="40" y="40" width="16" height="80" rx="8" fill="#fff" stroke="#c0392b" stroke-width="3"/>
      <rect x="44" y="64" width="8" height="54" fill="#c0392b"/><circle cx="48" cy="124" r="13" fill="#c0392b"/>
      <text x="76" y="70" font-size="13" fill="#7a3b12">drier, hotter,</text>
      <text x="76" y="88" font-size="13" fill="#7a3b12">a grid on alert</text>`),
    liveStats: ({ now, day }) => [
      ["Scenario", now.elNino ? "El Niño 2026" : "normal year"],
      ["Air now", `${now.ambient.toFixed(1)} °C`],
      ["Main grid", now.gridAlert ? `alert: ${mw(now.gridLimitMw)} max` : "no alert"],
      ["Homes dark now", homesDark(now) ? homes(homesDark(now)) : "none"],
      ["Unserved, 24 h", mwh(day.unservedMwh)],
    ],
    body: [
      "El Niño is a warming of the central and eastern tropical Pacific that shifts rain away from the Philippines. PAGASA reports a strong to very strong El Niño now, likely to peak around the end of 2026 and last into the first half of 2027, with below-normal rainfall, dry spells and drought, and fewer typhoons. Its July 2026 outlook named Cebu, this town's province, among those likely to be in drought by the end of August.",
      "The last one, from mid-2023 to May 2024, overlapped the hot dry months. Metro Manila set its all-time record of 38.8 °C on 27 April 2024. Demand ran above forecast in the heat, and with many plants on forced outage the Luzon grid went on red alert, on 16 April from 2 to 4 p.m. and 6 to 9 p.m., and towns took turns in rotating brownouts.",
      `The El Niño 2026 switch on the console brings that here. It sets clear skies and adds ${EL_NINO.warmingC} °C to the air, an assumption for a warm El Niño season (attribution puts El Niño's own share of the April 2024 heatwave at about 0.2 °C; most of it was climate change). Fans and aircon then run longer, so the town draws more. And on hot, dry days, from 2 to 4 p.m. and 6 to 9 p.m., the main grid can supply only ${Math.round(EL_NINO.importShare * 100)}% of the town's design peak, another assumption; whatever the plant and battery can't cover goes dark in rotation.`,
      "That is what a local plant is for in a drought year: clear skies are good for solar, and a battery charged at noon can carry the town through an evening alert.",
    ],
    try: "Press El Niño 2026, then 18:00, and switch off the Battery breaker: homes go dark in the alert. Switch it back on and watch them come back.",
    sources: ["pagasa2026", "pagasa2024end", "pia2024", "inquirer2024", "mb2024"],
  },
  layers: {
    title: "Inside a perovskite cell",
    art: svg(`
      <rect width="320" height="200" fill="#fff"/>
      ${[["#bfe8f2", "glass"], ["#8cc9ef", "transparent electrode"], ["#ececf2", "electron transport"], ["#7a3a24", "perovskite"], ["#a98ad0", "hole transport"], ["#e3b85a", "back contact"]]
        .map(([c, t], i) => `<rect x="30" y="${20 + i * 28}" width="150" height="22" fill="${c}"/><text x="190" y="${36 + i * 28}" font-size="12">${t}</text>`)
        .join("")}`),
    body: [
      "Light passes through the glass and the transparent electrode into the perovskite, where it frees electrons. The electron-transport layer carries electrons one way and the hole-transport layer carries the gaps they leave the other way, so the two flow out as current.",
      "Each choice of material trades efficiency, cost, and stability against each other. The best single-junction lab cells now reach about 27% efficiency, close to silicon's best; keeping that for years outdoors is the open problem.",
    ],
    liveStats: (c) => [
      ["Pilot row health", `${(c.now.perovskiteHealth * 100).toFixed(2)}%`],
      ["Lost, 24 h", `${(healthLost(c) * 100).toFixed(3)} points`],
      ["Humidity", `${c.now.humidity.toFixed(0)}%`],
      ["Cells", `${c.now.cellTemp.toFixed(0)} °C`],
      ["Seal", c.encapsulation],
    ],
    liveTrend: { label: "Pilot row health", value: (s) => s.perovskiteHealth * 100, unit: "%", color: "#a8492b", digits: 3 },
    sources: ["green2014", "nrelChart", "boyd2019"],
  },
  degradation: {
    title: "Why the Philippines is a hard test",
    art: svg(`
      <rect width="320" height="200" fill="#eef5f2"/>
      <text x="30" y="50" font-size="30">💧 🌡️ ☀️</text>
      <polyline points="30,90 90,98 150,115 210,140 270,170" fill="none" stroke="#c2603a" stroke-width="4"/>
      <polyline points="30,90 270,96" fill="none" stroke="#1d8f73" stroke-width="4"/>
      <text x="200" y="88" font-size="11" fill="#1d8f73">well sealed</text><text x="200" y="185" font-size="11" fill="#c2603a">unsealed</text>`),
    body: [
      "Humidity often above 80%, cell temperatures above 60 °C, and intense year-round sun are the three stressors perovskites handle worst. A design that lasts years in a dry, mild climate can fade within months here.",
      "Researchers compare stability by T80, the time a cell takes to fall to 80% of its starting output, under agreed test conditions. Before deploying perovskites in the Philippines, they would need testing under local conditions, with real sealed modules and measured weather. This lab shows the trade-offs; it does not predict a product's lifetime.",
    ],
    liveStats: (c) => [
      ["Pilot row health", `${(c.now.perovskiteHealth * 100).toFixed(2)}%`],
      ["Lost, 24 h", `${(healthLost(c) * 100).toFixed(3)} points`],
      ["Humidity", `${c.now.humidity.toFixed(0)}%`],
      ["Cells", `${c.now.cellTemp.toFixed(0)} °C`],
      ["Seal", c.encapsulation],
    ],
    liveTrend: { label: "Pilot row health", value: (s) => s.perovskiteHealth * 100, unit: "%", color: "#a8492b", digits: 3 },
    sources: ["boyd2019", "khenkin2020", "pagasa"],
  },
};
