import { useEffect, useRef, useState } from "react";
import type { GestureDefinition } from "../avatar/gestures";
import { BAR_LABEL_CLASS, barButtonActiveStyle, barButtonStyle, panelStyle, pillButtonActiveStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { WaveIcon } from "../ui/icons";

interface GesturePanelProps {
  gestures: GestureDefinition[];
  /** The local player's most recent gesture; `seq` changes on every trigger. */
  lastGesture: { name: string; seq: number } | null;
  onRequestGesture: (name: string) => void;
  /** Lets go of a held pose (see GestureDefinition.hold). */
  onReleaseGesture: (name: string) => void;
  /** Name of the held full-body pose, if any, so its button reads as on. */
  activePosture: string | null;
  /** Show number-key hints (desktop). */
  showShortcuts: boolean;
}

/**
 * Gesture menu plus the first pedagogical interaction module (paper
 * Section 4): an optional practice mode that prompts for a gesture and
 * scores matches.
 *
 * Built-in gestures and a deployment's custom ones are listed separately
 * so it's clear which is which; a custom clip that replaced a built-in is
 * listed under Custom with a note. See src/avatar/gestures.ts.
 */
export function GesturePanel({
  gestures,
  lastGesture,
  onRequestGesture,
  onReleaseGesture,
  activePosture,
  showShortcuts,
}: GesturePanelProps) {
  const [open, setOpen] = useState(false);
  const [practice, setPractice] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const seenSeq = useRef(lastGesture?.seq ?? 0);

  const builtin = gestures.filter((g) => g.source === "builtin");
  const custom = gestures.filter((g) => g.source === "custom");

  useEffect(() => {
    if (practice && !target && gestures.length) setTarget(pickRandom(gestures.map((g) => g.name)));
  }, [practice, target, gestures]);

  useEffect(() => {
    if (!lastGesture || lastGesture.seq === seenSeq.current) return;
    seenSeq.current = lastGesture.seq;
    if (practice && lastGesture.name === target) {
      setScore((s) => s + 1);
      setTarget(pickRandom(gestures.map((g) => g.name), target));
    }
  }, [lastGesture, practice, target, gestures]);

  const labelOf = (name: string | null) => gestures.find((g) => g.name === name)?.label ?? name;

  const renderButton = (g: GestureDefinition) => {
    const index = gestures.indexOf(g);
    const isActive = (practice && target === g.name) || activePosture === g.name;
    // 1–9 then 0, matching the keyboard shortcuts in App.tsx.
    const shortcut = index < 10 ? (index === 9 ? "0" : String(index + 1)) : null;
    // A full-body held pose toggles: press to take it up, press again to
    // stand. Anything else held follows the button, press and hold.
    const holdHandlers = g.hold && g.fullBody
      ? { onClick: () => onRequestGesture(g.name) }
      : g.hold
      ? {
          onPointerDown: () => onRequestGesture(g.name),
          onPointerUp: () => onReleaseGesture(g.name),
          onPointerLeave: () => onReleaseGesture(g.name),
          onPointerCancel: () => onReleaseGesture(g.name),
        }
      : { onClick: () => onRequestGesture(g.name) };
    return (
      <button
        key={g.name}
        type="button"
        style={{ ...(isActive ? pillButtonActiveStyle : pillButtonStyle), padding: "7px 12px", fontSize: 12, touchAction: "none" }}
        title={
          g.overridesBuiltin
            ? "Custom clip replacing the built-in gesture of the same name"
            : g.hold && g.fullBody
              ? "Stays until you press again or move"
              : g.hold
                ? "Press and hold to keep the pose"
                : undefined
        }
        {...holdHandlers}
      >
        {g.label}
        {g.overridesBuiltin && <span style={{ fontSize: 10, opacity: 0.7 }}>custom</span>}
        {showShortcuts && shortcut && <kbd style={{ fontSize: 10, opacity: 0.55 }}>{shortcut}</kbd>}
      </button>
    );
  };

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        className="seiza-bar-btn"
        style={open ? barButtonActiveStyle : barButtonStyle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Gestures"
        title="Gestures"
      >
        <WaveIcon />
        <span className={BAR_LABEL_CLASS}>Gestures</span>
        {practice && score > 0 && <span style={{ fontSize: 11, opacity: 0.75 }}>{score}</span>}
      </button>
      {open && (
        <div
          className="seiza-popover"
          style={{
            ...panelStyle,
            ...popoverStyle,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: "min(320px, calc(100vw - 32px))",
            maxHeight: "min(480px, calc(100svh - 150px))",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          {gestures.length === 0 ? (
            <p style={{ margin: 0 }}>This deployment has turned off every gesture.</p>
          ) : (
            <>
              {builtin.length > 0 && (
                <Section title="Built-in">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{builtin.map(renderButton)}</div>
                </Section>
              )}
              {custom.length > 0 && (
                <Section title="Custom for this world">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{custom.map(renderButton)}</div>
                </Section>
              )}
              {gestures.some((g) => g.hold) && (
                <small style={{ opacity: 0.6 }}>
                  A raised hand stays up while you hold its key. Seiza stays until you press its key again, or move.
                </small>
              )}
              <small style={{ opacity: 0.6 }}>Click a chair or bench in the world to sit down.</small>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={practice}
                    onChange={(e) => {
                      setPractice(e.target.checked);
                      setScore(0);
                      setTarget(null);
                    }}
                  />
                  Practice mode
                </label>
                {practice && target && (
                  <p style={{ margin: 0, fontSize: 13 }}>
                    Do this gesture: <strong>{labelOf(target)}</strong>. Score {score}.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <small style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>{title}</small>
      {children}
    </div>
  );
}

function pickRandom(list: string[], exclude?: string | null): string | null {
  const pool = exclude && list.length > 1 ? list.filter((x) => x !== exclude) : list;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}
