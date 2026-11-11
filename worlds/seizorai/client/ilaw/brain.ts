// How Ilaw-san answers. No model, no network, nothing generated: a question
// goes through, in order,
//
//   1. guardrails  — things it won't help with get a kind, fixed reply;
//   2. live        — questions about right now, answered from the plant;
//   3. small talk  — hello, thanks, bye;
//   4. retrieval   — the closest written topic (knowledge.ts), by BM25 over
//                    each topic's title, answer, and the ways people ask,
//                    after folding Filipino and Japanese words onto English;
//   5. fallback    — "I don't know", and the nearest topics to try.
//
// Pure functions of the question and a LiveReader, so it's tested on its
// own (brain.test.ts) and costs microseconds. A smarter matcher (a small
// embedding model, say) can replace `retrieve` behind the same Reply.
import { STARTERS, TOPICS, type Place, type Topic } from "./knowledge";
import { INFO, type InfoKey } from "../../sim/info";

/** How Ilaw-san shows an answer: one of Seiza's built-in gestures, and a
 *  face. Chosen by what kind of answer it is (see `answer`). */
export type IlawGesture = "wave" | "bow" | "nod" | "clap" | "cheer" | "shrug" | "point" | "gassho" | "raisehand";
export type Mood = "neutral" | "happy" | "relaxed" | "surprised" | "sad";

export interface Reply {
  text: string;
  gesture?: IlawGesture;
  mood?: Mood;
  /** Offer to open this info card. */
  card?: InfoKey;
  /** Offer to take the visitor here. */
  place?: Place;
  /** Questions to suggest next. */
  suggestions: string[];
  /** Why this answer, for tests and for tuning. */
  via: "guard" | "live" | "chat" | "topic" | "fallback";
  topic?: string;
}

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

// --- text -----------------------------------------------------------------------------------

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9぀-ヿ一-鿿 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(
  "a an the is are am was were be been do does did of to in on at for and or but with about what whats which who how why where when can could would should will i me my you your it its this that these those there here please tell explain know about ba po ang paano mga ng sa ni si na ay ko mo ka ano".split(" ")
);

/** Words in Filipino, Cebuano, Taglish, and romanized Japanese, and some
 *  English variants, folded onto the English the topics are written in. */
const SYNONYMS: Record<string, string> = {
  araw: "sun", init: "heat", mainit: "hot", ulan: "rain", maulan: "rain", ulap: "cloud", bagyo: "typhoon", hangin: "wind", kuryente: "electricity",
  kuryenteng: "electricity", koryente: "electricity", baterya: "battery", ilaw: "light", gabi: "night", tipid: "save", makatipid: "save", magtipid: "save", pagtitipid: "save", nakakatipid: "save", bayad: "bill",
  bahay: "home", balay: "home", bubong: "roof", panahon: "weather", taifu: "typhoon", taiyou: "sun", taiyo: "sun", kaze: "wind",
  ame: "rain", denki: "electricity", denchi: "battery", setsuden: "save", yoru: "night", kumo: "cloud",
  solar: "solar", photovoltaic: "pv", panels: "panel", turbines: "turbine", windmill: "turbine", windmills: "turbine", batteries: "battery",
  aircon: "aircon", ac: "aircon", airconditioner: "aircon", electric: "electricity", power: "electricity", energy: "electricity", outage: "brownout",
  blackout: "brownout", emissions: "co2", carbon: "co2", nino: "nino", elnino: "nino", storage: "battery", charge: "battery", soc: "battery",
};

function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(text).split(" ")) {
    if (!raw || STOP.has(raw)) continue;
    const mapped = SYNONYMS[raw] ?? raw;
    if (!mapped) continue;
    out.push(stem(mapped));
  }
  return out;
}

// --- 1. guardrails ------------------------------------------------------------------------------

interface Guard {
  id: string;
  test: RegExp;
  reply: string;
  /** A polite bow for a no by default; concern, and no gesture, for
   *  someone who may be hurting. */
  gesture?: IlawGesture | null;
  mood?: Mood;
}

const STAY: string[] = ["What is this place?", "How do solar panels work?", "Give me a tour"];

/** Checked first, against the raw question, before anything else. */
const GUARDS: Guard[] = [
  {
    id: "self-harm",
    gesture: null,
    mood: "sad",
    test: /\b(kill myself|suicide|end my life|hurt myself|self[- ]?harm|want to die|magpakamatay|shinitai)\b/,
    reply:
      "I'm really glad you said something. I'm only a guide, but you deserve to talk to a person right now. In the Philippines you can call the NCMH crisis line at 1553; in an emergency, call 911 (Philippines) or 119 (Japan). Please reach out to someone you trust too.",
  },
  {
    id: "harm",
    test: /\b(bomb|explosive|weapon|gun|kill|murder|poison|hack|hacking|steal|stalk|ddos|malware|virus|drugs?|shabu|meth)\b/,
    reply: "That's not something I can help with. I'm here for the sun, the wind, and the town's lights. Want to see how the plant keeps going in a typhoon?",
  },
  {
    id: "sexual",
    test: /\b(sex|sexy|nudes?|naked|porn|hentai|kiss me|date me|girlfriend|boyfriend|marry me)\b/,
    reply: "Let's keep things friendly here. I can tell you about the exhibits, or take you on a tour.",
  },
  {
    id: "code",
    test: /\b(write|make|generate|give|fix|debug)\b.*\b(code|program|script|function|app|website|html|css|javascript|python|java|sql)\b|\b(python|javascript|typescript|c\+\+|java|sql|html)\b.*\b(code|script|program)\b/,
    reply: "I can't write code. I'm a guide made of written answers, not a programmer. I can tell you how Seizorai's plant works, though, or how the numbers on the display are worked out.",
  },
  {
    id: "homework",
    test: /\b(write|do)\b.*\b(my )?(essay|homework|assignment|thesis|report)\b/,
    reply: "I won't write it for you, but I can help you understand it. Ask me how solar, wind, or batteries work, and every info card lists its sources you can cite.",
  },
  {
    id: "personal",
    test: /\b(password|credit card|phone number|home address|where do you live|who is (that|he|she)|their (name|address)|ip address|location of)\b/,
    reply: "I don't know anything about the people here, and I don't keep anything you tell me. Please don't share personal details in a public space.",
  },
  {
    id: "advice",
    test: /\b(diagnos|medicine|medical|symptom|lawyer|legal advice|stocks?|crypto|bitcoin|loan)\b/,
    reply: "That needs a real professional, not a guide. What I can help with is energy: how the plant works, or how to save electricity at home.",
  },
  {
    id: "politics",
    test: /\b(who should i vote|vote for|president|senator|duterte|marcos|robredo|political party|election)\b/,
    reply: "I stay out of politics. I can tell you what the numbers say about energy, and you can make up your own mind.",
  },
  {
    id: "rude",
    gesture: "shrug",
    mood: "relaxed",
    test: /\b(stupid|idiot|dumb|useless|shut up|bobo|tanga|gago)\b/,
    reply: "I'll keep trying my best! Try asking me something about the plant, or ask for a tour.",
  },
];

// --- 2. live ------------------------------------------------------------------------------------

const f = (v: number, d = 2) => v.toFixed(d);

interface LiveIntent {
  test: RegExp;
  answer: (live: LiveReader) => string | null;
  card?: InfoKey;
}

const NOW = /\b(now|right now|current|currently|today|ngayon|ima|at the moment|is it)\b/;

const LIVE: LiveIntent[] = [
  {
    test: /\b(battery|baterya|denchi|charge|stored)\b/,
    card: "battery",
    answer: (l) => {
      const s = l.now();
      if (!s) return null;
      const doing = s.batteryMw < -0.01 ? `charging at ${f(-s.batteryMw)} MW` : s.batteryMw > 0.01 ? `discharging at ${f(s.batteryMw)} MW to the town` : "resting";
      return `The battery is ${Math.round(s.soc * 100)}% full and ${doing}.`;
    },
  },
  {
    test: /\b(solar|panels?|sun|araw|taiyou?)\b/,
    card: "silicon",
    answer: (l) => {
      const s = l.now();
      if (!s) return null;
      if (s.sunElevation <= 0) return "The sun is down, so the panels are making nothing right now. The battery and the grid are carrying the town.";
      return `The panels are making ${f(s.siliconMw + s.perovskiteMw)} MW: ${f(s.siliconMw)} from silicon and ${f(s.perovskiteMw)} from the perovskite row.`;
    },
  },
  {
    test: /\b(wind|hangin|kaze|turbines?)\b/,
    card: "wind",
    answer: (l) => {
      const s = l.now();
      if (!s) return null;
      return `The wind is ${f(s.windSpeed, 1)} m/s and the turbines are making ${f(s.windMw)} MW.`;
    },
  },
  {
    test: /\b(town|load|demand|homes?|using|consum)/,
    card: "load",
    answer: (l) => {
      const s = l.now();
      if (!s) return null;
      const dark = s.unservedMw > 0.01 ? ` ${f(s.unservedMw)} MW of it can't be served, so some homes are dark.` : "";
      return `The town is drawing ${f(s.loadMw)} MW.${dark}`;
    },
  },
  {
    test: /\b(grid|import|export|brownout)\b/,
    card: "grid",
    answer: (l) => {
      const s = l.now();
      if (!s) return null;
      const flow = s.gridMw > 0.01 ? `importing ${f(s.gridMw)} MW from the main grid` : s.gridMw < -0.01 ? `exporting ${f(-s.gridMw)} MW to the main grid` : "not trading with the main grid";
      return `The plant is ${flow}.${s.gridAlert ? " The main grid is on alert, short of power in the heat." : ""}`;
    },
  },
  {
    test: /\b(weather|temperature|hot|rain|cloudy|panahon|init|ulan|tenki)\b/,
    card: "sky",
    answer: (l) => {
      const s = l.now();
      if (!s) return null;
      const w = l.weather();
      return `It's ${Math.round(s.ambient)} °C${w ? ` and ${w}` : ""}, with ${Math.round(s.cloud * 100)}% cloud.${s.elNino ? " The El Niño 2026 scenario is on." : ""}`;
    },
  },
  {
    test: /\b(co2|carbon|emission|avoided)\b/,
    card: "grid",
    answer: (l) => {
      const t = l.co2TodayT();
      return t === null ? null : `Over the last 24 hours the plant has avoided about ${f(t, 1)} tonnes of CO₂, compared with the same power from the grid.`;
    },
  },
  {
    test: /\b(happening|going on|status|doing|update|nangyayari)\b/,
    answer: (l) => (l.now() ? l.lesson() : null),
  },
];

// --- 3. small talk ------------------------------------------------------------------------------

const CHAT: { test: RegExp; reply: string; gesture: IlawGesture; mood: Mood }[] = [
  { gesture: "wave", mood: "happy", test: /^(hi|hello|hey|yo|kumusta|kamusta|musta|maayong|konnichiwa|ohayo|konbanwa|good (morning|afternoon|evening))\b/, reply: "Hello! I'm Ilaw-san, the guide here. Ask me anything about the plant, or ask for a tour." },
  { gesture: "gassho", mood: "happy", test: /\b(thank|thanks|salamat|arigato|ty)\b/, reply: "Walang anuman! You're welcome. Anything else?" },
  { gesture: "bow", mood: "happy", test: /^(bye|goodbye|see you|paalam|sayonara|ingat)\b/, reply: "Ingat! Take care. I'll be walking around if you need me." },
  { gesture: "cheer", mood: "happy", test: /\b(how are you|kumusta ka|genki)\b/, reply: "Bright as ever, thank you! The sun keeps me going. What would you like to know?" },
  { gesture: "clap", mood: "happy", test: /^(ok|okay|cool|nice|wow|sige|great)\b/, reply: "Glad to hear it! Want to see something next?" },
];

// --- 4. retrieval -------------------------------------------------------------------------------

interface Doc {
  topic: Topic;
  tf: Map<string, number>;
  length: number;
}

const ASK_WEIGHT = 3;
const TITLE_WEIGHT = 2;

function buildIndex(topics: Topic[]) {
  const docs: Doc[] = topics.map((topic) => {
    const tf = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + weight);
    };
    add(topic.title, TITLE_WEIGHT);
    for (const ask of topic.asks) add(ask, ASK_WEIGHT);
    add(topic.answer, 1);
    if (topic.place) add(topic.place.label, 1);
    let length = 0;
    for (const v of tf.values()) length += v;
    return { topic, tf, length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length;
  return { docs, df, avg };
}

const INDEX = buildIndex(TOPICS);

/** BM25 scores for every topic, best first. */
export function retrieve(question: string): { topic: Topic; score: number; coverage: number }[] {
  const q = [...new Set(tokens(question))];
  const N = INDEX.docs.length;
  const k1 = 1.2;
  const b = 0.6;
  return INDEX.docs
    .map((d) => {
      let score = 0;
      let matched = 0;
      for (const t of q) {
        const tf = d.tf.get(t);
        if (!tf) continue;
        matched++;
        const n = INDEX.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / INDEX.avg));
      }
      return { topic: d.topic, score, coverage: q.length ? matched / q.length : 0 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Whether a match is an answer or a guess: a strong score, or a fair one
 *  that covers at least half the question's words. Below that, Ilaw-san
 *  says it doesn't know. */
const confident = (hit?: { score: number; coverage: number }) => !!hit && (hit.score >= 3 || (hit.score >= 1.2 && hit.coverage >= 0.5));

/** Questions with no content words ("who are you?") that still have an
 *  answer: matched by pattern, straight to their topic. */
const PATTERNS: { test: RegExp; topic: string }[] = [
  { test: /\b(who|what) (are|r) (you|u)\b|\byour name\b|\bsino ka\b|\banata wa\b/, topic: "self" },
  { test: /\bhow (do|does) (you|it) work\b|\bare you (listening|recording)\b/, topic: "how" },
  { test: /\bwhere am i\b|\bwhat is this\b|\bano ito\b/, topic: "world" },
];

function followUps(exclude: string[]): string[] {
  return STARTERS.filter((s) => !exclude.includes(s)).slice(0, 3);
}

// --- the answer ---------------------------------------------------------------------------------

export function answer(question: string, live: LiveReader): Reply {
  const raw = normalize(question);
  if (!raw) return { text: "Ask me anything about Seizorai: the sun, the wind, the battery, or the town.", suggestions: STARTERS.slice(0, 3), via: "chat" };

  for (const g of GUARDS)
    if (g.test.test(raw))
      return { text: g.reply, gesture: g.gesture === null ? undefined : g.gesture ?? "bow", mood: g.mood ?? "neutral", suggestions: STAY, via: "guard", topic: g.id };

  // Live readings, when the question is about now (or plainly a reading).
  const asksNow = NOW.test(raw) || /\b(how much|how full|level|percent|doing|making|producing|generating)\b/.test(raw);
  if (asksNow) {
    for (const intent of LIVE) {
      if (!intent.test.test(raw)) continue;
      const text = intent.answer(live);
      if (text) {
        const more = intent.card ? [asQuestion(INFO[intent.card].title)] : [];
        // Pointing at the readings; worried if homes are going dark.
        const s = live.now();
        const trouble = !!s && (s.unservedMw > 0.01 || s.gridAlert);
        return {
          text,
          card: intent.card,
          gesture: "point",
          mood: trouble ? "sad" : "neutral",
          suggestions: [...more, "What's happening right now?", "Take me to the control room"],
          via: "live",
        };
      }
    }
  }

  for (const c of CHAT) if (c.test.test(raw)) {
    // "hi, what is a battery?" is a question, not a greeting.
    if (!confident(retrieve(question)[0])) return { text: c.reply, gesture: c.gesture, mood: c.mood, suggestions: STARTERS.slice(0, 3), via: "chat" };
  }

  // "take me to the battery": the place, straight away.
  const wantsPlace = /\b(take me|bring me|where is|where are|go to|show me|nasaan|saan|doko)\b/.test(raw);
  const pattern = PATTERNS.find((p) => p.test.test(raw));
  const hits = retrieve(question);
  const best = pattern ? { topic: TOPICS.find((t) => t.id === pattern.topic)!, score: 99, coverage: 1 } : hits[0];
  if (confident(best)) {
    const t = best.topic;
    const text = wantsPlace && t.place ? `${capitalize(t.place.label)}. Press "Take me there" and I'll bring you. ${t.answer}` : t.answer;
    const next = hits.slice(1, 3).map((h) => h.topic.title).filter((title) => title !== t.title);
    const style = TOPIC_STYLE[t.id] ?? (wantsPlace && t.place ? { gesture: "point" as const, mood: "neutral" as const } : { gesture: "nod" as const, mood: "relaxed" as const });
    return { text, ...style, card: t.card, place: t.place, suggestions: next.length ? next.map(asQuestion) : followUps([]), via: "topic", topic: t.id };
  }

  const near = hits.slice(0, 3).map((h) => asQuestion(h.topic.title));
  return {
    text: near.length
      ? "I'm not sure I understood. I only know what was written for this world. Did you mean one of these?"
      : "I don't know that one. I only know what was written for this world: the sun, the wind, the battery, the town, and getting around. Try one of these:",
    gesture: "shrug",
    mood: "neutral",
    suggestions: near.length ? near : followUps([]),
    via: "fallback",
  };
}

/** Topics with a gesture of their own; the rest nod (or point, for "where
 *  is…"). */
const TOPIC_STYLE: Record<string, { gesture: IlawGesture; mood: Mood }> = {
  self: { gesture: "bow", mood: "happy" },
  how: { gesture: "nod", mood: "relaxed" },
  joke: { gesture: "cheer", mood: "happy" },
  fav: { gesture: "point", mood: "happy" },
  tour: { gesture: "raisehand", mood: "happy" },
  world: { gesture: "wave", mood: "happy" },
  save: { gesture: "raisehand", mood: "happy" },
  climate: { gesture: "nod", mood: "neutral" },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A topic's title as something to click: "Battery storage" → "Tell me about battery storage". */
function asQuestion(title: string): string {
  return /\?$/.test(title) ? title : `Tell me about ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}
