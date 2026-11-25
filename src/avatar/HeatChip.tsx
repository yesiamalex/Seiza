import { useEffect, useState } from "react";
import { L, useLang } from "../i18n/lang";
import { currentHeatIndex, HEAT_LEVEL_LABELS, heatLevel, heatLoad, LOCAL_HEAT, useHeatReactions } from "./heat";

/**
 * The heat index, shown only once a walk is starting to tell (your heat
 * load building): the number, PAGASA's word for it, and how far your
 * avatar has to go before it slows. Quiet otherwise.
 */
const LEVEL_COLORS = { fine: "#7fd4ff", caution: "#ffd166", "extreme-caution": "#ff9a5a", danger: "#ff5a5a", "extreme-danger": "#c63bff" } as const;

export function HeatChip() {
  useLang();
  const on = useHeatReactions();
  const [state, setState] = useState({ load: 0, hi: 0 });
  useEffect(() => {
    const timer = window.setInterval(() => setState({ load: heatLoad(LOCAL_HEAT), hi: currentHeatIndex() }), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!on || state.load < 0.08) return null;
  const level = heatLevel(state.hi);
  const color = LEVEL_COLORS[level];
  return (
    <div role="status" style={{ position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(16,18,24,0.72)", color: "#fff", border: `1px solid ${color}`, fontSize: 12, zIndex: 25, pointerEvents: "none" }}>
      <span>{L(`Heat index ${Math.round(state.hi)} °C`, `暑さ指数 ${Math.round(state.hi)} °C`)}</span>
      <strong style={{ color }}>{L(...HEAT_LEVEL_LABELS[level])}</strong>
      <span aria-hidden style={{ width: 54, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
        <span style={{ display: "block", width: `${Math.round(state.load * 100)}%`, height: "100%", background: color }} />
      </span>
      {state.load >= 0.55 && <span style={{ opacity: 0.8 }}>{L("Rest in the shade", "日陰で休もう")}</span>}
    </div>
  );
}
