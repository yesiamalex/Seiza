import { useEffect, useRef, useState } from "react";
import type { GestureDefinition } from "../avatar/gestures";
import { useExclusiveMenu } from "../ui/exclusiveMenu";
import { BAR_LABEL_CLASS, barButtonActiveStyle, barButtonStyle, panelStyle, pillButtonActiveStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { WaveIcon } from "../ui/icons";
import type { TogetherGesture } from "../multiplayer/types";
import { togetherLabel } from "./together";
import { L, useLang } from "../i18n/lang";
import { gestureLabel } from "../i18n/gestureLabels";

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
  /** Together gestures (handshake, high five, hug): who's near enough to
   *  ask, and whether others may ask you. Null when the world has none. */
  together?: {
    gestures: { name: TogetherGesture; label: string }[];
    nearby: { id: string; name: string }[];
    allow: boolean;
    onAllowChange: (allow: boolean) => void;
    /** Your own request is waiting for an answer. */
    waiting: boolean;
    onAsk: (peer: string, gesture: TogetherGesture) => void;
  } | null;
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
  together = null,
}: GesturePanelProps) {
  useLang();
  const [open, setOpen] = useState(false);
  useExclusiveMenu("gestures", open, () => setOpen(false));
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

  const labelOf = (name: string | null) => {
    const g = gestures.find((x) => x.name === name);
    return g ? gestureLabel(g) : name;
  };

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
            ? L("Custom clip replacing the built-in gesture of the same name", "同じ名前の標準ジェスチャーを置き換えるカスタムクリップ")
            : g.hold && g.fullBody
              ? L("Stays until you press again or move", "もう一度押すか動くまで続きます")
              : g.hold
                ? L("Press and hold to keep the pose", "押している間ポーズを保ちます")
                : undefined
        }
        {...holdHandlers}
      >
        {gestureLabel(g)}
        {g.overridesBuiltin && <span style={{ fontSize: 10, opacity: 0.7 }}>{L("custom", "カスタム")}</span>}
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
        aria-label={L("Gestures", "ジェスチャー")}
        title={L("Gestures", "ジェスチャー")}
      >
        <WaveIcon />
        <span className={BAR_LABEL_CLASS}>{L("Gestures", "ジェスチャー")}</span>
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
            <p style={{ margin: 0 }}>{L("This deployment has turned off every gesture.", "このデプロイではすべてのジェスチャーがオフになっています。")}</p>
          ) : (
            <>
              {together && (
                <Section title={L("Together", "いっしょに")}>
                  {together.nearby.length === 0 ? (
                    <small style={{ opacity: 0.7, lineHeight: 1.4 }}>
                      {L(
                        "Stand near someone to ask for a handshake, fist bump, hug, slow dance, and more. It only happens if they say yes.",
                        "誰かの近くに立つと、握手、グータッチ、ハグ、スローダンスなどを頼めます。相手が「はい」と言ったときだけ行われます。"
                      )}
                    </small>
                  ) : (
                    together.nearby.slice(0, 3).map((person) => (
                      <div key={person.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 12, opacity: 0.85 }}>{L(`Ask ${person.name} for`, `${person.name}さんに頼む`)}</span>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {together.gestures.map((g) => (
                            <button
                              key={g.name}
                              type="button"
                              disabled={together.waiting}
                              style={{ ...pillButtonStyle, padding: "7px 12px", fontSize: 12, opacity: together.waiting ? 0.5 : 1 }}
                              onClick={() => together.onAsk(person.id, g.name)}
                            >
                              {togetherLabel(g.name)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <input type="checkbox" checked={together.allow} onChange={(e) => together.onAllowChange(e.target.checked)} />
                    {L("Others may ask me", "ほかの人からのリクエストを受ける")}
                  </label>
                </Section>
              )}
              {builtin.length > 0 && (
                <Section title={L("Built-in", "標準")}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{builtin.map(renderButton)}</div>
                </Section>
              )}
              {custom.length > 0 && (
                <Section title={L("Custom for this world", "このワールド専用")}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{custom.map(renderButton)}</div>
                </Section>
              )}
              {gestures.some((g) => g.hold) && (
                <small style={{ opacity: 0.6 }}>
                  {L(
                    "A raised hand stays up while you hold its key. Seiza and Dance stay until you press them again, or move.",
                    "挙げた手はキーを押している間上がったままです。正座とダンスは、もう一度押すか動くまで続きます。"
                  )}
                </small>
              )}
              <small style={{ opacity: 0.6 }}>{L("Click a chair or bench in the world to sit down.", "ワールドの椅子やベンチをクリックすると座れます。")}</small>
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
                  {L("Practice mode", "練習モード")}
                </label>
                {practice && target && (
                  <p style={{ margin: 0, fontSize: 13 }}>
                    {L("Do this gesture: ", "このジェスチャーをしてください:")}<strong>{labelOf(target)}</strong>
                    {L(`. Score ${score}.`, `。スコア ${score}。`)}
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
