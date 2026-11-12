import type { CSSProperties } from "react";
import { pillButtonStyle } from "../ui/styles";
import { setLang, useLang } from "./lang";

/** The language button: English ⇄ 日本語. Shows the language it switches to. */
export function LangToggle({ style }: { style?: CSSProperties }) {
  const lang = useLang();
  const next = lang === "ja" ? "en" : "ja";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      style={{ ...pillButtonStyle, fontWeight: 600, ...style }}
      aria-label={lang === "ja" ? "Switch to English" : "日本語に切り替える (Switch to Japanese)"}
      title={lang === "ja" ? "English" : "日本語"}
      lang={next}
    >
      {lang === "ja" ? "EN" : "日本語"}
    </button>
  );
}
