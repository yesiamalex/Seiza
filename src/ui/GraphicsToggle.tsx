import type { CSSProperties } from "react";
import { pillButtonStyle } from "./styles";
import { L } from "../i18n/lang";
import { lowEndDevice, setGraphicsChoice, useGraphicsChoice, type GraphicsChoice } from "../scene/graphics";

const NEXT: Record<GraphicsChoice, GraphicsChoice> = { auto: "high", high: "medium", medium: "low", low: "auto" };

/**
 * The graphics button: Auto → High → Medium → Low. Auto says which it picked.
 * `compact`, for the top bar in a world (beside 日本語): just "◐ Auto".
 * Sharpness and shadows change at once; avatars' textures, as they next load.
 */
export function GraphicsToggle({ style, compact = false }: { style?: CSSProperties; compact?: boolean }) {
  const choice = useGraphicsChoice();
  const picked = lowEndDevice() ? L("Low", "低") : L("High", "高");
  const short = choice === "auto" ? L("Auto", "自動") : choice === "high" ? L("High", "高") : choice === "medium" ? L("Medium", "中") : L("Low", "低");
  const label = compact ? `◐ ${short}` : choice === "auto" ? L(`Graphics: Auto (${picked})`, `画質:自動(${picked})`) : L(`Graphics: ${short}`, `画質:${short}`);
  return (
    <button
      type="button"
      onClick={() => setGraphicsChoice(NEXT[choice])}
      style={{ ...pillButtonStyle, fontWeight: 600, whiteSpace: "nowrap", ...style }}
      aria-label={L(`Graphics: ${short}. Tap to change.`, `画質:${short}。タップで切り替え。`)}
      title={L(`Graphics: ${short}${choice === "auto" ? ` (${picked} on this device)` : ""}. Low is lighter for older phones, Medium between, High sharpest. Tap to change.`, `画質:${short}${choice === "auto" ? `(この端末では${picked})` : ""}。「低」は古いスマホ向けの軽い設定、「中」はその間、「高」はいちばんくっきり。タップで切り替え。`)}
    >
      {label}
    </button>
  );
}
