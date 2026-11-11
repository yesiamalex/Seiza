// Seizorai's HUD: the info cards (InfoCardHost), an "Ask Ilaw-san" button,
// and the chat with Ilaw-san, on a flat screen or a phone. Shown through
// Seiza's world overlay. In a headset, Xr.tsx shows the same conversation.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { panelStyle, pillButtonStyle } from "../../../../src/ui/styles";
import { INFO } from "../../sim/info";
import { InfoCardHost, openInfo } from "../InfoCard";
import { ask, goTo, MAX_QUESTION, setChatOpen, useChat, type Message } from "./store";

export function SeizoraiHud() {
  const chat = useChat();
  return (
    <>
      <InfoCardHost />
      {!chat.open && (
        <button type="button" onClick={() => setChatOpen(true)} style={askButton} aria-label="Ask Ilaw-san, the guide">
          <span aria-hidden style={{ fontSize: 16 }}>🏮</span> Ask Ilaw-san
        </button>
      )}
      {chat.open && <Chat messages={chat.messages} />}
    </>
  );
}

const askButton: CSSProperties = {
  ...pillButtonStyle,
  position: "fixed",
  top: 64,
  left: 16,
  zIndex: 30,
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontWeight: 600,
};

function Chat({ messages }: { messages: Message[] }) {
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  useEffect(() => {
    // A phone's keyboard would cover the world; focus only with a real keyboard.
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, []);
  const last = messages[messages.length - 1];
  const send = (q: string) => {
    ask(q);
    setText("");
  };
  return (
    <div
      role="dialog"
      aria-label="Chat with Ilaw-san"
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
        if (event.key === "Escape") setChatOpen(false);
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <span aria-hidden style={{ fontSize: 20 }}>🏮</span>
        <div style={{ flex: 1 }}>
          <strong>Ilaw-san</strong>
          <div style={{ fontSize: 11, opacity: 0.65 }}>Seizorai's guide · answers only from this world, offline</div>
        </div>
        <button type="button" style={pillButtonStyle} onClick={() => setChatOpen(false)} aria-label="Close the chat">
          Close
        </button>
      </div>
      <div ref={list} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "grid", gap: 8, alignContent: "start" }} aria-live="polite">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {last?.reply && last.reply.suggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {last.reply.suggestions.map((s) => (
              <button key={s} type="button" style={{ ...pillButtonStyle, fontSize: 12, padding: "4px 10px" }} onClick={() => send(s)}>
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
          placeholder="Ask about the sun, wind, battery…"
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

function Bubble({ message }: { message: Message }) {
  const mine = message.from === "you";
  const r = message.reply;
  return (
    <div style={{ justifySelf: mine ? "end" : "start", maxWidth: "88%" }}>
      <div
        style={{
          padding: "7px 10px",
          borderRadius: 12,
          background: mine ? "rgba(122,162,255,0.22)" : "rgba(255,200,116,0.14)",
          border: `1px solid ${mine ? "rgba(122,162,255,0.35)" : "rgba(255,200,116,0.3)"}`,
        }}
      >
        {message.text}
      </div>
      {r && (r.card || r.place) && (
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          {r.card && (
            <button type="button" style={{ ...pillButtonStyle, fontSize: 12, padding: "3px 9px" }} onClick={() => openInfo(r.card!)}>
              Open “{INFO[r.card].title}”
            </button>
          )}
          {r.place && (
            <button type="button" style={{ ...pillButtonStyle, fontSize: 12, padding: "3px 9px" }} onClick={() => goTo(r.place!)}>
              Take me there
            </button>
          )}
        </div>
      )}
    </div>
  );
}
