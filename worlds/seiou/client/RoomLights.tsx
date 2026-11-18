// Ceiling lights in UPOU's buildings, one zone per indoor floor, from
// world/models/lights.json (scripts/place-lights.mjs). Built the way Seiza's
// own rooms are lit: each fixture is a glowing panel, drawn per floor as one
// instanced mesh, and a PooledLight, so only the few nearest the view
// actually shine (src/scene/LightPool.tsx), however many there are. Each
// floor's switch stands beside its lift kiosk (Lifts.tsx); the room's
// world state holds whether it's on, so everyone sees the same lights.
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { PooledLight } from "../../../src/scene/LightPool";

export interface LightZone {
  key: string;
  building: string;
  floor: number;
  fixtures: [number, number, number][];
}

let zonesPromise: Promise<LightZone[]> | null = null;
/** The buildings' light zones (loaded once). */
export function loadLightZones(): Promise<LightZone[]> {
  zonesPromise ??= fetch("/worlds/seiou/models/lights.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ zones: LightZone[] }>) : { zones: [] }))
    .then((d) => d.zones)
    .catch(() => []);
  return zonesPromise;
}

export function useLightZones(): LightZone[] {
  const [zones, setZones] = useState<LightZone[]>([]);
  useEffect(() => {
    let live = true;
    void loadLightZones().then((z) => live && setZones(z));
    return () => {
      live = false;
    };
  }, []);
  return zones;
}

/** Whether a zone is on: on unless someone switched it off. */
export const isOn = (state: Record<string, unknown>, key: string) => state[key] !== false;

const PANEL = new THREE.BoxGeometry(0.62, 0.03, 0.62);
/** Fixtures within a cell this wide share one real light. */
const CLUSTER = 12;

/**
 * The real lights for a floor: one per cluster of nearby fixtures rather
 * than one per fixture. A floor has 10 to 24 fixtures and the world shares
 * a pool of only four lights (LightPool.tsx), so with one each, the lights
 * were handed from fixture to fixture as you walked, and patches of floor
 * brightened and dimmed around you. A few broader lights per floor stay
 * put. Each panel still glows on its own.
 */
export function clusterLights(fixtures: [number, number, number][]) {
  const cells = new Map<string, [number, number, number][]>();
  for (const f of fixtures) {
    const key = `${Math.floor(f[0] / CLUSTER)},${Math.floor(f[2] / CLUSTER)}`;
    const cell = cells.get(key);
    if (cell) cell.push(f);
    else cells.set(key, [f]);
  }
  return [...cells.values()].map((cell) => {
    const n = cell.length;
    const x = cell.reduce((t, f) => t + f[0], 0) / n;
    const y = Math.min(...cell.map((f) => f[1]));
    const z = cell.reduce((t, f) => t + f[2], 0) / n;
    // As bright at the floor as Seiza's lanterns are: they hang at 2.75 m,
    // these at about 4, so (4 / 2.75)² as strong; more for a cell that
    // stands for several fixtures, reaching further.
    return { position: [x, y - 0.2, z] as [number, number, number], intensity: 16 * Math.min(2.5, 1 + 0.3 * (n - 1)), distance: 12 + Math.min(10, 2 * (n - 1)) };
  });
}
const ON = new THREE.Color("#fff6e2");
const OFF = new THREE.Color("#8d8f94");

function Zone({ zone, on }: { zone: LightZone; on: boolean }) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: ON, toneMapped: false }), []);
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(PANEL, material, zone.fixtures.length);
    const matrix = new THREE.Matrix4();
    zone.fixtures.forEach(([x, y, z], i) => m.setMatrixAt(i, matrix.makeTranslation(x, y, z)));
    m.userData.navIgnore = true;
    return m;
  }, [zone, material]);
  useEffect(
    () => () => {
      material.dispose();
      mesh.dispose();
    },
    [material, mesh]
  );
  const lights = useMemo(() => clusterLights(zone.fixtures), [zone]);
  material.color.copy(on ? ON : OFF);
  return (
    <>
      <primitive object={mesh} />
      {lights.map((light, i) => (
        <PooledLight key={i} position={light.position} intensity={on ? light.intensity : 0} distance={light.distance} color="#ffe9c4" />
      ))}
    </>
  );
}

export function RoomLights({ worldState }: { worldState: Record<string, unknown> }) {
  const zones = useLightZones();
  return (
    <>
      {zones.map((zone) => (
        <Zone key={zone.key} zone={zone} on={isOn(worldState, zone.key)} />
      ))}
    </>
  );
}
