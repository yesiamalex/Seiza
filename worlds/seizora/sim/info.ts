// Seizora's info cards, opened by clicking an exhibit or a board: an
// illustration and a short explanation for each part of the plant, written
// for visitors rather than engineers.
// The illustrations are inline SVG, so nothing is downloaded. Every figure
// in a card matches the model (sim/energy.ts, src/sky/weather.ts), and each
// card lists the sources it rests on (sim/references.ts).
import { CUT_IN, CUT_OUT, loadFraction, PEROVSKITE, PLANT, RATED_SPEED, SILICON, turbinePower, type Snapshot } from "./energy";
import type { RefKey } from "./references";

export type InfoKey = "sky" | "silicon" | "perovskite" | "wind" | "battery" | "grid" | "load" | "layers" | "degradation";

/** What a card's live parts read: the plant now, its switches, and its
 *  last 24 hours. */
export interface LiveContext {
  now: Snapshot;
  gridConnected: boolean;
  windBreaker: boolean;
  batteryMode: string;
  encapsulation: string;
  day: { renewableShare: number; co2AvoidedT: number; unservedMwh: number };
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
/** Output lost to heat at this cell temperature, by the model's own
 *  temperature coefficient. */
const heatLoss = (cellTemp: number, tech: typeof SILICON) => Math.max(0, -tech.tempCoeff * (cellTemp - 25));

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
    liveStats: ({ now }) => [
      ["Output", `${mw(now.siliconMw)} of ${PLANT.siliconMwp}`],
      ["On the panels", `${now.poa.toFixed(0)} W/m²`],
      ["Cells", `${now.cellTemp.toFixed(0)} °C`],
      ["Lost to heat", pct(heatLoss(now.cellTemp, SILICON))],
    ],
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
    liveStats: ({ now, encapsulation }) => [
      ["Output", `${mw(now.perovskiteMw)} of ${PLANT.perovskiteMwp}`],
      ["Health", `${(now.perovskiteHealth * 100).toFixed(2)}%`],
      ["Seal", encapsulation],
      ["Lost to heat", pct(heatLoss(now.cellTemp, PEROVSKITE))],
    ],
    try: "Set the seal to None, press Rain and Run 360×, and watch the pilot's health fall on the big display.",
    sources: ["green2014", "jost2020", "boyd2019", "meti2024"],
  },
  wind: {
    title: "Wind turbines",
    art: windArt(),
    liveArt: ({ now, windBreaker }) => windArt(now, !windBreaker),
    liveStats: ({ now, windBreaker }) => [
      ["Wind", `${now.windSpeed.toFixed(1)} m/s`],
      ["Output", `${mw(now.windMw)} of ${WIND_RATED}`],
      ["Rotors", !windBreaker ? "braked (breaker open)" : now.turbinesFeathered ? "feathered, past cut-out" : now.windMw > 0 ? "turning" : "idle, below cut-in"],
    ],
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
    liveStats: ({ now, batteryMode }) => [
      ["Stored", `${(now.soc * PLANT.batteryMwh).toFixed(1)} of ${PLANT.batteryMwh} MWh`],
      ["Power", now.batteryMw < -0.01 ? `charging ${mw(-now.batteryMw)}` : now.batteryMw > 0.01 ? `giving ${mw(now.batteryMw)}` : "idle"],
      ["Mode", batteryMode],
    ],
    body: [
      "The battery holds 6 MWh and can charge or discharge at up to 3 MW. In Auto, it stores whatever the plant makes beyond the load. On the grid it saves that energy for the evening peak: it covers only the part of the load above about 2.1 MW, so its charge lasts through the evening while the main grid supplies the rest. Cut off from the grid, it covers all it can.",
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
    ],
    liveStats: ({ now, gridConnected, day }) => [
      ["Grid tie", gridConnected ? "connected" : "island mode"],
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
    try: "Press 00:00 and Rain, then open the Grid tie and Wind breakers.",
    sources: ["npc2025", "doeNgef"],
  },
  load: {
    title: "The community load",
    art: loadArt(),
    liveArt: ({ now }) => loadArt(now),
    liveStats: ({ now }) => {
      const own = Math.max(0, now.loadMw - Math.max(0, now.gridMw) - now.unservedMw);
      return [
        ["Load now", `${mw(now.loadMw)} of ${PLANT.peakLoadMw} peak`],
        ["From the plant", now.loadMw > 0 ? pct(own / now.loadMw) : "–"],
      ];
    },
    body: [
      "The load is a small community with a school and a clinic: a rise in the morning, a plateau through the school day, and the biggest demand in the evening, when homes switch on lights, fans, and televisions, just as the sun sets.",
      "That mismatch between when the sun shines and when people use power is the whole reason for the battery. The curve is the model's own, with the load right now marked; its shape is illustrative, not measured from a real feeder.",
    ],
    sources: [],
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
    liveStats: ({ now, encapsulation }) => [
      ["Pilot row health", `${(now.perovskiteHealth * 100).toFixed(2)}%`],
      ["Humidity", `${now.humidity.toFixed(0)}%`],
      ["Cells", `${now.cellTemp.toFixed(0)} °C`],
      ["Seal", encapsulation],
    ],
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
    liveStats: ({ now, encapsulation }) => [
      ["Pilot row health", `${(now.perovskiteHealth * 100).toFixed(2)}%`],
      ["Humidity", `${now.humidity.toFixed(0)}%`],
      ["Cells", `${now.cellTemp.toFixed(0)} °C`],
      ["Seal", encapsulation],
    ],
    sources: ["boyd2019", "khenkin2020", "pagasa"],
  },
};
