import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FIELD, FIELD_Y, GARDEN_STEPS, MEADOW_BANK, MEADOW_WING, OUTDOOR, OUTER_GROUND_Y } from "./layout";
import { nightNeed } from "./roomLights";

const CURB = { height: 0.32, depth: 0.3 };
// As deep as the curb on it, so the curb covers its whole top: a strip of
// wall top left showing lay level with the deck and flickered against it.
const WALL_DEPTH = CURB.depth;
/** The stone kerb along the garden's sides, where the deck meets the lawn:
 *  without it the deck was a flat sheet laid on the grass. */
const KERB = { width: 0.3, height: 0.12 };

/**
 * The garden's back edge, where the meadow drops away below it: a stone
 * retaining wall, a low curb along its top, stone steps down through the
 * middle, and the wall's end walls where the meadow's banks take over.
 *
 * One merged mesh and one material, so all of it is a single draw call.
 * Its collision is in layout.ts (the curb and end walls are obstacles; the
 * steps walk as a slope, see floorHeightAt).
 *
 * Its edges glow on the garden switch (`lit`): each step's nose, the curb
 * along the wall, and the kerbs down the garden's sides, as thin unlit bars
 * in one more mesh. A glow, not a light, so it costs nothing per pixel,
 * like Seizora's outlined panels.
 */
export function GardenSteps({ lit = false }: { lit?: boolean }) {
  const geometry = useMemo(buildSteps, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => new THREE.MeshLambertMaterial({ color: "#9a958a" }), []);
  useEffect(() => () => material.dispose(), [material]);

  const glowGeometry = useMemo(buildGlow, []);
  useEffect(() => () => glowGeometry.dispose(), [glowGeometry]);
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: GLOW_COLOR, toneMapped: false }), []);
  useEffect(() => () => glow.dispose(), [glow]);
  const level = useRef(lit ? 1 : 0);
  useFrame((_, delta) => {
    level.current += ((lit ? 1 : 0) - level.current) * (1 - Math.exp(-delta / 0.15));
    // Strongest at night; a faint warm line by day; near dark when off.
    const strength = GLOW_OFF + (1 - GLOW_OFF) * level.current * (0.35 + 0.65 * nightNeed());
    glow.color.set(GLOW_COLOR).multiplyScalar(strength);
  });

  return (
    <>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      <mesh geometry={glowGeometry} material={glow} raycast={() => null} />
    </>
  );
}

const GLOW_COLOR = "#ffcf8a";
const GLOW_OFF = 0.05;
const GLOW_BAR = 0.025;

/** The glowing edges: thin bars just proud of the stone's top edges. */
function buildGlow(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bar = (x0: number, x1: number, y: number, z0: number, z1: number) =>
    parts.push(
      new THREE.BoxGeometry(Math.max(GLOW_BAR, x1 - x0), GLOW_BAR, Math.max(GLOW_BAR, z1 - z0)).translate((x0 + x1) / 2, y, (z0 + z1) / 2)
    );
  const edge = OUTDOOR.maxZ;
  const { x, halfWidth, tread, risers } = GARDEN_STEPS;
  const rise = -FIELD_Y / risers;
  const lip = GLOW_BAR / 2 + 0.004;
  // The landing's edge and each step's nose.
  for (let i = 0; i < risers; i++) bar(x - halfWidth, x + halfWidth, -rise * i + lip, edge + tread * i - GLOW_BAR, edge + tread * i);
  for (const side of [-1, 1]) {
    // The curb's outer top edge along the wall, either side of the steps.
    const [a, b] = side < 0 ? [-MEADOW_WING.x, x - halfWidth - 0.24] : [x + halfWidth + 0.24, MEADOW_WING.x];
    bar(a, b, CURB.height + lip, edge - GLOW_BAR, edge);
    // The kerb's outer top edge down the garden's side.
    const kx = side * (OUTDOOR.maxX + KERB.width - GLOW_BAR / 2);
    bar(kx - GLOW_BAR / 2, kx + GLOW_BAR / 2, KERB.height + lip, OUTDOOR.minZ, edge - CURB.depth);
  }
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  for (const g of parts) g.dispose();
  return merged ?? new THREE.BufferGeometry();
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
    // The steps' cheeks, the curb running down beside them. They start
    // just clear of the wall's face rather than inside it, where the two
    // shared surfaces and flickered.
    const cheek = side * (halfWidth + 0.12);
    for (let i = 1; i < risers; i++) {
      box(x + cheek - 0.12, x + cheek + 0.12, bottom, CURB.height - rise * i, edge + tread * (i - 1) + 0.002, edge + tread * i);
    }
    // The kerb down the garden's side, from the building to the wall.
    const k0 = side * OUTDOOR.maxX;
    const k1 = side * (OUTDOOR.maxX + KERB.width);
    box(Math.min(k0, k1), Math.max(k0, k1), OUTER_GROUND_Y - 0.02, KERB.height, OUTDOOR.minZ, edge - CURB.depth);
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
