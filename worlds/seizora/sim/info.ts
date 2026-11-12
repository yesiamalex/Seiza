// Seizora's info cards, opened by clicking an exhibit or a board: an
// illustration and a short explanation for each part of the plant, written
// for visitors rather than engineers, in English and Japanese. Text is read
// through getters with L(), so a card shows the visitor's language at the
// moment it's drawn.
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
import { TOWN, townLoad, useLabel, type Use } from "./town";
import { L } from "../../../src/i18n/lang";

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
  const state =
    batteryMw < -0.01
      ? L(`charging at ${(-batteryMw).toFixed(2)} MW`, `${(-batteryMw).toFixed(2)} MWで充電中`)
      : batteryMw > 0.01
        ? L(`discharging at ${batteryMw.toFixed(2)} MW`, `${batteryMw.toFixed(2)} MWで放電中`)
        : L("idle", "待機中");
  return svg(`
      <rect width="320" height="200" fill="#efeaf8"/>
      <rect x="60" y="50" width="200" height="100" rx="10" fill="#fff" stroke="#7d55e8" stroke-width="4"/>
      <rect x="260" y="85" width="12" height="30" fill="#7d55e8"/>
      <rect x="68" y="58" width="${fill.toFixed(1)}" height="84" rx="6" fill="#b78cff"/>
      <text x="160" y="106" font-size="22" font-weight="700" text-anchor="middle" fill="#3a2780">${Math.round(soc * 100)}%</text>
      <text x="160" y="40" font-size="12" text-anchor="middle" fill="#5a3bb0">${state}</text>
      <text x="60" y="175" font-size="11">${L("stores the midday surplus for the evening peak", "昼の余りを夕方のピークのためにためる")}</text>`);
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
  if (!Number.isFinite(hours) || hours > 48) return L("over 2 days", "2日以上");
  const minutes = Math.round(hours * 60);
  return minutes < 60 ? L(`${minutes} min`, `${minutes}分`) : L(`${Math.floor(minutes / 60)} h ${minutes % 60} min`, `${Math.floor(minutes / 60)}時間${minutes % 60}分`);
};
/** The console's settings, as a card shows them. */
const SEAL: Record<string, [string, string]> = { none: ["none", "なし"], edge: ["edge seal", "端面封止"], glass: ["glass", "ガラス封止"] };
const MODE: Record<string, [string, string]> = { auto: ["auto", "自動"], charge: ["charge", "充電"], hold: ["hold", "保持"], discharge: ["discharge", "放電"] };
const setting = (table: Record<string, [string, string]>, value: string) => (table[value] ? L(...table[value]) : value);
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
const homes = (n: number) => L(`${n.toLocaleString("en")} home${n === 1 ? "" : "s"}`, `${n.toLocaleString("en")}世帯`);

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
       <text x="${Math.min(x + 8, 236).toFixed(1)}" y="30" font-size="11" fill="#b5631a">${L("now", "現在")} ${now.loadMw.toFixed(2)} MW</text>`
    : "";
  return svg(`
      <rect width="320" height="200" fill="#fbf6ee"/>
      <line x1="20" y1="160" x2="300" y2="160" stroke="#bbb"/>
      <polyline points="${LOAD_CURVE}" fill="none" stroke="#333" stroke-width="3"/>
      ${marker}
      <text x="232" y="46" font-size="11" text-anchor="end">${L("evening peak", "夕方のピーク")}</text>
      <text x="14" y="178" font-size="10">${L("midnight", "0時")}</text><text x="148" y="178" font-size="10">${L("noon", "正午")}</text><text x="270" y="178" font-size="10">${L("midnight", "24時")}</text>`);
}

function windArt(now?: Snapshot, braked = false): string {
  const at = now ? (braked || now.turbinesFeathered ? 0 : now.windMw) : 0;
  const x = now ? WIND_X(now.windSpeed) : 0;
  const marker = now
    ? `<circle cx="${x.toFixed(1)}" cy="${WIND_Y(at).toFixed(1)}" r="6" fill="#1d9f80"/>
       <text x="${Math.min(x + 8, 226).toFixed(1)}" y="${(WIND_Y(at) - 8).toFixed(1)}" font-size="11" fill="#126b56">${L("now", "現在")} ${now.windSpeed.toFixed(1)} m/s</text>`
    : "";
  return svg(`
      <rect width="320" height="200" fill="#e7f4ef"/>
      <line x1="30" y1="160" x2="300" y2="160" stroke="#9bb"/>
      <polyline points="${WIND_CURVE}" fill="none" stroke="#2f5d52" stroke-width="3"/>
      ${marker}
      <text x="${WIND_X(CUT_IN) - 12}" y="178" font-size="10">${CUT_IN}</text>
      <text x="${WIND_X(RATED_SPEED) - 6}" y="178" font-size="10">${RATED_SPEED}</text>
      <text x="${WIND_X(CUT_OUT) - 6}" y="178" font-size="10">${CUT_OUT}</text>
      <text x="246" y="194" font-size="10">${L("wind, m/s", "風速 m/s")}</text>
      <text x="34" y="38" font-size="11">${L(`${WIND_RATED} MW, both turbines`, `${WIND_RATED} MW(2基合計)`)}</text>`);
}

export const INFO: Record<InfoKey, InfoCard> = {
  sky: {
    get title() {
      return L("The sun, the sky, and the weather", "太陽と空と天気");
    },
    get art() {
      return svg(`
      <defs><linearGradient id="s1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3e7bd6"/><stop offset="1" stop-color="#f6c793"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#s1)"/>
      <path d="M20 170 Q160 10 300 170" fill="none" stroke="#fff" stroke-dasharray="5 6" stroke-width="2"/>
      <circle cx="160" cy="62" r="18" fill="#fff4cf"/>
      <line x1="160" y1="80" x2="160" y2="170" stroke="#fff4cf" stroke-width="2"/>
      <rect y="170" width="320" height="30" fill="#2c4a2c"/>
      <text x="168" y="130" fill="#fff" font-size="12">${L("about 1,000 W/m² at noon", "正午に約1,000 W/m²")}</text>
      <text x="16" y="160" fill="#fff" font-size="11">${L("sunrise", "日の出")}</text><text x="262" y="160" fill="#fff" font-size="11">${L("sunset", "日の入り")}</text>`);
    },
    get body() {
      return [
        L(
          "Sunlight arriving on the ground is measured in watts per square metre. A clear tropical noon gives about 1,000 W/m²; a low sun gives far less, because its light crosses more atmosphere and strikes the ground at a slant.",
          "地上に届く日射は、1平方メートルあたりのワット数で測ります。晴れた熱帯の正午で約1,000 W/m²。太陽が低いとずっと少なくなります。光がより厚い大気を通り、地面に斜めに当たるからです。"
        ),
        L(
          "Clouds cut it further: full overcast lets through only about a quarter. The sky here follows the same weather engine as the world around you, so what you see overhead is what the panels are getting.",
          "雲はさらに減らします。全面の曇り空では約4分の1しか通しません。ここの空はまわりのワールドと同じ天気のしくみで動いているので、頭上に見える空が、そのままパネルが受けている光です。"
        ),
      ];
    },
    liveStats: ({ now }) => [
      [L("Sun", "太陽"), now.sunElevation > 0 ? L(`${now.sunElevation.toFixed(0)}° up`, `高度 ${now.sunElevation.toFixed(0)}°`) : L("below the horizon", "地平線の下")],
      [L("Sunlight", "日射"), `${now.ghi.toFixed(0)} W/m²`],
      [L("Cloud", "雲"), pct(now.cloud)],
      [L("Air", "気温"), L(`${now.ambient.toFixed(0)} °C, ${now.humidity.toFixed(0)}% humid`, `${now.ambient.toFixed(0)} °C、湿度 ${now.humidity.toFixed(0)}%`)],
    ],
    liveTrend: {
      get label() {
        return L("Sunlight", "日射");
      },
      value: (s) => s.ghi,
      unit: "W/m²",
      color: "#e8913a",
      min: 0,
      max: 1100,
      digits: 0,
    },
    get try() {
      return L(
        "At the control room console, press 12:00 and then Rain, and watch the irradiance and the solar output fall together.",
        "コントロールルームの操作盤で 12:00、次に「雨」を押して、日射と太陽光の出力がいっしょに下がるのを見てみましょう。"
      );
    },
    sources: ["duffie2013", "haurwitz1945", "reno2012", "kasten1980", "pagasa"],
  },
  silicon: {
    get title() {
      return L("Silicon solar panels", "シリコン太陽光パネル");
    },
    art: svg(`
      <rect width="320" height="200" fill="#dceaf7"/>
      <circle cx="270" cy="40" r="20" fill="#ffd36b"/>
      <g transform="translate(60 90) skewX(-20)">
        ${Array.from({ length: 4 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${c * 26}" y="${r * 18}" width="24" height="16" fill="#1d3a7a" stroke="#9fb6d9"/>`).join("")).join("")}
      </g>
      <line x1="80" y1="164" x2="80" y2="185" stroke="#666" stroke-width="4"/><line x1="200" y1="164" x2="200" y2="185" stroke="#666" stroke-width="4"/>
      <path d="M250 55 L180 100" stroke="#ffb000" stroke-width="3" marker-end="url(#a)"/>
      <defs><marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="#ffb000"/></marker></defs>`),
    get body() {
      return [
        L(
          "Most solar panels today are made of crystalline silicon. Light knocks electrons loose in the silicon, and the panel's built-in electric field pushes them out as current.",
          "今の太陽光パネルの多くは結晶シリコンでできています。光がシリコンの中の電子をたたき出し、パネルに組み込まれた電場がそれを電流として押し出します。"
        ),
        L(
          "Panels lose about 0.35% of their output for every degree they run above 25 °C, and in Philippine sun they often run at 55 to 65 °C. That is why a cool, bright morning can beat a hot afternoon. Wiring, dust, and the inverter take roughly another 17%.",
          "パネルは25 °Cを1度上回るごとに出力が約0.35%下がり、フィリピンの日差しではよく55〜65 °Cになります。だから、涼しく明るい朝が暑い午後に勝つこともあるのです。配線、ほこり、インバーターでさらに約17%失われます。"
        ),
        L(
          "This farm is 3.6 MW peak, tilted 15° toward the south; the rows in the garden stand in for it, since the real thing would cover about 4 hectares. Over a year, a well-placed panel in Metro Manila makes about 1,400 kWh for each kW of its rating.",
          "この発電所は最大3.6 MWで、南へ15°傾けてあります。本物なら約4ヘクタールになるので、庭のパネル列がその代わりです。よい場所に置いたパネルは、マニラ首都圏で1年に定格1 kWあたり約1,400 kWhを発電します。"
        ),
      ];
    },
    liveStats: (c) => [
      [L("Output", "出力"), `${mw(c.now.siliconMw)} / ${PLANT.siliconMwp}`],
      [L("Last 24 h", "24時間の発電量"), mwh(energyOf(c, (s) => s.siliconMw))],
      [L("Peak, 24 h", "24時間の最大"), mw(peakOf(c, (s) => s.siliconMw))],
      [L("Capacity factor", "設備利用率"), pct(capacityFactor(c, (s) => s.siliconMw, PLANT.siliconMwp))],
      [L("Cells", "セル"), `${c.now.cellTemp.toFixed(0)} °C, ${c.now.poa.toFixed(0)} W/m²`],
      [L("Lost to heat", "熱による損失"), pct(heatLoss(c.now.cellTemp, SILICON))],
    ],
    liveTrend: { get label() { return L("Silicon output", "シリコンの出力"); }, value: (s) => s.siliconMw, unit: "MW", color: "#3b7bff", min: 0, max: PLANT.siliconMwp },
    get try() {
      return L(
        "Press 10:00 and then 14:00 with Clear weather, and compare the cell temperature and the output on the big display.",
        "「晴れ」で 10:00、次に 14:00 を押して、大きな画面でセルの温度と出力を比べてみましょう。"
      );
    },
    sources: ["dupre2015", "duffie2013", "dobos2014", "doeSolar"],
  },
  perovskite: {
    get title() {
      return L("The perovskite pilot row", "ペロブスカイトの試験列");
    },
    get art() {
      return svg(`
      <rect width="320" height="200" fill="#f4ece6"/>
      <g transform="translate(40 40)">
        <rect width="240" height="22" fill="#bfe8f2"/><text x="8" y="15" font-size="11">${L("glass", "ガラス")}</text>
        <rect y="26" width="240" height="14" fill="#8cc9ef"/>
        <rect y="44" width="240" height="14" fill="#ececf2"/>
        <rect y="62" width="240" height="26" fill="#7a3a24"/><text x="8" y="80" font-size="11" fill="#fff">${L("perovskite absorber, under a micrometre", "ペロブスカイト吸収層(1マイクロメートル未満)")}</text>
        <rect y="92" width="240" height="14" fill="#a98ad0"/>
        <rect y="110" width="240" height="14" fill="#e3b85a"/>
      </g>`);
    },
    get body() {
      return [
        L(
          "Perovskites are crystals that absorb sunlight very strongly, so a layer thinner than a thousandth of a millimetre does the work of thick silicon. They can be printed at low temperature onto glass or flexible film, which is why Japan is developing lightweight, flexible perovskite panels for walls, roofs, and places silicon can't go, and plans about 20 GW of them by 2040.",
          "ペロブスカイトは日光をとても強く吸収する結晶で、1000分の1ミリより薄い層が厚いシリコンと同じ働きをします。低い温度でガラスや曲がるフィルムに印刷できるので、日本は壁や屋根などシリコンを置けない場所向けに、軽くて曲がるペロブスカイトパネルを開発しており、2040年までに約20 GWの導入を計画しています。"
        ),
        L(
          "They also lose less to heat than silicon: about 0.17% per degree instead of 0.35%. Their weakness is durability: moisture, oxygen, heat, and light break them down. This pilot row loses a little output with every humid hour, depending on how well it is sealed.",
          "熱による損失もシリコンより小さく、1度あたり0.35%ではなく約0.17%です。弱点は耐久性で、水分、酸素、熱、光で劣化します。この試験列は、封止のよしあしに応じて、湿度の高い時間ごとに少しずつ出力が落ちていきます。"
        ),
      ];
    },
    liveStats: (c) => [
      [L("Output", "出力"), `${mw(c.now.perovskiteMw)} / ${PLANT.perovskiteMwp}`],
      [L("Last 24 h", "24時間の発電量"), mwh(energyOf(c, (s) => s.perovskiteMw))],
      [L("Health", "健全度"), `${(c.now.perovskiteHealth * 100).toFixed(2)}%`],
      [L("Health lost, 24 h", "24時間の劣化"), L(`${(healthLost(c) * 100).toFixed(3)} points`, `${(healthLost(c) * 100).toFixed(3)} ポイント`)],
      [L("Seal", "封止"), setting(SEAL, c.encapsulation)],
      [L("Lost to heat", "熱による損失"), pct(heatLoss(c.now.cellTemp, PEROVSKITE))],
    ],
    liveTrend: { get label() { return L("Pilot row output", "試験列の出力"); }, value: (s) => s.perovskiteMw, unit: "MW", color: "#a8492b", min: 0, max: PLANT.perovskiteMwp },
    get try() {
      return L(
        "Set the seal to None, press Rain and Run 360×, and watch the pilot's health fall on the big display.",
        "封止を「なし」にして「雨」と「360倍速」を押し、大きな画面で試験列の健全度が下がるのを見てみましょう。"
      );
    },
    sources: ["green2014", "jost2020", "boyd2019", "meti2024"],
  },
  wind: {
    get title() {
      return L("Wind turbines", "風力タービン");
    },
    art: windArt(),
    liveArt: ({ now, windBreaker }) => windArt(now, !windBreaker),
    liveStats: (c) => [
      [L("Wind", "風"), `${c.now.windSpeed.toFixed(1)} m/s`],
      [L("Output", "出力"), `${mw(c.now.windMw)} / ${WIND_RATED}`],
      [
        L("Rotors", "ローター"),
        !c.windBreaker
          ? L("braked (breaker open)", "停止中(ブレーカー開)")
          : c.now.turbinesFeathered
            ? L("feathered, past cut-out", "フェザリング中(停止風速超え)")
            : c.now.windMw > 0
              ? `${c.rpm.toFixed(1)} rpm`
              : L("idle, below cut-in", "待機中(起動風速未満)"),
      ],
      [L("Last 24 h", "24時間の発電量"), mwh(energyOf(c, (s) => s.windMw))],
      [L("Capacity factor", "設備利用率"), pct(capacityFactor(c, (s) => s.windMw, WIND_RATED))],
    ],
    liveTrend: { get label() { return L("Wind output", "風力の出力"); }, value: (s) => s.windMw, unit: "MW", color: "#1d9f80", min: 0, max: WIND_RATED },
    get body() {
      return [
        L(
          "The power carried by the wind rises with the cube of its speed: double the wind, eight times the power. A turbine makes nothing below about 3.5 m/s, follows that cube up to about 12 m/s, then turns its blades to hold its full rating; when the wind averages over 25 m/s it feathers them and brakes to protect itself.",
          "風が運ぶエネルギーは風速の3乗で増えます。風が2倍なら8倍です。タービンは約3.5 m/s未満では発電せず、約12 m/sまでは3乗に沿って増え、それ以上は羽根の角度を変えて定格を保ちます。平均風速が25 m/sを超えると、身を守るため羽根を風に沿わせ(フェザリング)、ブレーキをかけます。"
        ),
        L(
          "That is why a typhoon, for all its wind, produces nothing here. The two turbines are 1.5 MW each. The ones in the garden are scale models: a real 1.5 MW turbine has a rotor about 77 m across on a tower about 80 m tall, turning at 10 to 20 rpm.",
          "だから台風のときは、あれほど風があってもここでは何も発電しません。タービンは2基で各1.5 MW。庭にあるのは縮尺模型で、本物の1.5 MW機は高さ約80 mの塔の上に直径約77 mのローターがあり、毎分10〜20回転します。"
        ),
      ];
    },
    get try() {
      return L(
        "Press Typhoon on the console, then look out at the turbines in the garden.",
        "操作盤で「台風」を押してから、庭のタービンを見てみましょう。"
      );
    },
    sources: ["manwell2009", "ge15"],
  },
  battery: {
    get title() {
      return L("Battery storage", "蓄電池");
    },
    art: batteryArt(0.6, 0),
    liveArt: ({ now }) => batteryArt(now.soc, now.batteryMw),
    liveStats: (c) => {
      const { now } = c;
      const energy = PLANT.batteryMwh;
      // At the current rate, by the model's own limits and one-way losses.
      const eta =
        now.batteryMw > 0.01
          ? L(`lasts ${duration(((now.soc - SOC_MIN) * energy * BATTERY_ONE_WAY_EFFICIENCY) / now.batteryMw)}`, `あと${duration(((now.soc - SOC_MIN) * energy * BATTERY_ONE_WAY_EFFICIENCY) / now.batteryMw)}もつ`)
          : now.batteryMw < -0.01
            ? L(`full in ${duration(((SOC_MAX - now.soc) * energy) / (-now.batteryMw * BATTERY_ONE_WAY_EFFICIENCY))}`, `あと${duration(((SOC_MAX - now.soc) * energy) / (-now.batteryMw * BATTERY_ONE_WAY_EFFICIENCY))}で満充電`)
            : L("holding", "保持中");
      return [
        [L("Stored", "蓄電量"), `${(now.soc * energy).toFixed(1)} / ${energy} MWh`],
        [
          L("Power", "電力"),
          now.batteryMw < -0.01 ? L(`charging ${mw(-now.batteryMw)}`, `充電 ${mw(-now.batteryMw)}`) : now.batteryMw > 0.01 ? L(`giving ${mw(now.batteryMw)}`, `放電 ${mw(now.batteryMw)}`) : L("idle", "待機中"),
        ],
        [L("At this rate", "このペースだと"), eta],
        [L("Taken in, 24 h", "24時間の充電量"), mwh(energyOf(c, (s) => Math.max(0, -s.batteryMw)))],
        [L("Given back, 24 h", "24時間の放電量"), mwh(energyOf(c, (s) => Math.max(0, s.batteryMw)))],
        [L("Mode", "モード"), setting(MODE, c.batteryMode)],
      ];
    },
    liveTrend: { get label() { return L("Charge", "充電率"); }, value: (s) => s.soc * 100, unit: "%", color: "#8a5fe0", min: 0, max: 100, digits: 0 },
    get body() {
      return [
        L(
          `The battery holds 6 MWh and can charge or discharge at up to 3 MW. In Auto, it stores whatever the plant makes beyond the load. On the grid it saves that energy for the evening peak: it covers only the part of the load above about ${(PEAK_SHAVE_FRACTION * PLANT.peakLoadMw).toFixed(1)} MW (65% of the town's design peak), so its charge lasts through the evening while the main grid supplies the rest. In an El Niño grid alert it also covers whatever the grid can't. Cut off from the grid, it covers all it can.`,
          `蓄電池の容量は6 MWhで、最大3 MWで充電・放電できます。「自動」では、発電が需要を上回った分をためます。系統につながっているときは、それを夕方のピークのためにとっておきます。需要のうち約${(PEAK_SHAVE_FRACTION * PLANT.peakLoadMw).toFixed(1)} MW(町の設計ピークの65%)を超える部分だけを受け持つので、夕方いっぱい電気がもち、残りは系統から来ます。エルニーニョで系統が警報のときは、系統が足りない分も受け持ちます。系統から切り離されたときは、できるかぎりすべてを受け持ちます。`
        ),
        L(
          "About 15% of the energy is lost on the round trip (85% comes back, typical of large lithium-ion systems), and the battery is kept between 10% and 95% full to protect it.",
          "ためて取り出すまでに約15%が失われ(戻ってくるのは85%。大型リチウムイオン電池ではふつうの値です)、電池を守るため充電率は10〜95%の間に保たれます。"
        ),
      ];
    },
    get try() {
      return L(
        "Press 18:00 and open the Grid tie breaker, and see how long the battery carries the evening.",
        "18:00 を押して「系統連系」のブレーカーを開き、蓄電池が夕方をどれだけ支えられるか見てみましょう。"
      );
    },
    sources: ["cole2019", "eia2021"],
  },
  grid: {
    get title() {
      return L("The main grid and island mode", "本線の系統と自立運転");
    },
    art: svg(`
      <rect width="320" height="200" fill="#eef1f7"/>
      ${[40, 140, 240].map((x) => `<path d="M${x} 180 L${x + 20} 40 L${x + 40} 180 M${x + 6} 120 L${x + 34} 120 M${x + 12} 80 L${x + 28} 80" stroke="#55607a" stroke-width="3" fill="none"/>`).join("")}
      <path d="M60 60 Q110 90 160 60 Q210 90 260 60" stroke="#55607a" fill="none" stroke-width="2"/>`),
    get body() {
      return [
        L(
          "Connected to the main grid, the plant exports its surplus and imports any shortfall, so the lights never go out. Island mode is a community running on its own, as it would after a typhoon cuts the lines.",
          "本線の系統につながっていると、発電所は余りを送り出し、足りない分を受け取るので、明かりが消えることはありません。自立運転(アイランドモード)は、台風で送電線が切れたときのように、地域が自分たちだけで電気をまかなう状態です。"
        ),
        L(
          "In island mode, whatever the plant and battery can't supply has to be shed. Many smaller Philippine islands are not on the main grid at all: the National Power Corporation runs their power plants, nearly all on diesel, and is adding solar and batteries to burn less fuel.",
          "自立運転では、発電所と蓄電池でまかなえない分は止めるしかありません。フィリピンの小さな島の多くはそもそも本線の系統につながっておらず、国家電力公社がほぼディーゼルの発電所を運転しています。燃料を減らすため、太陽光と蓄電池を増やしているところです。"
        ),
        L(
          "Every MWh the plant makes instead of the main grid avoids about 0.71 tonnes of CO₂, the grid's emission factor for Luzon and the Visayas.",
          "系統の代わりにこの発電所が1 MWh発電するごとに、約0.71トンのCO₂が減ります。これはルソンとビサヤの系統の排出係数です。"
        ),
        L(
          "The main grid can run short too. In the El Niño heat of April and May 2024 it went on red alert in the afternoons and evenings, and towns took turns in rotating brownouts. The El Niño 2026 switch on the console brings that here.",
          "本線の系統が足りなくなることもあります。2024年4〜5月のエルニーニョの暑さでは、午後と夕方にレッドアラートが出て、町が交代で計画停電をしました。操作盤の「エルニーニョ2026」スイッチで、それをここで再現できます。"
        ),
      ];
    },
    liveStats: ({ now, gridConnected, day }) => [
      [
        L("Grid tie", "系統連系"),
        gridConnected ? (now.gridAlert ? L(`on alert: ${mw(now.gridLimitMw)} max`, `警報中:最大 ${mw(now.gridLimitMw)}`) : L("connected", "接続中")) : L("island mode", "自立運転"),
      ],
      [
        L("Now", "現在"),
        !gridConnected
          ? now.unservedMw > 0.005
            ? L(`shedding ${mw(now.unservedMw)}`, `${mw(now.unservedMw)}を遮断中`)
            : L("all load served", "すべて供給中")
          : now.gridMw > 0.005
            ? L(`importing ${mw(now.gridMw)}`, `${mw(now.gridMw)}を受電中`)
            : now.gridMw < -0.005
              ? L(`exporting ${mw(-now.gridMw)}`, `${mw(-now.gridMw)}を送電中`)
              : L("balanced", "均衡"),
      ],
      [L("Own share, 24 h", "24時間の自給率"), pct(day.renewableShare)],
      [L("CO₂ avoided, 24 h", "24時間のCO₂削減"), `${day.co2AvoidedT.toFixed(1)} t`],
    ],
    liveTrend: { get label() { return L("From the grid (below the line: exported)", "系統からの受電(線より下は送電)"); }, value: (s) => s.gridMw, unit: "MW", color: "#55607a" },
    get try() {
      return L(
        "Press 00:00 and Rain, then open the Grid tie and Wind breakers.",
        "00:00 と「雨」を押してから、「系統連系」と「風力」のブレーカーを開いてみましょう。"
      );
    },
    sources: ["npc2025", "doeNgef", "inquirer2024"],
  },
  load: {
    get title() {
      return L("The town: who uses the power", "町:だれが電気を使うのか");
    },
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
        [L("Town now", "町の現在の需要"), L(`${mw(now.loadMw)} (design peak ${mw(PLANT.peakLoadMw)})`, `${mw(now.loadMw)}(設計ピーク ${mw(PLANT.peakLoadMw)})`)],
        [L("One home now", "1世帯の現在"), L(`${(town.perHomeKw * 1000).toFixed(0)} W at ${now.ambient.toFixed(0)} °C`, `${(town.perHomeKw * 1000).toFixed(0)} W(${now.ambient.toFixed(0)} °C)`)],
        [L("One home, 24 h", "1世帯の24時間"), L(`${kwh.toFixed(1)} kWh (≈ ${(kwh * 30.4).toFixed(0)} kWh a month)`, `${kwh.toFixed(1)} kWh(月に約 ${(kwh * 30.4).toFixed(0)} kWh)`)],
        [L("From the plant now", "いま発電所から"), now.loadMw > 0 ? pct(own / now.loadMw) : "–"],
        ...uses.map(([use, value]): Stat => [useLabel(use), `${mw(value)} (${pct(value / Math.max(0.001, town.totalMw))})`]),
        [L("Homes dark now", "停電中の世帯"), homesDark(now) ? homes(homesDark(now)) : L("none", "なし")],
      ];
    },
    get body() {
      return [
        L(
          `The plant serves a provincial coastal town in Cebu: ${TOWN.homes.toLocaleString("en")} homes, about ${Math.round((TOWN.homes * TOWN.peoplePerHome) / 1000)},000 people at ${TOWN.peoplePerHome} per home (the national average), plus a school, a health centre, shops and eateries, a water pumping station, and street lights.`,
          `この発電所は、セブ州の海沿いの地方の町に電気を送っています。${TOWN.homes.toLocaleString("en")}世帯、1世帯${TOWN.peoplePerHome}人(全国平均)で約${Math.round((TOWN.homes * TOWN.peoplePerHome) / 1000)},000人。ほかに学校、保健所、店や食堂、給水ポンプ場、街灯があります。`
        ),
        L(
          "A typical home here has six LED bulbs, two electric fans, a television, a rice cooker, phones, and Wi-Fi; seven homes in ten have a refrigerator, and one in four a 1 HP aircon. That comes to about 140 to 180 kWh a month, depending on the weather: a little under the 200 kWh household Meralco quotes its Metro Manila rates for, as suits a provincial town.",
          "ここの典型的な家には、LED電球6個、扇風機2台、テレビ、炊飯器、スマホ、Wi-Fiがあります。10世帯に7世帯は冷蔵庫を、4世帯に1世帯は1馬力のエアコンを持っています。合わせて月に約140〜180 kWh(天気しだい)。メラルコがマニラ首都圏の料金の目安にする200 kWhの世帯より少し少なく、地方の町らしい数字です。"
        ),
        L(
          "Heat drives it. On a hot, clear day the town uses about a quarter more than on a cool, rainy one, mostly through fans and aircon, inside the 10 to 40% rise Meralco expects in summer. And the biggest demand comes in the evening, as the sun sets, which is the whole reason for the battery.",
          "決め手は暑さです。暑く晴れた日は、涼しい雨の日より約4分の1多く使います。ほとんどが扇風機とエアコンで、メラルコが夏に見込む10〜40%増の範囲内です。そしていちばん需要が大きいのは、日が沈む夕方。蓄電池があるのはまさにそのためです。"
        ),
        L(
          "The mix and schedules are the model's assumptions, calibrated to those figures, not a survey of a real town. The curve is the town's own on a 28 °C day, with the load right now marked.",
          "家電の組み合わせや使う時間はモデルの仮定で、これらの数字に合わせたものです。実在の町の調査ではありません。曲線は28 °Cの日のこの町の需要で、今の需要に印がついています。"
        ),
      ];
    },
    get try() {
      return L(
        "Press 14:00 with Clear weather, then 14:00 with Rain, and compare one home's draw and the fans-and-aircon share.",
        "「晴れ」で 14:00、次に「雨」で 14:00 を押して、1世帯の消費と扇風機・エアコンの割合を比べてみましょう。"
      );
    },
    sources: ["psa2020", "tribune2024", "gma2021", "teko2024"],
  },
  elnino: {
    get title() {
      return L("El Niño 2026", "エルニーニョ2026");
    },
    get art() {
      return svg(`
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
      <text x="76" y="70" font-size="13" fill="#7a3b12">${L("drier, hotter,", "より乾き、より暑く、")}</text>
      <text x="76" y="88" font-size="13" fill="#7a3b12">${L("a grid on alert", "系統は警報")}</text>`);
    },
    liveStats: ({ now, day }) => [
      [L("Scenario", "シナリオ"), now.elNino ? L("El Niño 2026", "エルニーニョ2026") : L("normal year", "平年")],
      [L("Air now", "現在の気温"), `${now.ambient.toFixed(1)} °C`],
      [L("Main grid", "本線の系統"), now.gridAlert ? L(`alert: ${mw(now.gridLimitMw)} max`, `警報:最大 ${mw(now.gridLimitMw)}`) : L("no alert", "警報なし")],
      [L("Homes dark now", "停電中の世帯"), homesDark(now) ? homes(homesDark(now)) : L("none", "なし")],
      [L("Unserved, 24 h", "24時間の供給不足"), mwh(day.unservedMwh)],
    ],
    get body() {
      return [
        L(
          "El Niño is a warming of the central and eastern tropical Pacific that shifts rain away from the Philippines. PAGASA reports a strong to very strong El Niño now, likely to peak around the end of 2026 and last into the first half of 2027, with below-normal rainfall, dry spells and drought, and fewer typhoons. Its July 2026 outlook named Cebu, this town's province, among those likely to be in drought by the end of August.",
          "エルニーニョは、太平洋の赤道域の中部から東部が暖まる現象で、雨がフィリピンから遠ざかります。PAGASA(フィリピン気象庁)は、現在強い〜非常に強いエルニーニョが発生しており、2026年末ごろにピークを迎え、2027年前半まで続く見込みだとしています。降水は平年を下回り、少雨や干ばつが起き、台風は減ります。2026年7月の見通しでは、この町のあるセブ州も8月末までに干ばつになりそうな州に挙げられました。"
        ),
        L(
          "The last one, from mid-2023 to May 2024, overlapped the hot dry months. Metro Manila set its all-time record of 38.8 °C on 27 April 2024. Demand ran above forecast in the heat, and with many plants on forced outage the Luzon grid went on red alert, on 16 April from 2 to 4 p.m. and 6 to 9 p.m., and towns took turns in rotating brownouts.",
          "前回は2023年半ばから2024年5月までで、暑く乾いた季節と重なりました。マニラ首都圏は2024年4月27日に観測史上最高の38.8 °Cを記録。暑さで需要は予測を上回り、多くの発電所が故障で止まっていたため、ルソンの系統は4月16日の午後2〜4時と午後6〜9時にレッドアラートとなり、町が交代で計画停電をしました。"
        ),
        L(
          `The El Niño 2026 switch on the console brings that here. It sets clear skies and adds ${EL_NINO.warmingC} °C to the air, an assumption for a warm El Niño season (attribution puts El Niño's own share of the April 2024 heatwave at about 0.2 °C; most of it was climate change). Fans and aircon then run longer, so the town draws more. And on hot, dry days, from 2 to 4 p.m. and 6 to 9 p.m., the main grid can supply only ${Math.round(EL_NINO.importShare * 100)}% of the town's design peak, another assumption; whatever the plant and battery can't cover goes dark in rotation.`,
          `操作盤の「エルニーニョ2026」スイッチで、それをここで再現します。空を晴れにし、気温を${EL_NINO.warmingC} °C上げます。これは暑いエルニーニョの季節の仮定です(要因分析では、2024年4月の熱波のうちエルニーニョ自体の寄与は約0.2 °Cで、大半は気候変動によるものでした)。すると扇風機とエアコンが長く動き、町の需要が増えます。さらに暑く乾いた日の午後2〜4時と午後6〜9時には、本線の系統は町の設計ピークの${Math.round(EL_NINO.importShare * 100)}%しか供給できません(これも仮定です)。発電所と蓄電池でまかなえない分は、交代で停電します。`
        ),
        L(
          "That is what a local plant is for in a drought year: clear skies are good for solar, and a battery charged at noon can carry the town through an evening alert.",
          "干ばつの年にこそ地元の発電所が役に立ちます。晴れた空は太陽光に向いていて、正午に充電した蓄電池が、夕方の警報の間も町を支えられるのです。"
        ),
      ];
    },
    get try() {
      return L(
        "Press El Niño 2026, then 18:00, and switch off the Battery breaker: homes go dark in the alert. Switch it back on and watch them come back.",
        "「エルニーニョ2026」を押し、次に 18:00 を押して「蓄電池」のブレーカーを切ってみましょう。警報の間、家々が停電します。入れ直すと明かりが戻ります。"
      );
    },
    sources: ["pagasa2026", "pagasa2024end", "pia2024", "inquirer2024", "mb2024"],
  },
  layers: {
    get title() {
      return L("Inside a perovskite cell", "ペロブスカイトセルの中");
    },
    get art() {
      return svg(`
      <rect width="320" height="200" fill="#fff"/>
      ${[
        ["#bfe8f2", L("glass", "ガラス")],
        ["#8cc9ef", L("transparent electrode", "透明電極")],
        ["#ececf2", L("electron transport", "電子輸送層")],
        ["#7a3a24", L("perovskite", "ペロブスカイト")],
        ["#a98ad0", L("hole transport", "正孔輸送層")],
        ["#e3b85a", L("back contact", "裏面電極")],
      ]
        .map(([c, t], i) => `<rect x="30" y="${20 + i * 28}" width="150" height="22" fill="${c}"/><text x="190" y="${36 + i * 28}" font-size="12">${t}</text>`)
        .join("")}`);
    },
    get body() {
      return [
        L(
          "Light passes through the glass and the transparent electrode into the perovskite, where it frees electrons. The electron-transport layer carries electrons one way and the hole-transport layer carries the gaps they leave the other way, so the two flow out as current.",
          "光はガラスと透明電極を通ってペロブスカイトに入り、電子を自由にします。電子輸送層が電子を一方へ、正孔輸送層が電子の抜けた穴(正孔)をもう一方へ運ぶので、二つが電流として流れ出します。"
        ),
        L(
          "Each choice of material trades efficiency, cost, and stability against each other. The best single-junction lab cells now reach about 27% efficiency, close to silicon's best; keeping that for years outdoors is the open problem.",
          "どの材料を選ぶかで、効率、コスト、安定性のどれかを取ってどれかを譲ることになります。いちばんよい単接合の研究用セルは効率約27%に達し、シリコンの最高値に近づいています。それを屋外で何年も保つことが、まだ解けていない課題です。"
        ),
      ];
    },
    liveStats: (c) => [
      [L("Pilot row health", "試験列の健全度"), `${(c.now.perovskiteHealth * 100).toFixed(2)}%`],
      [L("Lost, 24 h", "24時間の劣化"), L(`${(healthLost(c) * 100).toFixed(3)} points`, `${(healthLost(c) * 100).toFixed(3)} ポイント`)],
      [L("Humidity", "湿度"), `${c.now.humidity.toFixed(0)}%`],
      [L("Cells", "セル"), `${c.now.cellTemp.toFixed(0)} °C`],
      [L("Seal", "封止"), setting(SEAL, c.encapsulation)],
    ],
    liveTrend: { get label() { return L("Pilot row health", "試験列の健全度"); }, value: (s) => s.perovskiteHealth * 100, unit: "%", color: "#a8492b", digits: 3 },
    sources: ["green2014", "nrelChart", "boyd2019"],
  },
  degradation: {
    get title() {
      return L("Why the Philippines is a hard test", "フィリピンがきびしい試験になるわけ");
    },
    get art() {
      return svg(`
      <rect width="320" height="200" fill="#eef5f2"/>
      <text x="30" y="50" font-size="30">💧 🌡️ ☀️</text>
      <polyline points="30,90 90,98 150,115 210,140 270,170" fill="none" stroke="#c2603a" stroke-width="4"/>
      <polyline points="30,90 270,96" fill="none" stroke="#1d8f73" stroke-width="4"/>
      <text x="200" y="88" font-size="11" fill="#1d8f73">${L("well sealed", "しっかり封止")}</text><text x="200" y="185" font-size="11" fill="#c2603a">${L("unsealed", "封止なし")}</text>`);
    },
    get body() {
      return [
        L(
          "Humidity often above 80%, cell temperatures above 60 °C, and intense year-round sun are the three stressors perovskites handle worst. A design that lasts years in a dry, mild climate can fade within months here.",
          "80%を超えることの多い湿度、60 °Cを超えるセル温度、一年中強い日差し。この3つはペロブスカイトがもっとも苦手とするものです。乾いた穏やかな気候で何年ももつ設計でも、ここでは数か月で衰えることがあります。"
        ),
        L(
          "Researchers compare stability by T80, the time a cell takes to fall to 80% of its starting output, under agreed test conditions. Before deploying perovskites in the Philippines, they would need testing under local conditions, with real sealed modules and measured weather. This lab shows the trade-offs; it does not predict a product's lifetime.",
          "研究者は安定性をT80(決められた試験条件で、セルの出力が最初の80%に下がるまでの時間)で比べます。フィリピンでペロブスカイトを使う前には、実際に封止したモジュールと実測の気象で、現地の条件で試験する必要があるでしょう。このラボは利点と弱点の関係を見せるもので、製品の寿命を予測するものではありません。"
        ),
      ];
    },
    liveStats: (c) => [
      [L("Pilot row health", "試験列の健全度"), `${(c.now.perovskiteHealth * 100).toFixed(2)}%`],
      [L("Lost, 24 h", "24時間の劣化"), L(`${(healthLost(c) * 100).toFixed(3)} points`, `${(healthLost(c) * 100).toFixed(3)} ポイント`)],
      [L("Humidity", "湿度"), `${c.now.humidity.toFixed(0)}%`],
      [L("Cells", "セル"), `${c.now.cellTemp.toFixed(0)} °C`],
      [L("Seal", "封止"), setting(SEAL, c.encapsulation)],
    ],
    liveTrend: { get label() { return L("Pilot row health", "試験列の健全度"); }, value: (s) => s.perovskiteHealth * 100, unit: "%", color: "#a8492b", digits: 3 },
    sources: ["boyd2019", "khenkin2020", "pagasa"],
  },
};
