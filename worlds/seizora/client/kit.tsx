// Small building blocks for Seizora's in-world exhibits: live canvas
// displays, merged static geometry, and clickable parts.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// --- live canvas displays --------------------------------------------------------------

/**
 * A canvas texture, drawn by `draw` once at the start and then `hz` times a
 * second while the camera is within `range` metres of `anchor` (or always,
 * with no anchor). Skipping far-away displays keeps texture uploads to the
 * one or two a visitor can actually read.
 */
export function useCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  options: { hz?: number; anchor?: React.RefObject<THREE.Object3D | null>; range?: number; deps?: unknown[] } = {}
): THREE.CanvasTexture {
  const { hz = 0, anchor, range = 22, deps = [] } = options;
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [width, height]);
  const redraw = () => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawRef.current(ctx, canvas.width, canvas.height);
    texture.needsUpdate = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(redraw, [texture, ...deps]);
  useEffect(() => () => texture.dispose(), [texture]);
  const since = useRef(0);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }, delta) => {
    if (!hz) return;
    since.current += delta;
    if (since.current < 1 / hz) return;
    since.current = 0;
    if (anchor?.current && anchor.current.getWorldPosition(scratch).distanceTo(camera.position) > range) return;
    redraw();
  });
  return texture;
}

export const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Wraps `text` to `maxWidth`, draws it from (x, y), and returns the y
 *  after the last line. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
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

export const fmt = (v: number, digits = 2) => v.toFixed(digits);
export const hhmm = (hour: number) => {
  const minutes = Math.floor((((hour % 24) + 24) % 24) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

// --- merged static geometry -----------------------------------------------------------

export interface BoxSpec {
  size: [number, number, number];
  at: [number, number, number];
  /** Euler rotation about the box's own centre. */
  rotation?: [number, number, number];
}

export interface CylinderSpec {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  at: [number, number, number];
  rotation?: [number, number, number];
  segments?: number;
}

/** Many boxes and cylinders as one geometry: one draw call however many
 *  pieces a structure has. */
export function mergedGeometry(boxes: BoxSpec[], cylinders: CylinderSpec[] = []): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(...b.size);
    q.setFromEuler(e.set(...(b.rotation ?? [0, 0, 0])));
    g.applyMatrix4(m.compose(new THREE.Vector3(...b.at), q, one));
    parts.push(g);
  }
  for (const c of cylinders) {
    const g = new THREE.CylinderGeometry(c.radiusTop, c.radiusBottom, c.height, c.segments ?? 16);
    q.setFromEuler(e.set(...(c.rotation ?? [0, 0, 0])));
    g.applyMatrix4(m.compose(new THREE.Vector3(...c.at), q, one));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  return merged;
}

export function useMerged(boxes: BoxSpec[], cylinders: CylinderSpec[] = []) {
  // The specs are module constants, so building once is right.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => mergedGeometry(boxes, cylinders), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/**
 * A solid with a side profile (points as [z, y], in order around the
 * outline) running `width` metres along X, centred: a desk with a sloped
 * top, say, as one closed shape with nothing to see inside.
 */
export function usePrismX(profile: [number, number][], width: number) {
  const geometry = useMemo(() => {
    // Shape x is -z, so that turning the extrusion onto X lands it the
    // right way round.
    const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(-z, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(-width / 2, 0, 0);
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export function standard(color: string, roughness = 0.6, metalness = 0.1, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

// --- clickable parts -------------------------------------------------------------------

/** A group you can click: a pointer cursor on hover, and the click kept
 *  from also reaching the floor (which would walk you there). */
export function Clickable({ onClick, children, enabled = true }: { onClick: () => void; children: ReactNode; enabled?: boolean }) {
  const over = (cursor: string) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = cursor;
  };
  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);
  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        if (enabled) onClick();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerOver={over(enabled ? "pointer" : "not-allowed")}
      onPointerOut={over("")}
    >
      {children}
    </group>
  );
}
