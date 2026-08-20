import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../multiplayer/types";
import { panelStyle, pillButtonActiveStyle, pillButtonStyle } from "../ui/styles";

interface ChatPanelProps {
  open: boolean;
  onToggle: () => void;
  messages: ChatMessage[];
  selfId: string | null;
  onSend: (text: string) => void;
}

const MAX_MESSAGE_LENGTH = 500;

export function ChatPanel({ open, onToggle, messages, selfId, onSend }: ChatPanelProps) {
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
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column-reverse", gap: 8, alignItems: "center" }}>
      <button style={open ? pillButtonActiveStyle : pillButtonStyle} onClick={onToggle}>
        💬 Chat{!open && messages.length > 0 ? ` (${messages.length})` : ""}
      </button>
      {open && (
        <div style={{ ...panelStyle, display: "flex", flexDirection: "column", width: 280, maxHeight: 320, padding: 0, overflow: "hidden" }}>
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
          <form onSubmit={handleSubmit} style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              placeholder="Message…"
              style={{ flex: 1, border: "none", padding: "8px 10px", background: "transparent", color: "white" }}
            />
            <button type="submit" disabled={!draft.trim()} style={{ ...pillButtonStyle, borderRadius: 0, border: "none" }}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
