// Seinag's imagined campus in the scene (futures.ts): the shaded walkway,
// the solar lampposts, more shade trees, the built-out Perma G.A.R.D.E.N.,
// a board at each that says what it is, and the station's "Imagined
// campus" board that switches each on or off for everyone in the room.
//
// Cheap by construction: each layer is a handful of merged meshes (the
// trees, two instanced meshes a kind), the lamps share the world's pool of
// four real lights (src/scene/LightPool.tsx), and the shade under the
// walkway and the trees is a flat shape moved each frame to where the sun
// casts it.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WorldStateValue } from "../../../src/multiplayer/types";
import { PooledLight } from "../../../src/scene/LightPool";
import { skyState } from "../../../src/sky/skyState";
import { L, useLang } from "../../../src/i18n/lang";
import { Clickable, FONT, mergedGeometry, roundRect, standard, useCanvasTexture, wrapText, type BoxSpec, type CylinderSpec } from "../../seizora/client/kit";
import { openCard, type CardKey } from "./cards";
import {
  BED,
  bedPositions,
  CANOPY_HEIGHT,
  CANOPY_RADIUS,
  GARDEN,
  GARDEN_SPOTS,
  GROUND_Y,
  LAMP_HEIGHT,
  lampPositions,
  LAYER_KEY,
  layerOn,
  LAYERS,
  shadeOffset,
  treeList,
  walkwayPosts,
  WALKWAY_HEIGHT,
  WALKWAY_LENGTH,
  WALKWAY_SEGMENTS,
  WALKWAY_WIDTH,
  type Layer,
  type Tree,
  type TreeKind,
} from "./futures";
import { STATION } from "./Station";

// --- shared pieces --------------------------------------------------------------------

interface BlobSpec {
  /** Radius, then a squash per axis. */
  r: number;
  at: [number, number, number];
  scale?: [number, number, number];
}

/** Rounded lumps (leaves, fruit, compost, stones) as one geometry. */
function blobGeometry(blobs: BlobSpec[], detail = 1) {
  const parts = blobs.map((b) => {
    const g = new THREE.IcosahedronGeometry(b.r, detail);
    g.scale(...(b.scale ?? [1, 1, 1]));
    g.translate(...b.at);
    return g;
  });
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}

/** Meshes built once from specs, disposed with the component. */
function useGeometry(build: () => THREE.BufferGeometry, deps: unknown[] = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(build, deps);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

const noRaycast = () => {};

/** The shade of something `height` up, shaped by `geometry` (flat, at the
 *  ground), moved each frame to where the sun puts it. */
function Shade({ geometry, height }: { geometry: THREE.BufferGeometry; height: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#0b1a10", transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const s = shadeOffset(skyState.sunDirection, height, skyState.cloud);
    const strength = s.strength * skyState.sunVisible * (1 - skyState.night);
    m.visible = strength > 0.02;
    m.position.set(s.x, 0, s.z);
    material.opacity = 0.42 * strength;
  });
  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={1} raycast={noRaycast} userData={{ navIgnore: true }} />;
}

const concrete = standard("#c4beb3", 0.92, 0);
const steel = standard("#4f5863", 0.45, 0.6);
const roofMetal = standard("#3f6150", 0.55, 0.3);
const darkSteel = standard("#2c3138", 0.5, 0.5);
const panelBlue = standard("#1c2f52", 0.3, 0.4);

// --- info boards ------------------------------------------------------------------------

interface Info {
  card: CardKey;
  color: string;
  title: () => string;
  lines: () => string[];
  now?: () => string;
}

const BOARD = { w: 1.4, h: 0.9, bottom: 0.85 };
const BOARD_FRAME: BoxSpec[] = [
  { size: [BOARD.w + 0.1, BOARD.h + 0.1, 0.05], at: [0, BOARD.bottom + BOARD.h / 2, -0.035] },
  { size: [0.07, BOARD.bottom + 0.1, 0.07], at: [-BOARD.w / 2 + 0.15, (BOARD.bottom + 0.1) / 2, -0.05] },
  { size: [0.07, BOARD.bottom + 0.1, 0.07], at: [BOARD.w / 2 - 0.15, (BOARD.bottom + 0.1) / 2, -0.05] },
];

function drawInfo(ctx: CanvasRenderingContext2D, w: number, h: number, info: Info) {
  ctx.fillStyle = "#fbf8f2";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = info.color;
  ctx.fillRect(0, 0, w, 92);
  ctx.fillStyle = "#fff";
  ctx.font = `800 42px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(info.title(), 30, 48);
  ctx.textBaseline = "alphabetic";
  ctx.font = `400 27px ${FONT}`;
  let y = 142;
  for (const line of info.lines()) {
    ctx.fillStyle = info.color;
    ctx.fillRect(30, y - 18, 10, 10);
    ctx.fillStyle = "#1f2430";
    y = wrapText(ctx, line, 54, y, w - 86, 34) + 10;
  }
  const now = info.now?.();
  if (now) {
    roundRect(ctx, 26, h - 146, w - 52, 86, 12);
    ctx.fillStyle = "#14223b";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 25px ${FONT}`;
    wrapText(ctx, now, 46, h - 110, w - 92, 31);
  }
  ctx.fillStyle = "#6a7080";
  ctx.font = `400 19px ${FONT}`;
  ctx.fillText(L("Click for more · Imagined: not UPOU's plan", "クリックで詳しく · 想像:UPOUの計画ではありません"), 30, h - 20);
}

function InfoBoard({ info, position, rotationY }: { info: Info; position: [number, number, number]; rotationY: number }) {
  const lang = useLang();
  const anchor = useRef<THREE.Mesh>(null);
  const texture = useCanvasTexture(960, 618, (ctx, w, h) => drawInfo(ctx, w, h, info), { hz: info.now ? 0.5 : 0, anchor, range: 20, deps: [lang] });
  const frame = useMemo(() => mergedGeometry(BOARD_FRAME), []);
  useEffect(() => () => frame.dispose(), [frame]);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Clickable onClick={() => openCard(info.card)}>
        <mesh geometry={frame} material={steel} castShadow />
        <mesh ref={anchor} position={[0, BOARD.bottom + BOARD.h / 2, 0.001]}>
          <planeGeometry args={[BOARD.w, BOARD.h]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </Clickable>
    </group>
  );
}

const compass = (x: number, z: number) => {
  // +x is east and +z south on this model (the Main Building faces west).
  const names = [L("east", "東"), L("south-east", "南東"), L("south", "南"), L("south-west", "南西"), L("west", "西"), L("north-west", "北西"), L("north", "北"), L("north-east", "北東")];
  return names[(Math.round(Math.atan2(z, x) / (Math.PI / 4)) + 8) % 8];
};

/** Where the walkway's shade is now, in a sentence (also for the guides). */
export function shadeNow(lang: "en" | "ja" = "en"): string {
  const s = shadeOffset(skyState.sunDirection, WALKWAY_HEIGHT, skyState.cloud);
  const sunUp = skyState.sunDirection.y > 0;
  const ja = lang === "ja";
  if (!sunUp || skyState.night > 0.5) return ja ? "今は夜です。日陰の代わりに、ソーラー街灯が通路を照らします。" : "It's night: the solar lampposts light the walk instead.";
  if (s.strength < 0.05) return ja ? "太陽が低く、日陰はほとんどできません。" : "The sun is too low for much shade.";
  const off = Math.hypot(s.x, s.z);
  const elevation = Math.round((Math.asin(Math.min(1, skyState.sunDirection.y)) * 180) / Math.PI);
  if (off < 0.6) return ja ? `太陽は${elevation}°の高さ。屋根の真下が日陰です。` : `The sun is ${elevation}° up: the shade is right under the roof.`;
  const dir = compass(s.x, s.z);
  return ja ? `太陽は${elevation}°の高さ。屋根の日陰は${off.toFixed(1)} m ${dir}にずれています。` : `The sun is ${elevation}° up: the roof's shade falls ${off.toFixed(1)} m to the ${dir}.`;
}

// --- the walkway -------------------------------------------------------------------------

function Walkway() {
  const parts = useMemo(() => {
    const floor: BoxSpec[] = [];
    const roof: BoxSpec[] = [];
    const beams: BoxSpec[] = [];
    for (const s of WALKWAY_SEGMENTS) {
      const at = (y: number): [number, number, number] => [s.mid[0], y, s.mid[1]];
      floor.push({ size: [s.length + 0.6, 0.08, WALKWAY_WIDTH], at: at(GROUND_Y + 0.04), rotation: [0, s.angle, 0] });
      roof.push({ size: [s.length + 0.8, 0.07, WALKWAY_WIDTH + 0.7], at: at(WALKWAY_HEIGHT + 0.16), rotation: [0, s.angle, 0] });
      // Edge beams on the posts, and a gutter down each side.
      const ux = (s.to[0] - s.from[0]) / s.length;
      const uz = (s.to[1] - s.from[1]) / s.length;
      for (const side of [-1, 1]) {
        const off = (side * (WALKWAY_WIDTH - 0.3)) / 2;
        beams.push({ size: [s.length + 0.3, 0.16, 0.12], at: [s.mid[0] - uz * off, WALKWAY_HEIGHT + 0.04, s.mid[1] + ux * off], rotation: [0, s.angle, 0] });
        const gutter = (side * (WALKWAY_WIDTH + 0.7)) / 2;
        beams.push({ size: [s.length + 0.8, 0.1, 0.1], at: [s.mid[0] - uz * gutter, WALKWAY_HEIGHT + 0.12, s.mid[1] + ux * gutter], rotation: [0, s.angle, 0] });
      }
    }
    const posts: BoxSpec[] = walkwayPosts().map(([x, z]) => ({ size: [0.12, WALKWAY_HEIGHT, 0.12], at: [x, GROUND_Y + WALKWAY_HEIGHT / 2, z] }));
    return { floor: mergedGeometry(floor), roof: mergedGeometry(roof), frame: mergedGeometry([...posts, ...beams]) };
  }, []);
  // The roof's outline, flat on the ground, for its shade.
  const shade = useGeometry(() => {
    const pieces = WALKWAY_SEGMENTS.map((s) => {
      const g = new THREE.PlaneGeometry(s.length + 0.8, WALKWAY_WIDTH + 0.7).rotateX(-Math.PI / 2).rotateY(s.angle);
      g.translate(s.mid[0], GROUND_Y + 0.09, s.mid[1]);
      return g;
    });
    const merged = mergeGeometries(pieces, false) ?? new THREE.BufferGeometry();
    for (const p of pieces) p.dispose();
    return merged;
  });
  useEffect(() => () => Object.values(parts).forEach((g) => g.dispose()), [parts]);
  return (
    <group userData={{ navIgnore: true }}>
      <mesh geometry={parts.floor} material={concrete} receiveShadow />
      <mesh geometry={parts.frame} material={steel} castShadow />
      <mesh geometry={parts.roof} material={roofMetal} castShadow />
      <Shade geometry={shade} height={WALKWAY_HEIGHT + 0.16} />
    </group>
  );
}

const WALKWAY_INFO: Info = {
  card: "walkway",
  color: "#3f7a5e",
  title: () => L("A covered walkway", "屋根つきの通路"),
  lines: () => [
    L(`${Math.round(WALKWAY_LENGTH)} m from the Academic Residences to the WCMPB, across the lawn people cross in the open today.`, `アカデミック・レジデンスからWCMPBまで${Math.round(WALKWAY_LENGTH)} m。今は日なたを歩いて渡る芝生の上です。`),
    L("Its shade falls where the real sun puts it, hour by hour.", "日陰は、実際の太陽が落とす場所に、時刻とともに動きます。"),
    L("Solar lampposts along it light the walk after dark.", "通路ぞいのソーラー街灯が、暗くなると道を照らします。"),
  ],
  now: () => L(`Now: ${shadeNow("en")}`, `現在:${shadeNow("ja")}`),
};

// --- the lampposts -------------------------------------------------------------------------

/** How lit the lamps are: they switch on at dusk on their own light
 *  sensors, as solar street lights do, and fade up over a few minutes. */
export function lampLevel() {
  return THREE.MathUtils.smoothstep(skyState.night, 0.05, 0.35);
}

const LAMP_INTENSITY = 9;

function Lampposts() {
  const spots = useMemo(() => lampPositions(), []);
  const geometry = useMemo(() => {
    const poles: CylinderSpec[] = [];
    const boxes: BoxSpec[] = [];
    const panels: BoxSpec[] = [];
    const heads: BoxSpec[] = [];
    for (const { at: [x, z], toward: [tx, tz] } of spots) {
      const yaw = Math.atan2(tx, tz);
      poles.push({ radiusTop: 0.05, radiusBottom: 0.08, height: LAMP_HEIGHT, at: [x, GROUND_Y + LAMP_HEIGHT / 2, z], segments: 10 });
      // The arm and the head reach toward what the lamp lights; the battery
      // box sits on the pole, and the panel on top is tilted 15° to face the
      // sun (south, +z here).
      boxes.push({ size: [0.06, 0.06, 0.7], at: [x + tx * 0.3, GROUND_Y + LAMP_HEIGHT - 0.1, z + tz * 0.3], rotation: [0, yaw, 0] });
      boxes.push({ size: [0.26, 0.4, 0.16], at: [x - tx * 0.08, GROUND_Y + 2.0, z - tz * 0.08], rotation: [0, yaw, 0] });
      panels.push({ size: [0.75, 0.035, 0.55], at: [x, GROUND_Y + LAMP_HEIGHT + 0.18, z + 0.05], rotation: [(15 * Math.PI) / 180, 0, 0] });
      heads.push({ size: [0.24, 0.06, 0.46], at: [x + tx * 0.62, GROUND_Y + LAMP_HEIGHT - 0.16, z + tz * 0.62], rotation: [0, yaw, 0] });
    }
    return { frame: mergedGeometry(boxes, poles), panels: mergedGeometry(panels), heads: mergedGeometry(heads) };
  }, [spots]);
  useEffect(() => () => Object.values(geometry).forEach((g) => g.dispose()), [geometry]);
  const headMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e9edf0", emissive: "#fff1d6", emissiveIntensity: 0, roughness: 0.4 }), []);
  useEffect(() => () => headMaterial.dispose(), [headMaterial]);
  const intensity = useRef(0);
  useFrame(() => {
    const level = lampLevel();
    intensity.current = LAMP_INTENSITY * level;
    headMaterial.emissiveIntensity = 3.2 * level;
  });
  return (
    <group userData={{ navIgnore: true }}>
      <mesh geometry={geometry.frame} material={darkSteel} castShadow />
      <mesh geometry={geometry.panels} material={panelBlue} />
      <mesh geometry={geometry.heads} material={headMaterial} />
      {spots.map(({ at: [x, z], toward: [tx, tz] }) => (
        <PooledLight key={`${x},${z}`} position={[x + tx * 0.62, GROUND_Y + LAMP_HEIGHT - 0.3, z + tz * 0.62]} color="#fff1d6" intensityRef={intensity} distance={18} />
      ))}
    </group>
  );
}

const LAMPS_INFO: Info = {
  card: "lamps",
  color: "#c2861f",
  title: () => L("Solar lampposts", "ソーラー街灯"),
  lines: () => [
    L("Each charges its own battery from the small panel on top by day.", "上の小さなパネルで、昼のあいだに自分の電池を充電します。"),
    L("A light sensor switches it on at dusk and off at dawn: no wiring, no grid.", "光センサーが夕方に点け、明け方に消します。配線も系統もいりません。"),
    L("They light the walkway and the garden's gate.", "通路と菜園の入口を照らします。"),
  ],
  now: () => (lampLevel() > 0.5 ? L("Now: on, after dark.", "現在:点灯中(日没後)。") : lampLevel() > 0.02 ? L("Now: coming on as the light fades.", "現在:暗くなるにつれて点灯中。") : L("Now: off, charging in the daylight.", "現在:消灯、日の光で充電中。")),
};

// --- the trees ---------------------------------------------------------------------------

function trunkGeometry(kind: TreeKind) {
  if (kind === "acacia") {
    // A short trunk that forks into two leaning limbs under a wide canopy.
    return mergedGeometry([], [
      { radiusTop: 0.28, radiusBottom: 0.42, height: 2.4, at: [0, 1.2, 0], segments: 8 },
      { radiusTop: 0.14, radiusBottom: 0.24, height: 3.4, at: [-0.9, 3.6, 0], rotation: [0, 0, 0.5], segments: 6 },
      { radiusTop: 0.14, radiusBottom: 0.24, height: 3.4, at: [0.9, 3.6, 0.2], rotation: [0.1, 0, -0.5], segments: 6 },
    ]);
  }
  if (kind === "fruit") return mergedGeometry([], [{ radiusTop: 0.12, radiusBottom: 0.2, height: 2.4, at: [0, 1.2, 0], segments: 7 }]);
  return mergedGeometry([], [
    { radiusTop: 0.22, radiusBottom: 0.34, height: 4.6, at: [0, 2.3, 0], segments: 8 },
    { radiusTop: 0.1, radiusBottom: 0.16, height: 2.2, at: [0.7, 4.6, 0], rotation: [0, 0, -0.6], segments: 6 },
  ]);
}

function canopyGeometry(kind: TreeKind) {
  if (kind === "acacia") {
    // The rain tree's umbrella: wide, flat, domed.
    return blobGeometry([
      { r: 2.6, at: [0, 6.6, 0], scale: [1.7, 0.55, 1.6] },
      { r: 2.0, at: [-2.6, 6.2, 0.8], scale: [1.3, 0.55, 1.2] },
      { r: 2.0, at: [2.5, 6.3, -0.6], scale: [1.3, 0.5, 1.3] },
      { r: 1.8, at: [0.4, 6.4, 2.6], scale: [1.3, 0.5, 1.1] },
      { r: 1.8, at: [-0.4, 6.5, -2.6], scale: [1.2, 0.5, 1.2] },
    ]);
  }
  if (kind === "fruit") {
    return blobGeometry([
      { r: 1.4, at: [0, 3.2, 0], scale: [1.2, 0.95, 1.2] },
      { r: 1.0, at: [0.9, 2.9, 0.4] },
      { r: 1.0, at: [-0.8, 3.0, -0.5] },
    ]);
  }
  // Narra: a full, rounded, spreading crown.
  return blobGeometry([
    { r: 2.4, at: [0, 6.3, 0], scale: [1.2, 0.85, 1.2] },
    { r: 1.8, at: [1.8, 5.8, 0.7] },
    { r: 1.8, at: [-1.7, 5.9, -0.6] },
    { r: 1.6, at: [0.3, 5.6, -1.9] },
    { r: 1.6, at: [-0.4, 5.7, 1.9] },
    { r: 1.4, at: [0.2, 7.6, 0.2] },
  ]);
}

const bark = standard("#5b4632", 0.9, 0);
const LEAF: Record<TreeKind, string> = { narra: "#4d7a35", acacia: "#5c8a3c", fruit: "#3f7a33" };

/** Trees of one kind: a trunk and a canopy instanced mesh, each one draw
 *  call however many trees. */
function TreeKindMeshes({ kind, trees }: { kind: TreeKind; trees: Tree[] }) {
  const trunk = useGeometry(() => trunkGeometry(kind), [kind]);
  const canopy = useGeometry(() => canopyGeometry(kind), [kind]);
  const leaf = useMemo(() => standard(LEAF[kind], 0.85, 0, { flatShading: true }), [kind]);
  useEffect(() => () => leaf.dispose(), [leaf]);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const canopies = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t.at[0] * 7.13 + t.at[1] * 3.7) % (Math.PI * 2));
      m.compose(new THREE.Vector3(t.at[0], GROUND_Y, t.at[1]), q, new THREE.Vector3(t.scale, t.scale, t.scale));
      trunks.current?.setMatrixAt(i, m);
      canopies.current?.setMatrixAt(i, m);
      // A little colour of its own, so a row doesn't read as copies.
      canopies.current?.setColorAt(i, c.set(LEAF[kind]).offsetHSL(((i * 37) % 10) / 300 - 0.015, 0, ((i * 53) % 10) / 120 - 0.04));
    });
    for (const mesh of [trunks.current, canopies.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [trees, kind]);
  return (
    <>
      <instancedMesh ref={trunks} args={[trunk, bark, trees.length]} castShadow />
      <instancedMesh ref={canopies} args={[canopy, leaf, trees.length]} castShadow />
    </>
  );
}

/** Round shade for every tree, moved together to where the sun casts it. */
function TreeShade({ trees }: { trees: Tree[] }) {
  const geometry = useGeometry(() => {
    const pieces = trees.map((t) => {
      const r = CANOPY_RADIUS[t.kind] * t.scale;
      const g = new THREE.CircleGeometry(r, 18).rotateX(-Math.PI / 2);
      g.scale(1, 1, 0.9);
      g.translate(t.at[0], GROUND_Y + 0.085, t.at[1]);
      return g;
    });
    const merged = mergeGeometries(pieces, false) ?? new THREE.BufferGeometry();
    for (const p of pieces) p.dispose();
    return merged;
  }, [trees]);
  const height = trees.length ? trees.reduce((n, t) => n + CANOPY_HEIGHT[t.kind] * t.scale, 0) / trees.length : 6;
  return <Shade geometry={geometry} height={height} />;
}

function Trees() {
  const trees = useMemo(() => treeList(), []);
  const byKind = useMemo(() => (["narra", "acacia"] as const).map((kind) => ({ kind, list: trees.filter((t) => t.kind === kind) })), [trees]);
  return (
    <group userData={{ navIgnore: true }}>
      {byKind.map(({ kind, list }) => (list.length ? <TreeKindMeshes key={kind} kind={kind} trees={list} /> : null))}
      <TreeShade trees={trees} />
    </group>
  );
}

const TREES_INFO: Info = {
  card: "trees",
  color: "#4d7a35",
  title: () => L("More shade trees", "日陰をつくる木を増やす"),
  lines: () => [
    L("Narra, the national tree, and acacia (rain tree), whose wide crown shades a whole path.", "国の木ナラと、広い樹冠で道ごと日陰にするアカシア(レインツリー)。"),
    L("Along the drive, the Main Building's back lawn, and beside the walkway.", "車道ぞい、本館の裏の芝生、そして通路のわき。"),
    L("Shade and the water leaves give off cool the ground under them.", "木陰と葉から出る水分が、その下の地面を涼しくします。"),
  ],
  now: () => {
    const s = shadeOffset(skyState.sunDirection, 6.4, skyState.cloud);
    if (skyState.night > 0.5 || s.strength < 0.05) return L("Now: no sun to block.", "現在:さえぎる日差しがありません。");
    return L(`Now: their shade falls ${Math.hypot(s.x, s.z).toFixed(1)} m from under their crowns.`, `現在:木陰は樹冠の真下から${Math.hypot(s.x, s.z).toFixed(1)} mずれています。`);
  },
};

// --- the garden ----------------------------------------------------------------------------

/** A local garden point as world coordinates, at `y` above the lawn. */
const g3 = (x: number, y: number, z: number): [number, number, number] => [GARDEN.x + x, GROUND_Y + y, GARDEN.z + z];

const bamboo = standard("#b59f5a", 0.75, 0);
const timber = standard("#7a5636", 0.85, 0);
const soil = standard("#4a3524", 1, 0);
const mulch = standard("#8a7357", 1, 0);
const stone = standard("#9a948a", 0.95, 0);
const thatch = standard("#a8874f", 0.95, 0);
const leafGreen = standard("#4f9a3a", 0.8, 0, { flatShading: true });
const darkLeaf = standard("#2f6e2c", 0.8, 0, { flatShading: true });
const fruitRed = standard("#c7372f", 0.6, 0);
const fruitPurple = standard("#5b2d6e", 0.5, 0);
const fruitYellow = standard("#e7b928", 0.6, 0);
const drumBlue = standard("#2f6db3", 0.5, 0.1);
const tankWhite = standard("#e8ecee", 0.4, 0.05, { transparent: true, opacity: 0.92 });
const netMaterial = standard("#2b5e35", 0.9, 0, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });

function gardenParts() {
  const W = GARDEN.w;
  const D = GARDEN.d;
  const fence: BoxSpec[] = [];
  const fencePosts: CylinderSpec[] = [];
  // A low bamboo fence, open at the gate on the west side.
  const edge = (ax: number, az: number, bx: number, bz: number) => {
    const length = Math.hypot(bx - ax, bz - az);
    const angle = -Math.atan2(bz - az, bx - ax);
    for (const y of [0.45, 0.85]) fence.push({ size: [length, 0.05, 0.05], at: g3((ax + bx) / 2, y, (az + bz) / 2), rotation: [0, angle, 0] });
    const n = Math.round(length / 2);
    for (let i = 0; i <= n; i++) fencePosts.push({ radiusTop: 0.04, radiusBottom: 0.04, height: 1.0, at: g3(ax + ((bx - ax) * i) / n, 0.5, az + ((bz - az) * i) / n), segments: 6 });
  };
  edge(-W / 2, -D / 2, W / 2, -D / 2);
  edge(W / 2, -D / 2, W / 2, D / 2);
  edge(W / 2, D / 2, -W / 2, D / 2);
  edge(-W / 2, D / 2, -W / 2, 1.8);
  edge(-W / 2, -1.8, -W / 2, -D / 2);

  // Adopt-A-Plot's raised beds: a timber frame, soil, and a name stake.
  const frames: BoxSpec[] = [];
  const soils: BoxSpec[] = [];
  const stakes: BoxSpec[] = [];
  const leaves: BlobSpec[] = [];
  const reds: BlobSpec[] = [];
  const purples: BlobSpec[] = [];
  const yellows: BlobSpec[] = [];
  const trellis: CylinderSpec[] = [];
  bedPositions().forEach(([bx, bz], i) => {
    const s = BED.size;
    for (const [dx, dz, w, d] of [[0, -s / 2, s, 0.06], [0, s / 2, s, 0.06], [-s / 2, 0, 0.06, s], [s / 2, 0, 0.06, s]] as const) frames.push({ size: [w, BED.height, d], at: g3(bx + dx, BED.height / 2, bz + dz) });
    soils.push({ size: [s - 0.08, 0.04, s - 0.08], at: g3(bx, BED.height - 0.04, bz) });
    stakes.push({ size: [0.16, 0.22, 0.02], at: g3(bx - s / 2 + 0.15, BED.height + 0.1, bz - s / 2 - 0.05) });
    // What each plot grows: leafy greens, eggplant, tomatoes on a trellis,
    // or herbs and flowers, by turns.
    const crop = i % 4;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const x = bx - 0.6 + c * 0.6;
        const z = bz - 0.6 + r * 0.6;
        const y = BED.height + 0.08;
        if (crop === 0) leaves.push({ r: 0.2, at: g3(x, y, z), scale: [1.2, 0.6, 1.2] });
        else if (crop === 1) {
          leaves.push({ r: 0.22, at: g3(x, y + 0.15, z), scale: [1, 1.1, 1] });
          purples.push({ r: 0.06, at: g3(x + 0.12, y + 0.08, z), scale: [0.8, 1.6, 0.8] });
        } else if (crop === 2) {
          leaves.push({ r: 0.18, at: g3(x, y + 0.35, z), scale: [0.9, 1.6, 0.9] });
          reds.push({ r: 0.05, at: g3(x + 0.1, y + 0.4, z + 0.05) });
        } else {
          leaves.push({ r: 0.14, at: g3(x, y, z) });
          if ((r + c) % 2 === 0) yellows.push({ r: 0.07, at: g3(x, y + 0.14, z) });
        }
      }
    if (crop === 2) {
      for (const dx of [-0.7, 0.7]) trellis.push({ radiusTop: 0.02, radiusBottom: 0.02, height: 1.3, at: g3(bx + dx, BED.height + 0.65, bz), segments: 5 });
      trellis.push({ radiusTop: 0.02, radiusBottom: 0.02, height: 1.5, at: g3(bx, BED.height + 1.28, bz), rotation: [0, 0, Math.PI / 2], segments: 5 });
    }
  });

  // The herb spiral: stones climbing round in a coil, herbs on every turn.
  const stones: BlobSpec[] = [];
  const [sx, sz] = GARDEN_SPOTS.spiral;
  for (let k = 0; k < 46; k++) {
    const t = k / 46;
    const angle = t * Math.PI * 4;
    const radius = 1.1 - t * 0.85;
    const x = sx + Math.cos(angle) * radius;
    const z = sz + Math.sin(angle) * radius;
    const h = t * 0.7;
    for (let y = 0.08; y <= h + 0.08; y += 0.16) stones.push({ r: 0.1, at: g3(x, y, z), scale: [1.2, 0.8, 1] });
    if (k % 3 === 0) leaves.push({ r: 0.13, at: g3(sx + Math.cos(angle) * (radius - 0.2), h + 0.22, sz + Math.sin(angle) * (radius - 0.2)) });
  }

  // Compost: three timber bays, filling, turning, ready.
  const [cx, cz] = GARDEN_SPOTS.compost;
  const compost: BlobSpec[] = [];
  for (let b = -1; b <= 1; b++) {
    const x = cx + b * 1.4;
    frames.push({ size: [1.3, 0.9, 0.06], at: g3(x, 0.45, cz + 0.6) }); // back
    frames.push({ size: [0.06, 0.9, 1.2], at: g3(x - 0.65, 0.45, cz) });
    frames.push({ size: [0.06, 0.9, 1.2], at: g3(x + 0.65, 0.45, cz) });
    frames.push({ size: [1.3, 0.35, 0.06], at: g3(x, 0.18, cz - 0.6) }); // low front board
    compost.push({ r: 0.5, at: g3(x, 0.2 + (b + 1) * 0.08, cz), scale: [1.1, 0.5 + (1 - b) * 0.1, 0.9] });
  }

  // Rainwater: the learning hut's gutter feeds an IBC tank and two drums.
  const [wx, wz] = GARDEN_SPOTS.water;
  const tanks: BoxSpec[] = [{ size: [1.1, 1.0, 1.0], at: g3(wx, 0.6, wz) }];
  const drums: CylinderSpec[] = [
    { radiusTop: 0.3, radiusBottom: 0.3, height: 0.9, at: g3(wx + 1.0, 0.45, wz + 0.1), segments: 14 },
    { radiusTop: 0.3, radiusBottom: 0.3, height: 0.9, at: g3(wx - 1.0, 0.45, wz + 0.1), segments: 14 },
  ];
  const cage: BoxSpec[] = [{ size: [1.16, 0.08, 1.06], at: g3(wx, 0.06, wz) }];

  // The learning hut (a kubo): bamboo posts, a raised floor, a nipa roof.
  const [hx, hz] = GARDEN_SPOTS.hut;
  const hut: CylinderSpec[] = [];
  for (const dx of [-1.8, 1.8]) for (const dz of [-1.3, 1.3]) hut.push({ radiusTop: 0.07, radiusBottom: 0.08, height: 2.5, at: g3(hx + dx, 1.25, hz + dz), segments: 7 });
  const hutFloor: BoxSpec[] = [
    { size: [3.8, 0.1, 2.8], at: g3(hx, 0.45, hz) },
    { size: [3.2, 0.06, 0.4], at: g3(hx, 0.85, hz + 0.9) }, // bench
    { size: [4.6, 0.08, 0.12], at: g3(hx, 2.42, hz + 1.5) }, // the gutter
  ];
  const roof: CylinderSpec[] = [{ radiusTop: 0, radiusBottom: 3.4, height: 1.6, at: g3(hx, 3.25, hz), rotation: [0, Math.PI / 4, 0], segments: 4 }];
  const downpipe: CylinderSpec[] = [{ radiusTop: 0.04, radiusBottom: 0.04, height: 1.4, at: g3(wx + 0.4, 1.7, hz + 1.5), segments: 6 }];

  // The food forest along the east side: a mango over bananas, papayas,
  // malunggay, calamansi bushes, and sweet potato on the ground.
  const forest: BlobSpec[] = [];
  const stems: CylinderSpec[] = [];
  const [fx, fz] = GARDEN_SPOTS.forest;
  for (const [dx, dz] of [[-1.5, -7], [1.6, -3.5], [-1.2, 2], [1.4, 6]]) {
    // Bananas: a clump of stems and long, drooping leaves.
    for (let k = 0; k < 3; k++) stems.push({ radiusTop: 0.09, radiusBottom: 0.13, height: 2.2, at: g3(fx + dx + k * 0.25, 1.1, fz + dz + (k % 2) * 0.25), segments: 7 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      forest.push({ r: 0.5, at: g3(fx + dx + Math.cos(a) * 0.75, 2.35 - (k % 2) * 0.15, fz + dz + Math.sin(a) * 0.75), scale: [1.6, 0.18, 0.6] });
    }
  }
  for (const [dx, dz] of [[0.2, -10], [-0.4, 9]]) {
    // Papaya: a bare stem, a crown of leaves, fruit under it.
    stems.push({ radiusTop: 0.06, radiusBottom: 0.1, height: 2.6, at: g3(fx + dx, 1.3, fz + dz), segments: 6 });
    forest.push({ r: 0.6, at: g3(fx + dx, 2.75, fz + dz), scale: [1.4, 0.3, 1.4] });
    for (let k = 0; k < 4; k++) yellows.push({ r: 0.09, at: g3(fx + dx + Math.cos(k * 1.6) * 0.14, 2.45, fz + dz + Math.sin(k * 1.6) * 0.14), scale: [1, 1.4, 1] });
  }
  for (const [dx, dz] of [[2.4, -8.5], [2.6, 1]]) {
    // Malunggay: slim, with a light, feathery crown.
    stems.push({ radiusTop: 0.05, radiusBottom: 0.08, height: 3, at: g3(fx + dx, 1.5, fz + dz), segments: 6 });
    for (let k = 0; k < 5; k++) forest.push({ r: 0.35, at: g3(fx + dx + Math.cos(k) * 0.45, 3.0 + (k % 2) * 0.3, fz + dz + Math.sin(k) * 0.45), scale: [1, 0.5, 1] });
  }
  for (const [dx, dz] of [[-2.4, -1.5], [-2.2, 4.5], [0.4, 12]]) {
    // Calamansi bushes, with fruit.
    forest.push({ r: 0.55, at: g3(fx + dx, 0.55, fz + dz), scale: [1, 0.9, 1] });
    for (let k = 0; k < 4; k++) yellows.push({ r: 0.05, at: g3(fx + dx + Math.cos(k * 1.7) * 0.5, 0.6 + (k % 2) * 0.2, fz + dz + Math.sin(k * 1.7) * 0.5) });
  }
  for (let k = 0; k < 14; k++) forest.push({ r: 0.32, at: g3(fx - 3 + (k % 7) * 1.0, 0.1, fz - 12 + Math.floor(k / 7) * 22 + (k % 3)), scale: [1.4, 0.35, 1.2] });

  // The nursery: seedlings on benches under a shade net.
  const [nx, nz] = GARDEN_SPOTS.nursery;
  const nurseryFrame: CylinderSpec[] = [];
  for (const dx of [-2, 2]) for (const dz of [-1.2, 1.2]) nurseryFrame.push({ radiusTop: 0.04, radiusBottom: 0.04, height: 2.1, at: g3(nx + dx, 1.05, nz + dz), segments: 6 });
  const benches: BoxSpec[] = [
    { size: [3.4, 0.06, 0.7], at: g3(nx, 0.75, nz - 0.6) },
    { size: [3.4, 0.06, 0.7], at: g3(nx, 0.75, nz + 0.6) },
  ];
  for (let k = 0; k < 16; k++) leaves.push({ r: 0.07, at: g3(nx - 1.5 + (k % 8) * 0.43, 0.84, nz - 0.6 + Math.floor(k / 8) * 1.2), scale: [1.2, 0.7, 1.2] });

  // A strip of flowers for the bees along the south fence.
  for (let k = 0; k < 22; k++) (k % 2 ? yellows : reds).push({ r: 0.1, at: g3(-12 + k * 1.1, 0.25, D / 2 - 0.7), scale: [1, 0.8, 1] });
  for (let k = 0; k < 22; k++) leaves.push({ r: 0.16, at: g3(-12 + k * 1.1, 0.12, D / 2 - 0.7), scale: [1.2, 0.5, 1] });

  return {
    bamboo: mergedGeometry(fence, [...fencePosts, ...trellis, ...hut, ...nurseryFrame]),
    timber: mergedGeometry([...frames, ...stakes, ...hutFloor, ...benches]),
    soil: mergedGeometry(soils),
    thatch: mergedGeometry([], roof),
    tank: mergedGeometry(tanks),
    drums: mergedGeometry(cage, [...drums, ...downpipe]),
    stems: mergedGeometry([], stems),
    leaves: blobGeometry(leaves, 0),
    forest: blobGeometry(forest, 0),
    stones: blobGeometry(stones, 0),
    compost: blobGeometry(compost, 1),
    reds: blobGeometry(reds, 0),
    purples: blobGeometry(purples, 0),
    yellows: blobGeometry(yellows, 0),
  };
}

function Garden() {
  const parts = useMemo(gardenParts, []);
  useEffect(() => () => Object.values(parts).forEach((g) => g.dispose()), [parts]);
  const [nx, nz] = GARDEN_SPOTS.nursery;
  return (
    <group userData={{ navIgnore: true }}>
      {/* Mulched ground under the beds and their paths. */}
      <mesh position={g3(-2.2, 0.012, 0)} rotation={[-Math.PI / 2, 0, 0]} material={mulch} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[14, 10.5]} />
      </mesh>
      <mesh geometry={parts.bamboo} material={bamboo} castShadow />
      <mesh geometry={parts.timber} material={timber} castShadow receiveShadow />
      <mesh geometry={parts.soil} material={soil} />
      <mesh geometry={parts.thatch} material={thatch} castShadow />
      <mesh geometry={parts.tank} material={tankWhite} />
      <mesh geometry={parts.drums} material={drumBlue} />
      <mesh geometry={parts.stems} material={bark} />
      <mesh geometry={parts.leaves} material={leafGreen} />
      <mesh geometry={parts.forest} material={darkLeaf} castShadow />
      <mesh geometry={parts.stones} material={stone} />
      <mesh geometry={parts.compost} material={soil} />
      <mesh geometry={parts.reds} material={fruitRed} />
      <mesh geometry={parts.purples} material={fruitPurple} />
      <mesh geometry={parts.yellows} material={fruitYellow} />
      <mesh position={g3(nx, 2.12, nz)} rotation={[-Math.PI / 2, 0, 0]} material={netMaterial}>
        <planeGeometry args={[4.3, 2.7]} />
      </mesh>
    </group>
  );
}

const GARDEN_INFO: Info = {
  card: "garden",
  color: "#5d8b2f",
  title: () => L("FMDS Perma G.A.R.D.E.N.", "FMDS パーマ G.A.R.D.E.N."),
  lines: () => [
    L("Growing Appreciation toward Resilience, Development, Entrepreneurship, and Nutrition: FMDS's permaculture garden.", "レジリエンス・開発・起業・栄養への理解を育てる、FMDSのパーマカルチャー菜園。"),
    L("Adopt-A-Plot's 2 m × 2 m organic beds are real; the compost, rain tanks, herb spiral, food forest, and nursery are imagined.", "2 m × 2 mの有機栽培の区画(アダプト・ア・プロット)は実在。堆肥、雨水タンク、ハーブスパイラル、食べられる森、苗床は想像です。"),
    L("Ask Chancy Joan or Dean Rob for a permaculture tour.", "チャンシー・ジョアンかディーン・ロブに、パーマカルチャーの案内を頼んでみてください。"),
  ],
};

// --- the switches ------------------------------------------------------------------------

const LAYER_LABEL: Record<Layer, () => string> = {
  walkway: () => L("Covered walkway, AR to WCMPB", "屋根つき通路(AR〜WCMPB)"),
  lamps: () => L("Solar lampposts", "ソーラー街灯"),
  trees: () => L("More shade trees", "日陰の木を増やす"),
  garden: () => L("Perma G.A.R.D.E.N., built out", "パーマ G.A.R.D.E.N.(拡充)"),
};

const KIOSK = { w: 1.4, h: 1.05, bottom: 0.8 };
const ROW_TOP = 150;
const ROW_H = 92;

function drawKiosk(ctx: CanvasRenderingContext2D, w: number, h: number, state: Record<string, WorldStateValue>, enabled: boolean, note: string, hovered: number) {
  ctx.fillStyle = "#f6f7f2";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2c4a3a";
  ctx.fillRect(0, 0, w, 100);
  ctx.fillStyle = "#fff";
  ctx.font = `800 44px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(L("Imagined campus", "想像のキャンパス"), 30, 52);
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = "#1f2430";
  ctx.fillText(L("What if UPOU had… Switch each on or off to compare.", "もしUPOUに…があったら。オン・オフで見比べられます。"), 30, 128);
  LAYERS.forEach((layer, i) => {
    const y = ROW_TOP + 18 + i * ROW_H;
    const on = layerOn(state, layer);
    roundRect(ctx, 24, y, w - 48, ROW_H - 14, 14);
    ctx.fillStyle = hovered === i && enabled ? "#e3ece6" : "#ffffff";
    ctx.fill();
    ctx.fillStyle = "#1f2430";
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(LAYER_LABEL[layer](), 48, y + (ROW_H - 14) / 2);
    roundRect(ctx, w - 190, y + 14, 140, ROW_H - 42, 24);
    ctx.fillStyle = on ? "#3f7a5e" : "#a8adb5";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(on ? L("ON", "オン") : L("OFF", "オフ"), w - 120, y + (ROW_H - 14) / 2);
    ctx.textAlign = "left";
  });
  ctx.fillStyle = "#6a7080";
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText(note, 30, h - 30);
  ctx.textBaseline = "alphabetic";
}

function Kiosk({ state, setWorldState, enabled, note }: { state: Record<string, WorldStateValue>; setWorldState: (key: string, value: WorldStateValue) => void; enabled: boolean; note: string }) {
  const lang = useLang();
  const [hovered, setHovered] = useState(-1);
  const W = 960;
  const H = Math.round((W * KIOSK.h) / KIOSK.w);
  const texture = useCanvasTexture(W, H, (ctx, w, h) => drawKiosk(ctx, w, h, state, enabled, note, hovered), { deps: [state, enabled, note, hovered, lang] });
  const frame = useMemo(
    () =>
      mergedGeometry([
        { size: [KIOSK.w + 0.1, KIOSK.h + 0.1, 0.05], at: [0, KIOSK.bottom + KIOSK.h / 2, -0.035] },
        { size: [0.07, KIOSK.bottom + 0.1, 0.07], at: [-KIOSK.w / 2 + 0.15, (KIOSK.bottom + 0.1) / 2, -0.05] },
        { size: [0.07, KIOSK.bottom + 0.1, 0.07], at: [KIOSK.w / 2 - 0.15, (KIOSK.bottom + 0.1) / 2, -0.05] },
      ]),
    []
  );
  useEffect(() => () => frame.dispose(), [frame]);
  const row = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!event.uv) return -1;
    const y = (1 - event.uv.y) * H;
    const k = Math.floor((y - ROW_TOP - 18) / ROW_H);
    return k >= 0 && k < LAYERS.length ? k : -1;
  };
  return (
    <group>
      <mesh geometry={frame} material={steel} castShadow />
      <mesh
        position={[0, KIOSK.bottom + KIOSK.h / 2, 0.001]}
        onClick={(event) => {
          event.stopPropagation();
          const k = row(event);
          if (k < 0 || !enabled) return;
          const layer = LAYERS[k];
          setWorldState(LAYER_KEY[layer], !layerOn(state, layer));
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerMove={(event) => {
          const k = row(event);
          if (k !== hovered) setHovered(k);
          document.body.style.cursor = k >= 0 ? (enabled ? "pointer" : "not-allowed") : "";
        }}
        onPointerOut={() => {
          setHovered(-1);
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[KIOSK.w, KIOSK.h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Where the switch board stands: beside the station's study boards, on
 *  the side toward where visitors arrive. */
export const KIOSK_AT: [number, number, number] = [STATION.x - 5.4, GROUND_Y, STATION.z + 4.6];

// --- the layer ---------------------------------------------------------------------------

export interface FuturesProps {
  worldState: Record<string, WorldStateValue>;
  setWorldState: (key: string, value: WorldStateValue) => void;
  canEdit: boolean;
  connected: boolean;
}

export function Futures({ worldState, setWorldState, canEdit, connected }: FuturesProps) {
  useLang();
  const on = (layer: Layer) => layerOn(worldState, layer);
  const enabled = canEdit && connected;
  const note = !connected ? L("Not connected", "未接続") : canEdit ? L("Changes are shared with everyone here", "変更はここにいる全員に共有されます") : L("Only editors can switch these", "切り替えられるのは編集者だけです");
  const [ax, az] = WALKWAY_SEGMENTS[0].from;
  const last = WALKWAY_SEGMENTS[WALKWAY_SEGMENTS.length - 1];
  const gate = [GARDEN.x - GARDEN.w / 2 - 2.2, GROUND_Y, GARDEN.z - 4.4] as [number, number, number];
  return (
    <>
      {on("walkway") && (
        <>
          <Walkway />
          {/* At each end, beside the walk, facing whoever arrives. */}
          <InfoBoard info={WALKWAY_INFO} position={[ax - 3.2, GROUND_Y, az + 1.2]} rotationY={Math.PI + WALKWAY_SEGMENTS[0].angle + Math.PI / 2} />
          <InfoBoard info={on("lamps") ? LAMPS_INFO : WALKWAY_INFO} position={[last.to[0] + 2.6, GROUND_Y, last.to[1] - 2.2]} rotationY={last.angle - Math.PI / 2} />
        </>
      )}
      {on("lamps") && <Lampposts />}
      {on("trees") && (
        <>
          <Trees />
          <InfoBoard info={TREES_INFO} position={[56, GROUND_Y, 10]} rotationY={-Math.PI / 2} />
        </>
      )}
      {on("garden") && (
        <>
          <Garden />
          <InfoBoard info={GARDEN_INFO} position={gate} rotationY={-Math.PI / 2} />
        </>
      )}
      <group position={KIOSK_AT} rotation={[0, -Math.PI / 2, 0]}>
        <Kiosk state={worldState} setWorldState={setWorldState} enabled={enabled} note={note} />
      </group>
    </>
  );
}
