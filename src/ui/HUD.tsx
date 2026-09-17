import type { ReactNode } from "react";
import { panelStyle } from "./styles";
import { SignalIcon, SignalOffIcon } from "./icons";
import type { ConnectionState } from "../multiplayer/useRoomSocket";

interface HUDProps {
  connectionState: ConnectionState;
  worldName: string;
  topRight?: ReactNode;
  /** Reserve room at the bottom for the on-screen D-pad/jump controls so
   *  the control bar doesn't sit underneath them on phones. */
  touchControlsVisible?: boolean;
  children?: ReactNode;
}

// Height the touch D-pad occupies (3 rows of 54px + gaps) plus breathing
// room — see TouchControls.tsx.
const TOUCH_CONTROLS_CLEARANCE_PX = 186;

const STATUS_LABEL: Record<ConnectionState, string> = {
  connected: "connected",
  connecting: "connecting…",
  reconnecting: "reconnecting…",
};

export function HUD({ connectionState, worldName, topRight, touchControlsVisible, children }: HUDProps) {
  const connected = connectionState === "connected";
  const bottomInset = touchControlsVisible ? TOUCH_CONTROLS_CLEARANCE_PX : 0;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        padding: 16,
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        paddingBottom: `calc(16px + env(safe-area-inset-bottom, 0px) + ${bottomInset}px)`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "system-ui, sans-serif",
        color: "white",
        // Consumed by the narrow-viewport popover rules below so panels
        // dock above the control bar (and above the D-pad when it's up).
        ["--seiza-popover-bottom" as string]: `${88 + bottomInset}px`,
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
          /* One scrollable row instead of several wrapped rows — wrapping
             six pills on a phone claims most of the screen and pushes the
             bar into the D-pad. */
          .seiza-control-bar {
            flex-wrap: nowrap !important;
            justify-content: flex-start !important;
            overflow-x: auto;
            overflow-y: visible;
            max-width: 100% !important;
            width: 100%;
            padding-bottom: 2px;
            scrollbar-width: none;
          }
          .seiza-control-bar::-webkit-scrollbar { display: none; }
        }
      `}</style>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ ...panelStyle, padding: "6px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{worldName}</strong>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.85, flexShrink: 0 }}>
            {connected ? <SignalIcon size={14} /> : <SignalOffIcon size={14} />}
            {STATUS_LABEL[connectionState]}
          </span>
        </div>
        {topRight}
      </div>
      <div
        className="seiza-control-bar"
        style={{
          pointerEvents: "auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "flex-end",
          justifyContent: "center",
          maxWidth: "min(900px, 96vw)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
