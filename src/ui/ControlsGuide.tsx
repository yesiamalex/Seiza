import { useEffect, useRef } from "react";
import { useExclusiveMenu } from "./exclusiveMenu";
import { useDismissOnOutside } from "./useDismissOnOutside";
import { CloseIcon } from "./icons";
import { ACCENT_COLOR, panelStyle, pillButtonStyle, primaryButtonStyle } from "./styles";

const SEEN_KEY = "seiza:controls-guide-seen";

/** Whether this browser has already dismissed the guide once. Storage can
 *  be blocked (private mode, previews); then it just shows each visit. */
export function hasSeenControlsGuide(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markControlsGuideSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Not remembered; it shows again next visit. Harmless.
  }
}

type Row = [keys: string[], action: string];

// Kept to what's actually wired up (PlayerRig.tsx, App.tsx, TouchControls),
// and short on purpose: the gestures and avatar panels label themselves.
const KEYBOARD: { title: string; rows: Row[] }[] = [
  {
    title: "Move",
    rows: [
      [["W", "A", "S", "D"], "Walk (or arrow keys)"],
      [["Shift"], "Hold to run"],
      [["Z"], "Hold to crouch (slower, quieter)"],
      [["Space"], "Jump, or stand up"],
      [["Drag"], "Look around"],
      [["Scroll"], "Zoom"],
    ],
  },
  {
    title: "Interact",
    rows: [
      [["Double-click"], "Walk to a spot on the floor"],
      [["Click"], "Sit, open doors, use screens"],
      [["1–0"], "Gestures"],
    ],
  },
  {
    title: "Shortcuts",
    rows: [
      [["C"], "Avatar menu"],
      [["V"], "First / third person"],
      [["G"], "Move tool (while editing)"],
      [["R"], "Rotate tool (while editing)"],
      [["Esc"], "Close a menu"],
      [["?"], "This guide"],
    ],
  },
];

const TOUCH: { title: string; rows: Row[] }[] = [
  {
    title: "Move",
    rows: [
      [["Pad"], "Walk; slide your thumb to turn"],
      [["Tap ↑↑"], "Double-tap forward to run"],
      [["Jump"], "Jump, or stand up"],
      [["Crouch"], "Hold the pad's centre to crouch"],
      [["Seiza"], "Kneel, or stand up again"],
      [["Drag"], "Look around"],
      [["Pinch"], "Zoom"],
    ],
  },
  {
    title: "Interact",
    rows: [
      [["Double-tap"], "Walk to a spot on the floor"],
      [["Tap"], "Sit, open doors, use screens"],
    ],
  },
  // A tablet can have a keyboard attached (Bluetooth, folio), and every
  // key binding works there too, so they're listed rather than hidden.
  // There's no reliable way to detect one before a key is pressed.
  {
    title: "With a keyboard",
    rows: [
      [["W", "A", "S", "D"], "Walk (or arrow keys)"],
      [["Shift"], "Hold to run"],
      [["Z"], "Hold to crouch (slower, quieter)"],
      [["Space"], "Jump, or stand up"],
      [["1–0"], "Gestures"],
      [["C"], "Avatar menu"],
      [["V"], "First / third person"],
      [["G"], "Move tool (while editing)"],
      [["R"], "Rotate tool (while editing)"],
      [["Esc"], "Close a menu"],
      [["?"], "This guide"],
    ],
  },
];

interface ControlsGuideProps {
  open: boolean;
  onClose: () => void;
  /** Show touch controls instead of keyboard and mouse. */
  touch: boolean;
}

/**
 * A short card of controls, shown on a first visit and reopened with "?"
 * or the help button. Kept light: no backdrop dimming the world, closes
 * on Esc, "Got it", or a press outside, and remembers that it was seen
 * so it doesn't greet a returning visitor every time.
 */
export function ControlsGuide({ open, onClose, touch }: ControlsGuideProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const close = () => {
    markControlsGuideSeen();
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useExclusiveMenu("controls-guide", open, () => closeRef.current());
  useDismissOnOutside(rootRef, open, () => closeRef.current());

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const sections = touch ? TOUCH : KEYBOARD;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-labelledby="seiza-guide-title"
      className="seiza-guide"
      style={{
        ...panelStyle,
        // Hangs from just under the top bar and drops down into view, like
        // the other top menus, rather than rising from the middle. Centred
        // horizontally with auto margins rather than a translate, since the
        // drop-in animation owns `transform`.
        position: "absolute",
        top: "calc(60px + env(safe-area-inset-top, 0px))",
        left: 0,
        right: 0,
        margin: "0 auto",
        zIndex: 40,
        width: "min(380px, calc(100vw - 32px))",
        // Never the full screen: it stops well clear of the bottom bar and
        // D-pad and scrolls inside instead.
        maxHeight: "max(220px, min(520px, calc(100svh - 60px - env(safe-area-inset-top, 0px) - 180px)))",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        pointerEvents: "auto",
      }}
    >
      <style>{GUIDE_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <strong id="seiza-guide-title" style={{ fontSize: 15 }}>
          Controls
        </strong>
        <button type="button" aria-label="Close" onClick={close} style={{ ...pillButtonStyle, padding: 6 }}>
          <CloseIcon size={14} />
        </button>
      </div>

      {sections.map((section) => (
        <section key={section.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h3 style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_COLOR, opacity: 0.85 }}>
            {section.title}
          </h3>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 6, alignItems: "center" }}>
            {section.rows.map(([keys, action]) => (
              <div key={action} style={{ display: "contents" }}>
                <dt style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {keys.map((key) => (
                    <kbd key={key} style={kbdStyle}>
                      {key}
                    </kbd>
                  ))}
                </dt>
                <dd style={{ margin: 0, fontSize: 13, opacity: 0.85, minWidth: 0 }}>{action}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <button type="button" onClick={close} style={{ ...primaryButtonStyle, padding: "9px 14px", fontSize: 13 }} autoFocus>
        Got it
      </button>
      <small style={{ opacity: 0.55, textAlign: "center", marginTop: -4 }}>
        Press ? or the ? button to see this again.
      </small>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  display: "inline-block",
  minWidth: 20,
  padding: "3px 7px",
  borderRadius: 6,
  fontSize: 11,
  fontFamily: "system-ui, sans-serif",
  textAlign: "center",
  whiteSpace: "nowrap",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderBottomWidth: 2,
};

const GUIDE_CSS = `
  .seiza-guide { animation: seiza-guide-in 320ms var(--seiza-ease, ease-out) both; transform-origin: top center; }
  @keyframes seiza-guide-in {
    from { opacity: 0; transform: translateY(-10px) scale(0.98); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) { .seiza-guide { animation: none; } }
`;
