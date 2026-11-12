/**
 * English ⇄ Japanese for chat, using the browser's own on-device
 * Translator API (Chrome 138 and later on desktop). Nothing is sent
 * anywhere: the browser downloads a small language pack once and
 * translates locally. Where the API is missing (Firefox, Safari, phones
 * for now), `translatorSupported()` is false and the chat shows no
 * translation controls at all.
 *
 * Only these two languages, because those are the two Seiza's own words
 * come in (see src/i18n/lang.ts).
 */
import type { Lang } from "../i18n/lang";

interface BrowserTranslator {
  translate(text: string): Promise<string>;
}
interface TranslatorStatic {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<BrowserTranslator>;
}

function api(): TranslatorStatic | null {
  const t = (globalThis as { Translator?: TranslatorStatic }).Translator;
  return t && typeof t.create === "function" ? t : null;
}

export function translatorSupported(): boolean {
  return api() !== null;
}

/** Kana or kanji anywhere means Japanese; otherwise any Latin letter
 *  means English. Emoji, numbers, and punctuation alone mean neither. */
export function detectLang(text: string): Lang | null {
  if (/[぀-ヿ㐀-鿿ｦ-ﾟ]/.test(text)) return "ja";
  if (/[A-Za-z]{2,}/.test(text)) return "en";
  return null;
}

const translators = new Map<string, Promise<BrowserTranslator>>();

/**
 * One translator per direction, made on first use. Making one may start
 * the language-pack download, which the browser only allows right after
 * a click or a key press, so the first call should come from one.
 */
function translatorFor(from: Lang, to: Lang): Promise<BrowserTranslator> {
  const key = `${from}-${to}`;
  let made = translators.get(key);
  if (!made) {
    const t = api();
    if (!t) return Promise.reject(new Error("unsupported"));
    made = t.create({ sourceLanguage: from, targetLanguage: to });
    // A failed attempt (no click yet, or offline) can be tried again.
    made.catch(() => translators.delete(key));
    translators.set(key, made);
  }
  return made;
}

/** Whether this browser can translate `from` → `to` at all. */
export async function canTranslate(from: Lang, to: Lang): Promise<boolean> {
  const t = api();
  if (!t) return false;
  try {
    return (await t.availability({ sourceLanguage: from, targetLanguage: to })) !== "unavailable";
  } catch {
    return false;
  }
}

/** `text` in `to`, or null when it's already in `to` or has no words. */
export async function translateTo(text: string, to: Lang): Promise<string | null> {
  const from = detectLang(text);
  if (!from || from === to) return null;
  const translator = await translatorFor(from, to);
  return translator.translate(text);
}
