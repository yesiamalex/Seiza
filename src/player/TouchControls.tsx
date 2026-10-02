import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { TouchMoveInput } from "./touchInput";
import { PAD_BUTTON_SIZE, PAD_GAP_PX, JUMP_BUTTON_SIZE, TOUCH_WRAPPER_BOTTOM_OFFSET_PX } from "./touchControlsMetrics";

interface TouchControlsProps {
  inputRef: MutableRefObject<TouchMoveInput>;
}

const DOUBLE_TAP_MS = 320;

/** Which way each pad cell moves you: [x, y], x = strafe, y = forward. */
type Cell = "up" | "upleft" | "upright" | "left" | "right" | "down";
const CELL_VECTORS: Record<Cell, [number, number]> = {
  up: [0, 1],
  upleft: [-1, 1],
  upright: [1, 1],
  left: [-1, 0],
  right: [1, 0],
  down: [0, -1],
};
const CELL_LABELS: Record<Cell, string> = {
  up: "Forward",
  upleft: "Forward left",
  upright: "Forward right",
  left: "Left",
  right: "Right",
  down: "Back",
};
/** Grid position of each cell, [column, row], top-left origin. The centre
 *  and the two bottom corners are dead zones. */
const CELL_AT: (Cell | null)[][] = [
  ["upleft", "up", "upright"],
  ["left", null, "right"],
  [null, "down", null],
];

/**
 * On-screen movement for touch devices: a D-pad with forward diagonals, a
 * jump button, and Minecraft's double-tap-forward-to-sprint. Writes into
 * a shared mutable ref that PlayerRig reads each frame (see touchInput.ts
 * for why it isn't React state).
 *
 * The pad is one touch surface, not separate buttons: whichever cell the
 * thumb is over is the direction, so it can slide from forward into
 * forward-left/right (or anywhere else) without lifting. With separate
 * buttons each one captured its own touch, so changing direction meant
 * lifting off, which also dropped a sprint. A sprint now lasts as long as
 * the thumb stays on any forward cell.
 *
 * Rendered only on coarse-pointer devices — on desktop this would just
 * be clutter sitting on top of WASD.
 */
export function TouchControls({ inputRef }: TouchControlsProps) {
  const lastForwardTapRef = useRef(0);
  const padRef = useRef<HTMLDivElement>(null);
  const padPointerRef = useRef<number | null>(null);
  // Purely for the pressed-state visuals; movement itself never goes
  // through React state.
  const [activeCell, setActiveCell] = useState<Cell | null>(null);
  const [jumpPressed, setJumpPressed] = useState(false);
  const [sprinting, setSprinting] = useState(false);
  const activeCellRef = useRef<Cell | null>(null);

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

  function cellAt(clientX: number, clientY: number): Cell | null {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // Clamped, so a thumb that drifts off the pad's edge keeps going the
    // way it was pointing instead of stopping dead.
    const column = Math.min(2, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 3)));
    const row = Math.min(2, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 3)));
    return CELL_AT[row][column];
  }

  function setCell(cell: Cell | null, freshPress: boolean) {
    const input = inputRef.current;
    const forward = cell !== null && CELL_VECTORS[cell][1] === 1;
    if (freshPress && forward) {
      const now = Date.now();
      if (now - lastForwardTapRef.current < DOUBLE_TAP_MS) input.running = true;
      lastForwardTapRef.current = now;
    }
    if (!forward) input.running = false;
    [input.x, input.y] = cell ? CELL_VECTORS[cell] : [0, 0];
    if (activeCellRef.current !== cell) {
      activeCellRef.current = cell;
      setActiveCell(cell);
    }
    setSprinting(input.running);
  }

  function endPadPress() {
    padPointerRef.current = null;
    setCell(null, false);
  }

  return (
    <div style={wrapperStyle}>
      <div
        ref={padRef}
        role="group"
        aria-label="Movement pad. Double-tap forward to run; slide to change direction."
        style={padGridStyle}
        onPointerDown={(e) => {
          e.preventDefault();
          // One thumb drives the pad; a second touch on it is ignored.
          if (padPointerRef.current !== null) return;
          padPointerRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          setCell(cellAt(e.clientX, e.clientY), true);
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== padPointerRef.current) return;
          const cell = cellAt(e.clientX, e.clientY);
          if (cell !== activeCellRef.current) setCell(cell, false);
        }}
        onPointerUp={(e) => e.pointerId === padPointerRef.current && endPadPress()}
        onPointerCancel={(e) => e.pointerId === padPointerRef.current && endPadPress()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {(Object.keys(CELL_VECTORS) as Cell[]).map((cell) => (
          <span
            key={cell}
            aria-hidden
            title={CELL_LABELS[cell]}
            style={{
              ...padButtonStyle,
              gridArea: cell,
              ...(cell === "upleft" || cell === "upright" ? diagonalButtonStyle : null),
              ...(activeCell === cell ? padButtonPressedStyle : null),
            }}
          >
            <Chevron direction={cell} />
          </span>
        ))}
        {sprinting && <span style={sprintBadgeStyle}>RUN</span>}
      </div>

      <button
        aria-label="Jump"
        style={{ ...jumpButtonStyle, ...(jumpPressed ? padButtonPressedStyle : null) }}
        onPointerDown={(e) => {
          e.preventDefault();
          setJumpPressed(true);
          inputRef.current.jumpRequested = true;
        }}
        onPointerUp={() => setJumpPressed(false)}
        onPointerCancel={() => setJumpPressed(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        JUMP
      </button>
    </div>
  );
}

type ChevronDirection = Cell;
const CHEVRON_ROTATION: Record<ChevronDirection, number> = { up: 0, upright: 45, right: 90, down: 180, left: 270, upleft: 315 };

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
  bottom: `calc(env(safe-area-inset-bottom, 0px) + ${TOUCH_WRAPPER_BOTTOM_OFFSET_PX}px)`,
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
  gridTemplateAreas: '"upleft up upright" "left . right" ". down ."',
  gridTemplateColumns: `repeat(3, ${PAD_BUTTON_SIZE})`,
  gridTemplateRows: `repeat(3, ${PAD_BUTTON_SIZE})`,
  gap: PAD_GAP_PX,
  pointerEvents: "auto",
  // The pad itself takes the touch now (see TouchControls), so it needs
  // what the buttons used to have: no scroll/zoom gesture, no selection.
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
};

const padButtonStyle: React.CSSProperties = {
  width: PAD_BUTTON_SIZE,
  height: PAD_BUTTON_SIZE,
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

/** Diagonals read as secondary: same size, so they're as easy to hit,
 *  but quieter until used. */
const diagonalButtonStyle: React.CSSProperties = {
  background: "rgba(18,18,22,0.4)",
  borderColor: "rgba(255,255,255,0.14)",
  opacity: 0.85,
};

const padButtonPressedStyle: React.CSSProperties = {
  background: "rgba(232,195,122,0.28)",
  borderColor: "rgba(232,195,122,0.7)",
};

const jumpButtonStyle: React.CSSProperties = {
  ...padButtonStyle,
  width: JUMP_BUTTON_SIZE,
  height: JUMP_BUTTON_SIZE,
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
