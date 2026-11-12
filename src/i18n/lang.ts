/**
 * English or Japanese, for every visitor's own view (and nothing else: the
 * room, other people, and what's written on boards by people stay as they
 * are). Chosen with the language button (LangToggle), remembered on this
 * device, and Japanese by default on a browser set to Japanese.
 *
 * Text is written in place with both versions side by side, English
 * first: `L("Join", "参加")`. A component that shows text calls `useLang()`
 * once so it redraws when the language changes; canvas-drawn boards pass
 * `lang` in their redraw dependencies.
 */
import { useSyncExternalStore } from "react";

export type Lang = "en" | "ja";

const STORAGE_KEY = "seiza.lang";

function initial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ja") return saved;
  } catch {
    // Storage blocked (a private window): fall through to the browser.
  }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ja")) return "ja";
  return "en";
}

let lang: Lang = typeof window === "undefined" ? "en" : initial();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not remembered, but still switched for this visit.
  }
  if (typeof document !== "undefined") document.documentElement.lang = next;
  for (const l of listeners) l();
}

/** The current language, and redraws the component when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lang,
    () => "en"
  );
}

/** Calls `listener` when the language changes (for code outside React). */
export function onLangChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The text in the current language. */
export function L(en: string, ja: string): string {
  return lang === "ja" ? ja : en;
}

/** For text with a number or a name in it: both versions as functions. */
export function Lf<A extends unknown[]>(en: (...a: A) => string, ja: (...a: A) => string): (...a: A) => string {
  return (...a: A) => (lang === "ja" ? ja(...a) : en(...a));
}

if (typeof document !== "undefined") document.documentElement.lang = lang;
