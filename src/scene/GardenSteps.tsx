import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FIELD, FIELD_Y, GARDEN_STEPS, MEADOW_BANK, MEADOW_WING, OUTDOOR } from "./layout";

const CURB = { height: 0.32, depth: 0.3 };
const WALL_DEPTH = 0.4;

/**
 * The garden's back edge, where the meadow drops away below it: a stone
 * retaining wall, a low curb along its top, stone steps down through the
 * middle, and the wall's end walls where the meadow's banks take over.
 *
 * One merged mesh and one material, so all of it is a single draw call.
 * Its collision is in layout.ts (the curb and end walls are obstacles; the
 * steps walk as a slope, see floorHeightAt).
 */
export function GardenSteps() {
  const geometry = useMemo(buildSteps, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => new THREE.MeshLambertMaterial({ color: "#9a958a" }), []);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

function buildSteps(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  /** A box from (x0, y0, z0) to (x1, y1, z1). */
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    parts.push(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));

  const edge = OUTDOOR.maxZ;
  const { x, halfWidth, tread, risers } = GARDEN_STEPS;
  const rise = -FIELD_Y / risers;
  const bottom = FIELD_Y - 0.05;

  for (const side of [-1, 1]) {
    // The retaining wall either side of the steps, its face on the edge.
    const [a, b] = side < 0 ? [-MEADOW_WING.x, x - halfWidth] : [x + halfWidth, MEADOW_WING.x];
    box(a, b, bottom, 0.001, edge - WALL_DEPTH, edge);
    // The curb along its top, on the garden side.
    box(a, b, 0, CURB.height, edge - CURB.depth, edge);
    // The steps' cheeks, the curb running down beside them.
    const cheek = side * (halfWidth + 0.12);
    for (let i = 0; i < risers; i++) {
      box(x + cheek - 0.12, x + cheek + 0.12, bottom, CURB.height - rise * i, edge + tread * (i - 1), edge + tread * i);
    }
    // The end wall, from the curb's end out across the bank.
    const w0 = side * MEADOW_WING.x;
    const w1 = side * (MEADOW_WING.x + MEADOW_WING.width);
    box(Math.min(w0, w1), Math.max(w0, w1), bottom, CURB.height, edge - CURB.depth, FIELD.minZ + MEADOW_BANK);
  }

  // The steps: each tread a riser lower than the last, down to the meadow.
  for (let i = 1; i < risers; i++) {
    box(x - halfWidth, x + halfWidth, bottom, -rise * i, edge + tread * (i - 1), edge + tread * i);
  }

  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  for (const g of parts) g.dispose();
  return merged ?? new THREE.BufferGeometry();
}
