import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Where the statuses that come and go sit (a fighter's health, a ride's
 * speed, the heat): one column centred just under the top bar, wherever
 * that bar ends on this screen, so they never cover its buttons (the
 * world's name, the admin's) or each other. App mounts the dock once;
 * anything that wants a place in it wraps itself in <Docked>.
 */
const DOCK_ID = "seiza-status-dock";

export function StatusDock() {
  const [top, setTop] = useState(64);
  useEffect(() => {
    const bar = document.querySelector("[data-seiza-topbar]");
    if (!bar) return;
    const place = () => setTop(Math.round(bar.getBoundingClientRect().bottom) + 8);
    const watch = new ResizeObserver(place);
    watch.observe(bar);
    addEventListener("resize", place);
    place();
    return () => {
      watch.disconnect();
      removeEventListener("resize", place);
    };
  }, []);
  return (
    <div
      id={DOCK_ID}
      style={{ position: "fixed", top, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 26, pointerEvents: "none", maxWidth: "calc(100vw - 24px)" }}
    />
  );
}

/** A place in the dock, by `order` (lower first). */
export function Docked({ order = 0, children }: { order?: number; children: ReactNode }) {
  const [dock, setDock] = useState<HTMLElement | null>(null);
  useEffect(() => setDock(document.getElementById(DOCK_ID)), []);
  return dock ? createPortal(<div style={{ order, display: "flex", justifyContent: "center" }}>{children}</div>, dock) : null;
}
