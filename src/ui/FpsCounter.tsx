import { useEffect, useRef } from "react";
import { JUMP_BUTTON_SIZE, TOUCH_WRAPPER_BOTTOM_OFFSET_PX } from "../player/touchControlsMetrics";

/**
 * A small frames-per-second readout in the bottom-right corner.
 *
 * Counts requestAnimationFrame callbacks, which is the same clock the 3D
 * canvas renders on, and writes straight to the DOM twice a second rather
 * than through React state, so measuring the frame rate never costs a
 * re-render of its own. On touch screens it sits just above the jump
 * button instead of underneath it.
 */
export function FpsCounter({ aboveTouchControls }: { aboveTouchControls: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - last;
      if (elapsed >= 500) {
        const fps = Math.round((frames * 1000) / elapsed);
        const el = ref.current;
        if (el) {
          el.textContent = `${fps} FPS`;
          el.style.color = fps >= 50 ? "#7CFF9E" : fps >= 30 ? "#e8c37a" : "#ff7a72";
        }
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        right: "calc(12px + env(safe-area-inset-right, 0px))",
        bottom: aboveTouchControls
          ? `calc(env(safe-area-inset-bottom, 0px) + ${TOUCH_WRAPPER_BOTTOM_OFFSET_PX}px + ${JUMP_BUTTON_SIZE} + 10px)`
          : "calc(10px + env(safe-area-inset-bottom, 0px))",
        zIndex: 6,
        pointerEvents: "none",
        padding: "3px 7px",
        borderRadius: 6,
        background: "rgba(16,17,22,0.55)",
        color: "#7CFF9E",
        font: "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        letterSpacing: 0.3,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      -- FPS
    </div>
  );
}
