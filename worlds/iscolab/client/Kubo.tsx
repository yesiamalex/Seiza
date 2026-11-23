// The temporary kubo for sessions while the lab is being fixed, built the way
// Tulay builds its kubo hall (worlds/tulay/client/Kubo.tsx), with Tulay's
// own geometry and materials: bamboo posts and benches, a nipa roof,
// sawali walls, capiz lamps lit at dusk, and a name board over its open
// side. The screen and the facilitator's chair are room objects
// (world.json's defaultObjects), so they can be shared to and moved.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PooledLight } from "../../../src/scene/LightPool";
import { skyState } from "../../../src/sky/skyState";
import { box, cane, hipRoof, mergeParts, post } from "../../tulay/client/geometry";
import { tulayMaterials } from "../../tulay/client/materials";
import { BENCH_LENGTH, BENCHES, KNEE_WALL, KUBO, KUBO_CENTRE, KUBO_POSTS, TABLE } from "./plan";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function build() {
  const bamboo: THREE.BufferGeometry[] = [];
  const deck: THREE.BufferGeometry[] = [];
  const thatch: THREE.BufferGeometry[] = [];
  const sawali: THREE.BufferGeometry[] = [];
  const wood: THREE.BufferGeometry[] = [];
  const width = KUBO.x1 - KUBO.x0;
  const depth = KUBO.z1 - KUBO.z0;
  const [cx, cz] = KUBO_CENTRE;

  deck.push(box(cx, 0.03, cz, width + 0.5, 0.06, depth + 0.5));
  for (const [x, z] of KUBO_POSTS) bamboo.push(post(x, 0, z, KUBO.eave + 0.15, 0.12));
  // Tie beams round the top of the posts, and two across under the roof.
  const top = KUBO.eave;
  for (const [a, b] of [
    [v(KUBO.x0, top, KUBO.z0), v(KUBO.x1, top, KUBO.z0)],
    [v(KUBO.x0, top, KUBO.z1), v(KUBO.x1, top, KUBO.z1)],
    [v(KUBO.x0, top, KUBO.z0), v(KUBO.x0, top, KUBO.z1)],
    [v(KUBO.x1, top, KUBO.z0), v(KUBO.x1, top, KUBO.z1)],
    [v(cx, top, KUBO.z0), v(cx, top, KUBO.z1)],
  ] as const) {
    bamboo.push(cane(a, b, 0.09));
  }
  thatch.push(hipRoof(cx, cz, width, depth, top + 0.08, KUBO.ridge - KUBO.eave, KUBO.overhang));
  // Knee walls of sawali north and south, from a little in from the open
  // front (west) to the back, a bamboo rail along the top.
  const kneeFrom = KUBO.x0 + 0.8;
  for (const z of [KUBO.z0, KUBO.z1]) {
    sawali.push(box((kneeFrom + KUBO.x1) / 2, KNEE_WALL / 2, z, KUBO.x1 - kneeFrom, KNEE_WALL, 0.05));
    bamboo.push(cane(v(kneeFrom, KNEE_WALL, z), v(KUBO.x1, KNEE_WALL, z), 0.06));
  }
  // The back wall, full height, behind the screen.
  sawali.push(box(KUBO.x1, KUBO.eave / 2, cz, 0.05, KUBO.eave, depth));
  // The facilitator's table: a top on four legs.
  const t = TABLE;
  wood.push(box(t.x, 0.76, t.z, t.width, 0.05, t.length));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(box(t.x + sx * (t.width / 2 - 0.06), 0.37, t.z + sz * (t.length / 2 - 0.06), 0.06, 0.74, 0.06));
  // Bamboo benches (bangko), along z, facing the screen: a slatted seat on
  // four cane legs and two rails.
  for (const b of BENCHES) {
    deck.push(box(b.x, 0.43, b.z, 0.38, 0.05, BENCH_LENGTH));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) bamboo.push(post(b.x + sx * 0.14, 0, b.z + sz * (BENCH_LENGTH / 2 - 0.12), 0.41, 0.035));
      bamboo.push(cane(v(b.x + sx * 0.14, 0.16, b.z - BENCH_LENGTH / 2 + 0.1), v(b.x + sx * 0.14, 0.16, b.z + BENCH_LENGTH / 2 - 0.1), 0.025));
    }
  }
  // The name board's hangers, from the front tie beam.
  for (const dz of [-1, 1]) bamboo.push(cane(v(KUBO.x0 - 0.02, top, cz + dz * 1.1), v(KUBO.x0 - 0.02, top - 0.32, cz + dz * 1.1), 0.012));
  return { bamboo: mergeParts(bamboo), deck: mergeParts(deck), thatch: mergeParts(thatch), sawali: mergeParts(sawali), wood: mergeParts(wood) };
}

/** The name board: painted on wood, as a barangay's would be. */
function nameBoard(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#6b4426";
  c.fillRect(0, 0, 512, 128);
  c.strokeStyle = "#e8c37a";
  c.lineWidth = 6;
  c.strokeRect(8, 8, 496, 112);
  c.fillStyle = "#fff4dc";
  c.textAlign = "center";
  c.font = "800 42px system-ui, sans-serif";
  c.fillText("ISCOLab Kubo", 256, 60);
  c.font = "500 24px system-ui, sans-serif";
  c.fillText("pansamantala · 仮設 · for now", 256, 98);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** How much the lamps glow: off by day, full after dusk. */
const dusk = () => THREE.MathUtils.clamp(1 - skyState.dayness * 1.8, 0, 1);

/** Capiz pendant lamps under the roof, lit from dusk. */
function Lamps() {
  const m = tulayMaterials();
  const lamps = useMemo<[number, number, number][]>(
    () => [
      [KUBO_CENTRE[0] - 2, KUBO.eave - 0.45, KUBO_CENTRE[1]],
      [KUBO_CENTRE[0] + 2, KUBO.eave - 0.45, KUBO_CENTRE[1]],
    ],
    []
  );
  const shades = useMemo(
    () => mergeParts(lamps.flatMap(([x, y, z]) => [new THREE.CylinderGeometry(0.16, 0.24, 0.34, 10).translate(x, y, z), new THREE.ConeGeometry(0.17, 0.12, 10).translate(x, y + 0.23, z)])),
    [lamps]
  );
  const cords = useMemo(() => mergeParts(lamps.map(([x, y, z]) => cane(v(x, y + 0.28, z), v(x, KUBO.eave + 0.05, z), 0.008))), [lamps]);
  useEffect(
    () => () => {
      shades.dispose();
      cords.dispose();
    },
    [shades, cords]
  );
  const intensity = useRef(0);
  useFrame(() => {
    const level = dusk();
    m.capiz.emissiveIntensity = 0.3 + level * 1.1;
    intensity.current = level * 7;
  });
  return (
    <group>
      <mesh geometry={shades} material={m.capiz} />
      <mesh geometry={cords} material={m.wood} />
      {lamps.map((p) => (
        <PooledLight key={p[0]} position={[p[0], p[1] - 0.25, p[2]]} intensityRef={intensity} distance={11} color="#ffd6a0" />
      ))}
    </group>
  );
}

export function Kubo() {
  const m = tulayMaterials();
  const parts = useMemo(build, []);
  const board = useMemo(() => new THREE.MeshStandardMaterial({ map: nameBoard(), roughness: 0.7 }), []);
  useEffect(
    () => () => {
      for (const g of Object.values(parts)) g.dispose();
      board.map?.dispose();
      board.dispose();
    },
    [parts, board]
  );
  return (
    <group>
      <mesh geometry={parts.bamboo} material={m.bamboo} castShadow receiveShadow />
      <mesh geometry={parts.deck} material={m.bambooDeck} castShadow receiveShadow />
      <mesh geometry={parts.thatch} material={m.thatch} castShadow receiveShadow />
      <mesh geometry={parts.sawali} material={m.sawali} castShadow receiveShadow />
      <mesh geometry={parts.wood} material={m.wood} castShadow receiveShadow />
      {/* Facing the lab and the arrival point (−x). */}
      <group position={[KUBO.x0 - 0.06, KUBO.eave - 0.55, KUBO_CENTRE[1]]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh material={m.wood}>
          <boxGeometry args={[2.64, 0.64, 0.04]} />
        </mesh>
        <mesh position={[0, 0, 0.021]} material={board}>
          <planeGeometry args={[2.56, 0.56]} />
        </mesh>
      </group>
      <Lamps />
    </group>
  );
}
