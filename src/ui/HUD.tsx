import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { closeAllMenus } from "./exclusiveMenu";
import { panelStyle } from "./styles";
import { ChevronRightIcon, CloseIcon, MenuIcon, SignalIcon, SignalOffIcon } from "./icons";
import type { ConnectionState } from "../multiplayer/useRoomSocket";
import { TOUCH_CONTROLS_CLEARANCE_CSS, TOUCH_CONTROLS_SIDE_CLEARANCE_CSS } from "../player/touchControlsMetrics";
import { useMediaQuery } from "./useMediaQuery";

interface HUDProps {
  connectionState: ConnectionState;
  worldName: string;
  topRight?: ReactNode;
  /** Replaces the default world-name/connection pill entirely when
   *  given — used to make that pill double as the participant-roster
   *  trigger (see ParticipantRoster.tsx and App.tsx) without this
   *  component needing to know anything about rosters or admin status
   *  itself. Pointer events on it are the caller's responsibility, same
   *  as topRight. */
  topLeft?: ReactNode;
  /** Reserve room at the bottom for the on-screen D-pad/jump controls so
   *  the control bar doesn't sit underneath them on phones. */
  touchControlsVisible?: boolean;
  children?: ReactNode;
}

const STATUS_LABEL: Record<ConnectionState, string> = {
  connected: "connected",
  connecting: "connecting…",
  reconnecting: "reconnecting…",
};

/** The dock's own look, shared by the bar and the landscape bottom drawer. */
const BAR_STYLE: React.CSSProperties = {
  pointerEvents: "auto",
  flexWrap: "nowrap",
  gap: 2,
  alignItems: "center",
  // Keeps the glass layer's z-index:-1 inside the bar without making the
  // bar a containing block for its fixed panels.
  isolation: "isolate",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 16,
  padding: 5,
  boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
  boxSizing: "border-box",
};

/** The round button that opens and closes either drawer. */
const LAUNCHER_STYLE: React.CSSProperties = {
  pointerEvents: "auto",
  width: 44,
  height: 44,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  borderRadius: 14,
  background: "rgba(16,17,22,0.84)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
  cursor: "pointer",
  padding: 0,
};

/** Gap between the open drawer and anything that steps aside for it
 *  (its own launcher tab, docked popovers). */
const DRAWER_GAP_PX = 8;
/** The drawer's distance from the right edge of the screen. */
const DRAWER_EDGE_PX = 10;

export function HUD({ connectionState, worldName, topRight, topLeft, touchControlsVisible, children }: HUDProps) {
  const connected = connectionState === "connected";

  // Portrait phones get a drawer on the right edge. A landscape phone is
  // too short for a vertical drawer (~300px of world under the browser
  // chrome), so it gets a collapsible bar along the bottom instead (see
  // `bottomDrawer`). Both start closed, so the world is what you see.
  const isCompact = useMediaQuery("(max-width: 640px)");
  const isShort = useMediaQuery("(max-height: 520px)");
  const bottomDrawer = Boolean(touchControlsVisible) && !isCompact && isShort;
  const [drawerOpen, setDrawerOpenState] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(0);
  // Collapsing a drawer takes its panels with it, rather than leaving a
  // chat or gesture panel floating with nothing it belongs to.
  const setDrawerOpen = useCallback((open: boolean) => {
    if (!open) closeAllMenus();
    setDrawerOpenState(open);
  }, []);

  // Switching layouts (rotating the phone, docking a keyboard) starts the
  // new layout closed, instead of carrying the other one's open flag over.
  useEffect(() => {
    setDrawerOpenState(false);
  }, [isCompact, bottomDrawer]);

  // Where the bar sits relative to the D-pad.
  //
  // It used to be stacked *above* the pad, with the pad's full height
  // reserved under it. On a landscape phone that reservation is most of
  // the screen, which is what kept the bar "floating in the middle" no
  // matter how the reservation was tuned. Now it sits on the bottom row
  // *between* the pad and the jump button, and the room it gives up is
  // horizontal (where a landscape screen has plenty) instead of vertical.
  // In drawer mode there is no bottom bar at all, so nothing is reserved.
  const besidePad = Boolean(touchControlsVisible) && !isCompact;
  const sideClearance = besidePad ? TOUCH_CONTROLS_SIDE_CLEARANCE_CSS : "12px";
  // Docked popovers on a portrait phone open above the D-pad.
  const popoverBottom = touchControlsVisible
    ? `calc(16px + env(safe-area-inset-bottom, 0px) + ${TOUCH_CONTROLS_CLEARANCE_CSS})`
    : "calc(16px + env(safe-area-inset-bottom, 0px))";
  const drawerClearance = DRAWER_EDGE_PX + drawerWidth + DRAWER_GAP_PX;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        padding: 16,
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "system-ui, sans-serif",
        color: "white",
        // Consumed by the docked-popover rules below: on a portrait phone
        // panels open above the D-pad, and step aside for the drawer while
        // it's open instead of opening underneath it.
        ["--seiza-popover-bottom" as string]: popoverBottom,
        ["--seiza-popover-right" as string]: isCompact && drawerOpen ? `${drawerClearance}px` : "12px",
      }}
    >
      <style>{`
        @keyframes seiza-popover-in { from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.96); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
        @keyframes seiza-popover-dock-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes seiza-popover-down-in { from { opacity: 0; transform: translateY(-8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .seiza-popover { animation: seiza-popover-in var(--seiza-slow, 360ms) var(--seiza-ease, ease-out) both; }
        /* Panels whose trigger sits at the top of the screen (the avatar
           menu) open downward. Opening upward from there is what made the
           avatar panel run off the top of the viewport. */
        .seiza-popover-down { animation: seiza-popover-down-in var(--seiza-slow, 360ms) var(--seiza-ease, ease-out) both; transform-origin: top right; }
        /* Same downward behaviour for a trigger in the top-*left* corner
           (the world-name pill / participant roster): only the growth
           origin differs. */
        .seiza-popover-down--left { transform-origin: top left; }
        @media (prefers-reduced-motion: reduce) { .seiza-popover, .seiza-popover-down { animation: none !important; } }
        /* Popovers are absolutely positioned relative to their own
           trigger. On a narrow screen a trigger near the edge puts its
           panel partly off-screen, so they dock to the viewport instead:
           bottom-bar panels above the bar (and the D-pad), top panels
           below the top bar. !important because the base positioning
           comes from inline styles, which a class rule can't override. */
        @media (max-width: 640px) {
          .seiza-popover {
            position: fixed !important;
            left: 12px !important;
            right: var(--seiza-popover-right, 12px) !important;
            bottom: var(--seiza-popover-bottom, 96px) !important;
            top: auto !important;
            width: auto !important;
            max-width: none !important;
            transform: none !important;
            max-height: calc(100svh - var(--seiza-popover-bottom, 96px) - 72px) !important;
            overflow-y: auto !important;
            animation: seiza-popover-dock-in var(--seiza-slow, 360ms) var(--seiza-ease, ease-out) both;
          }
          .seiza-popover-down {
            position: fixed !important;
            left: 12px !important;
            right: var(--seiza-popover-right, 12px) !important;
            top: calc(60px + env(safe-area-inset-top, 0px)) !important;
            bottom: auto !important;
            width: auto !important;
            max-width: none !important;
            max-height: calc(100svh - 60px - env(safe-area-inset-top, 0px) - 16px) !important;
            overflow-y: auto !important;
          }
        }
        /* A landscape phone is wide enough for the bar but far too short
           for a panel anchored to its trigger: centred above a button it
           runs off the top. Dock it centred above the bar instead, using
           whatever height there is. */
        @media (min-width: 641px) and (max-height: 520px) {
          .seiza-popover {
            position: fixed !important;
            left: 50% !important;
            right: auto !important;
            top: auto !important;
            bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
            max-width: calc(100vw - 24px) !important;
            max-height: calc(100svh - 76px - env(safe-area-inset-bottom, 0px) - 64px - env(safe-area-inset-top, 0px)) !important;
            overflow-y: auto !important;
            transform-origin: bottom center;
          }
        }
        /* Desktop/tablet horizontal bar. Two things here used to be wrong
           together and produced the "bottom bar isn't centred / looks
           squeezed" report on mid-width screens:

           1. a width:100% rule stretched the bar's own background across
              the whole screen, so it stopped reading as a centred pill.
              It is a flex item in a centre-aligned column, so without it
              the bar shrink-wraps its buttons and centres itself.
           2. justify-content:flex-start applied whether or not the
              content actually overflowed, left-aligning rows that had
              plenty of room to be centred.

           "safe center" fixes both: it centres when there is room and
           falls back to start alignment only when centring would push the
           overflowing edge out of reach. The plain flex-start declaration
           before it is the fallback for engines without "safe", where
           start alignment is the safer of the two.

           The bar must NOT be a scroll container (no overflow), and must
           not carry transform/filter/backdrop-filter itself. Its panels
           are its descendants: overflow-x:auto silently turns overflow-y
           into auto too and clips every panel to the bar's own height,
           and a transform or backdrop-filter makes the bar the containing
           block for their position:fixed docking. Both made panels "open"
           invisibly. The frosted glass lives on .seiza-dock-glass, a
           sibling layer behind the buttons. */
        .seiza-control-bar {
          position: relative;
          justify-content: flex-start;
          justify-content: safe center;
        }
        .seiza-dock-glass {
          position: absolute;
          inset: 0;
          z-index: -1;
          border-radius: inherit;
          background: rgba(16,17,22,0.78);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          pointer-events: none;
        }
        /* The same element in drawer mode: a single vertical column with
           its dividers laid flat. Groups that lay their buttons out in a
           row (voice + video) are turned into columns too, otherwise they
           made the drawer two buttons wide. */
        .seiza-control-bar--drawer {
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
        }
        .seiza-control-bar--drawer > div:not(.seiza-bar-divider):not(.seiza-dock-glass) {
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 2px !important;
        }
        .seiza-control-bar--drawer .seiza-bar-btn {
          justify-content: center;
          padding: 11px 12px !important;
        }
        .seiza-control-bar--drawer .seiza-bar-divider {
          width: 100% !important;
          height: 1px !important;
          align-self: stretch;
          margin: 2px 0 !important;
        }
        /* Buttons in the dock have no chrome of their own until you touch
           them — see barButtonStyle in styles.ts. */
        .seiza-bar-btn {
          transition: background-color 160ms var(--seiza-ease, ease-out), border-color 160ms var(--seiza-ease, ease-out);
        }
        .seiza-bar-btn:hover:not(:disabled) { background: rgba(255,255,255,0.11); }
        .seiza-bar-btn:focus-visible { outline: 2px solid rgba(232,195,122,0.8); outline-offset: 1px; }
        .seiza-bar-btn:disabled { opacity: 0.45; cursor: default; }
        .seiza-bar-divider {
          width: 1px;
          align-self: stretch;
          margin: 4px 2px;
          background: rgba(255,255,255,0.12);
          flex-shrink: 0;
        }
        /* Collapse to icons before the row ever has to wrap. The button
           keeps its accessible name from aria-label/title. */
        @media (max-width: 960px) {
          .seiza-bar-label { display: none; }
        }
        /* Animates right/opacity rather than transform: a transform on
           the drawer would capture its fixed-position panels again. */
        .seiza-drawer {
          transition: right 240ms var(--seiza-ease, ease-out), opacity 240ms var(--seiza-ease, ease-out), visibility 0s linear 240ms;
        }
        .seiza-drawer[data-open="true"] {
          transition: right 240ms var(--seiza-ease, ease-out), opacity 240ms var(--seiza-ease, ease-out), visibility 0s;
        }
        @media (prefers-reduced-motion: reduce) {
          .seiza-bar-btn, .seiza-drawer { transition: none; }
        }
      `}</style>
      {/* Relative so a top-bar control can centre itself on the screen
          (AdminButton) rather than wherever space-between puts it. */}
      <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        {topLeft ?? (
          <div style={{ ...panelStyle, padding: "6px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{worldName}</strong>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.85, flexShrink: 0 }}>
              {connected ? <SignalIcon size={14} /> : <SignalOffIcon size={14} />}
              {STATUS_LABEL[connectionState]}
            </span>
          </div>
        )}
        {topRight}
      </div>

      {isCompact ? (
        <ControlDrawer open={drawerOpen} onOpenChange={setDrawerOpen} onWidthChange={setDrawerWidth} launcherRight={drawerClearance}>
          {children}
        </ControlDrawer>
      ) : bottomDrawer ? (
        // Landscape phone: the bar along the bottom, between the D-pad and
        // the jump button, collapsed to a single button until it's wanted.
        <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: `calc(100vw - 2 * ${sideClearance})` }}>
          <div
            className="seiza-control-bar seiza-fade-in"
            role="group"
            aria-label="World controls"
            style={{
              ...BAR_STYLE,
              // display:none rather than unmounting, so each control keeps
              // its own state (an unread count, a half-typed message).
              display: drawerOpen ? "flex" : "none",
              minWidth: 0,
            }}
          >
            <div className="seiza-dock-glass" aria-hidden />
            {children}
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-expanded={drawerOpen}
            aria-label={drawerOpen ? "Hide controls" : "Show controls"}
            style={{ ...LAUNCHER_STYLE, position: "relative" }}
          >
            {drawerOpen ? <CloseIcon size={18} /> : <MenuIcon size={20} />}
          </button>
        </div>
      ) : (
        <div
          className="seiza-control-bar"
          style={{
            pointerEvents: "auto",
            display: "flex",
            // Never wraps. A second row was both ugly and a moving target:
            // the bar's height changed with how many controls were showing,
            // so everything anchored above it jumped.
            flexWrap: "nowrap",
            gap: 2,
            alignItems: "center",
            // Beside the D-pad on touch screens, so it stays clear of the
            // pad on the left and the jump button on the right.
            maxWidth: `calc(100vw - 2 * ${sideClearance})`,
            // Keeps the glass layer's z-index:-1 inside the bar without
            // making the bar a containing block for its fixed panels.
            isolation: "isolate",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 16,
            padding: 5,
            boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
            boxSizing: "border-box",
          }}
        >
          <div className="seiza-dock-glass" aria-hidden />
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The phone layout for the control dock: a tab on the right edge that
 * slides a vertical panel of the same buttons in and out.
 *
 * Deliberately a real collapsible drawer rather than the persistent
 * right-edge strip a previous attempt used. A strip is still permanent
 * chrome eating a column of a small screen; the point of the drawer is
 * that a phone showing a 3D world should mostly be showing the world.
 *
 * The panel holds the same buttons as the bar, and their panels (chat,
 * gestures, edit…) render inside it, so it must not clip or capture
 * them: no overflow, no transform, no backdrop-filter on the panel
 * itself (see the .seiza-control-bar note in HUD's stylesheet). It is
 * centred with top/bottom/margin and slides with `right` instead.
 */
function ControlDrawer({
  open,
  onOpenChange,
  onWidthChange,
  launcherRight,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWidthChange: (width: number) => void;
  /** Where the launcher sits while open: just left of the panel. */
  launcherRight: number;
  children?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Escape closes it, matching every other dismissible surface here.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // The panel's width depends on which controls are showing (stand up,
  // voice vs. mute…), so the launcher and docked panels measure it rather
  // than guessing a constant. Guessing is what left the launcher sitting
  // on top of the drawer's buttons.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(panel.offsetWidth);
      setWidth(next);
      onWidthChange(next);
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [onWidthChange]);

  return (
    <>
      {/* Tap-outside-to-close. Only while open, so the world stays fully
          interactive the rest of the time. */}
      {open && (
        <div
          onClick={() => onOpenChange(false)}
          aria-hidden
          style={{ position: "fixed", inset: 0, pointerEvents: "auto", zIndex: 18 }}
        />
      )}

      {/* The launcher tab. Stays mounted while the drawer is open so the
          control it belongs to never disappears from under a finger; it
          just flips to a close affordance. */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={open ? "Close controls" : "Open controls"}
        className="seiza-drawer"
        data-open="true"
        style={{
          position: "fixed",
          right: open ? `calc(env(safe-area-inset-right, 0px) + ${launcherRight}px)` : `calc(env(safe-area-inset-right, 0px) + ${DRAWER_EDGE_PX}px)`,
          top: 0,
          bottom: 0,
          margin: "auto 0",
          zIndex: 20,
          pointerEvents: "auto",
          width: 44,
          height: 44,
          display: "grid",
          placeItems: "center",
          borderRadius: 14,
          background: "rgba(16,17,22,0.84)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "white",
          boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {open ? <ChevronRightIcon size={20} /> : <MenuIcon size={20} />}
      </button>

      <div
        ref={panelRef}
        className="seiza-control-bar seiza-control-bar--drawer seiza-drawer"
        data-open={open}
        role="group"
        aria-label="World controls"
        aria-hidden={!open}
        style={{
          position: "fixed",
          // Parked just past the right edge when closed rather than
          // unmounted, so opening and closing animate symmetrically.
          right: open
            ? `calc(env(safe-area-inset-right, 0px) + ${DRAWER_EDGE_PX}px)`
            : `${-(width + 24)}px`,
          top: 0,
          bottom: 0,
          margin: "auto 0",
          height: "fit-content",
          opacity: open ? 1 : 0,
          // Nothing behind an invisible drawer should be catching taps.
          pointerEvents: open ? "auto" : "none",
          visibility: open ? "visible" : "hidden",
          zIndex: 19,
          display: "flex",
          gap: 2,
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 16,
          padding: 5,
          boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
          boxSizing: "border-box",
        }}
      >
        <div className="seiza-dock-glass" aria-hidden />
        {children}
      </div>
    </>
  );
}
