// The close-up view on a flat screen: a piece large, with its group, the
// words its makers chose, and a caption; Previous and Next walk along the
// line or lane it was opened from. Boards open their full text here too.
// Shown through Seiza's world overlay (showWorldOverlay), over the world.
import { useEffect, useState } from "react";
import { panelStyle, pillButtonStyle } from "../../../src/ui/styles";
import { GROUP_COLORS, PIECE_BY_ID, texUrl, viewUrl, type Group, type Kind } from "./collection";
import { PORTAL_BY_GROUP } from "./Portals";
import { boardText, subtitle, type BoardKey } from "./info";
import { openPiece, step, useViewer } from "./viewer";
import { L, useLang } from "../../../src/i18n/lang";

const KIND: Record<Kind, [string, string]> = {
  art: ["Art", "作品"],
  tour: ["Walking tour", "まち歩き"],
  poster: ["Collage wall", "コラージュの壁"],
  dance: ["Dance", "ダンス"],
};
/** What a piece is, in the visitor's language. */
export const kindLabel = (kind: Kind) => L(...KIND[kind]);

export function SeisugboHud() {
  useLang();
  const { open, sequence } = useViewer();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") openPiece(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  const close = () => openPiece(null);
  const board = open.startsWith("board:") ? (open.slice(6) as BoardKey) : null;
  if (open.startsWith("portal:")) return <PortalCard group={open.slice(7) as Group} onClose={close} />;
  return (
    <div
      role="dialog"
      aria-label={board ? boardText(board).title : PIECE_BY_ID[open]?.title}
      onClick={close}
      style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 12, pointerEvents: "auto", zIndex: 40, background: "rgba(8,10,16,0.45)" }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ ...panelStyle, width: board ? "min(560px, 100%)" : "min(920px, 100%)", maxHeight: "92vh", overflowY: "auto", padding: 14, fontSize: 14, lineHeight: 1.5 }}
      >
        {board ? <BoardCard board={board} /> : <PieceCard id={open} />}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          {sequence.length > 1 && !board ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" style={pillButtonStyle} onClick={() => step(-1)}>
                {L("‹ Previous", "‹ 前へ")}
              </button>
              <span style={{ fontSize: 12, opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
                {sequence.indexOf(open) + 1} / {sequence.length}
              </span>
              <button type="button" style={pillButtonStyle} onClick={() => step(1)}>
                {L("Next ›", "次へ ›")}
              </button>
            </div>
          ) : (
            <span />
          )}
          <button type="button" style={pillButtonStyle} onClick={close} aria-label={L("Close", "閉じる")}>
            {L("Close", "閉じる")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PieceCard({ id }: { id: string }) {
  const piece = PIECE_BY_ID[id];
  // The small picture at once (it's already loaded in the world), then the
  // large one when it arrives.
  const [large, setLarge] = useState(false);
  useEffect(() => setLarge(false), [id]);
  if (!piece) return null;
  const color = GROUP_COLORS[piece.group];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <strong style={{ fontSize: 18 }}>{piece.title}</strong>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: color, borderRadius: 999, padding: "1px 9px" }}>{L(`Group ${piece.group}`, `${piece.group}グループ`)}</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{kindLabel(piece.kind)}</span>
      </div>
      <div
        style={{
          position: "relative",
          borderRadius: 8,
          overflow: "hidden",
          background: piece.cutout ? "#e9e4d8" : "#111",
          display: "grid",
          placeItems: "center",
          aspectRatio: `${piece.px[0]} / ${piece.px[1]}`,
          maxHeight: "62vh",
          margin: "0 auto",
          width: `min(100%, calc(62vh * ${piece.px[0] / piece.px[1]}))`,
        }}
      >
        <img src={texUrl(id)} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", filter: large ? "none" : "blur(2px)" }} />
        <img
          key={id}
          src={viewUrl(id)}
          alt={L(`${piece.title}, by Group ${piece.group}${piece.caption ? `: ${piece.caption}` : ""}`, `${piece.title}(${piece.group}グループ)${piece.caption ? `:${piece.caption}` : ""}`)}
          onLoad={() => setLarge(true)}
          style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain", opacity: large ? 1 : 0, transition: "opacity 160ms" }}
        />
      </div>
      {piece.words && (
        <div style={{ display: "grid", gap: 4, marginTop: 10 }}>
          {piece.words.map((line) => (
            <div key={line} style={{ padding: "5px 9px", borderRadius: 7, borderLeft: `4px solid ${color}`, background: "rgba(127,127,127,0.12)", whiteSpace: "pre-line" }}>
              {line.replace(/ \/ /g, "\n")}
            </div>
          ))}
        </div>
      )}
      {piece.caption && <p style={{ margin: "10px 0 0" }}>{piece.caption}</p>}
      {piece.by && <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.75 }}>{L(`By ${piece.by}`, `作:${piece.by}`)}</p>}
      <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.6 }}>{subtitle()}</p>
    </div>
  );
}

function BoardCard({ board }: { board: BoardKey }) {
  const text = boardText(board);
  return (
    <div>
      <strong style={{ fontSize: 18 }}>{text.title}</strong>
      {text.subtitle && <div style={{ opacity: 0.75, marginBottom: 6 }}>{text.subtitle}</div>}
      {text.paragraphs.map((p) => (
        <p key={p.slice(0, 32)} style={{ margin: "0 0 8px" }}>
          {p}
        </p>
      ))}
      {text.list?.map((list, i) => (
        <div key={i}>
          {list.heading && <div style={{ fontWeight: 700, margin: "10px 0 4px" }}>{list.heading}</div>}
          {(() => {
            const items = list.items.map((item) => <li key={item} style={{ marginBottom: 4 }}>{item}</li>);
            return list.numbered ? <ol style={{ margin: 0, paddingLeft: 22 }}>{items}</ol> : <ul style={{ margin: 0, paddingLeft: 20 }}>{items}</ul>;
          })()}
        </div>
      ))}
    </div>
  );
}

/** Before leaving for a group's FrameVR room: where it goes, and a link
 *  that opens it in a new tab, so this room stays open behind. */
function PortalCard({ group, onClose }: { group: Group; onClose: () => void }) {
  const portal = PORTAL_BY_GROUP[group];
  if (!portal) return null;
  return (
    <div role="dialog" aria-label={L(`Group ${group}'s FrameVR space`, `${group}グループのFrameVRスペース`)} onClick={onClose} style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 12, pointerEvents: "auto", zIndex: 40, background: "rgba(8,10,16,0.45)" }}>
      <div onClick={(event) => event.stopPropagation()} style={{ ...panelStyle, width: "min(420px, 100%)", padding: 16, display: "grid", gap: 10, fontSize: 14, lineHeight: 1.5 }}>
        <strong style={{ fontSize: 18, color: GROUP_COLORS[group] }}>{L(`Group ${group} in FrameVR`, `FrameVRの${group}グループ`)}</strong>
        <p style={{ margin: 0 }}>
          {L(`This portal goes to Group ${group}'s own space in FrameVR, at `, `このポータルは、FrameVRにある${group}グループのスペース `)}
          <span style={{ fontFamily: "monospace" }}>{portal.url.replace("https://", "")}</span>
          {L(". It opens in a new tab, and this room stays open here.", " へつながります。新しいタブで開き、この部屋は開いたままです。")}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={pillButtonStyle} onClick={onClose}>
            {L("Stay here", "ここに残る")}
          </button>
          <a href={portal.url} target="_blank" rel="noopener noreferrer" onClick={onClose} style={{ ...pillButtonStyle, textDecoration: "none", fontWeight: 700, background: GROUP_COLORS[group], color: "#fff" }}>
            {L("Open FrameVR", "FrameVRを開く")}
          </a>
        </div>
      </div>
    </div>
  );
}

