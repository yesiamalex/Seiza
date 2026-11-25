/**
 * A profanity filter for chat and names, shared by the room server (which
 * enforces it: worker/room.ts) and the page. English, Tagalog, Cebuano,
 * and a little Japanese.
 *
 * Whole words only, so "class", "assume", and "Scunthorpe" pass; a word
 * ending "*" also matches what starts with it ("fuck*": fucking, fucker).
 * Letters are read through the common disguises first (sh1t, @ss,
 * f.u.c.k, fuuuck). Left out on purpose: words a safe-spaces lab needs to
 * talk about plainly ("rape", "abuse"), and everyday words that are only
 * sometimes rude ("leche" is also flan; "atay" is liver).
 *
 * Each room has two switches (world state, admin only): `filter.chat`,
 * masking words in chat, and `filter.names`, renaming a joining player
 * whose name has one. Their defaults are the world's own (SEIZA_CHAT_FILTER,
 * SEIZA_NAME_FILTER); chat is filtered unless a world turns it off.
 */
export const FILTER_KEYS = { chat: "filter.chat", names: "filter.names" } as const;

const WORDS = [
  // English
  "fuck*", "motherfuck*", "fck*", "fuk*", "phuck*", "fucc*", "shit*", "bullshit*", "bitch*", "cunt*", "asshole*", "ass", "arse", "arsehole*",
  "dick", "dickhead*", "cock", "cocksuck*", "pussy", "prick", "bastard*", "slut*", "whore*", "wank*", "twat*", "nigger*", "nigga*", "faggot*", "fag", "fags",
  "retard*", "dildo*", "jizz*",
  // Tagalog
  "putangina*", "putang", "tangina*", "puta", "gago", "gaga", "gagu", "ulol", "ulul", "tarantado*", "kupal", "pakyu*", "pakshet*", "pokpok", "burat",
  "titi", "puke", "kantot*", "jakol*", "hindot*", "punyeta*", "bwakanangina*", "inamo",
  // Cebuano
  "bilat", "oten", "iyot*", "yawa", "piste", "pisti", "giatay",
];
/** Written without spaces between words: matched anywhere in the text. */
const ANYWHERE = ["死ね", "ちんこ", "まんこ", "ファック"];
/** Strong enough to catch inside a run-together name ("xXfuckXx"). */
const IN_NAMES = ["fuck", "cunt", "nigg", "fagg", "bitch", "shit", "motherf", "putangina", "tangina", "pakyu", "kantot"];

const exact = new Set(WORDS.filter((w) => !w.endsWith("*")));
const stems = WORDS.filter((w) => w.endsWith("*")).map((w) => w.slice(0, -1));
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i", "|": "i" };

/** A word as the list reads it: lower case, disguises undone, letters only. */
function plain(word: string): string {
  return [...word.toLowerCase()]
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/[^a-z]/g, "");
}
/** Runs of three or more of a letter as one: fuuuck, shiiit. */
const squeeze = (word: string) => word.replace(/([a-z])\1{2,}/g, "$1");

function rude(word: string): boolean {
  for (const w of new Set([plain(word), squeeze(plain(word))])) {
    if (!w) continue;
    if (exact.has(w) || stems.some((s) => w.startsWith(s))) return true;
  }
  return false;
}

/** Chat: each rude word kept to its first letter, the rest starred. */
export function maskProfanity(text: string): string {
  // The word itself, not the punctuation round it ("shit," keeps its comma).
  let out = text.replace(/\S+/g, (token) =>
    token.replace(/^([("'[{]*)(.*?)([.,!?;:"')\]}…]*)$/u, (all, open: string, word: string, close: string) =>
      word && rude(word) ? open + word[0] + "*".repeat(Math.max(1, [...word].length - 1)) + close : all
    )
  );
  for (const w of ANYWHERE) out = out.split(w).join("*".repeat([...w].length));
  return out;
}

/** Names: any rude word in it, even run together or in camel case. */
export function hasProfanity(text: string): boolean {
  if (ANYWHERE.some((w) => text.includes(w))) return true;
  const words = text.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[\s_\-.,]+/);
  if (words.some(rude)) return true;
  const joined = squeeze(plain(text));
  return IN_NAMES.some((w) => joined.includes(w));
}

/** Whether a filter is on: the room's switch if an admin set it, else the world's default. */
export function filterOn(worldState: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = worldState[key];
  return typeof v === "boolean" ? v : fallback;
}
