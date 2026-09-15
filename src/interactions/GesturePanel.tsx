import { useEffect, useRef, useState } from "react";
import type { GestureDefinition } from "../avatar/gestures";
import { panelStyle, pillButtonActiveStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { WaveIcon } from "../ui/icons";

interface GesturePanelProps {
  gestures: GestureDefinition[];
  /** The local player's most recent gesture; `seq` changes on every trigger. */
  lastGesture: { name: string; seq: number } | null;
  onRequestGesture: (name: string) => void;
  /** Show 1–9 keyboard hints (desktop). */
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
export function GesturePanel({ gestures, lastGesture, onRequestGesture, showShortcuts }: GesturePanelProps) {
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
    const isActive = practice && target === g.name;
    return (
      <button
        key={g.name}
        type="button"
        style={{ ...(isActive ? pillButtonActiveStyle : pillButtonStyle), padding: "7px 12px", fontSize: 12 }}
        onClick={() => onRequestGesture(g.name)}
        title={g.overridesBuiltin ? "Custom clip replacing the built-in gesture of the same name" : undefined}
      >
        {g.label}
        {g.overridesBuiltin && <span style={{ fontSize: 10, opacity: 0.7 }}>custom</span>}
        {showShortcuts && index < 9 && <kbd style={{ fontSize: 10, opacity: 0.55 }}>{index + 1}</kbd>}
      </button>
    );
  };

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button type="button" style={open ? pillButtonActiveStyle : pillButtonStyle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <WaveIcon /> Gestures {practice && score > 0 ? `(${score})` : ""}
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
