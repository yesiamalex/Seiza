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

export const popoverStyle: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  left: "50%",
  transform: "translateX(-50%)",
  transformOrigin: "bottom center",
  zIndex: 20,
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

/**
 * A button inside the bottom control bar.
 *
 * The bar is a single dock, so its buttons don't each carry their own pill
 * chrome — eight stacked pills read as eight unrelated widgets, and at full
 * width they were what pushed the bar onto a second line. They get a
 * background on hover and while active instead. Pair with the CSS in
 * HUD.tsx (`.seiza-bar-btn`), which supplies hover and disabled states.
 */
export const barButtonStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid transparent",
  color: "white",
  borderRadius: 11,
  padding: "8px 11px",
  fontSize: 13,
  lineHeight: 1,
  fontFamily: "system-ui, sans-serif",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

export const barButtonActiveStyle: CSSProperties = {
  ...barButtonStyle,
  background: "rgba(124,255,158,0.2)",
  border: "1px solid rgba(124,255,158,0.45)",
};

/**
 * Wrap a control-bar button's text in this class. Below a narrow viewport
 * the labels drop out and the bar becomes icons, which is what keeps it on
 * one line instead of wrapping or scrolling out of reach — the icon keeps
 * its accessible name from the button's aria-label/title.
 */
export const BAR_LABEL_CLASS = "seiza-bar-label";

export const pillButtonActiveStyle: CSSProperties = {
  ...pillButtonStyle,
  background: "rgba(124,255,158,0.22)",
  border: "1px solid rgba(124,255,158,0.5)",
};

// This app's brand accent — warm starlight gold, distinct from the green
// "active/connected" color used elsewhere in the HUD so the two don't
// get visually confused. Used for the join screen's primary CTA and
// small decorative touches (see JoinScreen.tsx) — evokes 星座 (seiza,
// "constellation") without being literal about it.
export const ACCENT_COLOR = "#e8c37a";

export const primaryButtonStyle: CSSProperties = {
  background: "linear-gradient(135deg, #f0d29a, #c98f4a)",
  border: "1px solid rgba(232,195,122,0.6)",
  color: "#1a1408",
  fontWeight: 600,
  fontSize: 14,
  fontFamily: "system-ui, sans-serif",
  borderRadius: 8,
  padding: "12px 20px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

export const inputStyle: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  color: "white",
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "system-ui, sans-serif",
  outline: "none",
};
