// How a Japanese voice should say a name written in Latin letters. Left
// alone, a ja-JP speech voice spells "Seinag" out letter by letter
// ("es-ee-ay-en-a-gee"), so before a line is spoken the names Seiza knows
// are swapped for their katakana readings; a name it doesn't know is read
// as romaji (se-i-na-gu), which is how a Japanese reader would say it too.

/** Names whose reading isn't just their romaji (or is, but best said this way). */
export const READINGS: Record<string, string> = {
  seiza: "セイザ",
  seikansen: "セイカンセン",
  ecoseiztem: "エコセイズテム",
  seinag: "セイナグ",
  seishore: "セイショア",
  seisugbo: "セイスグボ",
  seilaya: "セイラヤ",
  seiou: "セイオウ",
  seizora: "セイゾラ",
  seizorai: "セイゾライ",
  iscolab: "イスコラボ",
  tulay: "トゥライ",
  upou: "ユーピーオーユー",
};

// Romaji to katakana, longest spellings first.
const KANA: [string, string][] = [
  ["kya", "キャ"], ["kyu", "キュ"], ["kyo", "キョ"], ["sha", "シャ"], ["shu", "シュ"], ["sho", "ショ"], ["shi", "シ"],
  ["cha", "チャ"], ["chu", "チュ"], ["cho", "チョ"], ["chi", "チ"], ["tsu", "ツ"], ["nya", "ニャ"], ["nyu", "ニュ"], ["nyo", "ニョ"],
  ["hya", "ヒャ"], ["hyu", "ヒュ"], ["hyo", "ヒョ"], ["rya", "リャ"], ["ryu", "リュ"], ["ryo", "リョ"], ["gya", "ギャ"], ["gyu", "ギュ"], ["gyo", "ギョ"],
  ["ja", "ジャ"], ["ju", "ジュ"], ["jo", "ジョ"], ["ji", "ジ"], ["je", "ジェ"], ["fa", "ファ"], ["fi", "フィ"], ["fu", "フ"], ["fe", "フェ"], ["fo", "フォ"],
  ["ti", "ティ"], ["tu", "トゥ"], ["di", "ディ"], ["du", "ドゥ"], ["wi", "ウィ"], ["we", "ウェ"], ["va", "ヴァ"], ["vi", "ヴィ"], ["vu", "ヴ"], ["ve", "ヴェ"], ["vo", "ヴォ"],
  ["ka", "カ"], ["ki", "キ"], ["ku", "ク"], ["ke", "ケ"], ["ko", "コ"], ["ga", "ガ"], ["gi", "ギ"], ["gu", "グ"], ["ge", "ゲ"], ["go", "ゴ"],
  ["sa", "サ"], ["su", "ス"], ["se", "セ"], ["so", "ソ"], ["za", "ザ"], ["zi", "ジ"], ["zu", "ズ"], ["ze", "ゼ"], ["zo", "ゾ"],
  ["ta", "タ"], ["te", "テ"], ["to", "ト"], ["da", "ダ"], ["de", "デ"], ["do", "ド"],
  ["na", "ナ"], ["ni", "ニ"], ["nu", "ヌ"], ["ne", "ネ"], ["no", "ノ"], ["ha", "ハ"], ["hi", "ヒ"], ["hu", "フ"], ["he", "ヘ"], ["ho", "ホ"],
  ["ba", "バ"], ["bi", "ビ"], ["bu", "ブ"], ["be", "ベ"], ["bo", "ボ"], ["pa", "パ"], ["pi", "ピ"], ["pu", "プ"], ["pe", "ペ"], ["po", "ポ"],
  ["ma", "マ"], ["mi", "ミ"], ["mu", "ム"], ["me", "メ"], ["mo", "モ"], ["ya", "ヤ"], ["yu", "ユ"], ["yo", "ヨ"],
  ["ra", "ラ"], ["ri", "リ"], ["ru", "ル"], ["re", "レ"], ["ro", "ロ"], ["la", "ラ"], ["li", "リ"], ["lu", "ル"], ["le", "レ"], ["lo", "ロ"],
  ["wa", "ワ"], ["wo", "ヲ"], ["a", "ア"], ["i", "イ"], ["u", "ウ"], ["e", "エ"], ["o", "オ"],
];
/** A lone consonant, said with the vowel a Japanese reader would add. */
const LONE: Record<string, string> = { b: "ブ", c: "ク", d: "ド", f: "フ", g: "グ", h: "フ", j: "ジ", k: "ク", l: "ル", m: "ム", p: "プ", q: "ク", r: "ル", s: "ス", t: "ト", v: "ヴ", w: "ウ", x: "クス", y: "イ", z: "ズ" };

/** A Latin word in katakana, read as romaji (a known name by its reading). */
export function katakana(word: string): string {
  const known = READINGS[word.toLowerCase()];
  if (known) return known;
  let w = word.toLowerCase().replace(/c(?=[aou])/g, "k").replace(/c/g, "s");
  let out = "";
  while (w) {
    // A doubled consonant: a small tsu before it.
    if (w.length > 1 && w[0] === w[1] && !"aeioun".includes(w[0])) {
      out += "ッ";
      w = w.slice(1);
      continue;
    }
    // N before a consonant or at the end.
    if (w[0] === "n" && (w.length === 1 || !"aeiouy".includes(w[1]))) {
      out += "ン";
      w = w.slice(1);
      continue;
    }
    const hit = KANA.find(([r]) => w.startsWith(r));
    if (hit) {
      out += hit[1];
      w = w.slice(hit[0].length);
      continue;
    }
    out += LONE[w[0]] ?? "";
    w = w.slice(1);
  }
  return out;
}

/**
 * A line for a Japanese voice: Seiza's own names in it said as names. A
 * name with its reading beside it, "Seishore(セイショア)", is said once, by
 * the reading. Other Latin words (an English loanword, an acronym like UP)
 * are left as they are, which a Japanese voice reads well enough.
 */
export function forJapaneseVoice(text: string): string {
  return text
    .replace(/([A-Za-z]+)[（(]([゠-ヿ・ー]+)[）)]/g, "$2")
    .replace(/[A-Za-z]+/g, (w) => READINGS[w.toLowerCase()] ?? w);
}

/** A station's name for the Japanese announcement: its reading if it's in Latin letters. */
export function stationReading(name: string): string {
  const shown = forJapaneseVoice(name);
  return shown.replace(/[A-Za-z]+/g, (w) => (/^[A-Z]{2,}$/.test(w) ? w : katakana(w)));
}
