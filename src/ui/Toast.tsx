import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "./useMediaQuery";
import { L, useLang } from "../i18n/lang";

/**
 * A transient message over the world: an error the app needs to admit to
 * ("WebXR is not available here") or a refusal it needs to explain
 * ("someone else is presenting on that screen").
 *
 * Every toast is both self-dismissing and manually closable, deliberately.
 * The previous inline version of this was neither for one of its two
 * message sources: its click handler cleared only the softer of the two
 * pieces of state, so the WebXR error — the single most likely one to
 * appear, since most desktop browsers have no XR runtime — stayed on
 * screen, over the control bar, for the rest of the session with no way
 * to get rid of it.
 *
 * A toast that can't be dismissed is a bug, so the dismissal path lives
 * here rather than at each call site where it can be forgotten again.
 */
export interface ToastProps {
  /** The message. Changing it restarts the auto-dismiss timer. */
  message: string;
  /** Errors are red and linger; plain notices are neutral and brief. */
  tone?: "info" | "error";
  /** Called after the fade-out finishes, not when it starts, so the
   *  caller's state clears exactly when the element leaves. */
  onDismiss: () => void;
  /** Visible milliseconds before the fade begins. */
  durationMs?: number;
  /** Distance above the bottom edge. Defaults to clearing the control bar. */
  bottom?: number;
}

const FADE_MS = 220;

export function Toast({ message, tone = "info", onDismiss, durationMs, bottom = 82 }: ToastProps) {
  useLang();
  const [leaving, setLeaving] = useState(false);
  // Held in a ref so the effect below doesn't need it as a dependency:
  // callers routinely pass an inline arrow, and depending on it would
  // restart the dismiss timer on every parent render — a toast that
  // never quite times out.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  // Matches how the HUD's popovers opt out of their entry animations.
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const visibleFor = durationMs ?? (tone === "error" ? 8000 : 4500);

  useEffect(() => {
    setLeaving(false);
    const fadeAt = window.setTimeout(() => setLeaving(true), visibleFor);
    const goneAt = window.setTimeout(() => onDismissRef.current(), visibleFor + FADE_MS);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(goneAt);
    };
    // `message` restarts the timer when the text changes, so a second
    // error replacing a first one gets its own full reading time.
  }, [message, visibleFor]);

  function dismissNow() {
    setLeaving(true);
    window.setTimeout(() => onDismissRef.current(), FADE_MS);
  }

  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        left: "50%",
        bottom,
        transform: `translateX(-50%) translateY(${leaving && !reduceMotion ? "6px" : "0"})`,
        opacity: leaving ? 0 : 1,
        transition: reduceMotion ? "none" : `opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`,
        maxWidth: "min(420px, 90vw)",
        padding: "10px 10px 10px 14px",
        borderRadius: 10,
        backgroundColor: tone === "error" ? "rgba(80,30,24,0.94)" : "rgba(28,34,46,0.94)",
        border: `1px solid ${tone === "error" ? "rgba(255,138,128,0.35)" : "rgba(255,255,255,0.12)"}`,
        color: "white",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        textAlign: "left",
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
      <button
        type="button"
        onClick={dismissNow}
        aria-label={L("Dismiss this message", "このメッセージを閉じる")}
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.06)",
          color: "inherit",
          cursor: "pointer",
          lineHeight: 1,
          fontSize: 13,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
