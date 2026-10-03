import { useEffect, useState } from "react";
import { phaseFor, SEIZA_CLOCK_SPEED, SEIZA_PHASES, seizaSeconds } from "../avatar/seizaEndurance";
import { panelStyle } from "./styles";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Small things worth knowing, shown one at a time while you kneel. */
const TIDBITS = [
  "正座 means \"proper sitting\": the formal posture of tea ceremony, calligraphy and the dojo.",
  "Its sound twin 星座 means \"constellation\", hence the kneeling figure under a starry sky.",
  "Everyone in the room sees your avatar doze off and wince as the minutes pass.",
  "Move or jump to stand up. After two minutes, your legs will be asleep for a few steps.",
  "In real seiza, numb feet are normal. Stand up slowly and let them wake.",
];
const TIDBIT_SECONDS = 7;

/**
 * The clock that appears while you kneel in seiza: how long, what it is
 * doing to you, what comes next (see seizaEndurance.ts), and a rotating
 * line about the posture itself. Out of the way at the top of the screen,
 * and gone the moment you stand.
 */
export function SeizaTimer({ startedAt, best }: { startedAt: number; best: number }) {
  const [seconds, setSeconds] = useState(0);
  const [tidbit, setTidbit] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(seizaSeconds(startedAt));
    tick();
    const id = window.setInterval(tick, Math.max(50, 1000 / SEIZA_CLOCK_SPEED));
    return () => window.clearInterval(id);
  }, [startedAt]);
  // Real seconds, not the seiza clock: a tip should stay up long enough to
  // read even when the clock is sped up for a demonstration.
  useEffect(() => {
    setTidbit(0);
    const id = window.setInterval(() => setTidbit((i) => (i + 1) % TIDBITS.length), TIDBIT_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const phase = phaseFor(seconds);
  const next = SEIZA_PHASES.find((p) => p.at > seconds);
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
        padding: "9px 16px 10px",
        borderRadius: 16,
        width: "max-content",
        maxWidth: "min(92vw, 440px)",
        display: "grid",
        gap: 4,
        justifyItems: "center",
        textAlign: "center",
        pointerEvents: "none",
        zIndex: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, whiteSpace: "nowrap" }}>
        <span style={{ color: "#e8c37a", fontWeight: 700 }}>正座</span>
        <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(seconds)}</span>
        <span style={{ opacity: 0.85 }}>
          {phase.jp} · {phase.label}
        </span>
        {best > 0 && <span style={{ opacity: 0.5, fontSize: 12 }}>Best {fmt(best)}</span>}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
        {next ? `Next: ${next.label.toLowerCase()} in ${fmt(next.at - seconds)}` : "The final phase. How long can you hold it?"}
      </div>
      <div key={tidbit} className="seiza-tabpanel" style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", lineHeight: 1.4 }}>
        {TIDBITS[tidbit]}
      </div>
    </div>
  );
}

export { fmt as formatSeizaTime };
