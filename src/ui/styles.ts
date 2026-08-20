import type { CSSProperties } from "react";

// Shared, minimal design tokens for the HUD — no CSS framework, just
// consistent inline styles so the control bar and its panels read as one
// system instead of a stack of ad hoc browser-default buttons.
export const panelStyle: CSSProperties = {
  background: "rgba(18,18,22,0.78)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  borderRadius: 12,
  padding: 12,
  color: "white",
  fontFamily: "system-ui, sans-serif",
  fontSize: 13,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  border: "1px solid rgba(255,255,255,0.08)",
};

export const pillButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.16)",
  color: "white",
  borderRadius: 999,
  padding: "9px 16px",
  fontSize: 13,
  fontFamily: "system-ui, sans-serif",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
};

export const pillButtonActiveStyle: CSSProperties = {
  ...pillButtonStyle,
  background: "rgba(124,255,158,0.22)",
  border: "1px solid rgba(124,255,158,0.5)",
};
