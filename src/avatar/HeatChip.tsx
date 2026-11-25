import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { L, useLang } from "../i18n/lang";
import { pillButtonStyle } from "../ui/styles";
import { Docked } from "../ui/StatusDock";
import { ceilingHeightAt, floorHeightAt, getGround, isBlocked } from "../scene/layout";
import { coolBy, currentHeatIndex, drinkReadyIn, drinkWater, faintPhase, HEAT_LEVEL_LABELS, heatLevel, heatLoad, inDeclaredShade, LOCAL_HEAT, onFaintChange, setFaint, useHeatReactions } from "./heat";

/**
 * The heat index, shown only once a walk is starting to tell (your heat
 * load building): the number, PAGASA's word for it, how full your load
 * is, and a drink of water to bring it down. Near full, the edges of the
 * screen go red; full, you faint (FaintOverlay) and come to in the shade.
 */
const LEVEL_COLORS = { fine: "#7fd4ff", caution: "#ffd166", "extreme-caution": "#ff9a5a", danger: "#ff5a5a", "extreme-danger": "#c63bff" } as const;

export function HeatChip() {
  useLang();
  const on = useHeatReactions();
  const [state, setState] = useState({ load: 0, hi: 0, wait: 0 });
  const [sip, setSip] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setState({ load: heatLoad(LOCAL_HEAT), hi: currentHeatIndex(), wait: drinkReadyIn() }), 500);
    return () => window.clearInterval(timer);
  }, []);
  if (!on || state.load < 0.08) return null;
  const level = heatLevel(state.hi);
  const color = LEVEL_COLORS[level];
  // The red edge: from nothing at 80% to strong at full.
  const edge = Math.max(0, Math.min(1, (state.load - 0.8) / 0.2));
  const drink = () => {
    if (drinkWater()) setSip(Date.now());
  };
  return (
    <>
      {edge > 0 && (
        <div
          aria-hidden
          style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 24, boxShadow: `inset 0 0 ${80 + 120 * edge}px rgba(200,20,30,${0.35 + 0.4 * edge})`, animation: "seiza-heat-throb 1.4s ease-in-out infinite", transition: "box-shadow 500ms" }}
        />
      )}
      <style>{"@keyframes seiza-heat-throb { 50% { opacity: 0.7; } } @media (prefers-reduced-motion: reduce) { [style*='seiza-heat-throb'] { animation: none !important; } }"}</style>
      <Docked order={2}>
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px 5px 12px", borderRadius: 999, background: "rgba(16,18,24,0.72)", color: "#fff", border: `1px solid ${color}`, fontSize: 12, pointerEvents: "auto" }}>
          <span>{L(`Heat index ${Math.round(state.hi)} °C`, `暑さ指数 ${Math.round(state.hi)} °C`)}</span>
          <strong style={{ color }}>{L(...HEAT_LEVEL_LABELS[level])}</strong>
          <span aria-hidden style={{ width: 54, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
            <span style={{ display: "block", width: `${Math.round(state.load * 100)}%`, height: "100%", background: edge > 0 ? "#ff3b45" : color, transition: "width 500ms" }} />
          </span>
          {state.load >= 0.55 && <span style={{ opacity: 0.8 }}>{L("Rest in the shade", "日陰で休もう")}</span>}
          <button
            type="button"
            onClick={drink}
            disabled={state.wait > 0}
            title={state.wait > 0 ? L(`Again in ${Math.ceil(state.wait / 1000)} s`, `あと${Math.ceil(state.wait / 1000)}秒`) : L("Drink some water", "水を飲む")}
            style={{ ...pillButtonStyle, padding: "3px 10px", fontSize: 12, opacity: state.wait > 0 ? 0.5 : 1 }}
          >
            {Date.now() - sip < 1500 ? L("Ahh", "ふう") : state.wait > 0 ? `${Math.ceil(state.wait / 1000)} s` : L("Drink water", "水を飲む")}
          </button>
        </div>
      </Docked>
    </>
  );
}

// --- fainting --------------------------------------------------------------------------

const WAKE_KEY = "seiza.wakeAt";
export type WakeAt = "shade" | "arrival";
export function wakeAt(): WakeAt {
  try {
    return localStorage.getItem(WAKE_KEY) === "arrival" ? "arrival" : "shade";
  } catch {
    return "shade";
  }
}
export function setWakeAt(next: WakeAt) {
  try {
    localStorage.setItem(WAKE_KEY, next);
  } catch {
    // Private mode: it just won't be remembered.
  }
}

const shadedAt = (x: number, y: number, z: number) => ceilingHeightAt(x, z) < Infinity || inDeclaredShade(x, z) || !!getGround()?.covered?.(x, y, z);

/**
 * Where you come to after fainting: the nearest shade you can stand in,
 * looked for in rings out to 60 m, or the arrival point if there's none
 * (or you'd rather: wakeAt).
 */
export function wakeSpot(from: [number, number, number], arrival: [number, number, number]): [number, number, number] {
  if (wakeAt() === "shade") {
    const [fx, fy, fz] = from;
    for (let r = 0; r <= 60; r += 2) {
      const steps = Math.max(1, Math.round((Math.PI * 2 * r) / 2));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = fx + Math.cos(a) * r;
        const z = fz + Math.sin(a) * r;
        const y = floorHeightAt(x, z);
        if (Math.abs(y - fy) < 3 && shadedAt(x, y, z) && !isBlocked(x, z)) return [x, y, z];
      }
    }
  }
  return arrival;
}

const DARK_MS = 1400;
const WAKE_MS = 3200;

/** The screen goes dark, you're moved somewhere cool, and you come to. */
export function FaintOverlay({ respawn }: { respawn: () => void }) {
  useLang();
  const phase = useSyncExternalStore(onFaintChange, faintPhase, faintPhase);
  // App hands a new function every render; the timers mustn't restart for it.
  const respawnRef = useRef(respawn);
  respawnRef.current = respawn;
  useEffect(() => {
    if (phase === "dark") {
      const t = window.setTimeout(() => {
        respawnRef.current();
        // Rested most of the way, not all of it.
        coolBy(0.75);
        setFaint("wake");
      }, DARK_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === "wake") {
      const t = window.setTimeout(() => setFaint("none"), WAKE_MS);
      return () => window.clearTimeout(t);
    }
  }, [phase]);
  if (phase === "none") return null;
  return (
    <div
      role="alert"
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", pointerEvents: "none", background: phase === "dark" ? "rgba(20,0,4,0.96)" : "rgba(20,0,4,0)", transition: `background ${phase === "dark" ? DARK_MS : WAKE_MS}ms ease`, color: "#fff", textAlign: "center", fontFamily: "system-ui, sans-serif", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}
    >
      <div style={{ display: "grid", gap: 6, opacity: phase === "wake" ? 1 : 0.9 }}>
        <strong style={{ fontSize: 22 }}>{L("You fainted!", "倒れてしまいました!")}</strong>
        <span style={{ fontSize: 15 }}>{wakeAt() === "shade" ? L("Someone helped you into the shade. Drink some water and rest a while.", "誰かが日陰まで運んでくれました。水を飲んで少し休みましょう。") : L("Someone helped you back to the start. Drink some water and rest a while.", "誰かが最初の場所まで運んでくれました。水を飲んで少し休みましょう。")}</span>
      </div>
    </div>
  );
}

/** For the settings: where you come to after fainting. */
export function WakeChoice() {
  useLang();
  const [at, setAt] = useState<WakeAt>(wakeAt);
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, paddingLeft: 26 }}>
      <span style={{ opacity: 0.75 }}>{L("If you faint, wake", "倒れたら")}</span>
      <select
        value={at}
        onChange={(e) => {
          const next = e.target.value as WakeAt;
          setAt(next);
          setWakeAt(next);
        }}
        style={{ background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "3px 6px" }}
      >
        <option value="shade">{L("in the nearest shade", "近くの日陰で")}</option>
        <option value="arrival">{L("at the arrival point", "最初の場所で")}</option>
      </select>
    </label>
  );
}
