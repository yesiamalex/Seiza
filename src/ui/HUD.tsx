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
        @keyframes seiza-popover-right-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .seiza-popover { animation: seiza-popover-in 160ms ease-out both; }
        .seiza-popover-right { animation: seiza-popover-right-in 160ms ease-out both; }
        @media (prefers-reduced-motion: reduce) { .seiza-popover, .seiza-popover-right { animation: none; } }
        /* Popovers are absolutely positioned and centered on their own
           trigger button. On a narrow screen a button near the edge puts
           its panel partly off-screen, and a tall panel can run past the
           top. Docking them to the viewport instead is the only thing
           that reliably prevents both. !important because the base
           positioning comes from inline styles (popoverStyle), which a
           plain class rule can't override. */
        @media (max-width: 640px) {
          .seiza-popover, .seiza-popover-right {
            position: fixed !important;
            left: 12px !important;
            right: 12px !important;
            bottom: var(--seiza-popover-bottom, 96px) !important;
            top: auto !important;
            width: auto !important;
            max-width: none !important;
            transform: none !important;
            max-height: 58svh !important;
            overflow-y: auto !important;
            animation: seiza-popover-right-in 160ms ease-out both;
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
        <div style={{ ...panelStyle, padding: "6px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <strong>{worldName}</strong>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.85 }}>
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
