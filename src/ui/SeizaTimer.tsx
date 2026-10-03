import { useEffect, useState } from "react";
import { phaseFor, SEIZA_CLOCK_SPEED, seizaSeconds } from "../avatar/seizaEndurance";
import { panelStyle } from "./styles";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * The clock that appears while you kneel in seiza: how long, and what it
 * is doing to you (see seizaEndurance.ts). Out of the way at the top of
 * the screen, and gone the moment you stand.
 */
export function SeizaTimer({ startedAt, best }: { startedAt: number; best: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(seizaSeconds(startedAt));
    tick();
    const id = window.setInterval(tick, Math.max(50, 1000 / SEIZA_CLOCK_SPEED));
    return () => window.clearInterval(id);
  }, [startedAt]);

  const phase = phaseFor(seconds);
  return (
    <div
      role="status"
      aria-label={`In seiza for ${fmt(seconds)}. ${phase.label}.`}
      style={{
        ...panelStyle,
        position: "absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 64px)",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 14px",
        borderRadius: 999,
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        pointerEvents: "none",
        zIndex: 6,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "#e8c37a", fontWeight: 700 }}>正座</span>
      <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(seconds)}</span>
      <span style={{ opacity: 0.8 }}>
        {phase.jp} · {phase.label}
      </span>
      {best > 0 && <span style={{ opacity: 0.5, fontSize: 12 }}>Best {fmt(best)}</span>}
    </div>
  );
}

export { fmt as formatSeizaTime };
