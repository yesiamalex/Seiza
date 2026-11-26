// Seishore's people: who they are, how they look (designed avatars, built
// in code, so there's nothing to download), where they spend their day,
// and what they say now and then (Japanese, with English under it). What
// they know is the same for all of them (knowledge.ts), each in their own
// voice. Lightweight: no language model, the guides' own small retriever,
// answering from what's written here.
import type { Persona } from "../../../src/guides/brain";
import type { Chatter } from "../../../src/guides/Guide";
import type { Stop } from "../../../src/guides/route";
import { encodeAvatarSpec, type AvatarSpec } from "../../../src/avatar/designer/avatarSpec";
import { at, type Node } from "./plan";

export interface Townsperson {
  id: string;
  name: string;
  role: string;
  persona: Persona;
  avatar: string;
  stops: Stop[];
  /** Metres a second on their round: a stroll is about 1. */
  speed: number;
  faceAt?: [number, number];
  chatter: Chatter[];
}

const look = (spec: Partial<AvatarSpec>): string =>
  encodeAvatarSpec({
    skin: "#eec1a0",
    hairStyle: "short",
    hairColor: "#1f1a17",
    eyeColor: "#2e2118",
    top: "tshirt",
    topColor: "#4f8fc9",
    bottom: "pants",
    bottomColor: "#2f3b52",
    shoeColor: "#f2f0eb",
    accessories: [],
    accessoryColor: "#1f1f1f",
    height: 1,
    build: 1,
    shoulders: 1,
    waist: 0.9,
    ...spec,
  });

const round = (...stops: [Node, number][]): Stop[] => stops.map(([node, wait]) => ({ at: at(node), wait }));

const INVITE = "Ask me about the town, the konbini, the sea, the shrine, or how to say something in Japanese.";
const INVITE_JA = "町のこと、コンビニ、海、神社、日本語の言い方、何でも聞いてね。";

export const PEOPLE: Townsperson[] = [
  {
    id: "haruka",
    name: "Haruka",
    role: "clerk",
    persona: {
      name: "Haruka",
      nameJa: "はるか",
      self: "I'm Haruka. I work the counter at Umi Mart, the konbini on the corner, mostly evenings, while I study. Everyone in town comes through here sooner or later.",
      selfJa: "はるかです。角のコンビニ「うみマート」で、だいたい夜、レジに立っています。大学に通いながらね。町の人はみんな、いつかはここに来ますよ。",
      invite: INVITE,
      inviteJa: INVITE_JA,
    },
    avatar: look({ hairStyle: "ponytail", hairColor: "#3a2a20", top: "longsleeve", topColor: "#2bb3a3", bottom: "pants", bottomColor: "#1d2433", accessories: ["cap"], accessoryColor: "#2bb3a3", height: 0.95, build: 0.92, shoulders: 0.88, waist: 0.8 }),
    stops: round(["clerk", 600]),
    speed: 0.8,
    faceAt: [19.4, 53.5],
    chatter: [
      { ja: "いらっしゃいませー!", en: "Welcome in!" },
      { ja: "温めますか?", en: "Shall I heat that up for you?" },
      { ja: "袋はご利用ですか?", en: "Would you like a bag?" },
      { ja: "ありがとうございましたー!", en: "Thank you very much!" },
    ],
  },
  {
    id: "mio",
    name: "Mio",
    role: "café",
    persona: {
      name: "Mio",
      nameJa: "美緒",
      self: "I'm Mio. I run Shiosai, the little café on the street: shiosai means the sound of the waves. Coffee, and a shirasu bowl when the boats bring it in.",
      selfJa: "美緒です。通りの小さなカフェ「潮騒」をやっています。潮騒は波の音のこと。コーヒーと、船がしらすを揚げた日はしらす丼をどうぞ。",
      invite: INVITE,
      inviteJa: INVITE_JA,
    },
    avatar: look({ hairStyle: "bob", hairColor: "#4a2f22", top: "blazer", topColor: "#e8c37a", bottom: "skirt", bottomColor: "#3d7a5a", accessories: ["glasses"], accessoryColor: "#4a2f22", height: 0.97, build: 0.95, shoulders: 0.9, waist: 0.82 }),
    stops: round(["barista", 600]),
    faceAt: [4.3, 53.5],
    speed: 0.8,
    chatter: [
      { ja: "いらっしゃいませ、どうぞ!", en: "Welcome, come on in!" },
      { ja: "今日のおすすめはしらす丼です。", en: "Today's special is a whitebait rice bowl." },
      { ja: "コーヒー、いかがですか?", en: "How about a coffee?" },
      { ja: "海、きれいでしょう?", en: "Lovely, the sea, isn't it?" },
    ],
  },
  {
    id: "genji",
    name: "Genji-san",
    role: "fisherman",
    persona: {
      name: "Genji-san",
      nameJa: "源さん",
      self: "Genji. Been fishing off this beach fifty years: shirasu mostly, the little whitebait the Shonan coast is known for. Up before the sun, done by noon.",
      selfJa: "源だよ。この浜で五十年、漁をしてる。だいたいしらすだな、湘南名物の小さいやつ。日の出前に出て、昼には終わりだ。",
      invite: "Ask me about the sea, the fish, or the town. I'll tell you what I know.",
      inviteJa: "海のこと、魚のこと、町のこと、知ってることなら話すよ。",
    },
    avatar: look({ skin: "#d9a07a", hairStyle: "buzz", hairColor: "#e7e2dc", top: "longsleeve", topColor: "#2f3b52", bottom: "pants", bottomColor: "#6b6f78", shoeColor: "#1f1f1f", accessories: ["cap"], accessoryColor: "#f2f0eb", height: 0.94, build: 1.05, shoulders: 1.05, waist: 1.05 }),
    stops: round(["boats", 300], ["beach", 40]),
    speed: 0.6,
    faceAt: [44, 50],
    chatter: [
      { ja: "今日は波が穏やかだねえ。", en: "The sea's calm today." },
      { ja: "しらす、食べたことあるかい?", en: "Ever had shirasu?" },
      { ja: "朝が一番いい時間だよ。", en: "Morning's the best time of day." },
      { ja: "とんびに気をつけな、食べ物取られるぞ。", en: "Mind the kites: they'll take your food." },
    ],
  },
  {
    id: "kaito",
    name: "Kaito",
    role: "surfer",
    persona: {
      name: "Kaito",
      nameJa: "海斗",
      self: "Kaito! I work at Kaze Surf and I'm in the water most mornings. Winter's the best: the beach is empty and the swell's good.",
      selfJa: "海斗です!「風サーフ」で働いてて、朝はだいたい海にいます。冬が最高。ビーチはすいてるし、波もいい。",
      invite: INVITE,
      inviteJa: INVITE_JA,
    },
    avatar: look({ skin: "#b87a55", hairStyle: "short", hairColor: "#8a5a33", top: "hoodie", topColor: "#1d2433", bottom: "shorts", bottomColor: "#4f8fc9", shoeColor: "#1f1f1f", height: 1.05, build: 1.02, shoulders: 1.1, waist: 0.88 }),
    stops: round(["surf", 60], ["laneEast", 0], ["rail", 0], ["crossing", 0], ["gapLand", 0], ["wallGap", 0], ["beach", 90], ["wallGap", 0], ["gapLand", 0], ["crossing", 0], ["rail", 0], ["laneEast", 0]),
    speed: 1.05,
    chatter: [
      { ja: "いい波来てるよ!", en: "Good waves coming in!" },
      { ja: "冬の海はすいてて最高。", en: "The sea in winter: empty, and the best." },
      { ja: "ウェットスーツは五ミリね。", en: "A five-millimetre wetsuit, mind." },
    ],
  },
  {
    id: "sato",
    name: "Satō-san",
    role: "neighbour",
    persona: {
      name: "Satō-san",
      nameJa: "佐藤さん",
      self: "I'm Satō. I've lived on this street all my life, and I look after the little shrine up by the meadow: I sweep it every morning.",
      selfJa: "佐藤です。ずっとこの通りに住んでいて、原っぱの上の小さな神社のお世話をしているの。毎朝お掃除してるのよ。",
      invite: "Ask me about the shrine, the town, or anything you like, dear.",
      inviteJa: "神社のこと、町のこと、何でも聞いてちょうだい。",
    },
    avatar: look({ skin: "#f6d7c3", hairStyle: "bun", hairColor: "#e7e2dc", top: "longsleeve", topColor: "#8c2f39", bottom: "skirt", bottomColor: "#2f3b52", shoeColor: "#6b6f78", height: 0.9, build: 0.95, shoulders: 0.88, waist: 0.98 }),
    stops: round(["shrine", 120], ["torii", 0], ["camp", 0], ["laneWest", 0], ["arrive", 0], ["dinerDoor", 0], ["cafe", 40], ["dinerDoor", 0], ["arrive", 0], ["laneWest", 0], ["camp", 0], ["torii", 0]),
    speed: 0.6,
    chatter: [
      { ja: "こんにちは、いいお天気ですね。", en: "Hello, lovely weather today." },
      { ja: "神社にお参りしていってね。", en: "Do pay a visit at the shrine." },
      { ja: "気をつけてね。", en: "Take care, now." },
      { ja: "風鈴の音、涼しいでしょう。", en: "The wind chimes: a cool sound, isn't it?" },
    ],
  },
  {
    id: "yuto",
    name: "Yūto",
    role: "student",
    persona: {
      name: "Yūto",
      nameJa: "悠斗",
      self: "Yūto, second year at the high school up the hill. After club practice I always get something at the konbini and eat it on the sea wall.",
      selfJa: "悠斗です。丘の上の高校の二年。部活のあとは、いつもコンビニで何か買って、堤防で食べるんだ。",
      invite: INVITE,
      inviteJa: INVITE_JA,
    },
    avatar: look({ hairStyle: "short", hairColor: "#1f1a17", top: "blazer", topColor: "#1d2433", bottom: "pants", bottomColor: "#1d2433", accessories: ["tie", "headphones"], accessoryColor: "#8c2f39", height: 1.02, build: 0.95, shoulders: 0.98, waist: 0.85 }),
    stops: round(
      ["arrive", 30],
      ["dinerDoor", 0],
      ["cafe", 0],
      ["cafeDoor", 0],
      ["laneMid", 0],
      ["fish", 0],
      ["konbiniDoor", 0],
      ["konbiniIn", 12],
      ["konbiniDoor", 0],
      ["laneEast", 0],
      ["rail", 0],
      ["crossing", 0],
      ["gapLand", 0],
      ["promenadeSouth", 40],
      ["gapLand", 0],
      ["crossing", 0],
      ["rail", 0],
      ["laneEast", 0],
      ["konbiniDoor", 0],
      ["fish", 0],
      ["laneMid", 0],
      ["cafeDoor", 0],
      ["cafe", 0],
      ["dinerDoor", 0]
    ),
    speed: 1.1,
    chatter: [
      { ja: "やばい、遅れる!", en: "Oh no, I'll be late!" },
      { ja: "部活のあとのアイス、最高。", en: "Ice cream after practice: the best." },
      { ja: "電車、何分だっけ?", en: "What time's the train again?" },
    ],
  },
];

// --- the chef, and people who are just here ---------------------------------------------

/** The family restaurant's chef, at the pass: someone you can talk to. */
export const CHEF: Townsperson = {
  id: "chef",
  name: "Takeda-san",
  role: "chef",
  persona: {
    name: "Takeda-san",
    nameJa: "武田さん",
    self: "Takeda, the cook at Hama Kitchen. Family restaurants are for everyone: kids, students doing homework over the drink bar, grandparents after the shrine. Today's set is horse mackerel, fried.",
    selfJa: "はまキッチンの料理長、武田です。ファミレスはみんなのもの。子どもも、ドリンクバーで宿題する学生も、お参り帰りのおじいちゃんおばあちゃんも。今日の定食はアジフライですよ。",
    invite: "Ask me about the food, the town, or anything you like.",
    inviteJa: "料理のこと、町のこと、何でもどうぞ。",
  },
  avatar: look({ skin: "#e8b590", hairStyle: "buzz", hairColor: "#1f1a17", top: "longsleeve", topColor: "#f2f0eb", bottom: "pants", bottomColor: "#1f1f1f", shoeColor: "#1f1f1f", accessories: ["cap"], accessoryColor: "#f2f0eb", height: 1.0, build: 1.08, shoulders: 1.06, waist: 1.05 }),
  stops: round(["chef", 600]),
  speed: 0.8,
  faceAt: [4.6, 57.5],
  chatter: [
    { ja: "へい、いらっしゃい!", en: "Hey, welcome in!" },
    { ja: "アジフライ定食、あがり!", en: "Horse mackerel set, up!" },
    { ja: "熱いから気をつけてね。", en: "Careful, it's hot." },
  ],
};

export interface Extra {
  avatar: string;
  chatter?: Chatter[];
}

/** Customers, at the seats plan.ts keeps for them (CUSTOMER_SEATS). */
export const CUSTOMERS: Record<string, Extra> = {
  "seishore-cafe-0-w": {
    avatar: look({ hairStyle: "long", hairColor: "#4a2f22", top: "longsleeve", topColor: "#e8c37a", bottom: "skirt", bottomColor: "#2f3b52", accessories: ["glasses"], height: 0.96, build: 0.92, shoulders: 0.88, waist: 0.8 }),
    chatter: [
      { ja: "このコーヒー、おいしい。", en: "This coffee's good." },
      { ja: "窓から海が見えるの、いいね。", en: "Nice, seeing the sea from the window." },
    ],
  },
  "seishore-diner-0-n": {
    avatar: look({ skin: "#d9a07a", hairStyle: "short", hairColor: "#1f1a17", top: "hoodie", topColor: "#3d7a5a", height: 1.0 }),
    chatter: [
      { ja: "ドリンクバー行ってくる。", en: "I'm going to the drink bar." },
      { ja: "宿題、あと少し…", en: "Homework, nearly done…" },
    ],
  },
  "seishore-diner-1-s": { avatar: look({ hairStyle: "bun", hairColor: "#e7e2dc", top: "longsleeve", topColor: "#8c2f39", bottom: "skirt", height: 0.9, waist: 1.0 }) },
  "seishore-diner-1-n": {
    avatar: look({ hairStyle: "buzz", hairColor: "#e7e2dc", top: "blazer", topColor: "#6b6f78", height: 0.95, build: 1.02, waist: 1.02 }),
    chatter: [{ ja: "お参りのあとはここに限る。", en: "After the shrine, it has to be here." }],
  },
  "seishore-diner-2-s": {
    avatar: look({ hairStyle: "ponytail", hairColor: "#8a5a33", top: "tshirt", topColor: "#e993b8", bottom: "shorts", height: 0.9, build: 0.9 }),
    chatter: [{ ja: "おいしい!", en: "Delicious!" }],
  },
};

/** The drivers, in uniform and cap; and passengers along for the ride. */
export const DRIVER = look({ hairStyle: "short", hairColor: "#1f1a17", top: "blazer", topColor: "#1d2433", bottom: "pants", bottomColor: "#1d2433", shoeColor: "#1f1f1f", accessories: ["cap", "tie"], accessoryColor: "#1d2433" });
export const PASSENGERS = [
  look({ hairStyle: "bob", hairColor: "#1f1a17", top: "blazer", topColor: "#2f3b52", bottom: "skirt", bottomColor: "#2f3b52", accessories: ["tie"], accessoryColor: "#8c2f39", height: 0.95, build: 0.92 }),
  look({ hairStyle: "none", top: "longsleeve", topColor: "#6b6f78", bottom: "pants", accessories: ["glasses"], height: 0.98, build: 1.04, waist: 1.08 }),
  look({ skin: "#b87a55", hairStyle: "short", hairColor: "#8a5a33", top: "hoodie", topColor: "#4f8fc9", bottom: "shorts", height: 1.04 }),
];
