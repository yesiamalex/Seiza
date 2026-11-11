/**
 * Talking to a world's guides on a flat screen or a phone: an "Ask …"
 * button per guide, and the chat with whoever is open. Each answer can
 * offer to open a card (if the world has cards), to walk you there (the
 * guide leads the way), or to take you there at once. A world mounts this
 * in its overlay (showWorldOverlay), with anything else it shows there.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { panelStyle, pillButtonStyle } from "../ui/styles";
import { ask, goTo, lead, MAX_QUESTION, openGuide, useGuides, type Message } from "./store";

export interface GuideHudProps {
  /** Opens a card a reply points to, for a world that has them. */
  onOpenCard?: (card: string) => void;
  cardTitle?: (card: string) => string;
  /** One line under the guide's name in the chat. */
  tagline?: string;
}

export function GuideHud({ onOpenCard, cardTitle, tagline = "Answers only from this world, offline" }: GuideHudProps) {
  const { guides, open, threads } = useGuides();
  const guide = guides.find((g) => g.id === open);
  return (
    <>
      {!guide && guides.length > 0 && (
        <div style={{ position: "fixed", top: 64, left: 16, zIndex: 30, display: "flex", flexDirection: "column", gap: 6, pointerEvents: "auto" }}>
          {guides.map((g) => (
            <button key={g.id} type="button" onClick={() => openGuide(g.id)} style={askButton} aria-label={`Ask ${g.name}, a guide`}>
              <span aria-hidden>💬</span> Ask {g.name}
            </button>
          ))}
        </div>
      )}
      {guide && <Chat guideId={guide.id} name={guide.name} messages={threads[guide.id] ?? []} tagline={tagline} onOpenCard={onOpenCard} cardTitle={cardTitle} />}
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
}: {
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
      aria-label={`Chat with ${name}`}
      style={{
        ...panelStyle,
        position: "fixed",
        top: 64,
        left: 16,
        width: "min(380px, calc(100vw - 32px))",
        maxHeight: "min(560px, calc(100vh - 180px))",
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
          <div style={{ fontSize: 11, opacity: 0.65 }}>Guide · {tagline}</div>
        </div>
        <button type="button" style={pillButtonStyle} onClick={() => openGuide(null)} aria-label="Close the chat">
          Close
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
              </div>
              {r && ((r.card && onOpenCard) || r.place) && (
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {r.card && onOpenCard && (
                    <button type="button" style={small} onClick={() => onOpenCard(r.card!)}>
                      Open “{cardTitle?.(r.card) ?? r.card}”
                    </button>
                  )}
                  {r.place && r.place.walk !== false && (
                    <button type="button" style={small} onClick={() => lead(guideId, r.place!)}>
                      Walk me there
                    </button>
                  )}
                  {r.place && (
                    <button type="button" style={small} onClick={() => goTo(r.place!)}>
                      Take me there now
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
          placeholder={`Ask ${name}…`}
          aria-label="Your question"
          style={{ flex: 1, minWidth: 0, borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "inherit", padding: "8px 12px", font: "inherit" }}
        />
        <button type="submit" style={pillButtonStyle} disabled={!text.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
