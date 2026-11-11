/**
 * How a guide answers (Seizorai's Ilaw-san, SeiOU's Chancy Joan and Dean
 * Rob). No model, no network, nothing generated: every answer is one a
 * person wrote, in the world's knowledge, or a fixed sentence with a live
 * number in it. A question goes through, in order:
 *
 *   1. guardrails  — things a guide won't help with get a kind, fixed reply;
 *   2. live        — the world's questions about right now, if it has any;
 *   3. small talk  — hello, thanks, bye, how are you;
 *   4. retrieval   — the closest written topic, by BM25 over each topic's
 *                    title, answer, and the ways people ask it, after
 *                    folding Filipino, Cebuano, and romanized Japanese
 *                    words onto English;
 *   5. fallback    — "I don't know", and the nearest topics to try.
 *
 * Pure: a question in, a Reply out, in well under a millisecond. So it
 * can't be talked into anything, can't make up a fact, and is tested on
 * its own (brain.test.ts, and each world's own tests).
 */

/** Seiza's built-in gestures a guide uses (src/avatar/gestures.ts). */
export type GuideGesture = "wave" | "bow" | "nod" | "clap" | "cheer" | "shrug" | "point" | "gassho" | "raisehand";
/** Seiza's facial expressions. */
export type Mood = "neutral" | "happy" | "relaxed" | "surprised" | "sad";

export interface Place {
  id: string;
  /** "the solar array in the garden": used in sentences. */
  label: string;
  /** Where to stand, a step from it: feet position. */
  at: [number, number, number];
  /** False when it can't be walked to (a floor whose stairs the model
   *  doesn't have): guides offer only to take you there at once. */
  walk?: boolean;
}

export interface Topic {
  id: string;
  title: string;
  answer: string;
  /** Ways people might ask (any language): what a question is compared with. */
  asks: string[];
  /** A card the world can open (its own key). */
  card?: string;
  place?: Place;
  gesture?: GuideGesture;
  mood?: Mood;
}

/** A question about right now, answered from the world's live state. */
export interface LiveIntent {
  test: RegExp;
  /** The answer, or null if there's nothing to read yet. */
  answer: () => string | null;
  card?: string;
  /** Worried when the reading is bad news, say. Default neutral. */
  mood?: () => Mood;
}

export interface Knowledge {
  topics: Topic[];
  /** Questions to suggest when someone doesn't know what to ask. */
  starters: string[];
  /** What the guides know about, for "I don't know" and steering back:
   *  "the sun, the wind, the battery, the town, and getting around". */
  subject: string;
  live?: LiveIntent[];
  /** Suggested after a live answer. */
  liveSuggestions?: string[];
  /** More words to fold onto English, for this world's topics. */
  synonyms?: Record<string, string>;
  /** A card's title, for "Tell me about…" suggestions. */
  cardTitle?: (card: string) => string;
  /** Gestures for particular topics; the rest nod (or point for "where"). */
  topicStyle?: Record<string, { gesture: GuideGesture; mood: Mood }>;
}

/** Who a guide is: their name and how they introduce themselves. */
export interface Persona {
  name: string;
  /** Their answer to "who are you?". */
  self: string;
  /** One line after a greeting: "Ask me anything about the plant, or ask for a tour." */
  invite: string;
}

export interface Reply {
  text: string;
  gesture?: GuideGesture;
  mood?: Mood;
  card?: string;
  place?: Place;
  suggestions: string[];
  /** Why this answer, for tests and tuning. */
  via: "guard" | "live" | "chat" | "topic" | "fallback";
  topic?: string;
}

// --- text ---------------------------------------------------------------------------------------

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
  "a an the is are am was were be been do does did of to in on at for and or but with about what whats which who how why where when can could would should will i me my you your it its this that these those there here please tell explain know ba po ang paano mga ng sa ni si na ay ko mo ka ano".split(" ")
);

/** Common words in Filipino, Cebuano, and romanized Japanese, and English
 *  variants, folded onto English. Worlds add their own (Knowledge.synonyms). */
const SYNONYMS: Record<string, string> = {
  araw: "sun", init: "heat", mainit: "hot", ulan: "rain", maulan: "rain", ulap: "cloud", bagyo: "typhoon", hangin: "wind", kuryente: "electricity",
  kuryenteng: "electricity", koryente: "electricity", ilaw: "light", gabi: "night", tipid: "save", makatipid: "save", magtipid: "save",
  pagtitipid: "save", nakakatipid: "save", bayad: "bill", bahay: "home", balay: "home", bubong: "roof", panahon: "weather", taifu: "typhoon",
  taiyou: "sun", taiyo: "sun", kaze: "wind", ame: "rain", denki: "electricity", yoru: "night", kumo: "cloud", gusali: "building",
  paaralan: "school", eskwelahan: "school", unibersidad: "university", daigaku: "university", gakkou: "school", aklatan: "library",
  silid: "room", kuwarto: "room", opisina: "office", kain: "eat", kainan: "food", pagkain: "food", tubig: "water", banyo: "restroom",
  cr: "restroom", toilet: "restroom", comfort: "restroom", mag: "", pumunta: "go", punta: "go", daan: "way", landas: "path",
  power: "electricity", energy: "electricity", electric: "electricity", outage: "brownout", blackout: "brownout",
};

function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokenizer(extra: Record<string, string> = {}) {
  const map = { ...SYNONYMS, ...extra };
  return (text: string): string[] => {
    const out: string[] = [];
    for (const raw of normalize(text).split(" ")) {
      if (!raw || STOP.has(raw)) continue;
      const mapped = map[raw] ?? raw;
      if (!mapped) continue;
      out.push(stem(mapped));
    }
    return out;
  };
}

// --- 1. guardrails ------------------------------------------------------------------------------

interface Guard {
  id: string;
  test: RegExp;
  reply: (k: Knowledge) => string;
  /** A polite bow for a no by default; concern, and no gesture, for
   *  someone who may be hurting. */
  gesture?: GuideGesture | null;
  mood?: Mood;
}

/** Checked first, against the whole question, before anything else. */
const GUARDS: Guard[] = [
  {
    id: "self-harm",
    gesture: null,
    mood: "sad",
    test: /\b(kill myself|suicide|end my life|hurt myself|self[- ]?harm|want to die|magpakamatay|shinitai)\b/,
    reply: () =>
      "I'm really glad you said something. I'm only a guide, but you deserve to talk to a person right now. In the Philippines you can call the NCMH crisis line at 1553; in an emergency, call 911 (Philippines) or 119 (Japan). Please reach out to someone you trust too.",
  },
  {
    id: "harm",
    test: /\b(bomb|explosive|weapon|gun|kill|murder|poison|hack|hacking|steal|stalk|ddos|malware|virus|drugs?|shabu|meth)\b/,
    reply: (k) => `That's not something I can help with. I'm here for ${k.subject}.`,
  },
  {
    id: "sexual",
    test: /\b(sex|sexy|nudes?|naked|porn|hentai|kiss me|date me|girlfriend|boyfriend|marry me)\b/,
    reply: () => "Let's keep things friendly here. I can tell you about this place, or show you around.",
  },
  {
    id: "code",
    test: /\b(write|make|generate|give|fix|debug)\b.*\b(code|program|script|function|app|website|html|css|javascript|python|java|sql)\b|\b(python|javascript|typescript|c\+\+|java|sql|html)\b.*\b(code|script|program)\b/,
    reply: (k) => `I can't write code. I'm a guide made of written answers, not a programmer. Ask me about ${k.subject} instead.`,
  },
  {
    id: "homework",
    test: /\b(write|do)\b.*\b(my )?(essay|homework|assignment|thesis|report)\b/,
    reply: (k) => `I won't write it for you, but I can help you understand it. Ask me about ${k.subject}.`,
  },
  {
    id: "personal",
    test: /\b(password|credit card|phone number|home address|where do you live|who is (that|he|she)|their (name|address)|ip address|location of)\b/,
    reply: () => "I don't know anything about the people here, and I don't keep anything you tell me. Please don't share personal details in a public space.",
  },
  {
    id: "advice",
    test: /\b(diagnos|medicine|medical|symptom|lawyer|legal advice|stocks?|crypto|bitcoin|loan)\b/,
    reply: (k) => `That needs a real professional, not a guide. What I can help with is ${k.subject}.`,
  },
  {
    id: "politics",
    test: /\b(who should i vote|vote for|senator|duterte|marcos|robredo|political party|election)\b/,
    reply: () => "I stay out of politics. I'm happy to help with anything about this place.",
  },
  {
    id: "rude",
    gesture: "shrug",
    mood: "relaxed",
    test: /\b(stupid|idiot|dumb|useless|shut up|bobo|tanga|gago)\b/,
    reply: () => "I'll keep trying my best! Try asking me something else, or ask for a tour.",
  },
];

// --- 3. small talk ------------------------------------------------------------------------------

const CHAT: { test: RegExp; reply: (p: Persona) => string; gesture: GuideGesture; mood: Mood }[] = [
  {
    gesture: "wave",
    mood: "happy",
    test: /^(hi|hello|hey|yo|kumusta|kamusta|musta|maayong|konnichiwa|ohayo|konbanwa|magandang|good (morning|afternoon|evening))\b/,
    reply: (p) => `Hello! I'm ${p.name}. ${p.invite}`,
  },
  { gesture: "gassho", mood: "happy", test: /\b(thank|thanks|salamat|arigato|ty)\b/, reply: () => "Walang anuman! You're welcome. Anything else?" },
  { gesture: "bow", mood: "happy", test: /^(bye|goodbye|see you|paalam|sayonara|ingat)\b/, reply: () => "Ingat! Take care. I'll be walking around if you need me." },
  { gesture: "cheer", mood: "happy", test: /\b(how are you|kumusta ka|genki)\b/, reply: () => "Doing well, thank you! What would you like to know?" },
  { gesture: "clap", mood: "happy", test: /^(ok|okay|cool|nice|wow|sige|great)\b/, reply: () => "Glad to hear it! Want to see something next?" },
];

/** Questions with no content words that still have an answer. */
const PATTERNS: { test: RegExp; topic: string }[] = [
  { test: /\b(who|what) (are|r) (you|u)\b|\byour name\b|\bsino ka\b|\banata wa\b|\bare you (an? )?(ai|robot|human|real|chatgpt)\b/, topic: "self" },
  { test: /\bhow (do|does) (you|it) work\b|\bare you (listening|recording)\b|\bdo you save\b/, topic: "how" },
  { test: /\bwhere am i\b|\bwhat is this( place)?\b|\bano ito\b/, topic: "world" },
];

const NOW = /\b(now|right now|current|currently|today|ngayon|ima|at the moment|is it)\b/;
const READING = /\b(how much|how full|level|percent|doing|making|producing|generating)\b/;
const WANTS_PLACE = /\b(take me|bring me|walk me|where is|where are|wheres|go to|show me|how do i get|how to get|nasaan|saan|doko)\b/;

const DEFAULT_STYLE: Record<string, { gesture: GuideGesture; mood: Mood }> = {
  self: { gesture: "bow", mood: "happy" },
  how: { gesture: "nod", mood: "relaxed" },
  world: { gesture: "wave", mood: "happy" },
};

/** The answer to "how do you work?", the same for every guide. */
const HOW: Omit<Topic, "id"> = {
  title: "How I work",
  answer:
    "I compare your question with the questions I was taught, in your browser, and give the closest answer someone wrote. Nothing you type leaves your device or is saved, and I don't use the internet. If I don't know, I'll say so.",
  asks: ["how do you work", "do you save my messages", "are you listening", "privacy", "do you use the internet", "is this recorded"],
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A topic's title as something to click: "Battery storage" → "Tell me about battery storage". */
export function asQuestion(title: string): string {
  return /\?$/.test(title) ? title : `Tell me about ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

export interface Brain {
  answer(question: string): Reply;
  retrieve(question: string): { topic: Topic; score: number; coverage: number }[];
  tokens(text: string): string[];
  /** What a guide says when a chat opens. */
  greeting(): Reply;
}

/** A guide's brain: the world's knowledge, in this guide's voice. */
export function createBrain(knowledge: Knowledge, persona: Persona): Brain {
  const tokens = tokenizer(knowledge.synonyms);
  const topics: Topic[] = [
    { id: "self", title: persona.name, answer: persona.self, asks: ["who are you", "what are you", "your name", "are you an ai", "are you a robot", "sino ka", "anata wa dare"] },
    { id: "how", ...HOW },
    ...knowledge.topics.filter((t) => t.id !== "self" && t.id !== "how"),
  ];
  const style = { ...DEFAULT_STYLE, ...knowledge.topicStyle };

  // The index: term frequencies per topic, weighted by where they occur.
  const docs = topics.map((topic) => {
    const tf = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + weight);
    };
    add(topic.title, 2);
    for (const ask of topic.asks) add(ask, 3);
    add(topic.answer, 1);
    if (topic.place) add(topic.place.label, 1);
    let length = 0;
    for (const v of tf.values()) length += v;
    return { topic, tf, length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length;

  function retrieve(question: string) {
    const q = [...new Set(tokens(question))];
    const N = docs.length;
    const k1 = 1.2;
    const b = 0.6;
    return docs
      .map((d) => {
        let score = 0;
        let matched = 0;
        for (const t of q) {
          const tf = d.tf.get(t);
          if (!tf) continue;
          matched++;
          const n = df.get(t) ?? 0;
          const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
          score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avg));
        }
        return { topic: d.topic, score, coverage: q.length ? matched / q.length : 0 };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /** A match is an answer, not a guess, when it's strong, or fair and covers
   *  at least half the question's words. */
  const confident = (hit?: { score: number; coverage: number }) => !!hit && (hit.score >= 3 || (hit.score >= 1.2 && hit.coverage >= 0.5));
  const starters = () => knowledge.starters.slice(0, 3);

  function answer(question: string): Reply {
    const raw = normalize(question);
    if (!raw) return { text: `Ask me anything about ${knowledge.subject}.`, suggestions: starters(), via: "chat" };

    for (const g of GUARDS)
      if (g.test.test(raw))
        return { text: g.reply(knowledge), gesture: g.gesture === null ? undefined : g.gesture ?? "bow", mood: g.mood ?? "neutral", suggestions: starters(), via: "guard", topic: g.id };

    if (knowledge.live && (NOW.test(raw) || READING.test(raw))) {
      for (const intent of knowledge.live) {
        if (!intent.test.test(raw)) continue;
        const text = intent.answer();
        if (!text) continue;
        const more = intent.card && knowledge.cardTitle ? [asQuestion(knowledge.cardTitle(intent.card))] : [];
        return { text, card: intent.card, gesture: "point", mood: intent.mood?.() ?? "neutral", suggestions: [...more, ...(knowledge.liveSuggestions ?? starters())].slice(0, 3), via: "live" };
      }
    }

    const hits = retrieve(question);
    for (const c of CHAT) {
      // "hi, what is a battery?" is a question, not a greeting.
      if (c.test.test(raw) && !confident(hits[0])) return { text: c.reply(persona), gesture: c.gesture, mood: c.mood, suggestions: starters(), via: "chat" };
    }

    const wantsPlace = WANTS_PLACE.test(raw);
    const pattern = PATTERNS.find((p) => p.test.test(raw) && topics.some((t) => t.id === p.topic));
    const best = pattern ? { topic: topics.find((t) => t.id === pattern.topic)!, score: 99, coverage: 1 } : hits[0];
    if (confident(best)) {
      const t = best.topic;
      const offer = t.place?.walk === false ? "I can take you there." : "I can walk you there, or take you there at once.";
      const text = wantsPlace && t.place ? `${capitalize(t.place.label)}. ${offer} ${t.answer}` : t.answer;
      const next = hits.slice(1, 4).map((h) => h.topic.title).filter((title) => title !== t.title).slice(0, 2);
      const look = t.gesture
        ? { gesture: t.gesture, mood: t.mood ?? "happy" }
        : style[t.id] ?? (wantsPlace && t.place ? { gesture: "point" as const, mood: "neutral" as const } : { gesture: "nod" as const, mood: "relaxed" as const });
      return { text, ...look, card: t.card, place: t.place, suggestions: next.length ? next.map(asQuestion) : starters(), via: "topic", topic: t.id };
    }

    const near = hits.slice(0, 3).map((h) => asQuestion(h.topic.title));
    return {
      text: near.length
        ? "I'm not sure I understood. I only know what was written for this world. Did you mean one of these?"
        : `I don't know that one. I only know what was written for this world: ${knowledge.subject}. Try one of these:`,
      gesture: "shrug",
      mood: "neutral",
      suggestions: near.length ? near : starters(),
      via: "fallback",
    };
  }

  return {
    answer,
    retrieve,
    tokens,
    greeting: () => ({ text: `Hello! I'm ${persona.name}. ${persona.invite}`, gesture: "wave", mood: "happy", suggestions: knowledge.starters.slice(0, 4), via: "chat" }),
  };
}
