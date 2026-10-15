// Seizora's info cards, opened by clicking an exhibit or a board: an
// illustration and a short explanation for each part of the plant, written
// for visitors rather than engineers.
// The illustrations are inline SVG, so nothing is downloaded. Every figure
// in a card matches the model (sim/energy.ts, src/sky/weather.ts), and each
// card lists the sources it rests on (sim/references.ts).
import type { RefKey } from "./references";

export type InfoKey = "sky" | "silicon" | "perovskite" | "wind" | "battery" | "grid" | "load" | "layers" | "degradation";

export interface InfoCard {
  title: string;
  art: string;
  body: string[];
  try?: string;
  sources: RefKey[];
}

const svg = (inner: string) => `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" role="img">${inner}</svg>`;

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
    try: "Set the seal to None, press Rain and Run 360×, and watch the pilot's health fall on the big display.",
    sources: ["green2014", "jost2020", "boyd2019", "meti2024"],
  },
  wind: {
    title: "Wind turbines",
    art: svg(`
      <rect width="320" height="200" fill="#e7f3ef"/>
      <line x1="160" y1="70" x2="160" y2="190" stroke="#cfd6d9" stroke-width="8"/>
      <g transform="translate(160 70)">${[0, 120, 240].map((a) => `<rect x="-4" y="-62" width="8" height="62" rx="4" fill="#fff" stroke="#b5c0c4" transform="rotate(${a})"/>`).join("")}<circle r="7" fill="#9aa"/></g>
      <polyline points="20,170 60,170 100,120 140,95 200,95 230,95 232,170 300,170" fill="none" stroke="#1d8f73" stroke-width="3"/>
      <text x="20" y="185" font-size="10">3.5</text><text x="136" y="110" font-size="10">12 m/s: full power</text><text x="236" y="160" font-size="10">25: stop</text>`),
    body: [
      "The power carried by the wind rises with the cube of its speed: double the wind, eight times the power. A turbine makes nothing below about 3.5 m/s, follows that cube up to about 12 m/s, then turns its blades to hold its full rating; when the wind averages over 25 m/s it feathers them and brakes to protect itself.",
      "That is why a typhoon, for all its wind, produces nothing here. The two turbines are 1.5 MW each. The ones in the garden are scale models: a real 1.5 MW turbine has a rotor about 77 m across on a tower about 80 m tall, turning at 10 to 20 rpm.",
    ],
    try: "Press Typhoon on the console, then look out at the turbines in the garden.",
    sources: ["manwell2009", "ge15"],
  },
  battery: {
    title: "Battery storage",
    art: svg(`
      <rect width="320" height="200" fill="#efeaf8"/>
      <rect x="60" y="50" width="200" height="100" rx="10" fill="#fff" stroke="#7d55e8" stroke-width="4"/>
      <rect x="260" y="85" width="12" height="30" fill="#7d55e8"/>
      <rect x="68" y="58" width="120" height="84" rx="6" fill="#b78cff"/>
      <text x="200" y="104" font-size="16" fill="#5a3bb0">60%</text>
      <text x="60" y="175" font-size="11">stores the midday surplus for the evening peak</text>`),
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
    try: "Press 00:00 and Rain, then open the Grid tie and Wind breakers.",
    sources: ["npc2025", "doeNgef"],
  },
  load: {
    title: "The community load",
    art: svg(`
      <rect width="320" height="200" fill="#fbf6ee"/>
      <polyline points="20,150 60,140 90,110 120,120 150,105 190,115 220,70 250,60 280,100 300,130" fill="none" stroke="#333" stroke-width="3"/>
      <text x="215" y="50" font-size="11">evening peak</text><text x="20" y="175" font-size="10">midnight</text><text x="140" y="175" font-size="10">noon</text>`),
    body: [
      "The load is a small community with a school and a clinic: a rise in the morning, a plateau through the school day, and the biggest demand in the evening, when homes switch on lights, fans, and televisions, just as the sun sets.",
      "That mismatch between when the sun shines and when people use power is the whole reason for the battery. The shape here is illustrative, not measured from a real feeder.",
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
    sources: ["boyd2019", "khenkin2020", "pagasa"],
  },
};
