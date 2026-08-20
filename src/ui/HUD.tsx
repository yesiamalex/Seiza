import type { ReactNode } from "react";
import { panelStyle } from "./styles";

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
        alignItems: "center",
        fontFamily: "system-ui, sans-serif",
        color: "white",
      }}
    >
      <div style={{ ...panelStyle, alignSelf: "flex-start", padding: "6px 12px", fontSize: 13 }}>
        <strong>{worldName}</strong> — {connected ? "connected" : "connecting…"}
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
