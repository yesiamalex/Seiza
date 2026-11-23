import type { CSSProperties } from "react";
import { L, useLang } from "../i18n/lang";
import { pillButtonStyle } from "../ui/styles";
import { Hint, ModeButton } from "../addons/ui";
import { STROKE_COLORS } from "../multiplayer/types";
import { setPen, usePen } from "./pen";

const ACCENT = "#7fd4ff";

/** The pen, in the control bar: on and off, its colour, and taking lines back. */
export function DrawButton({ mine, canClearAll, onUndo, onClear }: { mine: number; canClearAll: boolean; onUndo: () => void; onClear: (all: boolean) => void }) {
  useLang();
  const pen = usePen();
  return (
    <ModeButton id="draw" accent={ACCENT} icon={<PenIcon />} label={pen.on ? L("Drawing", "描画中") : L("Draw", "描く")} title={L("Draw in the room", "部屋に描く")}>
      <strong style={{ color: ACCENT }}>{L("Draw", "描く")}</strong>
      <button type="button" onClick={() => setPen({ on: !pen.on })} style={toggle(pen.on)}>
        {pen.on ? L("Put the pen down", "ペンを置く") : L("Pick up the pen", "ペンを持つ")}
      </button>
      <div role="radiogroup" aria-label={L("Colour", "色")} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STROKE_COLORS.map((color, i) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={pen.color === i}
            aria-label={color}
            onClick={() => setPen({ color: i, on: true })}
            style={{ width: 26, height: 26, borderRadius: "50%", cursor: "pointer", background: color, border: "1px solid rgba(255,255,255,0.4)", boxShadow: pen.color === i ? `0 0 0 2px #111, 0 0 0 4px ${color}` : "none" }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={pillButtonStyle} disabled={mine === 0} onClick={onUndo}>
          {L("Undo my last", "最後の線を消す")}
        </button>
        <button type="button" style={pillButtonStyle} disabled={mine === 0} onClick={() => onClear(false)}>
          {L("Clear mine", "自分の線を消す")}
        </button>
        {canClearAll && (
          <button type="button" style={pillButtonStyle} onClick={() => onClear(true)}>
            {L("Clear everyone's", "全員の線を消す")}
          </button>
        )}
      </div>
      <Hint accent={ACCENT}>
        {L(
          "With the pen up, **drag across anything** to draw on it, a wall, the floor, a board; off everything, it draws in the air. **Right-drag** still looks around, and **Esc** puts the pen down. Everyone sees a line once you finish it. In VR: **hold the trigger** to draw, or **pinch** with tracked hands.",
          "ペンを持ったら、**壁や床、ボードの上をドラッグ**して描きます。何もない所では空中に描きます。**右ドラッグ**で見回し、**Esc**でペンを置きます。描き終えた線は全員に見えます。VRでは**トリガーを押したまま**、ハンドトラッキングでは**つまんで**描きます。"
        )}
      </Hint>
    </ModeButton>
  );
}

const toggle = (on: boolean): CSSProperties => ({
  ...pillButtonStyle,
  justifyContent: "center",
  ...(on ? { background: "rgba(127,212,255,0.25)", border: `1px solid ${ACCENT}` } : {}),
});

function PenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
      <path d="M14 6l3 3" />
    </svg>
  );
}
