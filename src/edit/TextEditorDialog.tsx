import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_OBJECT_TEXT_LENGTH } from "../multiplayer/types";
import { inputStyle, panelStyle, pillButtonStyle, primaryButtonStyle } from "../ui/styles";
import { L, useLang } from "../i18n/lang";

interface TextEditorDialogProps {
  /** What the surface says now. */
  initialText: string;
  /** "board" or "note", only to word the dialog. */
  surface: "board" | "note";
  onSave: (text: string) => void;
  onCancel: () => void;
}

/**
 * Writes on a board or a note. Plain text on purpose: the first line is the
 * heading, blank lines break paragraphs, and a leading "-" makes a bullet.
 * That is enough for a notice or an agenda without inventing a markup
 * language, and it keeps what's synced to a short string.
 */
export function TextEditorDialog({ initialText, surface, onSave, onCancel }: TextEditorDialogProps) {
  useLang();
  const [draft, setDraft] = useState(initialText);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      // Ctrl/Cmd+Enter saves, since plain Enter is a new line here.
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) onSave(draft.slice(0, MAX_OBJECT_TEXT_LENGTH));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, onCancel, onSave]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={surface === "note" ? L("Write on this note", "このメモに書く") : L("Write on this board", "このボードに書く")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(4,5,8,0.6)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        pointerEvents: "auto",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="seiza-rise-in"
        style={{ ...panelStyle, width: "min(520px, 100%)", display: "flex", flexDirection: "column", gap: 10, padding: 16 }}
      >
        <strong>{surface === "note" ? L("Note", "メモ") : L("Board", "ボード")}</strong>
        <small style={{ opacity: 0.7 }}>
          {L(
            'The first line is the heading. Start a line with "-" for a bullet. Everyone in the room sees this.',
            "1行目が見出しになります。行頭に「-」で箇条書き。部屋の全員に見えます。"
          )}
        </small>
        <textarea
          value={draft}
          autoFocus
          rows={9}
          maxLength={MAX_OBJECT_TEXT_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <small style={{ opacity: 0.55 }}>
            {draft.length} / {MAX_OBJECT_TEXT_LENGTH}
          </small>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={pillButtonStyle} onClick={onCancel}>
              {L("Cancel", "キャンセル")}
            </button>
            <button type="button" style={primaryButtonStyle} onClick={() => onSave(draft.slice(0, MAX_OBJECT_TEXT_LENGTH))}>
              {L("Save", "保存")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
