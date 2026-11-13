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
  material.color.copy(on ? ON : OFF);
  return (
    <>
      <primitive object={mesh} />
      {zone.fixtures.map(([x, y, z], i) => (
        // As bright at the floor as Seiza's lanterns are: they hang at
        // 2.75 m, these at about 4, so (4 / 2.75)² as strong.
        <PooledLight key={i} position={[x, y - 0.2, z]} intensity={on ? 16 : 0} distance={12} color="#ffe9c4" />
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
