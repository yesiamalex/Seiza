import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { TouchMoveInput } from "./touchInput";

interface TouchControlsProps {
  inputRef: MutableRefObject<TouchMoveInput>;
}

const DOUBLE_TAP_MS = 320;
const PAD_BUTTON = 54;

/**
 * On-screen movement for touch devices: a four-way D-pad, a jump button,
 * and Minecraft's double-tap-forward-to-sprint. Writes into a shared
 * mutable ref that PlayerRig reads each frame (see touchInput.ts for why
 * it isn't React state).
 *
 * Rendered only on coarse-pointer devices — on desktop this would just
 * be clutter sitting on top of WASD.
 */
export function TouchControls({ inputRef }: TouchControlsProps) {
  const lastForwardTapRef = useRef(0);
  // Purely for the pressed-state visuals; movement itself never goes
  // through React state.
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [sprinting, setSprinting] = useState(false);

  // If the component unmounts mid-press (e.g. rotating into VR), the
  // input ref would otherwise stay stuck holding a direction forever.
  useEffect(() => {
    const input = inputRef.current;
    return () => {
      input.x = 0;
      input.y = 0;
      input.running = false;
    };
  }, [inputRef]);

  function press(key: string, apply: () => void) {
    setPressed((p) => ({ ...p, [key]: true }));
    apply();
  }

  function release(key: string, apply: () => void) {
    setPressed((p) => ({ ...p, [key]: false }));
    apply();
  }

  function handleForwardDown() {
    const now = Date.now();
    if (now - lastForwardTapRef.current < DOUBLE_TAP_MS) {
      inputRef.current.running = true;
      setSprinting(true);
    }
    lastForwardTapRef.current = now;
    press("up", () => {
      inputRef.current.y = 1;
    });
  }

  function handleForwardUp() {
    release("up", () => {
      inputRef.current.y = 0;
      inputRef.current.running = false;
      setSprinting(false);
    });
  }

  const padButton = (key: string, label: string, onDown: () => void, onUp: () => void, gridArea: string) => (
    <button
      key={key}
      aria-label={label}
      style={{ ...padButtonStyle, gridArea, ...(pressed[key] ? padButtonPressedStyle : null) }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onUp();
      }}
      onPointerCancel={onUp}
      onPointerLeave={() => pressed[key] && onUp()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Chevron direction={key as ChevronDirection} />
    </button>
  );

  return (
    <div style={wrapperStyle}>
      <div style={padGridStyle}>
        {padButton("up", "Move forward (double-tap to run)", handleForwardDown, handleForwardUp, "up")}
        {padButton(
          "left",
          "Move left",
          () => press("left", () => (inputRef.current.x = -1)),
          () => release("left", () => (inputRef.current.x = 0)),
          "left"
        )}
        {padButton(
          "right",
          "Move right",
          () => press("right", () => (inputRef.current.x = 1)),
          () => release("right", () => (inputRef.current.x = 0)),
          "right"
        )}
        {padButton(
          "down",
          "Move back",
          () => press("down", () => (inputRef.current.y = -1)),
          () => release("down", () => (inputRef.current.y = 0)),
          "down"
        )}
        {sprinting && <span style={sprintBadgeStyle}>RUN</span>}
      </div>

      <button
        aria-label="Jump"
        style={{ ...jumpButtonStyle, ...(pressed.jump ? padButtonPressedStyle : null) }}
        onPointerDown={(e) => {
          e.preventDefault();
          press("jump", () => {
            inputRef.current.jumpRequested = true;
          });
        }}
        onPointerUp={() => release("jump", () => {})}
        onPointerCancel={() => release("jump", () => {})}
        onContextMenu={(e) => e.preventDefault()}
      >
        JUMP
      </button>
    </div>
  );
}

type ChevronDirection = "up" | "down" | "left" | "right";
const CHEVRON_ROTATION: Record<ChevronDirection, number> = { up: 0, right: 90, down: 180, left: 270 };

/** SVG, not ▲/◀ characters: Android renders some of those as color emoji. */
function Chevron({ direction }: { direction: ChevronDirection }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden style={{ transform: `rotate(${CHEVRON_ROTATION[direction]}deg)` }}>
      <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const wrapperStyle: React.CSSProperties = {
  position: "absolute",
  // Sits above the safe-area inset so it clears iOS' home indicator and
  // Android's gesture bar instead of being half-swallowed by them.
  bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  padding: "0 16px",
  pointerEvents: "none",
  // Below the control bar's popovers so an open panel is never blocked.
  zIndex: 5,
};

const padGridStyle: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateAreas: '". up ." "left . right" ". down ."',
  gridTemplateColumns: `repeat(3, ${PAD_BUTTON}px)`,
  gridTemplateRows: `repeat(3, ${PAD_BUTTON}px)`,
  gap: 4,
  pointerEvents: "auto",
};

const padButtonStyle: React.CSSProperties = {
  width: PAD_BUTTON,
  height: PAD_BUTTON,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(18,18,22,0.6)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  color: "white",
  fontSize: 18,
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
  // Without this the browser treats a press-and-drag as a scroll/zoom
  // gesture and the button never sees a clean press.
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
};

const padButtonPressedStyle: React.CSSProperties = {
  background: "rgba(232,195,122,0.28)",
  borderColor: "rgba(232,195,122,0.7)",
};

const jumpButtonStyle: React.CSSProperties = {
  ...padButtonStyle,
  width: 76,
  height: 76,
  borderRadius: "50%",
  fontSize: 13,
  letterSpacing: "0.08em",
  pointerEvents: "auto",
};

const sprintBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: -22,
  left: "50%",
  transform: "translateX(-50%)",
  fontSize: 10,
  letterSpacing: "0.14em",
  color: "#e8c37a",
  background: "rgba(18,18,22,0.7)",
  borderRadius: 999,
  padding: "2px 8px",
  pointerEvents: "none",
};
