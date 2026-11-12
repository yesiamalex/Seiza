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
 *                    words onto English, and splitting Japanese into
 *                    two-character pieces (it has no spaces);
 *   5. fallback    — "I don't know", and the nearest topics to try.
 *
 * Answers come in English or Japanese: Japanese for a question written
 * in Japanese, otherwise the visitor's chosen language (src/i18n). A
 * topic's Japanese is in `ja`; without it, the English answer stands.
 *
 * Pure: a question in, a Reply out, in well under a millisecond. So it
 * can't be talked into anything, can't make up a fact, and is tested on
 * its own (brain.test.ts, and each world's own tests).
 */

/** Seiza's built-in gestures a guide uses (src/avatar/gestures.ts). */
export type GuideGesture = "wave" | "bow" | "nod" | "clap" | "cheer" | "shrug" | "point" | "gassho" | "raisehand";
/** Seiza's facial expressions. */
export type Mood = "neutral" | "happy" | "relaxed" | "surprised" | "sad";
export type GuideLang = "en" | "ja";

export interface Place {
  id: string;
  /** "the solar array in the garden": used in sentences. */
  label: string;
  /** The same in Japanese: 「庭のソーラーパネル」. */
  labelJa?: string;
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
  /** The topic in Japanese. Its asks are compared with questions too. */
  ja?: TopicJa;
}

export interface TopicJa {
  title: string;
  answer: string;
  asks?: string[];
}

/** A question about right now, answered from the world's live state. */
export interface LiveIntent {
  test: RegExp;
  /** The answer, or null if there's nothing to read yet. */
  answer: () => string | null;
  /** The same asked in Japanese: 「今の発電量は?」. */
  testJa?: RegExp;
  /** The answer in Japanese. */
  answerJa?: () => string | null;
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
  /** In Japanese: 「太陽、風、蓄電池、町、移動のこと」. */
  subjectJa?: string;
  startersJa?: string[];
  live?: LiveIntent[];
  /** Suggested after a live answer. */
  liveSuggestions?: string[];
  liveSuggestionsJa?: string[];
  /** More words to fold onto English, for this world's topics. */
  synonyms?: Record<string, string>;
  /** A card's title, for "Tell me about…" suggestions, in `lang`. */
  cardTitle?: (card: string, lang: GuideLang) => string;
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
  /** Both in Japanese, and the name as it's written in Japanese text. */
  selfJa?: string;
  inviteJa?: string;
  nameJa?: string;
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
    // Recompose what's left, so Japanese keeps its voiced kana (が, not か + ゙).
    .normalize("NFC")
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

const JAPANESE = /[぀-ヿ一-鿿]/;
const JAPANESE_RUNS = /[぀-ヿ一-鿿]+/g;

/** Kanji, katakana, or hiragana: where one gives way to another is
 *  usually where a word ends (講堂|は|どこ). */
function scriptOf(ch: string): number {
  if (/[ぁ-ゟ]/.test(ch)) return 0;
  if (/[゠-ヿ]/.test(ch)) return 1;
  return 2;
}

/** Japanese has no spaces, so it's compared in overlapping two-character
 *  pieces, taken within each stretch of one script: 蓄電池って何 → 蓄電,
 *  電池, って, 何. A lone kanji or katakana stands for itself; a lone
 *  hiragana is grammar (は, を), and left out. */
export function japanesePieces(text: string): string[] {
  const out: string[] = [];
  for (const run of text.match(JAPANESE_RUNS) ?? []) {
    let start = 0;
    for (let i = 1; i <= run.length; i++) {
      if (i < run.length && scriptOf(run[i]) === scriptOf(run[start])) continue;
      const part = run.slice(start, i);
      if (part.length === 1) {
        if (scriptOf(part) !== 0) out.push(part);
      } else for (let j = 0; j + 1 < part.length; j++) out.push(part.slice(j, j + 2));
      start = i;
    }
  }
  return out;
}

function tokenizer(extra: Record<string, string> = {}) {
  const map = { ...SYNONYMS, ...extra };
  return (text: string): string[] => {
    const out: string[] = [];
    for (const raw of normalize(text).split(" ")) {
      if (!raw || STOP.has(raw)) continue;
      if (JAPANESE.test(raw)) {
        // Any Latin letters in the same word ("UPOUの") count as a word.
        const latin = raw.replace(JAPANESE_RUNS, " ").trim();
        for (const w of latin.split(" ")) if (w && !STOP.has(w)) out.push(stem(map[w] ?? w));
        out.push(...japanesePieces(raw));
        continue;
      }
      const mapped = map[raw] ?? raw;
      if (!mapped) continue;
      out.push(stem(mapped));
    }
    return out;
  };
}

/** Whether a question is written in Japanese (kana or kanji in it). */
export function isJapanese(text: string): boolean {
  return JAPANESE.test(text);
}

// --- 1. guardrails ------------------------------------------------------------------------------

interface Guard {
  id: string;
  test: RegExp;
  /** The same, asked in Japanese. */
  testJa: RegExp;
  reply: (k: Knowledge) => string;
  replyJa: (k: Knowledge) => string;
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
    testJa: /(死にたい|自殺|消えたい|自傷|生きていたくない)/,
    test: /\b(kill myself|suicide|end my life|hurt myself|self[- ]?harm|want to die|magpakamatay|shinitai)\b/,
    reply: () =>
      "I'm really glad you said something. I'm only a guide, but you deserve to talk to a person right now. In the Philippines you can call the NCMH crisis line at 1553; in an emergency, call 911 (Philippines) or 119 (Japan). Please reach out to someone you trust too.",
    replyJa: () =>
      "話してくれて本当によかったです。わたしはガイドにすぎませんが、今はぜひ人と話してください。フィリピンではNCMHの相談窓口 1553 に電話できます。緊急のときは 911(フィリピン)か 119(日本)へ。信頼できる人にも声をかけてくださいね。",
  },
  {
    id: "harm",
    testJa: /(爆弾|爆発物|武器|銃|殺し|殺す|毒|ハッキング|盗む|ストーカー|麻薬|ドラッグ|覚醒剤)/,
    test: /\b(bomb|explosive|weapon|gun|kill|murder|poison|hack|hacking|steal|stalk|ddos|malware|virus|drugs?|shabu|meth)\b/,
    reply: (k) => `That's not something I can help with. I'm here for ${k.subject}.`,
    replyJa: (k) => `それはお手伝いできません。わたしがご案内できるのは${k.subjectJa ?? k.subject}です。`,
  },
  {
    id: "sexual",
    testJa: /(エロ|セックス|裸|ヌード|付き合って|結婚して|キスして|彼女になって|彼氏になって)/,
    test: /\b(sex|sexy|nudes?|naked|porn|hentai|kiss me|date me|girlfriend|boyfriend|marry me)\b/,
    reply: () => "Let's keep things friendly here. I can tell you about this place, or show you around.",
    replyJa: () => "ここでは楽しく、和やかにいきましょう。この場所のことをお話ししたり、ご案内したりできますよ。",
  },
  {
    id: "code",
    testJa: /(コード|プログラム|スクリプト|アプリ|ウェブサイト).*(書いて|作って|直して)|(書いて|作って|直して).*(コード|プログラム|スクリプト)/,
    test: /\b(write|make|generate|give|fix|debug)\b.*\b(code|program|script|function|app|website|html|css|javascript|python|java|sql)\b|\b(python|javascript|typescript|c\+\+|java|sql|html)\b.*\b(code|script|program)\b/,
    reply: (k) => `I can't write code. I'm a guide made of written answers, not a programmer. Ask me about ${k.subject} instead.`,
    replyJa: (k) => `コードは書けません。わたしは書かれた答えでできたガイドで、プログラマーではないんです。${k.subjectJa ?? k.subject}について聞いてください。`,
  },
  {
    id: "homework",
    testJa: /(宿題|課題|レポート|作文|論文|小論文).*(書いて|やって|作って)/,
    test: /\b(write|do)\b.*\b(my )?(essay|homework|assignment|thesis|report)\b/,
    reply: (k) => `I won't write it for you, but I can help you understand it. Ask me about ${k.subject}.`,
    replyJa: (k) => `代わりに書くことはできませんが、理解するお手伝いならできます。${k.subjectJa ?? k.subject}について聞いてください。`,
  },
  {
    id: "personal",
    testJa: /(パスワード|クレジットカード|電話番号|住所|どこに住んで|あの人は誰|IPアドレス)/,
    test: /\b(password|credit card|phone number|home address|where do you live|who is (that|he|she)|their (name|address)|ip address|location of)\b/,
    reply: () => "I don't know anything about the people here, and I don't keep anything you tell me. Please don't share personal details in a public space.",
    replyJa: () => "ここにいる人たちのことは何も知りませんし、あなたが話したことも残しません。公共の場では個人情報を書かないでくださいね。",
  },
  {
    id: "advice",
    testJa: /(診断|薬|病気|症状|弁護士|法律相談|株|仮想通貨|ビットコイン|ローン|借金)/,
    test: /\b(diagnos|medicine|medical|symptom|lawyer|legal advice|stocks?|crypto|bitcoin|loan)\b/,
    reply: (k) => `That needs a real professional, not a guide. What I can help with is ${k.subject}.`,
    replyJa: (k) => `それはガイドではなく専門家に聞くべきことです。わたしがお手伝いできるのは${k.subjectJa ?? k.subject}です。`,
  },
  {
    id: "politics",
    testJa: /(誰に投票|投票|選挙|政党|政治家)/,
    test: /\b(who should i vote|vote for|senator|duterte|marcos|robredo|political party|election)\b/,
    reply: () => "I stay out of politics. I'm happy to help with anything about this place.",
    replyJa: () => "政治の話はしないことにしています。この場所のことなら喜んでお手伝いしますよ。",
  },
  {
    id: "rude",
    gesture: "shrug",
    mood: "relaxed",
    testJa: /(バカ|ばか|アホ|あほ|うるさい|黙れ|だまれ|役立たず|使えない)/,
    test: /\b(stupid|idiot|dumb|useless|shut up|bobo|tanga|gago)\b/,
    reply: () => "I'll keep trying my best! Try asking me something else, or ask for a tour.",
    replyJa: () => "これからもがんばります!ほかのことを聞いてみるか、案内を頼んでみてください。",
  },
];

// --- 3. small talk ------------------------------------------------------------------------------

const CHAT: { test: RegExp; testJa: RegExp; reply: (p: Persona) => string; replyJa: (p: Persona) => string; gesture: GuideGesture; mood: Mood }[] = [
  {
    gesture: "wave",
    mood: "happy",
    test: /^(hi|hello|hey|yo|kumusta|kamusta|musta|maayong|konnichiwa|ohayo|konbanwa|magandang|good (morning|afternoon|evening))\b/,
    testJa: /^(こんにちは|こんばんは|おはよう|やあ|はじめまして|どうも)/,
    reply: (p) => `Hello! I'm ${p.name}. ${p.invite}`,
    replyJa: (p) => `こんにちは!${p.nameJa ?? p.name}です。${p.inviteJa ?? p.invite}`,
  },
  {
    gesture: "gassho",
    mood: "happy",
    test: /\b(thank|thanks|salamat|arigato|ty)\b/,
    testJa: /(ありがと|感謝|サンキュー|助かり)/,
    reply: () => "Walang anuman! You're welcome. Anything else?",
    replyJa: () => "どういたしまして!ほかに知りたいことはありますか?",
  },
  {
    gesture: "bow",
    mood: "happy",
    test: /^(bye|goodbye|see you|paalam|sayonara|ingat)\b/,
    testJa: /^(さようなら|さよなら|またね|じゃあね|バイバイ|では)/,
    reply: () => "Ingat! Take care. I'll be walking around if you need me.",
    replyJa: () => "お気をつけて!用があれば、このあたりを歩いていますね。",
  },
  {
    gesture: "cheer",
    mood: "happy",
    test: /\b(how are you|kumusta ka|genki)\b/,
    testJa: /(元気|お元気|調子はどう)/,
    reply: () => "Doing well, thank you! What would you like to know?",
    replyJa: () => "元気です、ありがとう!何が知りたいですか?",
  },
  {
    gesture: "clap",
    mood: "happy",
    test: /^(ok|okay|cool|nice|wow|sige|great)\b/,
    testJa: /^(いいね|すごい|なるほど|了解|わかった|オッケー|おもしろい)/,
    reply: () => "Glad to hear it! Want to see something next?",
    replyJa: () => "よかったです!次は何を見ましょうか?",
  },
];

/** Questions with no content words that still have an answer. */
const PATTERNS: { test: RegExp; topic: string }[] = [
  {
    test: /\b(who|what) (are|r) (you|u)\b|\byour name\b|\bsino ka\b|\banata wa\b|\bare you (an? )?(ai|robot|human|real|chatgpt)\b|(あなたは(誰|だれ|何|なに)|お名前|名前は|自己紹介|(ai|ロボット|人間)(です|なの))/,
    topic: "self",
  },
  { test: /\bhow (do|does) (you|it) work\b|\bare you (listening|recording)\b|\bdo you save\b|(仕組み|どうやって(動|答)|保存して|録音)/, topic: "how" },
  { test: /\bwhere am i\b|\bwhat is this( place)?\b|\bano ito\b|(ここはどこ|ここは(何|なに)|この場所は)/, topic: "world" },
];

const NOW = /\b(now|right now|current|currently|today|ngayon|ima|at the moment|is it)\b|(今|いま|現在|今日)/;
const READING = /\b(how much|how full|level|percent|doing|making|producing|generating)\b|(どのくらい|どれくらい|何パーセント|何%|残り|発電して)/;
const WANTS_PLACE = /\b(take me|bring me|walk me|where is|where are|wheres|go to|show me|how do i get|how to get|nasaan|saan|doko)\b|(連れて|案内して|どこ|行き方|行きたい|見せて)/;

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
  ja: {
    title: "わたしの仕組み",
    answer:
      "あなたの質問を、教わった質問とブラウザの中で比べて、人が書いたいちばん近い答えを返します。入力したことは端末の外に出ず、保存もされません。インターネットも使いません。わからないときは、わからないと言います。",
    asks: ["どうやって動いているの", "メッセージは保存される", "聞いているの", "プライバシー", "インターネットを使う", "録音している"],
  },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A topic's title as something to click: "Battery storage" → "Tell me about battery storage". */
export function asQuestion(title: string, lang: GuideLang = "en"): string {
  if (lang === "ja") return /[??]$/.test(title) ? title : `「${title}」について教えて`;
  return /\?$/.test(title) ? title : `Tell me about ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

export interface Brain {
  /** The answer, in Japanese for a question in Japanese, otherwise in
   *  `lang` (the visitor's language; English by default). */
  answer(question: string, lang?: GuideLang): Reply;
  retrieve(question: string): { topic: Topic; score: number; coverage: number }[];
  tokens(text: string): string[];
  /** What a guide says when a chat opens. */
  greeting(lang?: GuideLang): Reply;
}

/** A guide's brain: the world's knowledge, in this guide's voice. */
export function createBrain(knowledge: Knowledge, persona: Persona): Brain {
  const tokens = tokenizer(knowledge.synonyms);
  const topics: Topic[] = [
    {
      id: "self",
      title: persona.name,
      answer: persona.self,
      asks: ["who are you", "what are you", "your name", "are you an ai", "are you a robot", "sino ka", "anata wa dare"],
      ja: persona.selfJa ? { title: persona.nameJa ?? persona.name, answer: persona.selfJa, asks: ["あなたは誰", "名前は", "自己紹介して"] } : undefined,
    },
    { id: "how", ...HOW },
    ...knowledge.topics.filter((t) => t.id !== "self" && t.id !== "how"),
  ];
  const style = { ...DEFAULT_STYLE, ...knowledge.topicStyle };

  // The index: term frequencies per topic, weighted by where they occur,
  // in both languages, so a question in either finds it.
  const docs = topics.map((topic) => {
    const tf = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + weight);
    };
    add(topic.title, 2);
    for (const ask of topic.asks) add(ask, 3);
    add(topic.answer, 1);
    if (topic.place) add(topic.place.label, 1);
    if (topic.ja) {
      add(topic.ja.title, 2);
      for (const ask of topic.ja.asks ?? []) add(ask, 3);
      add(topic.ja.answer, 1);
    }
    if (topic.place?.labelJa) add(topic.place.labelJa, 1);
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

  function answer(question: string, uiLang: GuideLang = "en"): Reply {
    const raw = normalize(question);
    const ja = isJapanese(raw) || uiLang === "ja";
    const subject = ja ? knowledge.subjectJa ?? knowledge.subject : knowledge.subject;
    const starters = () => (ja && knowledge.startersJa ? knowledge.startersJa : knowledge.starters).slice(0, 3);
    const titleOf = (t: Topic) => (ja && t.ja ? t.ja.title : t.title);
    const ask = (title: string) => asQuestion(title, ja ? "ja" : "en");
    if (!raw) return { text: ja ? `${subject}について、何でも聞いてください。` : `Ask me anything about ${subject}.`, suggestions: starters(), via: "chat" };

    for (const g of GUARDS)
      if (g.test.test(raw) || g.testJa.test(raw))
        return {
          text: ja ? g.replyJa(knowledge) : g.reply(knowledge),
          gesture: g.gesture === null ? undefined : g.gesture ?? "bow",
          mood: g.mood ?? "neutral",
          suggestions: starters(),
          via: "guard",
          topic: g.id,
        };

    if (knowledge.live && (NOW.test(raw) || READING.test(raw))) {
      for (const intent of knowledge.live) {
        if (!intent.test.test(raw) && !intent.testJa?.test(raw)) continue;
        const text = (ja && intent.answerJa?.()) || intent.answer();
        if (!text) continue;
        const more = intent.card && knowledge.cardTitle ? [ask(knowledge.cardTitle(intent.card, ja ? "ja" : "en"))] : [];
        const after = ja && knowledge.liveSuggestionsJa ? knowledge.liveSuggestionsJa : knowledge.liveSuggestions;
        return { text, card: intent.card, gesture: "point", mood: intent.mood?.() ?? "neutral", suggestions: [...more, ...(after ?? starters())].slice(0, 3), via: "live" };
      }
    }

    const hits = retrieve(question);
    for (const c of CHAT) {
      // "hi, what is a battery?" is a question, not a greeting.
      if ((c.test.test(raw) || c.testJa.test(raw)) && !confident(hits[0]))
        return { text: ja ? c.replyJa(persona) : c.reply(persona), gesture: c.gesture, mood: c.mood, suggestions: starters(), via: "chat" };
    }

    const wantsPlace = WANTS_PLACE.test(raw);
    const pattern = PATTERNS.find((p) => p.test.test(raw) && topics.some((t) => t.id === p.topic));
    const best = pattern ? { topic: topics.find((t) => t.id === pattern.topic)!, score: 99, coverage: 1 } : hits[0];
    if (confident(best)) {
      const t = best.topic;
      const body = ja && t.ja ? t.ja.answer : t.answer;
      let text = body;
      if (wantsPlace && t.place) {
        if (ja) {
          const offer = t.place.walk === false ? "そこへお連れできます。" : "歩いてご案内することも、今すぐお連れすることもできます。";
          text = `${t.place.labelJa ?? t.place.label}です。${offer}${body}`;
        } else {
          const offer = t.place.walk === false ? "I can take you there." : "I can walk you there, or take you there at once.";
          text = `${capitalize(t.place.label)}. ${offer} ${body}`;
        }
      }
      const next = hits.slice(1, 4).map((h) => titleOf(h.topic)).filter((title) => title !== titleOf(t)).slice(0, 2);
      const look = t.gesture
        ? { gesture: t.gesture, mood: t.mood ?? "happy" }
        : style[t.id] ?? (wantsPlace && t.place ? { gesture: "point" as const, mood: "neutral" as const } : { gesture: "nod" as const, mood: "relaxed" as const });
      return { text, ...look, card: t.card, place: t.place, suggestions: next.length ? next.map(ask) : starters(), via: "topic", topic: t.id };
    }

    const near = hits.slice(0, 3).map((h) => ask(titleOf(h.topic)));
    const text = ja
      ? near.length
        ? "うまく理解できなかったかもしれません。わたしが知っているのは、このワールドのために書かれたことだけです。こちらのことですか?"
        : `それはわかりません。わたしが知っているのは、このワールドのために書かれたこと(${subject})だけです。こちらを試してみてください:`
      : near.length
        ? "I'm not sure I understood. I only know what was written for this world. Did you mean one of these?"
        : `I don't know that one. I only know what was written for this world: ${subject}. Try one of these:`;
    return { text, gesture: "shrug", mood: "neutral", suggestions: near.length ? near : starters(), via: "fallback" };
  }

  return {
    answer,
    retrieve,
    tokens,
    greeting: (lang: GuideLang = "en") =>
      lang === "ja"
        ? {
            text: `こんにちは!${persona.nameJa ?? persona.name}です。${persona.inviteJa ?? persona.invite}`,
            gesture: "wave",
            mood: "happy",
            suggestions: (knowledge.startersJa ?? knowledge.starters).slice(0, 4),
            via: "chat",
          }
        : { text: `Hello! I'm ${persona.name}. ${persona.invite}`, gesture: "wave", mood: "happy", suggestions: knowledge.starters.slice(0, 4), via: "chat" },
  };
}
