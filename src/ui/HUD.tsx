import type { ReactNode } from "react";

interface HUDProps {
  connected: boolean;
  worldName: string;
  children?: ReactNode;
}

export function HUD({ connected, worldName, children }: HUDProps) {
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
        fontFamily: "system-ui, sans-serif",
        color: "white",
        textShadow: "0 1px 2px rgba(0,0,0,0.6)",
      }}
    >
      <div>
        <strong>{worldName}</strong> — {connected ? "connected" : "connecting…"}
      </div>
      <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        {children}
      </div>
    </div>
  );
}
