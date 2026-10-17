// Small building blocks for Seilaya's stations: canvas-drawn boards and
// clickable parts. Forked from Seizora's kit (worlds/seizora/client/kit.tsx)
// so each world stands on its own.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { LightZone } from "../../../src/multiplayer/types";
import { nightNeed, roomLights, signWashTexture } from "../../../src/scene/roomLights";

export const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** A canvas texture drawn once (and again whenever `deps` change). */
export function useCanvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[] = []) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [width, height]);
  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw(ctx, canvas.width, canvas.height);
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, ...deps]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Wraps `text` to `maxWidth`, draws it from (x, y), and returns the y
 *  after the last line. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function standard(color: string, roughness = 0.6, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/**
 * A face for a board or plaque: its canvas texture, washed from the top at
 * night while its room's lights are on, as Seiza's own text boards are
 * (src/scene/roomLights.ts). A light map, not a light: it costs nothing.
 */
export function useWashedFace(texture: THREE.Texture, zone: LightZone) {
  const face = useMemo(
    () => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, lightMap: signWashTexture(), lightMapIntensity: 0 }),
    [texture]
  );
  useEffect(() => () => face.dispose(), [face]);
  const wash = useRef(0);
  useFrame((_, delta) => {
    const target = (roomLights[zone] ? 2.4 : 0.25) * nightNeed();
    wash.current += (target - wash.current) * (1 - Math.exp(-delta / 0.12));
    face.lightMapIntensity = wash.current;
  });
  return face;
}

/** A group you can click: a pointer cursor on hover, and the click kept
 *  from also reaching the floor (which would walk you there). */
export function Clickable({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  const over = (cursor: string) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = cursor;
  };
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    []
  );
  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerOver={over("pointer")}
      onPointerOut={over("")}
    >
      {children}
    </group>
  );
}
