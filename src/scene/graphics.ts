// How much the graphics ask of the device: High (as Seiza always was),
// Medium between, or Low, for older phones. Auto picks Low on an older iPhone (iPhone 11, XR,
// SE: the 2× screens) and on phones that say they're short of memory or
// cores, and High everywhere else; anyone can choose either.
//
// Low draws at one pixel per CSS pixel, turns the sun's shadows off, keeps
// avatars' textures to 1024 px (a VRoid avatar's 2048 px ones are about
// 20 MB each on the GPU, and a busy room of them is what runs Safari out of
// memory), and steps far avatars' detail down sooner, as a headset does.
// Medium keeps the shadows, draws a little less sharp than High, keeps
// textures to 2048 px, and steps far avatars down as Low does.
// Nothing about sound or voice changes.
import { useSyncExternalStore } from "react";
import * as THREE from "three";

export type GraphicsChoice = "auto" | "high" | "medium" | "low";
export type GraphicsLevel = "high" | "medium" | "low";
const KEY = "seiza-graphics";
const listeners = new Set<() => void>();

function stored(): GraphicsChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "high" || v === "medium" || v === "low" ? v : "auto";
  } catch {
    return "auto";
  }
}
let choice: GraphicsChoice = typeof window === "undefined" ? "auto" : stored();

export function getGraphicsChoice(): GraphicsChoice {
  return choice;
}

export function setGraphicsChoice(next: GraphicsChoice): void {
  choice = next;
  try {
    if (next === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // No storage: it holds for this visit.
  }
  for (const l of listeners) l();
}

export function useGraphicsChoice(): GraphicsChoice {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getGraphicsChoice,
    () => "auto"
  );
}

/** Whether this looks like a device that needs the lighter graphics. */
export function lowEndDevice(nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator, pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? "";
  // iPhones with 2× screens are the older ones (11, XR, SE, 8); newer have 3×.
  if (/iPhone|iPod/.test(ua)) return pixelRatio < 2.5;
  const mobile = /Android|Mobile/.test(ua);
  const memory = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
  if (!mobile) return false;
  // Chrome reports memory rounded down to a power of two: a 6 GB phone says
  // 4. So only 2 or less is short of it on its own, or 4 with few cores.
  const cores = nav.hardwareConcurrency ?? 8;
  if (memory !== undefined && memory <= 2) return true;
  if (memory !== undefined && memory <= 4 && cores <= 4) return true;
  return memory === undefined && cores <= 4;
}

const levelOf = (c: GraphicsChoice): GraphicsLevel => (c === "auto" ? (lowEndDevice() ? "low" : "high") : c);

/** The graphics now: chosen, or what Auto picked for this device. */
export function graphicsLevel(): GraphicsLevel {
  return levelOf(choice);
}
export function useGraphicsLevel(): GraphicsLevel {
  return levelOf(useGraphicsChoice());
}
/** Low graphics now. */
export function isLowGraphics(): boolean {
  return graphicsLevel() === "low";
}
/** Far avatars' detail steps down sooner (Medium and Low), as in a headset. */
export const leanCrowd = () => graphicsLevel() !== "high";
/** The largest texture side an avatar keeps, or null for its own. */
export function textureCap(level: GraphicsLevel = graphicsLevel()): number | null {
  return level === "low" ? LOW_TEXTURE_SIZE : level === "medium" ? 2048 : null;
}
/** The most pixels drawn per screen pixel; and whether the sun casts shadows. */
export const PIXEL_CAP: Record<GraphicsLevel, number> = { high: 1.5, medium: 1.15, low: 1 };
export const castsShadows = (level: GraphicsLevel) => level !== "low";

/** The largest texture side an avatar keeps on Low graphics. */
export const LOW_TEXTURE_SIZE = 1024;

/**
 * Redraws every texture under `root` bigger than `max` on a side at `max`,
 * once each (avatars share textures between materials), and frees the
 * original. MToon keeps its textures in uniforms, so those are looked in too.
 */
export function shrinkTextures(root: THREE.Object3D, max = LOW_TEXTURE_SIZE): number {
  if (typeof document === "undefined") return 0;
  const seen = new Set<THREE.Texture>();
  let shrunk = 0;
  const shrink = (texture: THREE.Texture) => {
    if (seen.has(texture)) return;
    seen.add(texture);
    const image = texture.image as (CanvasImageSource & { width?: number; height?: number; close?: () => void }) | undefined;
    const width = image?.width ?? 0;
    const height = image?.height ?? 0;
    if (!image || !width || !height) return;
    const k = max / Math.max(width, height);
    if (k >= 1) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * k));
    canvas.height = Math.max(1, Math.round(height * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.();
    texture.image = canvas;
    texture.needsUpdate = true;
    shrunk++;
  };
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) shrink(value);
      const uniforms = (m as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) if (u?.value instanceof THREE.Texture) shrink(u.value);
    }
  });
  return shrunk;
}
