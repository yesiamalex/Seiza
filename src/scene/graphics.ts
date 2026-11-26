// How much the graphics ask of the device: High (as Seiza always was) or
// Low, for older phones. Auto picks Low on an older iPhone (iPhone 11, XR,
// SE: the 2× screens) and on phones that say they're short of memory or
// cores, and High everywhere else; anyone can choose either.
//
// Low draws at one pixel per CSS pixel, turns the sun's shadows off, keeps
// avatars' textures to 1024 px (a VRoid avatar's 2048 px ones are about
// 20 MB each on the GPU, and a busy room of them is what runs Safari out of
// memory), and steps far avatars' detail down sooner, as a headset does.
// Nothing about sound or voice changes.
import { useSyncExternalStore } from "react";
import * as THREE from "three";

export type GraphicsChoice = "auto" | "high" | "low";
const KEY = "seiza-graphics";
const listeners = new Set<() => void>();

function stored(): GraphicsChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "high" || v === "low" ? v : "auto";
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
  if (mobile && memory !== undefined && memory <= 4) return true;
  if (mobile && (nav.hardwareConcurrency ?? 8) <= 4) return true;
  return false;
}

/** Low graphics now: chosen, or picked by Auto. */
export function isLowGraphics(): boolean {
  return choice === "low" || (choice === "auto" && lowEndDevice());
}

export function useLowGraphics(): boolean {
  const c = useGraphicsChoice();
  return c === "low" || (c === "auto" && lowEndDevice());
}

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
