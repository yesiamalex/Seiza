// What Ilaw-san knows, and who she is. Every answer she gives is written
// here (or built from Seizorai's own info cards and the live plant), so she
// can never say something nobody wrote, and every number matches the
// displays. Seiza's shared guides (src/guides/) do the rest: matching a
// question to an answer, guardrails, walking, gestures, and the chat.
//
// To teach her something, add a Topic: a title, the answer, and a few
// `asks` (ways people might put the question, in any language). They're
// what the matcher compares a question with, so more and more varied
// `asks` make her understand more. `place` lets her walk you there or take
// you there; `card` lets her open the matching info card.
import type { Knowledge, LiveIntent, Mood, Persona, Place, Topic } from "../../../../src/guides/brain";
import type { Stop } from "../../../../src/guides/route";
import { INFO, type InfoKey } from "../../sim/info";
import { withLang } from "../../../../src/i18n/lang";

const place = (id: string, label: string, labelJa: string, at: [number, number, number]): Place => ({ id, label, labelJa, at });

export const PLACES = {
  welcome: place("welcome", "the welcome board in the hall", "ホールの案内板", [5.2, 0, 12.6]),
  solar: place("solar", "the solar array in the garden", "庭の太陽光パネル", [-4.2, 0, 27.6]),
  battery: place("battery", "the battery in the garden", "庭の蓄電池", [5.6, 0, 27.4]),
  turbines: place("turbines", "the wind turbines on the meadow", "草原の風力タービン", [4.2, -0.6, 43.2]),
  control: place("control", "the control room in the classroom", "教室のコントロールルーム", [1.2, 0, -18.6]),
  lab: place("lab", "the perovskite lab in the classroom", "教室のペロブスカイト・ラボ", [-4.6, 0, -11.4]),
  cell: place("cell", "the perovskite cell in the classroom", "教室のペロブスカイトセル", [5.4, 0, -11.2]),
  camp: place("camp", "the campsite on the meadow", "草原のキャンプ場", [-9.6, -0.6, 58.4]),
};

/** The info cards, with where each exhibit stands and how people ask. */
const CARD_TOPICS: { card: InfoKey; place: Place; asks: string[]; asksJa?: string[] }[] = [
  { card: "sky", place: PLACES.solar, asks: ["how much sunlight", "irradiance", "why less power when cloudy", "does solar work when it rains", "sun angle", "weather and solar"], asksJa: ["日射はどのくらい", "曇りだと発電が減るのはなぜ", "雨でも太陽光は発電する", "太陽の角度", "天気と太陽光"] },
  { card: "silicon", place: PLACES.solar, asks: ["how do solar panels work", "silicon panels", "why do hot panels make less", "panel efficiency", "solar farm", "pv"], asksJa: ["太陽光パネルの仕組み", "シリコンパネル", "熱いパネルは発電が減る", "パネルの効率", "太陽光発電所"] },
  { card: "perovskite", place: PLACES.solar, asks: ["what is perovskite", "brown panels", "new kind of solar cell", "perovskite pilot row", "why is the back row brown"], asksJa: ["ペロブスカイトって何", "茶色いパネル", "新しい太陽電池", "ペロブスカイトの試験列", "奥の列が茶色いのはなぜ"] },
  { card: "wind", place: PLACES.turbines, asks: ["how do wind turbines work", "why do turbines stop", "turbine in a typhoon", "wind power", "cut in speed"], asksJa: ["風力タービンの仕組み", "タービンが止まるのはなぜ", "台風のときのタービン", "風力発電", "起動風速"] },
  { card: "battery", place: PLACES.battery, asks: ["what does the battery do", "energy storage", "why store electricity", "battery charge", "night power"], asksJa: ["蓄電池は何をしている", "エネルギーの貯蔵", "電気をためるのはなぜ", "蓄電池の充電", "夜の電気"] },
  { card: "grid", place: PLACES.control, asks: ["what is the grid", "island mode", "what happens if the grid goes down", "import export power", "brownout"], asksJa: ["系統って何", "自立運転", "系統が止まったらどうなる", "受電と送電", "停電"] },
  { card: "load", place: PLACES.control, asks: ["who uses the power", "the town", "how much does a home use", "aircon electricity", "electric fan", "household consumption"], asksJa: ["だれが電気を使う", "町", "一世帯の電気使用量", "エアコンの電気", "扇風機", "家庭の消費"] },
  { card: "elnino", place: PLACES.control, asks: ["what is el nino", "drought", "heatwave", "red alert grid", "rotating brownouts"], asksJa: ["エルニーニョって何", "干ばつ", "熱波", "レッドアラート", "計画停電"] },
  { card: "layers", place: PLACES.cell, asks: ["layers of a solar cell", "inside a perovskite cell", "electron transport layer", "how is a cell made"], asksJa: ["太陽電池の層", "ペロブスカイトセルの中", "電子輸送層", "セルの作り方"] },
  { card: "degradation", place: PLACES.lab, asks: ["why does perovskite degrade", "moisture damage", "how long do panels last", "philippines humidity solar", "encapsulation seal"], asksJa: ["ペロブスカイトが劣化するのはなぜ", "湿気による劣化", "パネルの寿命", "フィリピンの湿度と太陽光", "封止"] },
];

/** A card as a topic, in English and in Japanese (the cards are written in
 *  both; see sim/info.ts). */
const cardTopics: Topic[] = CARD_TOPICS.map(({ card, place, asks, asksJa = [] }) => {
  const [en, ja] = (["en", "ja"] as const).map((lang) =>
    withLang(lang, () => ({ title: INFO[card].title, first: INFO[card].body[0], tryThis: INFO[card].try }))
  );
  return {
    id: `card:${card}`,
    title: en.title,
    answer: [en.first, en.tryThis ? `Try this: ${en.tryThis}` : ""].filter(Boolean).join(" "),
    asks: [en.title, ...asks],
    card,
    place,
    ja: { title: ja.title, answer: [ja.first, ja.tryThis ? `やってみよう:${ja.tryThis}` : ""].filter(Boolean).join(""), asks: [ja.title, ...asksJa] },
  };
});

/** Written for Ilaw-san: the world, getting around, and the wider topic. */
const FAQ: Topic[] = [
  {
    id: "world",
    title: "About Seizorai",
    answer:
      "Seizorai is a learning world about solar futures: a solar, wind, and battery microgrid for a coastal town in Cebu, and a lab for a new kind of solar cell, perovskite. The plant runs live on the sky you see, so clouds and night really change what it makes.",
    asks: ["what is this place", "what is seizorai", "where am i", "what can i do here", "what is this world about", "ano ito", "nani kore"],
    place: PLACES.welcome,
    ja: {
      title: "Seizoraiについて",
      answer:
        "Seizoraiは、太陽の未来を学ぶワールドです。セブの海沿いの町のための太陽光・風力・蓄電池のマイクログリッドと、新しい太陽電池ペロブスカイトのラボがあります。発電所は見えている空に合わせてリアルタイムで動くので、雲や夜で本当に発電量が変わります。",
      asks: ["ここはどこ", "Seizoraiって何", "ここで何ができる", "このワールドは何", "これは何"],
    },
  },
  {
    id: "microgrid",
    title: "What is a microgrid?",
    answer:
      "A microgrid is a small power system for one community: its own generators (here, sun and wind), storage (the battery), and the homes it serves. It can work with the main grid, or cut loose and run on its own in island mode when the main grid fails.",
    asks: ["what is a microgrid", "microgrid meaning", "local power system", "community energy"],
    place: PLACES.control,
    ja: {
      title: "マイクログリッドって何?",
      answer:
        "マイクログリッドは、ひとつの地域のための小さな電力システムです。自分たちの発電(ここでは太陽と風)、蓄電(蓄電池)、そして電気を届ける家々でできています。本線の系統といっしょに動くことも、系統が止まったときに切り離して自立運転することもできます。",
      asks: ["マイクログリッドって何", "マイクログリッドの意味", "地域の電力システム", "地域エネルギー"],
    },
  },
  {
    id: "tour",
    title: "A tour",
    answer:
      "Start with the welcome board in the hall. Then the garden: the solar array and the battery. Down the steps to the meadow for the wind turbines. Last, the classroom: the control room, where you can run the plant, and the perovskite lab, where you design a cell. Ask me to walk you to any of them.",
    asks: ["give me a tour", "where should i go", "what should i see first", "show me around", "where to start", "pasyal", "annai shite"],
    place: PLACES.welcome,
    ja: {
      title: "ワールドめぐり",
      answer:
        "まずホールの案内板から。次に庭の太陽光パネルと蓄電池。階段を下りて草原の風力タービンへ。最後は教室です。発電所を動かせるコントロールルームと、セルを設計できるペロブスカイト・ラボがあります。どこへでも歩いてご案内しますよ。",
      asks: ["案内して", "どこに行けばいい", "最初に何を見ればいい", "見せて回って", "どこから始める"],
    },
  },
  {
    id: "controls",
    title: "Getting around",
    answer:
      "Walk with W A S D or the arrow keys, run with Shift, and jump with Space. Drag to look around. Double-click the floor to walk there. On a phone, use the pad at the bottom. Click any exhibit or board for its card.",
    asks: ["how do i move", "how to walk", "controls", "how do i run", "keyboard", "how do i jump", "paano maglakad"],
    ja: {
      title: "移動のしかた",
      answer:
        "W・A・S・Dか矢印キーで歩き、Shiftで走り、スペースでジャンプします。ドラッグで見回し、床をダブルクリックするとそこまで歩きます。スマホでは下のパッドを使ってください。展示や案内板をクリックすると説明カードが開きます。",
      asks: ["どうやって動く", "歩き方", "操作方法", "走り方", "キーボード", "ジャンプのしかた"],
    },
  },
  {
    id: "console",
    title: "Running the plant",
    answer:
      "The console beside the teacher's desk in the classroom runs the plant for everyone: breakers for the panels, the turbines, the battery, and the grid; the battery's mode; the time and the weather; and the El Niño 2026 scenario. If the room has an editor password, only editors can press it.",
    asks: ["how do i change the weather", "control panel", "can i turn off the grid", "breakers", "change the time", "make it rain", "run the plant"],
    place: PLACES.control,
    ja: {
      title: "発電所を動かす",
      answer:
        "教室の先生の机の横にある操作盤で、みんなの発電所を動かせます。パネル、タービン、蓄電池、系統のブレーカー、蓄電池のモード、時刻と天気、そして「エルニーニョ2026」シナリオ。部屋に編集パスワードがあれば、押せるのは編集者だけです。",
      asks: ["天気を変えるには", "操作盤", "系統を切れる", "ブレーカー", "時刻を変える", "雨を降らせて", "発電所を動かす"],
    },
  },
  {
    id: "sustainability",
    title: "Sustainability",
    answer:
      "Sustainability means meeting today's needs without taking away what people later will need. For energy, that's power from sources that don't run out or heat the planet, used carefully, and fairly shared, so a town can keep its lights on through heat, typhoons, and fuel price shocks.",
    asks: ["what is sustainability", "sustainable energy", "renewable energy", "why renewables", "green energy", "clean energy", "climate friendly power"],
    ja: {
      title: "持続可能性",
      answer:
        "持続可能性とは、将来の人が必要とするものを奪わずに、今の必要を満たすことです。エネルギーでいえば、なくならず地球を暖めない電源を、大切に、公平に使うこと。そうすれば町は、暑さや台風や燃料価格の高騰の中でも明かりを保てます。",
      asks: ["持続可能性とは", "持続可能なエネルギー", "再生可能エネルギー", "なぜ再エネ", "グリーンエネルギー", "クリーンエネルギー"],
    },
  },
  {
    id: "climate",
    title: "Climate change",
    answer:
      "Burning coal, oil, and gas adds carbon dioxide to the air, which traps heat and warms the planet. For the Philippines that means hotter days, stronger rain, and rising seas. Solar and wind make electricity without burning anything; the control room counts the CO₂ the plant avoids.",
    asks: ["what is climate change", "global warming", "carbon dioxide", "co2", "greenhouse gas", "why is it getting hotter"],
    place: PLACES.control,
    ja: {
      title: "気候変動",
      answer:
        "石炭、石油、ガスを燃やすと二酸化炭素が空気中に増え、熱を閉じこめて地球を暖めます。フィリピンでは、より暑い日、より強い雨、海面の上昇につながります。太陽光と風力は何も燃やさずに電気を作ります。コントロールルームでは、この発電所が減らしたCO₂を数えています。",
      asks: ["気候変動とは", "地球温暖化", "二酸化炭素", "温室効果ガス", "なぜ暑くなっている"],
    },
  },
  {
    id: "save",
    title: "Saving electricity at home",
    answer:
      "The big users in a Filipino home are aircon and the fridge. Set aircon a degree or two warmer, close doors and curtains on the sun, keep the fridge door shut and its coils clean, switch to LED bulbs, and unplug chargers and TVs at the wall. Fans use far less than aircon.",
    asks: ["how to save electricity", "lower my electric bill", "save energy at home", "tipid kuryente", "energy saving tips", "setsuden"],
    ja: {
      title: "家で電気を節約する",
      answer:
        "フィリピンの家で電気をたくさん使うのはエアコンと冷蔵庫です。エアコンの設定を1〜2度上げ、日の当たるドアやカーテンを閉め、冷蔵庫の扉は閉めて裏のコイルをきれいに。電球はLEDにし、充電器やテレビはコンセントから抜きましょう。扇風機はエアコンよりずっと少ない電気ですみます。",
      asks: ["電気を節約するには", "電気代を下げたい", "家で省エネ", "節電のコツ", "節電"],
    },
  },
  {
    id: "rooftop",
    title: "Solar on your own roof",
    answer:
      "A home can have its own panels. In the Philippines, the Renewable Energy Act of 2008 (RA 9513) set up net metering, so a small rooftop system can send its spare power to the utility for a credit. How much it pays back depends on the roof, the shade, and the rates, so ask an accredited installer for a site check.",
    asks: ["can i put solar on my house", "rooftop solar", "net metering", "solar for my home", "is solar worth it"],
    ja: {
      title: "自分の家の屋根に太陽光",
      answer:
        "家にも自分のパネルを付けられます。フィリピンでは2008年の再生可能エネルギー法(共和国法9513号)でネットメータリングができ、小さな屋根の設備は余った電気を電力会社に送ってクレジットにできます。元が取れるかは屋根、日陰、料金しだいなので、認定業者に現地を見てもらってください。",
      asks: ["家に太陽光を付けられる", "屋根の太陽光", "ネットメータリング", "家庭用太陽光", "太陽光はお得"],
    },
  },
  {
    id: "night",
    title: "Power at night",
    answer:
      "Solar makes nothing at night. Here, the battery covers the evening peak with sunlight stored during the day, the turbines help when there's wind, and the main grid fills the rest. Ask me what the battery is doing right now.",
    asks: ["what happens at night", "solar at night", "power when the sun sets", "no sun"],
    card: "battery",
    place: PLACES.battery,
    ja: {
      title: "夜の電気",
      answer:
        "夜、太陽光はまったく発電しません。ここでは、昼にためた太陽の光で蓄電池が夕方のピークを支え、風があればタービンが手伝い、残りは本線の系統が補います。今の蓄電池の様子を聞いてみてください。",
      asks: ["夜はどうなる", "夜の太陽光", "日が沈んだら電気は", "太陽がないとき"],
    },
  },
  {
    id: "typhoon",
    title: "Typhoons",
    answer:
      "In a typhoon the turbines feather their blades and brake so they survive, which means they make nothing; the clouds cut solar to a fraction. That's when storage, and being able to run as an island if the main grid goes down, matters most.",
    asks: ["what happens in a typhoon", "bagyo", "storm", "strong winds", "taifu"],
    card: "wind",
    place: PLACES.turbines,
    ja: {
      title: "台風",
      answer:
        "台風のとき、タービンは羽根を風に沿わせてブレーキをかけ、壊れないようにします。つまり発電はしません。雲で太陽光もわずかになります。蓄電池と、系統が止まったときに自立運転できることが、いちばん大切になるときです。",
      asks: ["台風のときはどうなる", "台風", "嵐", "強い風"],
    },
  },
  {
    id: "camp",
    title: "The campsite",
    answer: "Everyone wakes up at the tent on the meadow. You can sit in the camp chairs round the fire, click the fire to light it or put it out, and lie down in the sleeping bags.",
    asks: ["where is the tent", "campfire", "where did i start", "can i sleep", "camp"],
    place: PLACES.camp,
    ja: {
      title: "キャンプ場",
      answer:
        "みんな草原のテントのそばで目を覚まします。たき火のまわりのキャンプチェアに座ったり、たき火をクリックして火をつけたり消したり、寝袋で横になったりできます。",
      asks: ["テントはどこ", "たき火", "どこから始まった", "眠れる", "キャンプ"],
    },
  },
  {
    id: "voice",
    title: "Talking to people",
    answer: "Press Voice at the bottom to talk; people nearby hear you louder than people far away. Chat is next to it if you'd rather type. Gestures has waves, bows, and dances.",
    asks: ["how do i talk", "voice chat", "microphone", "how to chat", "gestures", "how do i wave"],
    ja: {
      title: "ほかの人と話す",
      answer:
        "下の「ボイス」を押すと話せます。近くの人ほど大きく聞こえます。文字で話したいときは、その隣の「チャット」へ。「ジェスチャー」には手を振る、お辞儀、ダンスなどがあります。",
      asks: ["どうやって話す", "ボイスチャット", "マイク", "チャットのしかた", "ジェスチャー", "手を振るには"],
    },
  },
];

/** Who Ilaw-san is, and small talk. */
const SELF: Topic[] = [
  {
    id: "joke",
    title: "A joke",
    answer: "Why did the solar panel get a good grade? It was a bright student. (I also know one about a battery, but it isn't charged up yet.)",
    asks: ["tell me a joke", "say something funny", "make me laugh", "joke", "biro"],
    ja: {
      title: "ジョーク",
      answer:
        "太陽光パネルがいい成績をとったのはなぜ?とっても「明るい」生徒だったから。(蓄電池のジョークもあるけれど、まだ充電中です。)",
      asks: ["ジョークを言って", "何かおもしろいこと", "笑わせて", "冗談"],
    },
  },
  {
    id: "fav",
    title: "My favourite",
    answer: "The battery at sunset: all day it quietly saves sunlight, and then at dusk it keeps the town's lights on. Ask me to walk you there.",
    asks: ["what is your favorite", "what do you like", "favourite exhibit", "best thing here"],
    place: PLACES.battery,
    ja: {
      title: "わたしのお気に入り",
      answer:
        "夕暮れの蓄電池です。一日じゅう静かに太陽の光をためて、日が暮れると町の明かりを守ります。そこまでご案内しましょうか。",
      asks: ["お気に入りは", "何が好き", "好きな展示", "ここでいちばんいいもの"],
    },
  },
];

export const TOPICS: Topic[] = [...cardTopics, ...FAQ, ...SELF];

/** What to suggest when someone doesn't know what to ask. */
export const STARTERS_JA = ["ここはどこ?", "今、蓄電池は何をしている?", "案内して", "太陽光パネルの仕組みは?", "エルニーニョって何?", "電気を節約するには?"];
export const STARTERS = ["What is this place?", "What's the battery doing now?", "Give me a tour", "How do solar panels work?", "What is El Niño?", "How can I save electricity?"];

// --- who she is --------------------------------------------------------------------------------

export const ILAW: Persona = {
  name: "Ilaw-san",
  self: "I'm Ilaw-san, Seizorai's guide. Ilaw means light in Filipino, and san is how you'd politely say someone's name in Japanese. You'll usually find me by the campfire where everyone arrives, and I can walk you to any exhibit. I'm not a chatbot that makes things up: everything I say was written for this world, so if I don't know, I'll say so.",
  invite: "Ask me about the sun, the wind, the battery, or the town, or ask for a tour.",
  nameJa: "イラウさん",
  selfJa:
    "イラウさんです。Seizoraiのガイドです。「イラウ」はフィリピン語で「光」、「さん」は日本語で人の名前をていねいに呼ぶときの言葉です。たいてい、みんなが到着するたき火のそばにいて、どの展示へも歩いてご案内できます。作り話をするチャットボットではありません。話すことはすべてこのワールドのために書かれたものなので、知らないことは知らないと言いますね。",
  inviteJa: "太陽、風、蓄電池、町のこと、何でも聞いてください。案内もできますよ。",
};

/** The model: Sendagaya Shino, a CC0 VRoid Studio sample (pixiv Inc.),
 *  fetched at build time with the other preset avatars. */
export const ILAW_AVATAR = "/avatars/vroid/sendagaya-shino.vrm";

/** Where visitors wake (world.json): by the tent, facing the fire. */
export const ILAW_FACES: [number, number] = [-13.03, 58.35];

/** Her day: mostly by the campfire where everyone arrives, with a short
 *  stroll across the meadow now and then. Home is the first stop. */
export const ILAW_ROUTE: Stop[] = (
  [
    [-9.0, 55.6, 300], // home: by the fire, clear of the camp chairs
    [-1.5, 44.5, 20], // the foot of the garden steps
    [-9.0, 55.6, 300],
    [3.5, 46.5, 20], // toward the turbines
  ] as [number, number, number][]
).map(([x, z, wait]) => ({ at: [x, -0.6, z], wait }));

// --- the live plant --------------------------------------------------------------------------------

/** The plant, as Ilaw-san reads it: null before it has started. */
export interface LiveReader {
  now(): {
    hour: number;
    soc: number;
    batteryMw: number;
    siliconMw: number;
    perovskiteMw: number;
    windMw: number;
    loadMw: number;
    gridMw: number;
    unservedMw: number;
    ambient: number;
    windSpeed: number;
    cloud: number;
    sunElevation: number;
    elNino: boolean;
    gridAlert: boolean;
  } | null;
  /** One line on what the plant is doing and why. */
  lesson(): string;
  co2TodayT(): number | null;
  weather(): string | null;
}

const f = (v: number, d = 2) => v.toFixed(d);

function liveIntents(l: LiveReader): LiveIntent[] {
  // Worried, not cheerful, when homes are going dark.
  const mood = (): Mood => {
    const s = l.now();
    return s && (s.unservedMw > 0.01 || s.gridAlert) ? "sad" : "neutral";
  };
  return [
    {
      test: /\b(battery|baterya|denchi|charge|stored)\b/,
      testJa: /(蓄電池|バッテリー|充電)/,
      answerJa: () => {
        const s = l.now();
        if (!s) return null;
        const doing = s.batteryMw < -0.01 ? `${f(-s.batteryMw)} MWで充電中` : s.batteryMw > 0.01 ? `町へ${f(s.batteryMw)} MWを放電中` : "待機中";
        return `蓄電池の充電率は${Math.round(s.soc * 100)}%で、${doing}です。`;
      },
      card: "battery",
      mood,
      answer: () => {
        const s = l.now();
        if (!s) return null;
        const doing = s.batteryMw < -0.01 ? `charging at ${f(-s.batteryMw)} MW` : s.batteryMw > 0.01 ? `discharging at ${f(s.batteryMw)} MW to the town` : "resting";
        return `The battery is ${Math.round(s.soc * 100)}% full and ${doing}.`;
      },
    },
    {
      test: /\b(solar|panels?|sun|araw|taiyou?)\b/,
      testJa: /(太陽|パネル|ソーラー|発電量)/,
      answerJa: () => {
        const s = l.now();
        if (!s) return null;
        if (s.sunElevation <= 0) return "日が沈んでいるので、今パネルは発電していません。蓄電池と系統が町を支えています。";
        return `パネルは${f(s.siliconMw + s.perovskiteMw)} MWを発電中です。シリコンが${f(s.siliconMw)}、ペロブスカイトの列が${f(s.perovskiteMw)}です。`;
      },
      card: "silicon",
      mood,
      answer: () => {
        const s = l.now();
        if (!s) return null;
        if (s.sunElevation <= 0) return "The sun is down, so the panels are making nothing right now. The battery and the grid are carrying the town.";
        return `The panels are making ${f(s.siliconMw + s.perovskiteMw)} MW: ${f(s.siliconMw)} from silicon and ${f(s.perovskiteMw)} from the perovskite row.`;
      },
    },
    {
      test: /\b(wind|hangin|kaze|turbines?)\b/,
      testJa: /(風|タービン)/,
      answerJa: () => {
        const s = l.now();
        return s ? `風速は${f(s.windSpeed, 1)} m/sで、タービンは${f(s.windMw)} MWを発電中です。` : null;
      },
      card: "wind",
      mood,
      answer: () => {
        const s = l.now();
        return s ? `The wind is ${f(s.windSpeed, 1)} m/s and the turbines are making ${f(s.windMw)} MW.` : null;
      },
    },
    {
      test: /\b(town|load|demand|homes?|using|consum)/,
      testJa: /(町|需要|家|使って|消費)/,
      answerJa: () => {
        const s = l.now();
        if (!s) return null;
        const dark = s.unservedMw > 0.01 ? `そのうち${f(s.unservedMw)} MWは供給できず、停電している家があります。` : "";
        return `町は今${f(s.loadMw)} MWを使っています。${dark}`;
      },
      card: "load",
      mood,
      answer: () => {
        const s = l.now();
        if (!s) return null;
        const dark = s.unservedMw > 0.01 ? ` ${f(s.unservedMw)} MW of it can't be served, so some homes are dark.` : "";
        return `The town is drawing ${f(s.loadMw)} MW.${dark}`;
      },
    },
    {
      test: /\b(grid|import|export|brownout)\b/,
      testJa: /(系統|受電|送電|停電)/,
      answerJa: () => {
        const s = l.now();
        if (!s) return null;
        const flow = s.gridMw > 0.01 ? `本線の系統から${f(s.gridMw)} MWを受電中` : s.gridMw < -0.01 ? `本線の系統へ${f(-s.gridMw)} MWを送電中` : "本線の系統とはやりとりしていません";
        return `発電所は${flow}です。${s.gridAlert ? "暑さで電力が足りず、本線の系統は警報中です。" : ""}`;
      },
      card: "grid",
      mood,
      answer: () => {
        const s = l.now();
        if (!s) return null;
        const flow = s.gridMw > 0.01 ? `importing ${f(s.gridMw)} MW from the main grid` : s.gridMw < -0.01 ? `exporting ${f(-s.gridMw)} MW to the main grid` : "not trading with the main grid";
        return `The plant is ${flow}.${s.gridAlert ? " The main grid is on alert, short of power in the heat." : ""}`;
      },
    },
    {
      test: /\b(weather|temperature|hot|rain|cloudy|panahon|init|ulan|tenki)\b/,
      testJa: /(天気|気温|暑い|雨|曇り)/,
      answerJa: () => {
        const s = l.now();
        if (!s) return null;
        const w = withLang("ja", () => l.weather());
        return `気温は${Math.round(s.ambient)} °C${w ? `、${w}` : ""}で、雲量は${Math.round(s.cloud * 100)}%です。${s.elNino ? "「エルニーニョ2026」シナリオが有効です。" : ""}`;
      },
      card: "sky",
      answer: () => {
        const s = l.now();
        if (!s) return null;
        const w = l.weather();
        return `It's ${Math.round(s.ambient)} °C${w ? ` and ${w}` : ""}, with ${Math.round(s.cloud * 100)}% cloud.${s.elNino ? " The El Niño 2026 scenario is on." : ""}`;
      },
    },
    {
      test: /\b(co2|carbon|emission|avoided)\b/,
      testJa: /(二酸化炭素|排出|削減)/,
      answerJa: () => {
        const t = l.co2TodayT();
        return t === null ? null : `過去24時間で、同じ電気を系統から使った場合とくらべて約${f(t, 1)}トンのCO₂を減らしました。`;
      },
      card: "grid",
      answer: () => {
        const t = l.co2TodayT();
        return t === null ? null : `Over the last 24 hours the plant has avoided about ${f(t, 1)} tonnes of CO₂, compared with the same power from the grid.`;
      },
    },
    {
      test: /\b(happening|going on|status|doing|update|nangyayari)\b/,
      testJa: /(どうなって|何が起き|様子|状況)/,
      mood,
      answer: () => (l.now() ? withLang("en", () => l.lesson()) : null),
      answerJa: () => (l.now() ? withLang("ja", () => l.lesson()) : null),
    },
  ];
}

/** Seizorai's knowledge, reading the live plant through `live`. */
export function seizoraiKnowledge(live: LiveReader): Knowledge {
  return {
    topics: TOPICS,
    starters: STARTERS,
    startersJa: STARTERS_JA,
    subject: "the sun, the wind, the battery, the town, and getting around",
    subjectJa: "太陽、風、蓄電池、町、そして移動のこと",
    live: liveIntents(live),
    liveSuggestions: ["What's happening right now?", "Take me to the control room"],
    liveSuggestionsJa: ["今どうなっている?", "コントロールルームに連れて行って"],
    synonyms: {
      baterya: "battery", denchi: "battery", setsuden: "save", solar: "solar", photovoltaic: "pv", panels: "panel", turbines: "turbine", windmill: "turbine",
      windmills: "turbine", batteries: "battery", aircon: "aircon", ac: "aircon", airconditioner: "aircon", emissions: "co2", carbon: "co2", nino: "nino",
      elnino: "nino", storage: "battery", charge: "battery", soc: "battery",
    },
    cardTitle: (card, lang) => withLang(lang, () => INFO[card as InfoKey]?.title ?? card),
    topicStyle: {
      joke: { gesture: "cheer", mood: "happy" },
      fav: { gesture: "point", mood: "happy" },
      tour: { gesture: "raisehand", mood: "happy" },
      save: { gesture: "raisehand", mood: "happy" },
      climate: { gesture: "nod", mood: "neutral" },
    },
  };
}
