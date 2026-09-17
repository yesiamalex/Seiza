import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../multiplayer/types";
import { BAR_LABEL_CLASS, barButtonActiveStyle, barButtonStyle, panelStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { ChatIcon } from "../ui/icons";

interface ChatPanelProps {
  open: boolean;
  onToggle: () => void;
  messages: ChatMessage[];
  selfId: string | null;
  onSend: (text: string) => void;
  connected: boolean;
}

const MAX_MESSAGE_LENGTH = 500;

export function ChatPanel({ open, onToggle, messages, selfId, onSend, connected }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        className="seiza-bar-btn"
        style={open ? barButtonActiveStyle : barButtonStyle}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Chat${messages.length > 0 ? ` (${messages.length} messages)` : ""}`}
        title="Chat"
      >
        <ChatIcon />
        <span className={BAR_LABEL_CLASS}>Chat</span>
        {!open && messages.length > 0 && (
          <span style={{ fontSize: 11, opacity: 0.75 }}>{messages.length}</span>
        )}
      </button>
      {open && (
        <div className="seiza-popover" style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", width: 280, maxHeight: 320, padding: 0, overflow: "hidden" }}>
          <div
            ref={listRef}
            style={{ overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: 13, flex: 1 }}
          >
            {messages.length === 0 && <p style={{ opacity: 0.6, margin: 0 }}>No messages yet — say hello.</p>}
            {messages.map((m) => (
              <div key={m.id}>
                <strong style={{ color: m.senderId === selfId ? "#7CFF9E" : "#9ecbff" }}>{m.senderName}: </strong>
                <span style={{ wordBreak: "break-word" }}>{m.text}</span>
              </div>
            ))}
          </div>
          {!connected && (
            <small style={{ color: "#ffb347", padding: "0 10px 6px" }}>Not connected — messages won't send until you reconnect.</small>
          )}
          <form onSubmit={handleSubmit} style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              placeholder="Message…"
              disabled={!connected}
              style={{ flex: 1, border: "none", padding: "8px 10px", background: "transparent", color: "white" }}
            />
            <button type="submit" disabled={!connected || !draft.trim()} style={{ ...pillButtonStyle, borderRadius: 0, border: "none" }}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
