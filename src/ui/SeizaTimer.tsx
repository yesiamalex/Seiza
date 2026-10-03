import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { phaseFor, SEIZA_CLOCK_SPEED, SEIZA_PHASES, seizaSeconds, type SeizaPhase } from "../avatar/seizaEndurance";
import { ChevronDownIcon, ChevronUpIcon, MinimizeIcon, PowerIcon } from "./icons";
import { panelStyle, pillButtonStyle } from "./styles";

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

/** Each phase's colour: the dot beside its name and the ring of the badge. */
const PHASE_COLOR: Record<SeizaPhase, string> = {
  composed: "#a9c4ff",
  dozing: "#c3b2ff",
  numb: "#ffd27a",
  agony: "#ff8f7a",
};

/** How the timer shows: the full panel, one line, or a badge in the top bar. */
export type SeizaTimerView = "full" | "compact" | "badge";

const VIEW_KEY = "seiza-timer-view";
export function loadSeizaTimerView(): SeizaTimerView {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    return value === "compact" || value === "badge" ? value : "full";
  } catch {
    return "full";
  }
}
export function saveSeizaTimerView(view: SeizaTimerView) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Not remembered in a private window.
  }
}

/** Seconds in seiza, ticking at the (possibly sped-up) seiza clock. */
function useSeizaClock(startedAt: number) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(seizaSeconds(startedAt));
    tick();
    const id = window.setInterval(tick, Math.max(50, 1000 / SEIZA_CLOCK_SPEED));
    return () => window.clearInterval(id);
  }, [startedAt]);
  return seconds;
}

/** How far through the current phase, 0..1 (1 in the last phase). */
function phaseProgress(seconds: number) {
  const phase = phaseFor(seconds);
  const next = SEIZA_PHASES.find((p) => p.at > seconds);
  return { phase, next, progress: next ? (seconds - phase.at) / (next.at - phase.at) : 1 };
}

const iconButton: CSSProperties = {
  width: 26,
  height: 26,
  padding: 0,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,0.7)",
  cursor: "pointer",
  flexShrink: 0,
};

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="seiza-icon-btn" aria-label={label} title={label} onClick={onClick} style={iconButton}>
      {children}
    </button>
  );
}

function PhaseDot({ phase }: { phase: SeizaPhase }) {
  return <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: PHASE_COLOR[phase], flexShrink: 0 }} />;
}

interface SeizaTimerProps {
  startedAt: number;
  best: number;
  view: Exclude<SeizaTimerView, "badge">;
  onViewChange: (view: SeizaTimerView) => void;
  onTurnOff: () => void;
}

/**
 * The clock that appears while you kneel in seiza: how long, what it is
 * doing to you, what comes next (see seizaEndurance.ts), and a rotating
 * line about the posture itself. It folds to a single line, or to a badge
 * in the top bar (SeizaTimerBadge), and its power button turns the whole
 * feature off. Gone the moment you stand.
 */
export function SeizaTimer({ startedAt, best, view, onViewChange, onTurnOff }: SeizaTimerProps) {
  const seconds = useSeizaClock(startedAt);
  const [tidbit, setTidbit] = useState(0);
  // Real seconds, not the seiza clock: a tip should stay up long enough to
  // read even when the clock is sped up for a demonstration.
  useEffect(() => {
    setTidbit(0);
    const id = window.setInterval(() => setTidbit((i) => (i + 1) % TIDBITS.length), TIDBIT_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const { phase, next, progress } = phaseProgress(seconds);
  const compact = view === "compact";
  const muted = "rgba(255,255,255,0.55)";

  return (
    <div
      role="group"
      aria-label={`Seiza timer: ${fmt(seconds)}, ${phase.label}`}
      className="seiza-fade-in"
      style={{
        ...panelStyle,
        position: "absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 64px)",
        left: "50%",
        transform: "translateX(-50%)",
        padding: compact ? "5px 6px 5px 14px" : "10px 8px 12px 16px",
        borderRadius: compact ? 999 : 16,
        width: compact ? "max-content" : "min(calc(100vw - 32px), 340px)",
        boxSizing: "border-box",
        pointerEvents: "auto",
        zIndex: 6,
      }}
    >
      {/* Time and controls. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "#e8c37a", fontWeight: 700, fontSize: 13 }}>正座</span>
        <span style={{ fontSize: compact ? 15 : 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{fmt(seconds)}</span>
        {compact && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: muted, whiteSpace: "nowrap" }}>
            <PhaseDot phase={phase.id} />
            {phase.jp}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {compact ? (
          <IconButton label="Show details" onClick={() => onViewChange("full")}>
            <ChevronDownIcon size={16} />
          </IconButton>
        ) : (
          <IconButton label="Show the time only" onClick={() => onViewChange("compact")}>
            <ChevronUpIcon size={16} />
          </IconButton>
        )}
        <IconButton label="Minimise to the top bar" onClick={() => onViewChange("badge")}>
          <MinimizeIcon size={16} />
        </IconButton>
        {!compact && (
          <IconButton label="Turn off reactions for my avatar" onClick={onTurnOff}>
            <PowerIcon size={15} />
          </IconButton>
        )}
      </div>

      {!compact && (
        <>
          {/* Where you are, and how far to the next phase. */}
          <div style={{ marginTop: 10, paddingRight: 8, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <PhaseDot phase={phase.id} />
              <span style={{ fontWeight: 600 }}>{phase.jp}</span>
              <span style={{ color: muted }}>{phase.label}</span>
              <span style={{ flex: 1 }} />
              {best > 0 && <span style={{ color: muted, fontSize: 11, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>Best {fmt(best)}</span>}
            </div>
            <div aria-hidden style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(1, progress) * 100}%`, background: PHASE_COLOR[next?.id ?? phase.id], transition: "width 0.4s linear" }} />
            </div>
            <div style={{ fontSize: 12, color: muted, fontVariantNumeric: "tabular-nums" }}>
              {next ? (
                <>
                  {next.label} in <span style={{ color: "rgba(255,255,255,0.85)" }}>{fmt(next.at - seconds)}</span>
                </>
              ) : (
                "The final phase. How long can you hold it?"
              )}
            </div>
          </div>

          {/* A rotating tip, set apart from the readout. */}
          <div style={{ marginTop: 10, marginRight: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#e8c37a" }}>TIP</span>
              <span aria-hidden style={{ display: "inline-flex", gap: 3 }}>
                {TIDBITS.map((_, i) => (
                  <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: i === tidbit ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)" }} />
                ))}
              </span>
            </div>
            <div key={tidbit} className="seiza-tabpanel" style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 1.45 }}>
              {TIDBITS[tidbit]}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The timer folded into the top bar: a round badge beside the help button,
 * its ring filling toward the next phase in that phase's colour. Pressing
 * it opens the full timer again.
 */
export function SeizaTimerBadge({ startedAt, onOpen }: { startedAt: number; onOpen: () => void }) {
  const seconds = useSeizaClock(startedAt);
  const { phase, next, progress } = phaseProgress(seconds);
  const ring = PHASE_COLOR[next?.id ?? phase.id];
  const label = `In seiza ${fmt(seconds)}, ${phase.label}. Show the seiza timer`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onOpen}
      className="seiza-fade-in"
      style={{
        ...pillButtonStyle,
        width: 36,
        height: 36,
        padding: 0,
        justifyContent: "center",
        flexShrink: 0,
        pointerEvents: "auto",
        // The ring: a conic fill behind a smaller disc.
        background: `conic-gradient(${ring} ${Math.min(1, progress) * 360}deg, rgba(255,255,255,0.12) 0)`,
        border: "none",
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 3,
          borderRadius: "50%",
          background: "rgba(24,22,28,0.92)",
          display: "grid",
          placeItems: "center",
          fontSize: 10,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
        }}
      >
        {fmt(seconds)}
      </span>
    </button>
  );
}

export { fmt as formatSeizaTime };
