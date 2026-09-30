import { useEffect, useState, type ReactNode } from "react";
import { panelStyle } from "./styles";
import { ChevronRightIcon, MenuIcon, SignalIcon, SignalOffIcon } from "./icons";
import type { ConnectionState } from "../multiplayer/useRoomSocket";
import { TOUCH_CONTROLS_CLEARANCE_CSS } from "../player/touchControlsMetrics";
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

/** Width of the mobile drawer's closed launcher tab, and the gap the
 *  popovers leave for the open drawer. Shared with the CSS below. */
const DRAWER_CLEARANCE_PX = 76;

export function HUD({ connectionState, worldName, topRight, topLeft, touchControlsVisible, children }: HUDProps) {
  const connected = connectionState === "connected";
  // A CSS calc()/clamp() expression (see touchControlsMetrics.ts), not a
  // fixed pixel number: the D-pad itself now shrinks on a short/landscape
  // viewport, and this has to shrink by exactly the same amount or the
  // two drift apart again — which is the bug this replaced. A flat "186px
  // of clearance" was a small, unnoticeable reservation on a tall
  // portrait phone and nearly half the screen on a 400px-tall landscape
  // one, which is what pushed the whole control bar up into the visual
  // middle of the screen.
  const bottomInset = touchControlsVisible ? TOUCH_CONTROLS_CLEARANCE_CSS : "0px";

  // Below this width the horizontal bottom bar is replaced by a drawer.
  //
  // The bar kept being reported as "floating in the middle of the screen"
  // on phones, and the reason is structural rather than a stray number:
  // it is the last child of a `justify-content: space-between` column
  // that also has to reserve room for the D-pad. Its resting position is
  // therefore whatever is left over after the reservation, which on a
  // short or busy viewport is somewhere around the middle. Shrinking the
  // reservation (touchControlsMetrics.ts) fixed the worst landscape case
  // but never changed that; the bar was still positioned by subtraction.
  //
  // A drawer is pulled out of the column flow entirely (position: fixed,
  // anchored to the right edge), so it has an actual anchor instead of a
  // leftover one, and it collapses to a single tab so a phone screen is
  // mostly world rather than mostly chrome.
  const isCompact = useMediaQuery("(max-width: 640px)");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Rotating a phone to landscape (or docking a keyboard) takes the
  // layout back to the horizontal bar, where a stuck-open drawer flag
  // would otherwise reappear the next time the viewport narrowed.
  useEffect(() => {
    if (!isCompact) setDrawerOpen(false);
  }, [isCompact]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        padding: 16,
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        paddingBottom: `calc(16px + env(safe-area-inset-bottom, 0px) + ${bottomInset})`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "system-ui, sans-serif",
        color: "white",
        // Consumed by the narrow-viewport popover rules below so panels
        // dock above the control bar (and above the D-pad when it's up).
        ["--seiza-popover-bottom" as string]: `calc(88px + ${bottomInset})`,
        // ...and so they step aside for the drawer while it's open,
        // instead of opening underneath it.
        ["--seiza-popover-right" as string]: isCompact && drawerOpen ? `${DRAWER_CLEARANCE_PX}px` : "12px",
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
           start alignment is the safer of the two. */
        .seiza-control-bar {
          justify-content: flex-start;
          justify-content: safe center;
          overflow-x: auto;
          overflow-y: visible;
          scrollbar-width: none;
        }
        .seiza-control-bar::-webkit-scrollbar { display: none; }
        /* The same element in drawer mode: a vertical column, scrolled
           top-to-bottom, with its dividers laid flat. */
        .seiza-control-bar--drawer {
          flex-direction: column;
          overflow-x: visible;
          overflow-y: auto;
          align-items: stretch;
          justify-content: flex-start;
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
        .seiza-drawer {
          transition: transform 240ms var(--seiza-ease, ease-out), opacity 240ms var(--seiza-ease, ease-out);
        }
        @media (prefers-reduced-motion: reduce) {
          .seiza-bar-btn, .seiza-drawer { transition: none; }
        }
      `}</style>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
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
        <ControlDrawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          {children}
        </ControlDrawer>
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
            maxWidth: "calc(100vw - 24px)",
            background: "rgba(16,17,22,0.74)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 16,
            padding: 5,
            boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
            boxSizing: "border-box",
          }}
        >
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
 */
function ControlDrawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: ReactNode;
}) {
  // Escape closes it, matching every other dismissible surface here.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

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
        style={{
          position: "fixed",
          right: open ? `${DRAWER_CLEARANCE_PX}px` : "calc(env(safe-area-inset-right, 0px) + 10px)",
          top: "50%",
          transform: "translateY(-50%)",
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
        className="seiza-control-bar seiza-control-bar--drawer seiza-drawer"
        role="group"
        aria-label="World controls"
        aria-hidden={!open}
        style={{
          position: "fixed",
          right: "calc(env(safe-area-inset-right, 0px) + 10px)",
          top: "50%",
          // Tucked fully off the right edge when closed rather than
          // unmounted, so opening and closing animate symmetrically.
          transform: `translateY(-50%) translateX(${open ? "0" : "calc(100% + 24px)"})`,
          opacity: open ? 1 : 0,
          // Nothing behind an invisible drawer should be catching taps.
          pointerEvents: open ? "auto" : "none",
          visibility: open ? "visible" : "hidden",
          zIndex: 19,
          display: "flex",
          gap: 2,
          maxHeight: "calc(100svh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 96px)",
          background: "rgba(16,17,22,0.86)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 16,
          padding: 5,
          boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </>
  );
}
