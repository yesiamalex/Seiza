import * as THREE from "three";

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

export type TextSurface = "board" | "note";

export interface TextTextureResult {
  texture: THREE.CanvasTexture;
  /** Width / height of the drawn surface. */
  aspect: number;
}

const SURFACES = {
  board: { width: 1024, height: 576, pad: 52, title: 64, body: 40, lineGap: 1.34 },
  note: { width: 640, height: 880, pad: 54, title: 48, body: 34, lineGap: 1.36 },
} as const;

const FONT_STACK = `system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
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
  const background = paper ? "#fdfaf1" : "#f7f3e8";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, spec.width, spec.height);

  // A coloured band along the top ties the board to its object colour and
  // gives an empty one something to look at.
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, spec.width, paper ? 14 : 22);
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

  let y = spec.pad + spec.title * 0.85;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#1e2430";
  if (heading) {
    ctx.font = `600 ${spec.title}px ${FONT_STACK}`;
    for (const line of wrap(ctx, heading, maxWidth).slice(0, 2)) {
      ctx.fillText(line, spec.pad, y);
      y += spec.title * 1.12;
    }
    ctx.strokeStyle = "rgba(30,36,48,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(spec.pad, y - spec.title * 0.45);
    ctx.lineTo(spec.width - spec.pad, y - spec.title * 0.45);
    ctx.stroke();
    y += spec.body * 0.5;
  }

  ctx.font = `400 ${spec.body}px ${FONT_STACK}`;
  ctx.fillStyle = "#333b49";
  const limit = spec.height - spec.pad;
  for (const raw of body) {
    if (y > limit) break;
    const trimmed = raw.trim();
    if (!trimmed) {
      y += spec.body * 0.6;
      continue;
    }
    const bullet = /^[-*•]\s*/.test(trimmed);
    const content = bullet ? trimmed.replace(/^[-*•]\s*/, "") : trimmed;
    const indent = bullet ? spec.body * 1.1 : 0;
    const wrapped = wrap(ctx, content, maxWidth - indent);
    wrapped.forEach((line, index) => {
      if (y > limit) return;
      if (bullet && index === 0) {
        ctx.fillStyle = accent;
        ctx.fillText("•", spec.pad, y);
        ctx.fillStyle = "#333b49";
      }
      ctx.fillText(line, spec.pad + indent, y);
      y += spec.body * spec.lineGap;
    });
  }

  if (!heading && body.every((line) => !line.trim())) {
    ctx.font = `400 ${spec.body}px ${FONT_STACK}`;
    ctx.fillStyle = "rgba(51,59,73,0.45)";
    ctx.fillText(paper ? "Click to write on this note" : "Click to write on this board", spec.pad, spec.pad + spec.title);
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
