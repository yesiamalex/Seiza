import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { nightNeed } from "./roomLights";

/** A straight glowing line from one point to another. Lines run along an
 *  axis (an outline's edges), which is all the world needs. */
export type GlowSegment = [[number, number, number], [number, number, number]];

const BAR = 0.025;
/** How bright the lines stay with their switch off. */
const OFF = 0.05;

/**
 * Warm outline trim on a light switch: thin unlit bars along `segments`,
 * merged into one mesh, so a whole room's worth is a single draw call and
 * no light at all (it costs nothing per pixel, like Seizora's outlined
 * panels). Strongest at night, faint by day, nearly dark when switched off.
 * Not clickable, so it never gets between you and what it outlines.
 */
export function GlowEdges({ segments, lit, color = "#ffcf8a" }: { segments: GlowSegment[]; lit: boolean; color?: string }) {
  // The segments are fixed for the world's lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => buildBars(segments), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color, toneMapped: false }), [color]);
  useEffect(() => () => material.dispose(), [material]);
  const level = useRef(lit ? 1 : 0);
  useFrame((_, delta) => {
    level.current += ((lit ? 1 : 0) - level.current) * (1 - Math.exp(-delta / 0.15));
    material.color.set(color).multiplyScalar(OFF + (1 - OFF) * level.current * (0.35 + 0.65 * nightNeed()));
  });
  return <mesh geometry={geometry} material={material} raycast={() => null} />;
}

/** The four edges of a horizontal rectangle at height `y`. */
export function rectOutline(minX: number, maxX: number, minZ: number, maxZ: number, y: number): GlowSegment[] {
  return [
    [[minX, y, minZ], [maxX, y, minZ]],
    [[minX, y, maxZ], [maxX, y, maxZ]],
    [[minX, y, minZ], [minX, y, maxZ]],
    [[maxX, y, minZ], [maxX, y, maxZ]],
  ];
}

function buildBars(segments: GlowSegment[]): THREE.BufferGeometry {
  const parts = segments.map(([a, b]) =>
    new THREE.BoxGeometry(
      Math.abs(b[0] - a[0]) + BAR,
      Math.abs(b[1] - a[1]) + BAR,
      Math.abs(b[2] - a[2]) + BAR
    ).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  );
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  for (const g of parts) g.dispose();
  return merged ?? new THREE.BufferGeometry();
}
