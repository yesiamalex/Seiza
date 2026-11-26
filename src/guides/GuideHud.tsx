/**
 * Talking to a world's guides on a flat screen or a phone: a "Talk to …"
 * button per guide, and the chat with whoever is open. Each answer can
 * offer to open a card (if the world has cards), to walk you there (the
 * guide leads the way), or to take you there at once. A world mounts this
 * in its overlay (showWorldOverlay), with anything else it shows there.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { panelStyle, pillButtonStyle } from "../ui/styles";
import { useMediaQuery } from "../ui/useMediaQuery";
import { TOUCH_CONTROLS_CLEARANCE_CSS } from "../player/touchControlsMetrics";

/** From under the top bar down to just above the touch controls. */
const CLEAR_OF_CONTROLS = `calc(100dvh - 64px - ${TOUCH_CONTROLS_CLEARANCE_CSS} - env(safe-area-inset-bottom, 0px))`;
import { L, useLang } from "../i18n/lang";
import { ask, goTo, lead, MAX_QUESTION, openGuide, useGuides, type Message } from "./store";

export interface GuideHudProps {
  /** Opens a card a reply points to, for a world that has them. */
  onOpenCard?: (card: string) => void;
  cardTitle?: (card: string) => string;
  /** One line under the guide's name in the chat. */
  tagline?: string;
}

export function GuideHud({ onOpenCard, cardTitle, tagline }: GuideHudProps) {
  useLang();
  tagline ??= L("Knows this world well, and talks offline", "このワールドにくわしく、オフラインで話せます");
  const { guides, open, threads } = useGuides();
  const guide = guides.find((g) => g.id === open);
  // On a touch screen the joystick and buttons fill the bottom: nothing here
  // may reach them. And a town of guides is one button that opens a list,
  // not a column of them down the screen.
  const touch = useMediaQuery("(pointer: coarse)");
  const [listing, setListing] = useState(false);
  const many = guides.length > 2;
  const room = touch ? CLEAR_OF_CONTROLS : "calc(100dvh - 64px - 120px)";
  return (
    <>
      {!guide && guides.length > 0 && (
        <div style={{ position: "fixed", top: 64, left: 16, zIndex: 30, display: "flex", flexDirection: "column", gap: 6, pointerEvents: "auto", maxWidth: "calc(100vw - 32px)" }}>
          {many && (
            <button type="button" onClick={() => setListing((v) => !v)} style={askButton} aria-expanded={listing} aria-label={L("Talk to someone here", "ここの人と話す")}>
              <span aria-hidden>💬</span> {L(`Talk to… (${guides.length})`, `話しかける…(${guides.length}人)`)}
            </button>
          )}
          {(!many || listing) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: room, overflowY: "auto", paddingRight: 2 }}>
              {guides.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setListing(false);
                    openGuide(g.id);
                  }}
                  style={askButton}
                  aria-label={L(`Talk to ${g.name}, a guide`, `ガイドの${g.name}と話す`)}
                >
                  <span aria-hidden>💬</span> {L(`Talk to ${g.name}`, `${g.name}と話す`)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {guide && <Chat guideId={guide.id} name={guide.name} messages={threads[guide.id] ?? []} tagline={tagline} onOpenCard={onOpenCard} cardTitle={cardTitle} touch={touch} />}
    </>
  );
}

const askButton: CSSProperties = { ...pillButtonStyle, display: "flex", alignItems: "center", gap: 6, fontWeight: 600 };
const small: CSSProperties = { ...pillButtonStyle, fontSize: 12, padding: "3px 9px" };

function Chat({
  guideId,
  name,
  messages,
  tagline,
  onOpenCard,
  cardTitle,
  touch = false,
}: {
  touch?: boolean;
  guideId: string;
  name: string;
  messages: Message[];
  tagline: string;
  onOpenCard?: (card: string) => void;
  cardTitle?: (card: string) => string;
}) {
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  useEffect(() => {
    // A phone's keyboard would cover the world; focus only with a real keyboard.
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, [guideId]);
  const last = messages[messages.length - 1];
  const send = (q: string) => {
    ask(guideId, q);
    setText("");
  };
  return (
    <div
      role="dialog"
      aria-label={L(`Chat with ${name}`, `${name}とのチャット`)}
      style={{
        ...panelStyle,
        position: "fixed",
        top: 64,
        left: 16,
        width: "min(380px, calc(100vw - 32px))",
        // Clear of the touch controls on a phone.
        maxHeight: touch ? `min(560px, ${CLEAR_OF_CONTROLS})` : "min(560px, calc(100vh - 180px))",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        zIndex: 30,
        pointerEvents: "auto",
        fontSize: 14,
        lineHeight: 1.45,
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") openGuide(null);
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ flex: 1 }}>
          <strong>{name}</strong>
          <div style={{ fontSize: 11, opacity: 0.65 }}>{L("Guide", "ガイド")} · {tagline}</div>
        </div>
        <button type="button" style={pillButtonStyle} onClick={() => openGuide(null)} aria-label={L("Close the chat", "チャットを閉じる")}>
          {L("Close", "閉じる")}
        </button>
      </div>
      <div ref={list} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "grid", gap: 8, alignContent: "start" }} aria-live="polite">
        {messages.map((m) => {
          const mine = m.from === "you";
          const r = m.reply;
          return (
            <div key={m.id} style={{ justifySelf: mine ? "end" : "start", maxWidth: "88%" }}>
              <div
                style={{
                  padding: "7px 10px",
                  borderRadius: 12,
                  background: mine ? "rgba(122,162,255,0.22)" : "rgba(255,200,116,0.14)",
                  border: `1px solid ${mine ? "rgba(122,162,255,0.35)" : "rgba(255,200,116,0.3)"}`,
                }}
              >
                {m.text}
                {r?.translation && <div style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid rgba(255,255,255,0.12)", fontSize: "0.86em", opacity: 0.72 }}>{r.translation}</div>}
              </div>
              {r && ((r.card && onOpenCard) || r.place) && (
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {r.card && onOpenCard && (
                    <button type="button" style={small} onClick={() => onOpenCard(r.card!)}>
                      {L(`Open “${cardTitle?.(r.card) ?? r.card}”`, `「${cardTitle?.(r.card) ?? r.card}」を開く`)}
                    </button>
                  )}
                  {r.place && r.place.walk !== false && (
                    <button type="button" style={small} onClick={() => lead(guideId, r.place!)}>
                      {L("Walk me there", "そこまで案内して")}
                    </button>
                  )}
                  {r.place && (
                    <button type="button" style={small} onClick={() => goTo(r.place!)}>
                      {L("Take me there now", "今すぐ連れて行って")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {last?.reply && last.reply.suggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {last.reply.suggestions.map((s) => (
              <button key={s} type="button" style={small} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
        style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}
      >
        <input
          ref={input}
          value={text}
          maxLength={MAX_QUESTION}
          onChange={(event) => setText(event.target.value)}
          placeholder={L(`Say something to ${name}…`, `${name}に話しかける…`)}
          aria-label={L("Your question", "あなたの質問")}
          style={{ flex: 1, minWidth: 0, borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "inherit", padding: "8px 12px", font: "inherit" }}
        />
        <button type="submit" style={pillButtonStyle} disabled={!text.trim()}>
          {L("Ask", "質問")}
        </button>
      </form>
    </div>
  );
}
