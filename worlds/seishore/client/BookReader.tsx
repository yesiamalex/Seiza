// A book off the bookshop's shelf, open on the screen: its title, a line
// about it, and its pages, in a hand too small to read (scribbles), turned
// one spread at a time. Nothing to download: the pages are drawn here.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { L, useLang } from "../../../src/i18n/lang";

export interface Book {
  ja: string;
  en: string;
  line: string;
}

let open: { book: Book; spread: number } | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** Opens a book at its first spread (or closes it, with null). */
export function openBook(book: Book | null): void {
  open = book ? { book, spread: 0 } : null;
  changed();
}
function turn(by: number) {
  if (!open) return;
  open = { ...open, spread: Math.max(0, Math.min(SPREADS - 1, open.spread + by)) };
  changed();
}

const SPREADS = 6;
const FONT = "system-ui, 'Hiragino Sans', 'Noto Sans CJK JP', sans-serif";

/** A page of handwriting too small to read: lines of joined-up loops, a paragraph break now and then. */
function scribbles(seed: number, width: number, top: number, lines: number): string {
  let n = seed * 9301 + 49297;
  const rnd = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  let d = "";
  for (let i = 0; i < lines; i++) {
    const y = top + i * 15;
    // A short line ends a paragraph; the next starts indented.
    const indent = i > 0 && rnd() < 0.18 ? 14 : 0;
    const end = rnd() < 0.15 ? width * (0.35 + rnd() * 0.3) : width - rnd() * 10;
    let x = 14 + indent;
    d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
    while (x < end) {
      const step = 3 + rnd() * 4;
      const up = 2 + rnd() * 4;
      d += ` q${(step / 2).toFixed(1)} ${(-up).toFixed(1)} ${step.toFixed(1)} 0`;
      x += step;
      // A gap between words.
      if (rnd() < 0.16) {
        x += 4;
        d += ` m4 0`;
      }
    }
  }
  return d;
}

function Page({ seed, title, line, folio }: { seed: number; title?: string; line?: string; folio: number }) {
  const path = useMemo(() => scribbles(seed, 220, title ? 92 : 26, title ? 15 : 19), [seed, title]);
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0, background: "linear-gradient(90deg, #f3ead6, #fbf6ea)", padding: 0 }}>
      <svg viewBox="0 0 248 330" width="100%" style={{ display: "block" }} aria-hidden="true">
        {title && (
          <>
            <text x="124" y="40" textAnchor="middle" style={{ font: `700 17px ${FONT}`, fill: "#3a2c22" }}>
              {title}
            </text>
            <line x1="84" y1="56" x2="164" y2="56" stroke="#8a6545" strokeWidth="1" />
          </>
        )}
        <path d={path} fill="none" stroke="#3a3330" strokeWidth="0.9" strokeLinecap="round" opacity="0.72" />
        <text x="124" y="320" textAnchor="middle" style={{ font: `10px ${FONT}`, fill: "#8a7a66" }}>
          {folio}
        </text>
      </svg>
      {line && <p style={{ position: "absolute", left: 14, right: 14, top: 62, margin: 0, font: `italic 12px/1.35 ${FONT}`, color: "#5a4a3a" }}>{line}</p>}
    </div>
  );
}

/** The open book, if there is one, over the world. */
export function BookReader() {
  useLang();
  const state = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open
  );
  useEffect(() => {
    if (!state) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") openBook(null);
      else if (e.key === "ArrowRight") turn(1);
      else if (e.key === "ArrowLeft") turn(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [state]);
  if (!state) return null;
  const { book, spread } = state;
  const seed = [...book.en].reduce((a, c) => a + c.charCodeAt(0), 0);
  const button = { border: "none", borderRadius: 999, padding: "7px 14px", background: "rgba(255,255,255,0.14)", color: "#fff", cursor: "pointer", font: `14px ${FONT}` } as const;
  return (
    <div role="dialog" aria-label={L(`Reading ${book.en}`, `『${book.ja}』を読む`)} style={{ position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 16, background: "rgba(8,10,16,0.45)" }} onClick={() => openBook(null)}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", boxShadow: "0 18px 50px rgba(0,0,0,0.5), inset 0 0 0 6px #5a3a22", padding: 6, background: "#5a3a22" }}>
          <Page seed={seed + spread * 2} title={spread === 0 ? book.ja : undefined} line={spread === 0 ? `${book.en}. ${book.line}` : undefined} folio={spread * 2 + 1} />
          <div style={{ width: 2, background: "linear-gradient(90deg, #c9b896, #8a7a66, #c9b896)" }} />
          <Page seed={seed + spread * 2 + 1} folio={spread * 2 + 2} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", color: "#fff", font: `13px ${FONT}` }}>
          <button type="button" style={{ ...button, opacity: spread === 0 ? 0.4 : 1 }} disabled={spread === 0} onClick={() => turn(-1)}>
            ‹ {L("Back", "前へ")}
          </button>
          <span style={{ opacity: 0.8, minWidth: 60, textAlign: "center" }}>
            {spread + 1} / {SPREADS}
          </span>
          <button type="button" style={{ ...button, opacity: spread === SPREADS - 1 ? 0.4 : 1 }} disabled={spread === SPREADS - 1} onClick={() => turn(1)}>
            {L("Turn the page", "めくる")} ›
          </button>
          <button type="button" style={button} onClick={() => openBook(null)}>
            {L("Put it back", "棚に戻す")}
          </button>
        </div>
      </div>
    </div>
  );
}
