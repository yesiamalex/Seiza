import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_OBJECT_TEXT_LENGTH } from "../multiplayer/types";
import { inputStyle, panelStyle, pillButtonStyle, primaryButtonStyle } from "../ui/styles";

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
      aria-label={surface === "note" ? "Write on this note" : "Write on this board"}
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
        <strong>{surface === "note" ? "Note" : "Board"}</strong>
        <small style={{ opacity: 0.7 }}>
          The first line is the heading. Start a line with "-" for a bullet. Everyone in the room sees this.
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
              Cancel
            </button>
            <button type="button" style={primaryButtonStyle} onClick={() => onSave(draft.slice(0, MAX_OBJECT_TEXT_LENGTH))}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
