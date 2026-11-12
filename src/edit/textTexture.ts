import * as THREE from "three";
import { wrapLines } from "../ui/wrapLines";

/**
 * Draws a board or note's text onto a canvas and hands back a texture.
 *
 * Deliberately not a 3D text library: troika (what drei's <Text> uses)
 * builds glyph geometry and, by default, downloads a font from a third-party
 * CDN, which this project avoids. A canvas uses the reader's own system
 * fonts, costs one texture, and is redrawn only when the text actually
 * changes — a board nobody is editing is free.
 *
 * Formatting is deliberately small: the first line is the heading, blank
 * lines separate paragraphs, and a line starting with "-" or "*" is a
 * bullet. That covers a notice or an agenda without turning into a markup
 * language nobody asked for.
 */

export type TextSurface = "board" | "note" | "sign";

export interface TextTextureResult {
  texture: THREE.CanvasTexture;
  /** Width / height of the drawn surface. */
  aspect: number;
}

const SURFACES = {
  board: { width: 1024, height: 576, pad: 52, title: 64, body: 40, lineGap: 1.34 },
  note: { width: 640, height: 880, pad: 54, title: 48, body: 34, lineGap: 1.36 },
  // A sign is read from across the room rather than from arm's length,
  // so it is typeset the other way round from a board: a very large
  // heading, a small amount of supporting text, and centred, because a
  // short centred line reads faster at distance than a ragged-right one.
  sign: { width: 1024, height: 512, pad: 60, title: 128, body: 52, lineGap: 1.3 },
} as const;

const FONT_STACK = `system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return wrapLines(ctx, text.replace(/\s+/g, " ").trim(), maxWidth);
}

export function createTextTexture(text: string, surface: TextSurface, accent: string): TextTextureResult | null {
  if (typeof document === "undefined") return null;
  const spec = SURFACES[surface];
  const canvas = document.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const paper = surface === "note";
  const sign = surface === "sign";
  // A sign is dark with light lettering: it is usually seen against a
  // bright floor or a sunlit wall, where a pale panel washes out.
  const background = sign ? "#232a36" : paper ? "#fdfaf1" : "#f7f3e8";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, spec.width, spec.height);

  // A coloured band along the top ties the board to its object colour and
  // gives an empty one something to look at.
  ctx.fillStyle = accent;
  if (sign) {
    // Framed rather than banded: a border reads as a sign from any
    // angle, where a top stripe disappears when seen from below.
    ctx.lineWidth = 10;
    ctx.strokeStyle = accent;
    ctx.strokeRect(14, 14, spec.width - 28, spec.height - 28);
  } else {
    ctx.fillRect(0, 0, spec.width, paper ? 14 : 22);
  }
  if (paper) {
    // Faint ruled lines, so an empty note still reads as a sheet of paper.
    ctx.strokeStyle = "rgba(70,90,120,0.16)";
    ctx.lineWidth = 2;
    for (let y = spec.pad + 90; y < spec.height - spec.pad; y += spec.body * spec.lineGap) {
      ctx.beginPath();
      ctx.moveTo(spec.pad, y);
      ctx.lineTo(spec.width - spec.pad, y);
      ctx.stroke();
    }
  }

  const maxWidth = spec.width - spec.pad * 2;
  const lines = text.split("\n");
  const heading = lines[0]?.trim() ?? "";
  const body = lines.slice(1);
  const limit = spec.height - spec.pad;
  // Everything below measures from the left padding; on a centred sign
  // the anchor is the middle instead.
  const anchorX = sign ? spec.width / 2 : spec.pad;
  if (sign) ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  /**
   * Lays the text out at a given type scale, drawing it only when asked.
   * Returns where the last line ended and whether every line fitted.
   *
   * Layout is measured before anything is drawn because the sizes are
   * fixed per surface, and a sign's large heading used to wrap to two
   * lines and push every body line past the bottom margin, where the
   * loop below silently dropped them. Now the type shrinks until the
   * whole text fits, down to a floor that is still readable.
   */
  const layout = (scale: number, draw: boolean, offset = 0) => {
    const title = spec.title * scale;
    // The body gives up size more slowly than the heading: a long heading
    // is what usually forces the shrink, and body text is already small.
    const bodySize = spec.body * Math.min(1, scale + 0.3);
    let y = spec.pad + title * 0.85 + offset;
    let fits = true;
    if (heading) {
      ctx.font = `600 ${title}px ${FONT_STACK}`;
      ctx.fillStyle = sign ? "#f4efe3" : "#1e2430";
      const wrapped = wrap(ctx, heading, maxWidth);
      if (wrapped.length > 2) fits = false;
      for (const line of wrapped.slice(0, 2)) {
        if (draw) ctx.fillText(line, anchorX, y);
        y += title * 1.12;
      }
      // The rule under a board's heading would cut a sign in half.
      if (!sign && draw) {
        ctx.strokeStyle = "rgba(30,36,48,0.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(spec.pad, y - title * 0.45);
        ctx.lineTo(spec.width - spec.pad, y - title * 0.45);
        ctx.stroke();
      }
      y += bodySize * 0.5;
    }

    ctx.font = `400 ${bodySize}px ${FONT_STACK}`;
    const bodyColor = sign ? "rgba(244,239,227,0.82)" : "#333b49";
    ctx.fillStyle = bodyColor;
    for (const raw of body) {
      const trimmed = raw.trim();
      if (!trimmed) {
        y += bodySize * 0.6;
        continue;
      }
      const bullet = /^[-*•]\s*/.test(trimmed);
      const content = bullet ? trimmed.replace(/^[-*•]\s*/, "") : trimmed;
      const indent = bullet ? bodySize * 1.1 : 0;
      wrap(ctx, content, maxWidth - indent).forEach((line, index) => {
        // A baseline below the margin means a line that doesn't fit.
        if (y > limit) {
          fits = false;
          return;
        }
        if (draw) {
          if (bullet && index === 0 && !sign) {
            ctx.fillStyle = accent;
            ctx.fillText("•", spec.pad, y);
            ctx.fillStyle = bodyColor;
          }
          ctx.fillText(line, sign ? anchorX : spec.pad + indent, y);
        }
        y += bodySize * spec.lineGap;
      });
    }
    // Where the last baseline sits, less the gap left after it.
    return { fits, end: y - bodySize * spec.lineGap + bodySize * 0.3 };
  };

  const MIN_SCALE = 0.5;
  let scale = 1;
  while (scale > MIN_SCALE && !layout(scale, false).fits) scale -= 0.05;
  scale = Math.max(scale, MIN_SCALE);
  // A sign is read as a block, so its text sits in the middle of the
  // panel; boards and notes keep theirs at the top, like paper.
  const offset = sign ? Math.max(0, (limit - layout(scale, false).end) / 2) : 0;
  layout(scale, true, offset);

  if (!heading && body.every((line) => !line.trim())) {
    ctx.font = `400 ${spec.body}px ${FONT_STACK}`;
    ctx.fillStyle = sign ? "rgba(244,239,227,0.5)" : "rgba(51,59,73,0.45)";
    const placeholder = sign
      ? "Click to name this sign"
      : paper
        ? "Click to write on this note"
        : "Click to write on this board";
    ctx.fillText(placeholder, anchorX, spec.pad + spec.title);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 4;
  return { texture, aspect: spec.width / spec.height };
}

/** The idle face of a screen object, before anyone presents on it. */
export function createScreenPlaceholder(label: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createLinearGradient(0, 0, 0, 288);
  gradient.addColorStop(0, "#2b3242");
  gradient.addColorStop(1, "#1b202b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 288);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = `500 26px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText(label, 256, 150);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
