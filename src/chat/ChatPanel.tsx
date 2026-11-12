import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../multiplayer/types";
import { BAR_LABEL_CLASS, barButtonActiveStyle, barButtonStyle, panelStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { ChatIcon } from "../ui/icons";
import { L, useLang, type Lang } from "../i18n/lang";
import { canTranslate, detectLang, translateTo, translatorSupported } from "./translate";

const TRANSLATE_KEY = "seiza.chat.translate";
/** Only the latest messages are translated, so a long backlog costs nothing. */
const TRANSLATE_RECENT = 30;

function loadTranslate(): boolean {
  try {
    return localStorage.getItem(TRANSLATE_KEY) === "on";
  } catch {
    return false;
  }
}
function saveTranslate(on: boolean) {
  try {
    localStorage.setItem(TRANSLATE_KEY, on ? "on" : "off");
  } catch {
    // Not remembered in a private window.
  }
}

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
  const lang = useLang();
  const [draft, setDraft] = useState("");
  const translation = useChatTranslation(open, messages, selfId, lang);
  const [draftBusy, setDraftBusy] = useState(false);
  // The draft goes into the other language: Japanese → English, and
  // anything else → Japanese.
  const draftTarget: Lang = detectLang(draft) === "ja" ? "en" : "ja";
  async function translateDraft() {
    const text = draft.trim();
    if (!text || draftBusy) return;
    setDraftBusy(true);
    try {
      const out = await translateTo(text, draftTarget);
      if (out) setDraft(out.slice(0, MAX_MESSAGE_LENGTH));
    } catch {
      translation.setError(L("Couldn't translate. Try again in a moment.", "翻訳できませんでした。少ししてからもう一度試してください。"));
    } finally {
      setDraftBusy(false);
    }
  }
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
        aria-label={L(
          `Chat${unread > 0 ? `, ${unread} unread message${unread === 1 ? "" : "s"}` : ""}`,
          `チャット${unread > 0 ? `、未読 ${unread} 件` : ""}`
        )}
        title={L("Chat", "チャット")}
        style={{ ...(open ? barButtonActiveStyle : barButtonStyle), position: "relative" }}
      >
        <ChatIcon />
        <span className={BAR_LABEL_CLASS}>{L("Chat", "チャット")}</span>
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
        <div className="seiza-popover" style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", width: 280, maxHeight: 340, padding: 0, overflow: "hidden" }}>
          {translation.supported && (
            <label
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.1)" }}
              title={L(
                "Translated in your browser. Nothing is sent anywhere. The first time, the browser downloads a small language pack.",
                "ブラウザの中で翻訳します。外部には送信されません。初回はブラウザが小さな言語パックをダウンロードします。"
              )}
            >
              <input type="checkbox" checked={translation.on} onChange={(e) => translation.setOn(e.target.checked)} />
              {L("Translate messages into English", "メッセージを日本語に翻訳")}
            </label>
          )}
          <div
            ref={listRef}
            style={{ overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: 13, flex: 1 }}
          >
            {messages.length === 0 && <p style={{ opacity: 0.6, margin: 0 }}>{L("No messages yet — say hello.", "まだメッセージはありません。あいさつしてみましょう。")}</p>}
            {messages.map((m) => {
              const translated = translation.of(m.id);
              return (
                <div key={m.id}>
                  <strong style={{ color: m.senderId === selfId ? "#7CFF9E" : "#9ecbff" }}>{m.senderName}: </strong>
                  <span style={{ wordBreak: "break-word" }}>{m.text}</span>
                  {translated && (
                    <div lang={lang} style={{ wordBreak: "break-word", opacity: 0.7, fontSize: 12, paddingLeft: 8, borderLeft: "2px solid rgba(255,255,255,0.18)", marginTop: 2 }}>
                      {translated}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!connected && (
            <small style={{ color: "#ffb347", padding: "0 10px 6px" }}>
              {L("Not connected — messages won't send until you reconnect.", "接続していません。再接続するまでメッセージは送信されません。")}
            </small>
          )}
          {translation.error && <small style={{ color: "#ffb347", padding: "0 10px 6px" }}>{translation.error}</small>}
          <form onSubmit={handleSubmit} style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              placeholder={L("Message…", "メッセージ…")}
              disabled={!connected}
              style={{ flex: 1, minWidth: 0, border: "none", padding: "8px 10px", background: "transparent", color: "white" }}
            />
            {translation.supported && (
              <button
                type="button"
                disabled={!draft.trim() || draftBusy}
                onClick={() => void translateDraft()}
                title={draftTarget === "ja" ? L("Translate my message into Japanese", "メッセージを日本語に翻訳") : L("Translate my message into English", "メッセージを英語に翻訳")}
                aria-label={draftTarget === "ja" ? L("Translate my message into Japanese", "メッセージを日本語に翻訳") : L("Translate my message into English", "メッセージを英語に翻訳")}
                style={{ ...pillButtonStyle, borderRadius: 0, border: "none", padding: "0 8px", fontSize: 12, opacity: draft.trim() ? 1 : 0.5 }}
              >
                {draftBusy ? "…" : draftTarget === "ja" ? "→あ" : "→A"}
              </button>
            )}
            <button type="submit" disabled={!connected || !draft.trim()} style={{ ...pillButtonStyle, borderRadius: 0, border: "none" }}>
              {L("Send", "送信")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * Chat messages translated into the visitor's own language, when they've
 * turned it on and their browser can (see translate.ts). Messages already
 * in that language, and your own, are left alone.
 */
function useChatTranslation(open: boolean, messages: ChatMessage[], selfId: string | null, lang: Lang) {
  const supported = translatorSupported();
  const [on, setOnState] = useState(() => supported && loadTranslate());
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Set<string>());

  const setOn = (next: boolean) => {
    setError(null);
    setOnState(next);
    saveTranslate(next);
    if (!next) return;
    const from: Lang = lang === "ja" ? "en" : "ja";
    void canTranslate(from, lang).then((ok) => {
      if (ok) return;
      setOnState(false);
      setError(L("This browser can't translate between English and Japanese.", "このブラウザでは英語と日本語の翻訳ができません。"));
    });
  };

  useEffect(() => {
    if (!on || !open) return;
    for (const m of messages.slice(-TRANSLATE_RECENT)) {
      const key = `${m.id}:${lang}`;
      if (m.senderId === selfId || key in done || pending.current.has(key)) continue;
      const from = detectLang(m.text);
      if (!from || from === lang) continue;
      pending.current.add(key);
      translateTo(m.text, lang)
        .then((text) => setDone((prev) => ({ ...prev, [key]: text ?? "" })))
        .catch(() => {
          // Most often the language pack needs a click to start
          // downloading: the checkbox is that click.
          setOnState(false);
          setError(L("Couldn't start translating. Tick the box again to retry.", "翻訳を開始できませんでした。もう一度チェックを入れてください。"));
        })
        .finally(() => pending.current.delete(key));
    }
  }, [on, open, messages, selfId, lang, done]);

  return {
    supported,
    on,
    setOn,
    error,
    setError,
    of: (id: string) => (on ? done[`${id}:${lang}`] || null : null),
  };
}
