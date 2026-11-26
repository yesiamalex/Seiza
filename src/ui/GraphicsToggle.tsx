import type { CSSProperties } from "react";
import { pillButtonStyle } from "./styles";
import { L } from "../i18n/lang";
import { lowEndDevice, setGraphicsChoice, useGraphicsChoice, type GraphicsChoice } from "../scene/graphics";

const NEXT: Record<GraphicsChoice, GraphicsChoice> = { auto: "high", high: "low", low: "auto" };

/** The graphics button: Auto → High → Low. Auto says which it picked. */
export function GraphicsToggle({ style }: { style?: CSSProperties }) {
  const choice = useGraphicsChoice();
  const picked = lowEndDevice() ? L("Low", "低") : L("High", "高");
  const label = choice === "auto" ? L(`Graphics: Auto (${picked})`, `画質:自動(${picked})`) : choice === "high" ? L("Graphics: High", "画質:高") : L("Graphics: Low", "画質:低");
  return (
    <button
      type="button"
      onClick={() => setGraphicsChoice(NEXT[choice])}
      style={{ ...pillButtonStyle, fontWeight: 600, ...style }}
      title={L("Low is lighter for older phones: sharper is High. Takes effect as you enter.", "「低」は古いスマホ向けの軽い設定です。入室時に反映されます。")}
    >
      {label}
    </button>
  );
}
