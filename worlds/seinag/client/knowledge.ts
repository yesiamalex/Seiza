// What Chancy Joan and Dean Rob know in Seinag: everything they know in
// SeiOU (worlds/seiou/client/campus.ts), plus the campus's hypothetical
// solar, with live readings from the plant (live.ts). Every answer is
// written here or built from the plant's own numbers.
import type { Knowledge, LiveIntent, Mood, Place, Topic } from "../../../src/guides/brain";
import { seiouKnowledge } from "../../seiou/client/campus";
import { CAMPUS, ROOFTOP_MWP } from "./plant";
import { dayTotals, live } from "./live";
import solar from "../world/solar.json";

const kw = (mw: number) => `${Math.round(mw * 1000)} kW`;

/** Where the dashboard stands, by the arrival point. */
export const DASHBOARD_AT: [number, number, number] = [77, 0.2, -6.5];
/** Turned to face where visitors arrive (SPAWN). */
export const DASHBOARD_TURN = Math.atan2(66 - 77, 0 + 6.5);

export const SOLAR_PLACES = {
  dashboard: { id: "dashboard", label: "the solar dashboard by the drive", labelJa: "車道わきのソーラー・ダッシュボード", at: [75.6, 0.2, -5.4] } as Place,
  mainRoof: { id: "mainRoof", label: "the panels on the Main Building's roof", labelJa: "本館の屋上のパネル", // Where the Main Building's lift arrives on the roof
  // (worlds/seiou/world/models/floors.json), among the panels.
  at: [115.5, 10.24, 0.5], walk: false } as Place,
};

const modules = Object.values(solar.arrays).reduce((n, a) => n + a.modules.length, 0);

const TOPICS: Topic[] = [
  {
    id: "seinag",
    title: "About Seinag",
    answer: `Seinag is UPOU's campus with hypothetical solar on its roofs: ${modules} panels, about ${Math.round(ROOFTOP_MWP * 1000)} kW at their peak, and a small battery, running live on the sky you see. Sinag means a ray of light in Filipino. It isn't UPOU's real plan: it's a way to see what the roofs could do.`,
    asks: ["what is seinag", "what is this place", "is this real", "where am i", "what is this world about", "sinag"],
    card: "solar",
    place: SOLAR_PLACES.dashboard,
    gesture: "raisehand",
    mood: "happy",
    ja: {
      title: "Seinagについて",
      answer: `Seinagは、屋根に仮想の太陽光パネルをのせたUPOUのキャンパスです。パネル${modules}枚、最大約${Math.round(ROOFTOP_MWP * 1000)} kWと小さな蓄電池が、見えている空に合わせてリアルタイムで動いています。「シナグ」はフィリピン語で「光の筋」。UPOUの実際の計画ではなく、屋根に何ができるかを見るためのものです。`,
      asks: ["Seinagって何", "ここはどこ", "これは本物", "このワールドは何"],
    },
  },
  {
    id: "rooftops",
    title: "The rooftop panels",
    answer: `The panels sit on the flat roofs of the Main Building, the Teaching and Learning Hub's pods, the CCDL, and the top of the World-Class Multimedia Production Building, tilted 15° to the south. The WCMPB's roof deck stays clear for visitors, and the Academic Residences already has panels of its own. A script placed them wherever a whole panel fits on open roof.`,
    asks: ["where are the solar panels", "which roofs have panels", "how many panels", "rooftop solar", "show me the panels", "take me to the panels"],
    place: SOLAR_PLACES.mainRoof,
    ja: {
      title: "屋根のパネル",
      answer: "パネルは、本館、ティーチング・アンド・ラーニング・ハブの棟、CCDL、ワールドクラス・マルチメディア制作棟の最上部の平らな屋根に、南へ15°傾けて置いてあります。WCMPBの屋上デッキは見学者のために空けてあり、アカデミック・レジデンスにはもともとパネルがあります。パネルが1枚まるごと開けた屋根に収まる場所に、スクリプトで配置しました。",
      asks: ["太陽光パネルはどこ", "どの屋根にパネルがある", "パネルは何枚", "屋根の太陽光", "パネルを見せて", "パネルに連れて行って"],
    },
  },
  {
    id: "dashboard",
    title: "The solar dashboard",
    answer: "The dashboard by the drive shows the panels' output right now, what the campus is using, the battery, and the last 24 hours. Click it for how the numbers are worked out.",
    asks: ["dashboard", "where can i see the numbers", "solar display", "the screen by the drive"],
    card: "solar",
    place: SOLAR_PLACES.dashboard,
    ja: {
      title: "ソーラー・ダッシュボード",
      answer: "車道わきのダッシュボードに、今のパネルの出力、キャンパスの使用量、蓄電池、過去24時間が表示されています。クリックすると、数字の出し方がわかります。",
      asks: ["ダッシュボード", "数字はどこで見られる", "ソーラーの表示", "車道わきの画面"],
    },
  },
  {
    id: "load",
    title: "What the campus uses",
    answer: "The campus's demand here is an assumed weekday: lights, servers, and security through the night, offices and classrooms from 7 to 6, and aircon that rises with the heat. It peaks at about a quarter of a megawatt on a hot afternoon. It isn't UPOU's metered use.",
    asks: ["how much electricity does the campus use", "campus load", "demand", "electric bill", "aircon"],
    card: "load",
    ja: {
      title: "キャンパスの使用量",
      answer: "ここでのキャンパスの需要は、仮定した平日のものです。夜は照明、サーバー、警備。7時から18時は事務室と教室。暑くなるほどエアコンが増えます。暑い午後には約0.25メガワットでピークになります。UPOUの実際の計測値ではありません。",
      asks: ["キャンパスはどのくらい電気を使う", "キャンパスの需要", "需要", "電気代", "エアコン"],
    },
  },
  {
    id: "worth",
    title: "Is rooftop solar worth it for a campus?",
    answer: "A campus is a good match for solar: it uses most of its power in the day, when the sun shines, so most of what the roofs make is used at once rather than stored. The battery here moves a little of the midday surplus to the evening. Whether it pays back depends on the roofs, the shade, the rates, and the installer, so a real project starts with a site study.",
    asks: ["is solar worth it", "why solar on a campus", "payback", "should upou install solar", "benefits of solar"],
    ja: {
      title: "キャンパスに屋根の太陽光は見合う?",
      answer: "キャンパスは太陽光と相性がよいのです。電気の大部分を日中、つまり日が照っているときに使うので、屋根で作った電気のほとんどをためずにすぐ使えます。ここの蓄電池は、昼の余りを少しだけ夕方に回します。元が取れるかは屋根、日陰、料金、施工業者しだいなので、実際の計画は現地調査から始まります。",
      asks: ["太陽光は見合う", "なぜキャンパスに太陽光", "投資回収", "UPOUは太陽光を入れるべき", "太陽光の利点"],
    },
  },
];

function liveIntents(): LiveIntent[] {
  const mood = (): Mood => {
    const s = live.now;
    return s && s.siliconMw > 0.5 * ROOFTOP_MWP ? "happy" : "neutral";
  };
  return [
    {
      test: /\b(solar|panels?|sun|producing|making|generating|output)\b/,
      testJa: /(太陽|パネル|ソーラー|発電)/,
      card: "solar",
      mood,
      answer: () => {
        const s = live.now;
        if (!s) return null;
        if (s.sunElevation <= 0) return `The sun is down, so the roofs are making nothing right now. The campus is drawing ${kw(s.loadMw)}, from the battery and the grid.`;
        return `The roofs are making ${kw(s.siliconMw)} of their ${Math.round(ROOFTOP_MWP * 1000)} kW peak, while the campus uses ${kw(s.loadMw)}: ${Math.round(Math.min(1, s.siliconMw / Math.max(0.001, s.loadMw)) * 100)}% of it from the sun.`;
      },
      answerJa: () => {
        const s = live.now;
        if (!s) return null;
        if (s.sunElevation <= 0) return `日が沈んでいるので、今は屋根の発電はゼロです。キャンパスは${kw(s.loadMw)}を、蓄電池と系統から使っています。`;
        return `屋根は最大${Math.round(ROOFTOP_MWP * 1000)} kWのうち${kw(s.siliconMw)}を発電中で、キャンパスの使用量は${kw(s.loadMw)}。その${Math.round(Math.min(1, s.siliconMw / Math.max(0.001, s.loadMw)) * 100)}%を太陽でまかなっています。`;
      },
    },
    {
      test: /\b(battery|stored|charge)\b/,
      testJa: /(蓄電池|バッテリー|充電)/,
      card: "solar",
      answer: () => {
        const s = live.now;
        if (!s) return null;
        const doing = s.batteryMw < -0.001 ? `charging at ${kw(-s.batteryMw)}` : s.batteryMw > 0.001 ? `giving ${kw(s.batteryMw)} to the campus` : "resting";
        return `The battery is ${Math.round(s.soc * 100)}% full of its ${Math.round(CAMPUS.batteryMwh * 1000)} kWh, and ${doing}.`;
      },
      answerJa: () => {
        const s = live.now;
        if (!s) return null;
        const doing = s.batteryMw < -0.001 ? `${kw(-s.batteryMw)}で充電中` : s.batteryMw > 0.001 ? `キャンパスへ${kw(s.batteryMw)}を供給中` : "待機中";
        return `蓄電池(${Math.round(CAMPUS.batteryMwh * 1000)} kWh)は充電率${Math.round(s.soc * 100)}%で、${doing}です。`;
      },
    },
    {
      test: /\b(today|co2|carbon|saved|avoided|24 hours)\b/,
      testJa: /(今日|二酸化炭素|削減|24時間)/,
      card: "solar",
      answer: () => {
        if (!live.now) return null;
        const t = dayTotals();
        return `Over the last 24 hours the roofs made ${(t.solarMwh * 1000).toFixed(0)} kWh, ${Math.round(t.ownShare * 100)}% of what the campus used came from its own sun and battery, and about ${(t.co2AvoidedT * 1000).toFixed(0)} kg of CO₂ was avoided.`;
      },
      answerJa: () => {
        if (!live.now) return null;
        const t = dayTotals();
        return `過去24時間で、屋根は${(t.solarMwh * 1000).toFixed(0)} kWhを発電し、キャンパスの使用量の${Math.round(t.ownShare * 100)}%を自前の太陽と蓄電池でまかない、約${(t.co2AvoidedT * 1000).toFixed(0)} kgのCO₂を減らしました。`;
      },
    },
  ];
}

/** SeiOU's knowledge, with the solar added. */
export function seinagKnowledge(): Knowledge {
  const base = seiouKnowledge();
  return {
    ...base,
    topics: [...TOPICS, ...base.topics.filter((t) => t.id !== "world")],
    starters: ["What is Seinag?", "How much are the roofs making now?", "Where are the solar panels?", "Give me a tour", "What is UPOU?"],
    startersJa: ["Seinagって何?", "今、屋根はどのくらい発電している?", "太陽光パネルはどこ?", "キャンパスを案内して", "UPOUって何?"],
    subject: "UPOU, this campus, its rooftop solar, and finding your way",
    subjectJa: "UPOUとこのキャンパス、屋根の太陽光、そして道案内",
    live: liveIntents(),
    liveSuggestions: ["What did the roofs make today?", "Take me to the solar dashboard"],
    liveSuggestionsJa: ["今日はどのくらい発電した?", "ソーラー・ダッシュボードに連れて行って"],
    cardTitle: (card, lang) => (card === "load" ? (lang === "ja" ? "キャンパスの使用量" : "What the campus uses") : lang === "ja" ? "キャンパスの太陽光" : "Campus solar"),
    synonyms: { ...base.synonyms, pv: "solar", photovoltaic: "solar", araw: "sun", sinag: "seinag" },
  };
}
