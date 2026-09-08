import type { ReactNode } from "react";
import { panelStyle } from "./styles";
import { SignalIcon, SignalOffIcon } from "./icons";
import type { ConnectionState } from "../multiplayer/useRoomSocket";

interface HUDProps {
  connectionState: ConnectionState;
  worldName: string;
  children?: ReactNode;
}

const STATUS_LABEL: Record<ConnectionState, string> = {
  connected: "connected",
  connecting: "connecting…",
  reconnecting: "reconnecting…",
};

export function HUD({ connectionState, worldName, children }: HUDProps) {
  const connected = connectionState === "connected";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "system-ui, sans-serif",
        color: "white",
      }}
    >
      <style>{`@keyframes seiza-popover-in { from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.96); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } } .seiza-popover { animation: seiza-popover-in 160ms ease-out both; } @media (prefers-reduced-motion: reduce) { .seiza-popover { animation: none; } }`}</style>
      <div style={{ ...panelStyle, alignSelf: "flex-start", padding: "6px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
        <strong>{worldName}</strong>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.85 }}>
          {connected ? <SignalIcon size={14} /> : <SignalOffIcon size={14} />}
          {STATUS_LABEL[connectionState]}
        </span>
      </div>
      <div
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
