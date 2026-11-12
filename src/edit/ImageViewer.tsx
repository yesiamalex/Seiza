import { useEffect } from "react";
import type { WorldObject } from "../multiplayer/types";
import { panelStyle, pillButtonStyle, primaryButtonStyle } from "../ui/styles";
import { L, useLang } from "../i18n/lang";

/**
 * A placed picture, large: what anyone sees when they click one. If an
 * editor gave it a link (objectSetLink), an "Open link" button shows where
 * it goes before anyone follows it, and opens it in a new tab, so leaving
 * never drops you out of the room.
 */
export function ImageViewer({ object, onClose }: { object: WorldObject; onClose: () => void }) {
  useLang();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  let host = "";
  try {
    host = object.link ? new URL(object.link).hostname : "";
  } catch {
    host = "";
  }
  return (
    <div
      role="dialog"
      aria-label={L("Picture", "写真")}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 12, zIndex: 45, background: "rgba(8,10,16,0.55)", pointerEvents: "auto" }}
    >
      <div onClick={(event) => event.stopPropagation()} style={{ ...panelStyle, padding: 12, maxWidth: "min(1000px, 100%)", display: "grid", gap: 10 }}>
        {object.src && (
          <img src={object.src} alt={object.text ?? L("A picture placed in this room", "この部屋に飾られた写真")} style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: 8, justifySelf: "center" }} />
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
          {object.link && host && (
            <>
              <span style={{ fontSize: 12, opacity: 0.75, marginRight: "auto" }}>{L(`Links to ${host}`, `リンク先:${host}`)}</span>
              <a href={object.link} target="_blank" rel="noopener noreferrer" style={{ ...primaryButtonStyle, textDecoration: "none" }}>
                {L("Open link", "リンクを開く")}
              </a>
            </>
          )}
          <button type="button" style={pillButtonStyle} onClick={onClose}>
            {L("Close", "閉じる")}
          </button>
        </div>
      </div>
    </div>
  );
}
