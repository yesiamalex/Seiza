import { barButtonActiveStyle, panelStyle, pillButtonStyle } from "../../ui/styles";

/**
 * The VR menu's layout and drawing: a plain 2D canvas, turned into a
 * texture by XrHud.
 *
 * A canvas rather than DOM because an immersive session cannot show DOM
 * over the scene (that is the whole reason this panel exists), and rather
 * than a 3D text library because those fetch their fonts from a CDN at
 * runtime, which this project avoids everywhere else. The same choice the
 * notice boards and signs already make (src/edit/textTexture.ts).
 *
 * The look comes from the flat-screen HUD's own tokens — imported, not
 * copied — so a change to src/ui/styles.ts changes both.
 */

/** Everything the panel shows, and what each control does. Built by the
 *  app (App.tsx), so this module knows nothing about rooms or media. */
export interface XrHudModel {
  title: string;
  /** Everyone in the room, including you. */
  people: number;
  voice: "unavailable" | "off" | "connecting" | "muted" | "live";
  onVoice: () => void;
  gestures: { name: string; label: string; hold: boolean }[];
  activeGesture: string | null;
  onGestureStart: (name: string) => void;
  onGestureEnd: (name: string) => void;
  seiza: { active: boolean; toggle: () => void } | null;
  crouch: { active: boolean; start: () => void; end: () => void } | null;
  /** Shown only while seated or kneeling. */
  standUp: (() => void) | null;
  chat: { id: string; name: string; text: string }[];
  onExit: () => void;
  /** Someone's request for a together gesture ("Bea would like a hug"),
   *  answered here in a headset, or null. */
  request?: { text: string; accept: () => void; decline: () => void } | null;
  /** Someone within reach to ask for a together gesture, in a headset as
   *  on a screen, or null. `waiting` is your own request while it waits. */
  together?: { name: string; gestures: { name: string; label: string }[]; onAsk: (gesture: string) => void; waiting: string | null } | null;
}

export interface HudButton {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Press-and-hold rather than click: raise hand, crouch. */
  hold: boolean;
  active: boolean;
  disabled: boolean;
  icon?: "mic" | "micOff" | "exit";
  onPress: () => void;
  onRelease?: () => void;
}

export interface HudLayout {
  width: number;
  height: number;
  buttons: HudButton[];
  draw: (ctx: CanvasRenderingContext2D, hoverId: string | null, pressedId: string | null) => void;
}

/** Canvas pixels. The panel is drawn at roughly three times the flat
 *  HUD's CSS size, which is what the same text needs to be legible at
 *  arm's length in a headset. */
export const HUD_CANVAS_WIDTH = 960;
const SCALE = 3;
const PAD = 14 * SCALE;
const GAP = 6 * SCALE;
const ROW = 40 * SCALE;
const LABEL = 22 * SCALE;
const GESTURE_COLUMNS = 3;
const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

// The flat HUD's tokens. Panels and buttons are drawn a shade more opaque
// than on screen, because in a headset whatever is behind the panel is a
// moving 3D scene rather than a still page, and the text has to win.
const PANEL_FILL = String(panelStyle.background ?? "rgba(18,18,22,0.78)").replace(/[\d.]+\)$/, "0.92)");
const PANEL_BORDER = String(panelStyle.border ?? "1px solid rgba(255,255,255,0.08)").replace(/^.*?(rgba?\(.*\))$/, "$1");
const BUTTON_FILL = String(pillButtonStyle.background ?? "rgba(255,255,255,0.1)");
const BUTTON_BORDER = String(pillButtonStyle.border ?? "1px solid rgba(255,255,255,0.16)").replace(/^.*?(rgba?\(.*\))$/, "$1");
const ACTIVE_FILL = String(barButtonActiveStyle.background ?? "rgba(124,255,158,0.2)");
const ACTIVE_BORDER = String(barButtonActiveStyle.border ?? "1px solid rgba(124,255,158,0.45)").replace(/^.*?(rgba?\(.*\))$/, "$1");
/** Hover is the dock's own (.seiza-bar-btn:hover in HUD.tsx). */
const HOVER_FILL = "rgba(255,255,255,0.18)";
/** Held down: the gold the touch controls use while pressed
 *  (padButtonPressedStyle in TouchControls.tsx). */
const PRESSED_FILL = "rgba(232,195,122,0.32)";
const PRESSED_BORDER = "rgba(232,195,122,0.75)";
const TEXT = "#ffffff";
const MUTED_TEXT = "rgba(255,255,255,0.6)";

/** The flat HUD's microphone and leave icons (src/ui/icons.tsx), same
 *  24-unit geometry, as canvas paths. */
const ICON_PATHS: Record<NonNullable<HudButton["icon"]>, string[]> = {
  mic: ["M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z", "M5 10a7 7 0 0 0 14 0", "M12 17v4", "M9 21h6"],
  micOff: [
    "M9 9v3a3 3 0 0 0 4.6 2.5",
    "M15 5a3 3 0 0 0-6 0v3",
    "M5 10a7 7 0 0 0 9.5 6.6",
    "M19 10a7 7 0 0 1-1.2 3.9",
    "M12 17v4",
    "M9 21h6",
    "M3 3l18 18",
  ],
  exit: ["M15 3.5H8.5A1.5 1.5 0 0 0 7 5v14a1.5 1.5 0 0 0 1.5 1.5H15", "M11 12h10M18 8.5l3.5 3.5-3.5 3.5"],
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: NonNullable<HudButton["icon"]>, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = TEXT;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of ICON_PATHS[icon]) ctx.stroke(new Path2D(d));
  ctx.restore();
}

/** Cuts text to fit, with an ellipsis, rather than letting it run off. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

const VOICE_LABEL: Record<XrHudModel["voice"], string> = {
  unavailable: "",
  off: "Voice",
  connecting: "Connecting…",
  muted: "Unmute",
  live: "Mute",
};

/** Lays the panel out for this model. Height follows the content. */
export function layoutHud(model: XrHudModel): HudLayout {
  const width = HUD_CANVAS_WIDTH;
  const inner = width - PAD * 2;
  const buttons: HudButton[] = [];
  const texts: { text: string; x: number; y: number; size: number; color: string; weight?: number; maxWidth: number }[] = [];
  let y = PAD;

  // ---- header: where you are, who's here, and the way out ----
  const exitWidth = 150 * SCALE;
  texts.push({ text: model.title, x: PAD, y: y + ROW * 0.42, size: 17 * SCALE, color: TEXT, weight: 600, maxWidth: inner - exitWidth - GAP });
  texts.push({
    text: `${model.people} ${model.people === 1 ? "person" : "people"} here`,
    x: PAD,
    y: y + ROW * 0.86,
    size: 12 * SCALE,
    color: MUTED_TEXT,
    maxWidth: inner - exitWidth - GAP,
  });
  buttons.push({
    id: "exit",
    label: "Exit VR",
    x: width - PAD - exitWidth,
    y,
    w: exitWidth,
    h: ROW,
    hold: false,
    active: false,
    disabled: false,
    icon: "exit",
    onPress: model.onExit,
  });
  y += ROW + GAP * 2;

  // ---- a request waiting for an answer: first, so it's seen ----
  if (model.request) {
    const request = model.request;
    texts.push({ text: request.text, x: PAD, y: y + ROW * 0.55, size: 15 * SCALE, color: TEXT, weight: 600, maxWidth: inner });
    y += ROW * 0.9;
    const w = (inner - GAP) / 2;
    buttons.push({ id: "together:yes", label: "Yes", x: PAD, y, w, h: ROW, hold: false, active: true, disabled: false, onPress: request.accept });
    buttons.push({ id: "together:no", label: "No thanks", x: PAD + w + GAP, y, w, h: ROW, hold: false, active: false, disabled: false, onPress: request.decline });
    y += ROW + GAP * 2;
  }

  // ---- someone close enough to ask ----
  if (model.together && !model.request) {
    const together = model.together;
    if (together.waiting) {
      texts.push({ text: together.waiting, x: PAD, y: y + LABEL * 0.7, size: 13 * SCALE, color: MUTED_TEXT, maxWidth: inner });
      y += LABEL + GAP;
    } else {
      texts.push({ text: `Ask ${together.name} for`, x: PAD, y: y + LABEL * 0.7, size: 12 * SCALE, color: MUTED_TEXT, maxWidth: inner });
      y += LABEL;
      const w = (inner - GAP * (GESTURE_COLUMNS - 1)) / GESTURE_COLUMNS;
      together.gestures.forEach((gesture, i) => {
        const column = i % GESTURE_COLUMNS;
        const row = Math.floor(i / GESTURE_COLUMNS);
        buttons.push({
          id: `together:${gesture.name}`,
          label: gesture.label,
          x: PAD + column * (w + GAP),
          y: y + row * (ROW + GAP),
          w,
          h: ROW,
          hold: false,
          active: false,
          disabled: false,
          onPress: () => together.onAsk(gesture.name),
        });
      });
      y += Math.ceil(together.gestures.length / GESTURE_COLUMNS) * (ROW + GAP) + GAP;
    }
  }

  // ---- voice and standing up ----
  const rowItems: Omit<HudButton, "x" | "y" | "w" | "h">[] = [];
  if (model.voice !== "unavailable") {
    rowItems.push({
      id: "voice",
      label: VOICE_LABEL[model.voice],
      hold: false,
      // Green while your microphone is live, as on the flat control bar.
      active: model.voice === "live",
      disabled: model.voice === "connecting",
      icon: model.voice === "muted" ? "micOff" : "mic",
      onPress: model.onVoice,
    });
  }
  if (model.standUp) {
    rowItems.push({ id: "stand", label: "Stand up", hold: false, active: false, disabled: false, onPress: model.standUp });
  }
  if (rowItems.length) {
    const w = (inner - GAP * (rowItems.length - 1)) / rowItems.length;
    rowItems.forEach((item, i) => buttons.push({ ...item, x: PAD + i * (w + GAP), y, w, h: ROW }));
    y += ROW + GAP * 2;
  }

  // ---- gestures ----
  const gestureItems: Omit<HudButton, "x" | "y" | "w" | "h">[] = model.gestures.map((gesture) => ({
    id: `gesture:${gesture.name}`,
    // "(hold)" is in the flat menu's labels already; here holding is how
    // the button works, so the hint is redundant and costs width.
    label: gesture.label.replace(/\s*\(hold\)\s*$/i, ""),
    hold: gesture.hold,
    active: model.activeGesture === gesture.name,
    disabled: false,
    onPress: () => model.onGestureStart(gesture.name),
    onRelease: gesture.hold ? () => model.onGestureEnd(gesture.name) : undefined,
  }));
  if (model.seiza) {
    const seiza = model.seiza;
    gestureItems.push({ id: "seiza", label: "Seiza", hold: false, active: seiza.active, disabled: false, onPress: seiza.toggle });
  }
  if (model.crouch) {
    const crouch = model.crouch;
    gestureItems.push({ id: "crouch", label: "Crouch", hold: true, active: crouch.active, disabled: false, onPress: crouch.start, onRelease: crouch.end });
  }
  if (gestureItems.length) {
    texts.push({ text: "Gestures", x: PAD, y: y + LABEL * 0.7, size: 12 * SCALE, color: MUTED_TEXT, maxWidth: inner });
    y += LABEL;
    const w = (inner - GAP * (GESTURE_COLUMNS - 1)) / GESTURE_COLUMNS;
    gestureItems.forEach((item, i) => {
      const column = i % GESTURE_COLUMNS;
      const row = Math.floor(i / GESTURE_COLUMNS);
      buttons.push({ ...item, x: PAD + column * (w + GAP), y: y + row * (ROW + GAP), w, h: ROW });
    });
    y += Math.ceil(gestureItems.length / GESTURE_COLUMNS) * (ROW + GAP) + GAP;
  }

  // ---- chat, read-only ----
  // There is no comfortable way to type in a headset yet, so the panel
  // shows what people are saying and leaves replying to voice.
  if (model.chat.length) {
    texts.push({ text: "Chat", x: PAD, y: y + LABEL * 0.7, size: 12 * SCALE, color: MUTED_TEXT, maxWidth: inner });
    y += LABEL;
    for (const message of model.chat) {
      texts.push({ text: `${message.name}: ${message.text}`, x: PAD, y: y + 15 * SCALE, size: 13 * SCALE, color: TEXT, maxWidth: inner });
      y += 21 * SCALE;
    }
    y += GAP;
  }

  const height = Math.ceil(y + PAD - GAP);

  const draw = (ctx: CanvasRenderingContext2D, hoverId: string | null, pressedId: string | null) => {
    ctx.clearRect(0, 0, width, height);
    roundRect(ctx, 1.5, 1.5, width - 3, height - 3, 16 * SCALE);
    ctx.fillStyle = PANEL_FILL;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PANEL_BORDER;
    ctx.stroke();

    ctx.textBaseline = "middle";
    for (const text of texts) {
      ctx.font = `${text.weight ?? 400} ${text.size}px ${FONT}`;
      ctx.fillStyle = text.color;
      ctx.textAlign = "left";
      ctx.fillText(fit(ctx, text.text, text.maxWidth), text.x, text.y);
    }

    for (const button of buttons) {
      const pressed = pressedId === button.id;
      const hovered = hoverId === button.id && !button.disabled;
      roundRect(ctx, button.x, button.y, button.w, button.h, button.h / 2);
      ctx.fillStyle = pressed ? PRESSED_FILL : button.active ? ACTIVE_FILL : hovered ? HOVER_FILL : BUTTON_FILL;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = pressed ? PRESSED_BORDER : button.active ? ACTIVE_BORDER : BUTTON_BORDER;
      ctx.stroke();

      ctx.globalAlpha = button.disabled ? 0.45 : 1;
      ctx.font = `500 ${13 * SCALE}px ${FONT}`;
      ctx.fillStyle = TEXT;
      ctx.textAlign = "center";
      const iconSize = 18 * SCALE;
      const room = button.w - (button.icon ? iconSize + 36 : 24);
      // "Gasshō (thanks)" reads better as "Gasshō" than as "Gasshō (tha…":
      // a parenthetical gloss is the first thing to give up its space.
      const label =
        ctx.measureText(button.label).width > room ? button.label.replace(/\s*\([^)]*\)\s*$/, "") : button.label;
      const labelWidth = Math.min(ctx.measureText(label).width, room);
      const contentWidth = button.icon ? iconSize + 7 * SCALE + labelWidth : labelWidth;
      const left = button.x + (button.w - contentWidth) / 2;
      if (button.icon) drawIcon(ctx, button.icon, left, button.y + (button.h - iconSize) / 2, iconSize);
      const labelX = button.icon ? left + iconSize + 7 * SCALE + labelWidth / 2 : button.x + button.w / 2;
      ctx.fillText(fit(ctx, label, labelWidth + 1), labelX, button.y + button.h / 2 + 1);
      ctx.globalAlpha = 1;
    }
  };

  return { width, height, buttons, draw };
}

/** The button under a point in canvas pixels, if any. */
export function hitTest(layout: HudLayout, x: number, y: number): HudButton | null {
  for (const button of layout.buttons) {
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) return button;
  }
  return null;
}
