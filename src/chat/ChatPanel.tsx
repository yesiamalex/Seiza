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

  // How many messages had arrived the last time the panel was open. What
  // the button showed before this was `messages.length` — the size of the
  // whole conversation, which only ever grows and tells you nothing about
  // whether there is something new to read. Unread is the difference
  // since you last looked.
  //
  // Seeded with the current length rather than 0, so joining a room with
  // existing backlog doesn't greet you with "47 unread" for a
  // conversation you were never part of.
  const seenCountRef = useRef(messages.length);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (open) {
      // Opening the panel is the read receipt.
      seenCountRef.current = messages.length;
      setUnread(0);
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      return;
    }
    // Your own messages never count as unread: you sent them, and the
    // panel closing behind you shouldn't badge you about yourself.
    const fresh = messages.slice(seenCountRef.current).filter((m) => m.senderId !== selfId);
    if (fresh.length > 0) setUnread((n) => n + fresh.length);
    seenCountRef.current = messages.length;
  }, [open, messages, selfId]);

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
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Chat${unread > 0 ? `, ${unread} unread message${unread === 1 ? "" : "s"}` : ""}`}
        title="Chat"
        style={{ ...(open ? barButtonActiveStyle : barButtonStyle), position: "relative" }}
      >
        <ChatIcon />
        <span className={BAR_LABEL_CLASS}>Chat</span>
        {unread > 0 && (
          <span
            // aria-hidden: the count is already in the button's
            // accessible name above, and announcing it twice is worse
            // than not announcing it here.
            aria-hidden
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 15,
              height: 15,
              padding: "0 4px",
              borderRadius: 999,
              background: "#ff5a52",
              color: "white",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "15px",
              textAlign: "center",
              boxShadow: "0 0 0 2px rgba(16,17,22,0.9)",
              pointerEvents: "none",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
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
