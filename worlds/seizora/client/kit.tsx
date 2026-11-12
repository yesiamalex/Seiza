// Small building blocks for Seizora's in-world exhibits: live canvas
// displays, merged static geometry, clickable parts, glow outlines, and sign
// lamps.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LightZone } from "../../../src/multiplayer/types";
import { nightNeed as darkness, signWashTexture } from "../../../src/scene/roomLights";
import { live } from "./live";
import { drawWrapped } from "../../../src/ui/wrapLines";

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
 *  after the last line. Breaks between words, or anywhere in Japanese. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  return drawWrapped(ctx, text, x, y, maxWidth, lineHeight);
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

// --- glow outlines ---------------------------------------------------------------------

export interface RingSpec {
  radius: number;
  at: [number, number, number];
  /** Euler rotation; a ring lies in its XY plane, so [π/2, 0, 0] lays it flat. */
  rotation?: [number, number, number];
}

/** The twelve edges of each box (turned about the box's own centre) and
 *  any rings, as thin bars in one geometry. */
export function glowGeometry(boxes: BoxSpec[], rings: RingSpec[] = [], thickness = 0.025): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const t = thickness;
  const bar = (size: [number, number, number], at: [number, number, number]) => {
    const g = new THREE.BoxGeometry(...size);
    g.translate(...at);
    g.applyMatrix4(m);
    parts.push(g);
  };
  for (const b of boxes) {
    const [hx, hy, hz] = [b.size[0] / 2, b.size[1] / 2, b.size[2] / 2];
    q.setFromEuler(e.set(...(b.rotation ?? [0, 0, 0])));
    m.compose(new THREE.Vector3(...b.at), q, one);
    for (const u of [-1, 1]) {
      for (const v of [-1, 1]) {
        bar([2 * hx + t, t, t], [0, u * hy, v * hz]);
        if (hy * 2 > t) bar([t, 2 * hy + t, t], [u * hx, 0, v * hz]);
        bar([t, t, 2 * hz + t], [u * hx, v * hy, 0]);
      }
    }
  }
  for (const r of rings) {
    const g = new THREE.TorusGeometry(r.radius, t / 2, 4, 48);
    q.setFromEuler(e.set(...(r.rotation ?? [0, 0, 0])));
    g.applyMatrix4(m.compose(new THREE.Vector3(...r.at), q, one));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  return merged;
}

/** How bright a glow line stays with its room's lights switched off. */
const GLOW_OFF = 0.06;
const noRaycast = () => {};

/**
 * Cheap lit trim: thin unlit bars along the outlines of `boxes` and around
 * `rings`, one draw call, switched with the room's lights in `zone` (the
 * same switches as Seiza's own lamps). Not clickable, so they never get in
 * the way of the exhibit underneath.
 */
export function GlowLines({ boxes = [], rings = [], color, zone, thickness }: { boxes?: BoxSpec[]; rings?: RingSpec[]; color: string; zone: LightZone; thickness?: number }) {
  // The specs are module constants or fixed for the exhibit's lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => glowGeometry(boxes, rings, thickness), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const base = useMemo(() => new THREE.Color(color), [color]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: base, toneMapped: false }), [base]);
  useEffect(() => () => material.dispose(), [material]);
  const level = useRef(live.lights[zone] ? 1 : GLOW_OFF);
  useFrame((_, delta) => {
    const target = live.lights[zone] ? 1 : GLOW_OFF;
    level.current += (target - level.current) * (1 - Math.exp(-delta / 0.12));
    material.color.copy(base).multiplyScalar(level.current);
  });
  return <mesh geometry={geometry} material={material} raycast={noRaycast} />;
}

// --- sign lamps --------------------------------------------------------------------------

/** Seiza's own sign wash (src/scene/roomLights.ts), shared with its text
 *  boards. */
export { signWashTexture };

/**
 * A sign lamp for `faces` (standard materials with signWashTexture() as
 * their light map): turns their wash up at night while `zone`'s lights are
 * on, and returns the material for the lamp's glowing strip.
 */
export function useSignLamp(zone: LightZone, faces: THREE.MeshStandardMaterial[], strength = 2.6) {
  const strip = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff1d6", toneMapped: false }), []);
  useEffect(() => () => strip.dispose(), [strip]);
  const level = useRef(live.lights[zone] ? 1 : 0);
  useFrame((_, delta) => {
    level.current += ((live.lights[zone] ? 1 : 0) - level.current) * (1 - Math.exp(-delta / 0.12));
    strip.color.setRGB(1, 0.945, 0.84).multiplyScalar(GLOW_OFF + (1 - GLOW_OFF) * level.current);
    const wash = strength * level.current * darkness();
    for (const face of faces) face.lightMapIntensity = wash;
  });
  return strip;
}

/**
 * Lifts `materials` a little at night while `zone`'s lights are on, as if
 * a lamp over them were on: their own colour, added as emission, so a dark
 * exhibit doesn't read as a silhouette. No light involved.
 */
export function useNightLift(zone: LightZone, materials: THREE.MeshStandardMaterial[], amount = 0.3) {
  const level = useRef(live.lights[zone] ? 1 : 0);
  useFrame((_, delta) => {
    level.current += ((live.lights[zone] ? 1 : 0) - level.current) * (1 - Math.exp(-delta / 0.12));
    const lift = amount * level.current * darkness();
    for (const m of materials) m.emissive.copy(m.color).multiplyScalar(lift);
  });
}
