import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { addShade } from "../avatar/heat";
import { skyState } from "../sky/skyState";
import { MAKILING_SUMMIT_M, MOUNTAIN, MOUNTAIN_SCALE, mountainHeight, nearTrail, placeMountain, SUMMIT } from "./mountainShape";
import { BENCH_LENGTH, SEAT_HEIGHT, seatAt, setGroundWrap, setMountain, type BenchPlacement, type Seat } from "./layout";
import { MountainGround } from "./mountainGround";
import { MeadowTree } from "./Seasons";
import { SeatPad } from "./SeatPad";

/**
 * Mt. Makiling, drawn for next to nothing: the ground one mesh (a 64 × 64
 * grid of the real heights, coloured by height and slope, the trail up
 * worn into it), the forest one instanced mesh, and at the summit a flag,
 * a marker, two benches (BaseEnvironment, as the garden's), and a tree of
 * the meadow's kind that turns with the seasons, with shade under it.
 */
const GRID = 64;
const FOREST = 220;
/** The summit's clearing: no forest within this far, metres. */
const CLEARING = 7;
const floorAt = (x: number, z: number) => MOUNTAIN.y + mountainHeight(x, z);

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGround() {
  const g = new THREE.PlaneGeometry(MOUNTAIN.size, MOUNTAIN.size, GRID, GRID).rotateX(-Math.PI / 2);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const low = new THREE.Color("#7a9652");
  const forest = new THREE.Color("#3e6a35");
  const high = new THREE.Color("#5f8448");
  const trail = new THREE.Color("#a08c62");
  const c = new THREE.Color();
  const peak = mountainHeight(SUMMIT[0], SUMMIT[1]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + MOUNTAIN.x;
    const z = p.getZ(i) + MOUNTAIN.z;
    const h = mountainHeight(x, z);
    // Sunk a touch below the floor, so it never pokes over the walk.
    p.setY(i, MOUNTAIN.y + h - 0.03);
    const t = h / peak;
    c.copy(low).lerp(forest, Math.min(1, t * 3)).lerp(high, Math.max(0, (t - 0.8) / 0.2));
    if (h > 0.05 && nearTrail(x, z, 1.1)) c.copy(trail);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.translate(MOUNTAIN.x, 0, MOUNTAIN.z);
  g.computeVertexNormals();
  return g;
}

function buildForest() {
  const cone = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: "#2f5a2c", flatShading: true }), FOREST);
  const rand = random(1090);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let n = 0;
  for (let tries = 0; tries < FOREST * 6 && n < FOREST; tries++) {
    const x = MOUNTAIN.x + (rand() - 0.5) * MOUNTAIN.size * 0.9;
    const z = MOUNTAIN.z + (rand() - 0.5) * MOUNTAIN.size * 0.9;
    const h = mountainHeight(x, z);
    if (h < 0.6 || nearTrail(x, z, 2.6) || Math.hypot(x - SUMMIT[0], z - SUMMIT[1]) < CLEARING) continue;
    const size = 1.6 + rand() * 1.4;
    m.compose(new THREE.Vector3(x, floorAt(x, z) - 0.1, z), q, new THREE.Vector3(size * 0.45, size * 1.6, size * 0.45));
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.navIgnore = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** The Philippine flag, drawn once onto a small canvas. */
function flagTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 60;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0038a8";
  ctx.fillRect(0, 0, 120, 30);
  ctx.fillStyle = "#ce1126";
  ctx.fillRect(0, 30, 120, 30);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(52, 30);
  ctx.lineTo(0, 60);
  ctx.fill();
  ctx.fillStyle = "#fcd116";
  ctx.beginPath();
  ctx.arc(17, 30, 6, 0, Math.PI * 2);
  ctx.fill();
  for (const [sx, sy] of [[5, 7], [5, 53], [42, 30]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function markerTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2c3a2a";
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = "#f2efe4";
  ctx.textAlign = "center";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText("MT. MAKILING", 128, 48);
  ctx.font = "600 24px system-ui, sans-serif";
  ctx.fillText(`${MAKILING_SUMMIT_M.toLocaleString("en-US")} m above sea level`, 128, 88);
  ctx.font = "400 18px system-ui, sans-serif";
  ctx.fillText(`Laguna · its real shape at 1:${Math.round(1 / MOUNTAIN_SCALE)}`, 128, 126);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Mountain() {
  const ground = useMemo(buildGround, []);
  const groundMaterial = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  const forest = useMemo(buildForest, []);
  const flagMap = useMemo(() => (typeof document === "undefined" ? null : flagTexture()), []);
  const markerMap = useMemo(() => (typeof document === "undefined" ? null : markerTexture()), []);
  const cloth = useRef<THREE.Mesh>(null);
  const summitY = floorAt(SUMMIT[0], SUMMIT[1]);
  const markerAt: [number, number] = [SUMMIT[0] - 2.6, SUMMIT[1] + 0.6];
  const SUMMIT_TREE = useMemo<[number, number]>(() => [SUMMIT[0] + 3.4, SUMMIT[1] + 1.6], []);

  useEffect(() => {
    setMountain(true);
    // Shade under the summit tree, for heat reactions.
    return addShade((x, z) => Math.hypot(x - SUMMIT_TREE[0], z - SUMMIT_TREE[1]) < 3.6);
  }, [SUMMIT_TREE]);
  useEffect(
    () => () => {
      ground.dispose();
      groundMaterial.dispose();
      forest.geometry.dispose();
      (forest.material as THREE.Material).dispose();
      flagMap?.dispose();
      markerMap?.dispose();
    },
    [ground, groundMaterial, forest, flagMap, markerMap]
  );
  // The flag streams with the wind the sky has, its cloth rippling.
  useFrame((state) => {
    const mesh = cloth.current;
    if (!mesh) return;
    const wind = skyState.weatherState?.wind ?? 6;
    const t = state.clock.elapsedTime;
    mesh.rotation.y = 0.35 * Math.sin(t * 0.6) + Math.min(0.4, wind / 40);
    mesh.scale.y = 1 - 0.04 * Math.sin(t * (2 + wind / 8));
  });

  return (
    <group userData={{ navIgnore: true }}>
      <mesh geometry={ground} material={groundMaterial} receiveShadow />
      <primitive object={forest} />
      {/* The flag, on its pole at the summit. */}
      <group position={[SUMMIT[0], summitY, SUMMIT[1]]}>
        <mesh position={[0, 2.4, 0]}>
          <cylinderGeometry args={[0.035, 0.045, 4.8, 8]} />
          <meshStandardMaterial color="#c9cdd3" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh ref={cloth} position={[0.6, 4.25, 0]}>
          <planeGeometry args={[1.2, 0.6]} />
          <meshLambertMaterial map={flagMap} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* The summit marker, facing the trail up. */}
      <group position={[markerAt[0], floorAt(markerAt[0], markerAt[1]), markerAt[1]]}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <boxGeometry args={[0.9, 1.1, 0.25]} />
          <meshStandardMaterial color="#9a9488" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.66, -0.13]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.8, 0.5]} />
          <meshBasicMaterial map={markerMap} />
        </mesh>
      </group>
      {/* A tree of the meadow's kind, turning with the seasons, and its shade. */}
      <MeadowTree at={SUMMIT_TREE} solid={false} />
      <mesh position={[SUMMIT_TREE[0], floorAt(SUMMIT_TREE[0], SUMMIT_TREE[1]) + 0.05, SUMMIT_TREE[1]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <circleGeometry args={[3.4, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** The summit's two benches, a little below it, facing back down the trail. */
function summitBenches(): BenchPlacement[] {
  return [-1.5, 1.5].map((dx) => {
    const x = SUMMIT[0] + dx;
    const z = SUMMIT[1] - 3.2;
    return { position: [x, floorAt(x, z), z], rotationY: 0 };
  });
}

/**
 * Mt. Makiling in a model world (world.json `mountain: {x, z, y}`): put
 * where the world says, its ground joined to the world's navmesh
 * (mountainGround.ts), with the summit's benches to sit on. The built-in
 * worlds draw theirs with the garden's (BaseEnvironment, layout.ts's seats).
 */
export function ModelMountain({ at, onSit, occupiedSeatId }: { at: { x: number; z: number; y?: number }; onSit?: (seat: Seat) => void; occupiedSeatId?: string | null }) {
  // Placed before anything below is built from it.
  useState(() => placeMountain(at));
  useEffect(() => {
    placeMountain(at);
    setGroundWrap((inner) => new MountainGround(inner));
    return () => {
      setGroundWrap(null);
      placeMountain();
    };
  }, [at]);
  const benches = useMemo(summitBenches, [at]);
  const seats = useMemo<Seat[]>(
    () =>
      benches.flatMap((bench, i) =>
        [-1, 1].map((side) => {
          const x = bench.position[0] + side * BENCH_LENGTH * 0.25;
          const s = seatAt(x, bench.position[2], bench.rotationY);
          return { id: `summit-bench-${i}-${side > 0 ? "r" : "l"}`, position: [s[0], bench.position[1], s[2]] as [number, number, number], rotationY: bench.rotationY, label: "Summit bench" };
        })
      ),
    [benches]
  );
  return (
    <>
      <Mountain key={`${at.x},${at.z}`} />
      {benches.map((b, i) => (
        <group key={i} position={b.position} rotation={[0, b.rotationY, 0]} userData={{ navIgnore: true }}>
          <mesh position={[0, SEAT_HEIGHT, 0]} castShadow receiveShadow>
            <boxGeometry args={[BENCH_LENGTH, 0.11, 0.54]} />
            <meshStandardMaterial color="#8a5c3c" roughness={0.8} />
          </mesh>
          <mesh position={[0, SEAT_HEIGHT + 0.32, 0.24]} rotation={[0.12, 0, 0]} castShadow>
            <boxGeometry args={[BENCH_LENGTH, 0.46, 0.09]} />
            <meshStandardMaterial color="#8a5c3c" roughness={0.8} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (BENCH_LENGTH / 2 - 0.18), SEAT_HEIGHT / 2, 0]} castShadow>
              <boxGeometry args={[0.13, SEAT_HEIGHT, 0.5]} />
              <meshStandardMaterial color="#4a4743" roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      {onSit && seats.map((seat) => <SeatPad key={seat.id} seat={seat} onSit={onSit} occupied={occupiedSeatId === seat.id} />)}
    </>
  );
}
