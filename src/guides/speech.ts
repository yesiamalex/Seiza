import { isSfxMuted } from "../audio/sfx";

/**
 * Spoken lines, in the browser's own voices (the Web Speech API): a
 * townsperson's greeting, a station's announcement. Nothing to download,
 * and nothing if the browser has no voice for the language (it's skipped,
 * not read in the wrong accent). Quiet when sound effects are muted; never
 * more than a couple of lines waiting, so walking past several people
 * doesn't build a queue of them.
 */
const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
let waiting = 0;

function voiceFor(lang: string): SpeechSynthesisVoice | null {
  const voices = synth?.getVoices() ?? [];
  const base = lang.slice(0, 2);
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(base)) ?? null;
}
// Some browsers only list their voices after a moment.
synth?.getVoices();

export interface SpeakOptions {
  /** 0 to 1: farther away is quieter. */
  volume?: number;
  rate?: number;
  pitch?: number;
}

/** Says `text` in `lang` ("ja-JP", "en-US"). Returns whether it was spoken. */
export function speak(text: string, lang: string, options: SpeakOptions = {}): boolean {
  if (!synth || isSfxMuted()) return false;
  const volume = Math.min(1, Math.max(0, options.volume ?? 1));
  if (volume < 0.05 || waiting > 1) return false;
  const voice = voiceFor(lang);
  if (!voice) return false;
  const line = new SpeechSynthesisUtterance(text);
  line.voice = voice;
  line.lang = voice.lang;
  line.volume = volume;
  line.rate = options.rate ?? 1;
  line.pitch = options.pitch ?? 1;
  waiting++;
  const done = () => {
    waiting = Math.max(0, waiting - 1);
  };
  line.onend = done;
  line.onerror = done;
  synth.speak(line);
  return true;
}

/** Stops anything being said (leaving a world). */
export function hush() {
  synth?.cancel();
  waiting = 0;
}
