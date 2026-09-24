import type { ReactNode } from "react";
import { panelStyle } from "./styles";
import { SignalIcon, SignalOffIcon } from "./icons";
import type { ConnectionState } from "../multiplayer/useRoomSocket";
import { TOUCH_CONTROLS_CLEARANCE_CSS } from "../player/touchControlsMetrics";

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
            right: 12px !important;
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
            right: 12px !important;
            top: calc(60px + env(safe-area-inset-top, 0px)) !important;
            bottom: auto !important;
            width: auto !important;
            max-width: none !important;
            max-height: calc(100svh - 60px - env(safe-area-inset-top, 0px) - 16px) !important;
            overflow-y: auto !important;
          }
          /* Last resort on a very narrow phone: scroll the dock sideways
             rather than let it wrap or push controls off-screen. Popovers
             are position:fixed at this width (above), so they still escape
             the scroll container. */
          .seiza-control-bar {
            justify-content: flex-start !important;
            overflow-x: auto;
            overflow-y: visible;
            max-width: 100% !important;
            width: 100%;
            scrollbar-width: none;
          }
          .seiza-control-bar::-webkit-scrollbar { display: none; }
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
        @media (prefers-reduced-motion: reduce) { .seiza-bar-btn { transition: none; } }
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
          justifyContent: "center",
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
    </div>
  );
}
