// The plant itself, built into the world: the solar array and its
// perovskite pilot row, the battery, two wind turbines whose rotors turn
// with their real output, the exploded perovskite cell in the classroom,
// and an info board at each, drawn in code, with live numbers. Each has a
// glow outline that switches with its room's lights (kit.tsx, GlowLines).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { LightZone } from "../../../src/multiplayer/types";
import { floorHeightAt } from "../../../src/scene/layout";
import { PLANT } from "../sim/energy";
import type { InfoKey } from "../sim/info";
import { openInfo } from "./InfoCard";
import {
  Clickable,
  FONT,
  fmt,
  GlowLines,
  roundRect,
  signWashTexture,
  standard,
  useCanvasTexture,
  useMerged,
  useNightLift,
  useSignLamp,
  wrapText,
  type BoxSpec,
  type CylinderSpec,
  type RingSpec,
} from "./kit";
import { homesNow, live, rotorRpm } from "./live";
import { TOWN } from "../sim/town";
import { L } from "../../../src/i18n/lang";

// --- where everything stands ----------------------------------------------------------

export const SOLAR = { x: -6.5, z: 31 };
export const BATTERY = { x: 7.5, z: 30 };
export const TURBINES = [
  { x: -7, z: 45, phase: 0.2 },
  { x: 7, z: 47, phase: 0.9 },
];
export const CELL = { x: 6.6, z: -12.2 };

// --- the solar array --------------------------------------------------------------------

const TILT = (15 * Math.PI) / 180;
const PANEL = { w: 1.05, l: 1.75, t: 0.035, gap: 0.04, y: 1.0 };
const ROWS = 3, PER_ROW = 6, ROW_SPACING = 2.6;
export const ROW_WIDTH = PER_ROW * (PANEL.w + PANEL.gap);
const SUPPORT_DZ = 0.55;

/** Height of a panel's underside at `dz` metres south of its row's centre:
 *  the panels slope down toward the south (+Z), facing the sun's path. */
const underside = (dz: number) => PANEL.y - dz * Math.tan(TILT) - PANEL.t / 2 / Math.cos(TILT);

function solarParts() {
  const silicon: BoxSpec[] = [], perovskite: BoxSpec[] = [], aluminium: BoxSpec[] = [], steel: BoxSpec[] = [], concrete: BoxSpec[] = [];
  const half = PANEL.l / 2;
  for (let r = 0; r < ROWS; r++) {
    const z = r * ROW_SPACING;
    const panels = r === ROWS - 1 ? perovskite : silicon;
    for (let i = 0; i < PER_ROW; i++) {
      const x = -ROW_WIDTH / 2 + i * (PANEL.w + PANEL.gap) + PANEL.w / 2;
      panels.push({ size: [PANEL.w, PANEL.t, PANEL.l], at: [x, PANEL.y, z], rotation: [TILT, 0, 0] });
    }
    // Frame edges along the high (north) and low (south) sides of the row.
    for (const side of [-1, 1]) {
      aluminium.push({
        size: [ROW_WIDTH, 0.045, 0.045],
        at: [0, PANEL.y - side * Math.sin(TILT) * half, z + side * Math.cos(TILT) * half],
        rotation: [TILT, 0, 0],
      });
    }
    // Two rails under each row, and posts down to concrete feet.
    for (const dz of [-SUPPORT_DZ, SUPPORT_DZ]) {
      const railTop = underside(dz);
      steel.push({ size: [ROW_WIDTH, 0.06, 0.08], at: [0, railTop - 0.03, z + dz] });
      for (const x of [-ROW_WIDTH / 2 + 0.3, 0, ROW_WIDTH / 2 - 0.3]) {
        const h = railTop - 0.06;
        steel.push({ size: [0.08, h, 0.08], at: [x, h / 2, z + dz] });
        concrete.push({ size: [0.3, 0.12, 0.3], at: [x, 0.06, z + dz] });
      }
    }
  }
  // A combiner box at the east end of the middle row.
  steel.push({ size: [0.5, 0.7, 0.25], at: [ROW_WIDTH / 2 + 0.6, 0.47, ROW_SPACING] });
  steel.push({ size: [0.08, 0.12, 0.08], at: [ROW_WIDTH / 2 + 0.6, 0.06, ROW_SPACING] });
  return { silicon, perovskite, aluminium, steel, concrete };
}
const SOLAR_PARTS = solarParts();

/** Each row's outline: blue for silicon, amber for the perovskite row. */
const rowOutline = (r: number): BoxSpec => ({ size: [ROW_WIDTH + 0.02, PANEL.t + 0.02, PANEL.l + 0.02], at: [0, PANEL.y, r * ROW_SPACING], rotation: [TILT, 0, 0] });
const SOLAR_GLOW = {
  silicon: [rowOutline(0), rowOutline(1), { size: [0.5, 0.7, 0.25], at: [ROW_WIDTH / 2 + 0.6, 0.47, ROW_SPACING] }] as BoxSpec[],
  perovskite: [rowOutline(ROWS - 1)],
};

/**
 * A panel's face, painted once: a silver frame edge, and either a grid of
 * blue silicon cells with silver gaps and fine busbars, or the perovskite
 * module's long thin strips. A texture rather than geometry, so the detail
 * costs no draw calls, and it's the panels' glow at night too.
 */
function panelTexture(kind: "silicon" | "perovskite"): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const w = (canvas.width = 192), h = (canvas.height = 320);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#c3cad4"; // frame and the gaps between cells
  ctx.fillRect(0, 0, w, h);
  const edge = 5;
  if (kind === "silicon") {
    const cols = 6, rows = 10, gap = 2;
    const cw = (w - 2 * edge - (cols - 1) * gap) / cols, ch = (h - 2 * edge - (rows - 1) * gap) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = edge + c * (cw + gap), y = edge + r * (ch + gap);
        const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
        g.addColorStop(0, "#2a52b8");
        g.addColorStop(1, "#1b3a8f");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = "rgba(205,214,228,0.55)"; // busbars
        for (const f of [0.25, 0.5, 0.75]) ctx.fillRect(x + cw * f - 0.5, y, 1, ch);
      }
    }
  } else {
    ctx.fillStyle = "#3d1c11";
    ctx.fillRect(edge, edge, w - 2 * edge, h - 2 * edge);
    ctx.fillStyle = "rgba(170,140,120,0.45)"; // the scribed lines between strips
    for (let x = edge + 9; x < w - edge; x += 9) ctx.fillRect(x, edge, 1, h - 2 * edge);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function panelMaterial(kind: "silicon" | "perovskite") {
  const map = panelTexture(kind);
  return standard("#ffffff", 0.3, 0.2, { map, emissiveMap: map });
}

const materials = {
  silicon: panelMaterial("silicon"),
  perovskite: panelMaterial("perovskite"),
  aluminium: standard("#b8bcc2", 0.4, 0.8),
  steel: standard("#71767e", 0.5, 0.7),
  concrete: standard("#9e9b93", 0.95, 0),
  white: standard("#eceef0", 0.5, 0.05),
  container: standard("#dfe3df", 0.6, 0.2),
  green: standard("#1a8c52", 0.6, 0.1),
  dark: standard("#1f2126", 0.6, 0.2),
  warning: standard("#f2b81a", 0.5, 0.1),
  wood: standard("#73502f", 0.8, 0),
};

function SolarArray() {
  const silicon = useMerged(SOLAR_PARTS.silicon);
  const perovskite = useMerged(SOLAR_PARTS.perovskite);
  const aluminium = useMerged(SOLAR_PARTS.aluminium);
  const steel = useMerged(SOLAR_PARTS.steel);
  const concrete = useMerged(SOLAR_PARTS.concrete);
  return (
    <group position={[SOLAR.x, 0, SOLAR.z]}>
      <Clickable onClick={() => openInfo("silicon")}>
        <mesh geometry={silicon} material={materials.silicon} castShadow receiveShadow />
      </Clickable>
      <Clickable onClick={() => openInfo("perovskite")}>
        <mesh geometry={perovskite} material={materials.perovskite} castShadow receiveShadow />
      </Clickable>
      <mesh geometry={aluminium} material={materials.aluminium} castShadow />
      <mesh geometry={steel} material={materials.steel} castShadow />
      <mesh geometry={concrete} material={materials.concrete} receiveShadow />
      <GlowLines boxes={SOLAR_GLOW.silicon} color="#5fa8ff" zone="pond" thickness={0.03} />
      <GlowLines boxes={SOLAR_GLOW.perovskite} color="#ff9a52" zone="pond" thickness={0.03} />
    </group>
  );
}

// --- the battery ----------------------------------------------------------------------------

/** Laid out along X, then turned to stand along the garden's east side. */
const BATTERY_PARTS = {
  concrete: [{ size: [8, 0.2, 3.6], at: [0.8, 0.1, 0] }] as BoxSpec[],
  container: [{ size: [6, 2.6, 2.44], at: [0, 1.5, 0] }] as BoxSpec[],
  aluminium: [
    ...[0, 1, 2, 3, 4].map((i) => ({ size: [0.04, 2.3, 0.02], at: [-2.4 + i * 1.2, 1.5, 1.23] }) as BoxSpec),
    { size: [0.7, 0.7, 0.04], at: [3.55, 1.6, 0.97] },
  ] as BoxSpec[],
  dark: [
    { size: [0.9, 1.0, 0.7], at: [3.55, 1.5, 0.6] },
    { size: [5.1, 0.24, 0.02], at: [0, 2.3, 1.235] },
  ] as BoxSpec[],
  green: [{ size: [1.3, 1.5, 1.2], at: [4.6, 0.95, -0.5] }] as BoxSpec[],
  warning: [
    { size: [0.5, 0.35, 0.02], at: [2.3, 1.75, 1.235] },
    { size: [0.3, 0.3, 0.02], at: [4.6, 1.3, 0.11] },
  ] as BoxSpec[],
};

/** The charge strip along the container's side: as long as the battery is
 *  full, green while charging, amber while discharging. */
function ChargeStrip() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: "#7aa2ff", toneMapped: false }), []);
  const colors = useMemo(() => ({ charge: new THREE.Color("#5dff8f"), discharge: new THREE.Color("#ffb03b"), idle: new THREE.Color("#7aa2ff") }), []);
  useFrame(() => {
    const s = live.now;
    if (!mesh.current || !s) return;
    const fill = Math.max(0.02, s.soc);
    mesh.current.scale.x = fill;
    mesh.current.position.x = -2.5 + 2.5 * fill;
    material.color.copy(s.batteryMw < -0.01 ? colors.charge : s.batteryMw > 0.01 ? colors.discharge : colors.idle);
  });
  return (
    <mesh ref={mesh} position={[0, 2.3, 1.25]} material={material}>
      <boxGeometry args={[5, 0.16, 0.01]} />
    </mesh>
  );
}

function Battery() {
  const parts = {
    concrete: useMerged(BATTERY_PARTS.concrete),
    container: useMerged(BATTERY_PARTS.container),
    aluminium: useMerged(BATTERY_PARTS.aluminium),
    dark: useMerged(BATTERY_PARTS.dark),
    green: useMerged(BATTERY_PARTS.green),
    warning: useMerged(BATTERY_PARTS.warning),
  };
  return (
    <group position={[BATTERY.x, 0, BATTERY.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Clickable onClick={() => openInfo("battery")}>
        {(Object.keys(parts) as (keyof typeof parts)[]).map((key) => (
          <mesh key={key} geometry={parts[key]} material={materials[key]} castShadow receiveShadow />
        ))}
        <ChargeStrip />
      </Clickable>
      <GlowLines boxes={[...BATTERY_PARTS.container, ...BATTERY_PARTS.green]} color="#b58cff" zone="pond" thickness={0.04} />
    </group>
  );
}

// --- the wind turbines -------------------------------------------------------------------

const HUB = { y: 14.2, z: -1.05 };
const TOWER: CylinderSpec[] = [
  { radiusTop: 1.3, radiusBottom: 1.3, height: 0.3, at: [0, 0.15, 0], segments: 20 },
  { radiusTop: 0.22, radiusBottom: 0.42, height: 13.7, at: [0, 0.3 + 13.7 / 2, 0], segments: 20 },
];
const NACELLE: BoxSpec[] = [{ size: [0.8, 0.8, 2.2], at: [0, HUB.y, 0.2] }];
/** The rotor, around its own hub: three blades of two tapered pieces,
 *  and the nose cone pointing into the wind (-Z). */
function rotorParts(): { boxes: BoxSpec[]; cylinders: CylinderSpec[] } {
  const boxes: BoxSpec[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3;
    const along = (r: number): [number, number, number] => [-Math.sin(a) * r, Math.cos(a) * r, 0];
    boxes.push({ size: [0.5, 2.6, 0.08], at: along(1.9), rotation: [0, 0.15, a] });
    boxes.push({ size: [0.28, 2.9, 0.06], at: along(4.6), rotation: [0, 0.15, a] });
  }
  return { boxes, cylinders: [{ radiusTop: 0.12, radiusBottom: 0.34, height: 0.7, at: [0, 0, -0.25], rotation: [-Math.PI / 2, 0, 0] }] };
}
const ROTOR = rotorParts();
/** The nacelle's outline, a ring round the hub, and one round the footing. */
const TURBINE_GLOW = {
  boxes: NACELLE,
  rings: [
    { radius: 0.42, at: [0, HUB.y, HUB.z + 0.12] },
    { radius: 1.32, at: [0, 0.3, 0], rotation: [Math.PI / 2, 0, 0] },
  ] as RingSpec[],
};

function Turbine({ x, z, phase }: { x: number; z: number; phase: number }) {
  const tower = useMerged(NACELLE, TOWER);
  const rotor = useMerged(ROTOR.boxes, ROTOR.cylinders);
  const spin = useRef<THREE.Mesh>(null);
  const rpm = useRef(0);
  useFrame((_, delta) => {
    // Rotors have inertia: they spin up and coast down over a few seconds
    // rather than jumping to a new speed.
    rpm.current += (rotorRpm() - rpm.current) * (1 - Math.exp(-delta / 2.5));
    if (spin.current) spin.current.rotation.z -= (rpm.current / 60) * Math.PI * 2 * delta;
  });
  return (
    // On the sunken meadow, so on its floor rather than the garden's.
    <group position={[x, floorHeightAt(x, z), z]}>
      <Clickable onClick={() => openInfo("wind")}>
        <mesh geometry={tower} material={materials.white} castShadow />
        <mesh ref={spin} geometry={rotor} material={materials.white} position={[0, HUB.y, HUB.z]} rotation={[0, 0, phase]} castShadow>
          {/* The blades' outlines turn with them. */}
          <GlowLines boxes={ROTOR.boxes} color="#4dffd2" zone="pond" thickness={0.05} />
        </mesh>
      </Clickable>
      <mesh position={[0, HUB.y + 0.45, 1.25]} material={materials.warning}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
      </mesh>
      <GlowLines boxes={TURBINE_GLOW.boxes} rings={TURBINE_GLOW.rings} color="#4dffd2" zone="pond" thickness={0.06} />
    </group>
  );
}

// --- the perovskite cell ------------------------------------------------------------------

/** The stack, light-facing glass on top, pulled apart to read from the
 *  side. The absorber yellows as the pilot row degrades: real perovskite
 *  breaks down into yellow lead iodide when moisture gets in. */
const LAYERS: { name: string; color: string; t: number; opacity?: number }[] = [
  { name: "back contact", color: "#d9b24c", t: 0.04 },
  { name: "hole transport", color: "#8c59bf", t: 0.05 },
  { name: "perovskite", color: "#33140b", t: 0.09 },
  { name: "electron transport", color: "#eceef3", t: 0.05 },
  { name: "transparent electrode", color: "#8cccf2", t: 0.04, opacity: 0.75 },
  { name: "glass", color: "#c4e6f2", t: 0.08, opacity: 0.35 },
];

/** The top of the stack's frame, above the pedestal. */
const STACK_TOP = LAYERS.reduce((y, l) => y + l.t + 0.14, 1.05);
const CELL_GLOW = {
  boxes: [{ size: [0.9, STACK_TOP - 0.9, 0.9], at: [0, (0.9 + STACK_TOP) / 2, 0] }] as BoxSpec[],
  rings: [
    { radius: 0.555, at: [0, 0.9, 0], rotation: [Math.PI / 2, 0, 0] },
    { radius: 0.605, at: [0, 0.02, 0], rotation: [Math.PI / 2, 0, 0] },
  ] as RingSpec[],
};

function PerovskiteCell() {
  const pedestal = useMerged([], [{ radiusTop: 0.55, radiusBottom: 0.6, height: 0.9, at: [0, 0.45, 0], segments: 28 }]);
  const layerMaterials = useMemo(
    () =>
      LAYERS.map((l) =>
        standard(l.color, 0.4, l.name === "back contact" ? 0.9 : 0.1, l.opacity ? { transparent: true, opacity: l.opacity, depthWrite: false } : {})
      ),
    []
  );
  const pedestalMaterial = useMemo(() => materials.wood.clone(), []);
  useNightLift("classroom", [...layerMaterials, pedestalMaterial], 0.35);
  const fresh = useMemo(() => new THREE.Color("#33140b"), []);
  const degraded = useMemo(() => new THREE.Color("#c9a227"), []);
  useFrame(() => {
    const s = live.now;
    if (!s) return;
    // Visible fade by 80% health, the usual end-of-life mark.
    const t = THREE.MathUtils.clamp((1 - s.perovskiteHealth) / 0.2, 0, 1);
    layerMaterials[2].color.copy(fresh).lerp(degraded, t);
  });
  let y = 1.05;
  const stack = LAYERS.map((l, i) => {
    const at = y + l.t / 2;
    y += l.t + 0.14;
    return { ...l, at, material: layerMaterials[i] };
  });
  const postsHeight = STACK_TOP - 0.9;
  const posts = useMerged(
    [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].map(([x, z]) => ({ size: [0.02, postsHeight, 0.02], at: [x, 0.9 + postsHeight / 2, z] }) as BoxSpec)
  );
  return (
    <group position={[CELL.x, 0, CELL.z]}>
      <Clickable onClick={() => openInfo("layers")}>
        <mesh geometry={pedestal} material={pedestalMaterial} castShadow receiveShadow />
        <mesh geometry={posts} material={materials.aluminium} />
        {stack.map((l) => (
          <mesh key={l.name} position={[0, l.at, 0]} material={l.material} castShadow={!l.opacity}>
            <boxGeometry args={[0.9, l.t, 0.9]} />
          </mesh>
        ))}
      </Clickable>
      <GlowLines boxes={CELL_GLOW.boxes} rings={CELL_GLOW.rings} color="#ffa45c" zone="classroom" thickness={0.018} />
    </group>
  );
}

// --- the boards ------------------------------------------------------------------------------

type Art = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

const art: Record<string, Art> = {
  sun: (ctx, x, y, w, h) => {
    ctx.fillStyle = "#f6e7c8";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#3e7d3a";
    ctx.fillRect(x, y + h * 0.78, w, h * 0.22);
    ctx.strokeStyle = "#f2a531";
    ctx.lineWidth = 8;
    const cx = x + w / 2, cy = y + h * 0.5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
      ctx.lineTo(cx + Math.cos(a) * 112, cy + Math.sin(a) * 112);
      ctx.stroke();
    }
    ctx.fillStyle = "#f2a531";
    ctx.beginPath();
    ctx.arc(cx, cy, 64, 0, Math.PI * 2);
    ctx.fill();
  },
  panels: (ctx, x, y, w, h) => {
    ctx.fillStyle = "#d6e6f5";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#f2a531";
    ctx.beginPath();
    ctx.arc(x + w * 0.78, y + h * 0.2, 34, 0, Math.PI * 2);
    ctx.fill();
    for (let r = 0; r < 3; r++) {
      const py = y + h * (0.45 + r * 0.17);
      ctx.fillStyle = r === 0 ? "#5b2a18" : "#16285a";
      ctx.beginPath();
      ctx.moveTo(x + 30 + r * 10, py + 28);
      ctx.lineTo(x + w - 30 - r * 10, py + 28);
      ctx.lineTo(x + w - 50 - r * 10, py);
      ctx.lineTo(x + 50 + r * 10, py);
      ctx.closePath();
      ctx.fill();
    }
  },
  turbine: (ctx, x, y, w, h) => {
    ctx.fillStyle = "#dcefe8";
    ctx.fillRect(x, y, w, h);
    const cx = x + w / 2, cy = y + h * 0.3;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#7a8a86";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 8, y + h);
    ctx.lineTo(cx - 4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.lineTo(cx + 8, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.4 + (k * 2 * Math.PI) / 3);
      ctx.beginPath();
      ctx.ellipse(0, -62, 10, 62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },
  battery: (ctx, x, y, w, h) => {
    ctx.fillStyle = "#ece4fa";
    ctx.fillRect(x, y, w, h);
    const bw = w * 0.6, bh = h * 0.42, bx = x + (w - bw) / 2, by = y + (h - bh) / 2;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#4b3a73";
    roundRect(ctx, bx, by, bw, bh, 14);
    ctx.stroke();
    ctx.fillStyle = "#4b3a73";
    ctx.fillRect(bx + bw, by + bh * 0.3, 16, bh * 0.4);
    // Four cells, filled to the battery's live charge.
    const soc = live.now?.soc ?? 0.6;
    const cell = (bw - 28) / 4;
    for (let i = 0; i < 4; i++) {
      const filled = THREE.MathUtils.clamp(soc * 4 - i, 0, 1);
      ctx.fillStyle = "#ddd0f7";
      ctx.fillRect(bx + 14 + i * cell, by + 14, cell - 10, bh - 28);
      ctx.fillStyle = "#8a5fe0";
      ctx.fillRect(bx + 14 + i * cell, by + 14, (cell - 10) * filled, bh - 28);
    }
    ctx.fillStyle = "#4b3a73";
    ctx.font = `700 40px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(soc * 100)}%`, x + w / 2, by + bh + 56);
    ctx.textAlign = "left";
  },
  layers: (ctx, x, y, w, h) => {
    ctx.fillStyle = "#f4ece6";
    ctx.fillRect(x, y, w, h);
    const order = [...LAYERS].reverse();
    const lh = (h - 40) / order.length;
    order.forEach((l, i) => {
      ctx.fillStyle = l.color;
      roundRect(ctx, x + 30, y + 20 + i * lh + 4, w - 60, lh - 8, 6);
      ctx.fill();
      ctx.fillStyle = l.name === "perovskite" ? "#fff" : "#222";
      ctx.font = `500 22px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(l.name, x + w / 2, y + 20 + i * lh + lh / 2);
      ctx.textAlign = "left";
    });
  },
};

interface BoardSpec {
  title: string;
  color: string;
  /** The outline's colour, and whose light switch it follows. */
  glow: string;
  zone: LightZone;
  lines: string[];
  art: keyof typeof art;
  info: InfoKey;
  /** The live line under the board's text, or nothing. */
  now?: () => string;
  position: [number, number, number];
  rotationY: number;
}

const solarNow = () => {
  const s = live.now;
  if (!s) return "";
  return L(
    `Now: silicon ${fmt(s.siliconMw)} MW, perovskite ${fmt(s.perovskiteMw)} MW. ${fmt(s.poa, 0)} W/m² on the panels, cells at ${fmt(s.cellTemp, 0)} °C.`,
    `現在:シリコン ${fmt(s.siliconMw)} MW、ペロブスカイト ${fmt(s.perovskiteMw)} MW。パネル面の日射 ${fmt(s.poa, 0)} W/m²、セル温度 ${fmt(s.cellTemp, 0)} °C。`
  );
};
const windNow = () => {
  const s = live.now;
  if (!s) return "";
  if (s.turbinesFeathered)
    return L(`Now: ${fmt(s.windSpeed, 1)} m/s, past cut-out. Blades feathered, rotors braked: 0 MW.`, `現在:風速 ${fmt(s.windSpeed, 1)} m/s で停止風速超え。羽根をフェザリングし、ブレーキ中:0 MW。`);
  if (!live.controls.wind) return L("Now: the wind breaker is open in the control room, so the rotors are braked.", "現在:コントロールルームで風力のブレーカーが開いているので、ローターは止まっています。");
  return L(`Now: ${fmt(s.windSpeed, 1)} m/s of wind gives ${fmt(s.windMw)} MW from both turbines.`, `現在:風速 ${fmt(s.windSpeed, 1)} m/s で、2基合わせて ${fmt(s.windMw)} MW。`);
};
const batteryNow = () => {
  const s = live.now;
  if (!s) return "";
  const state =
    s.batteryMw < -0.01
      ? L(`charging at ${fmt(-s.batteryMw)} MW`, `${fmt(-s.batteryMw)} MWで充電中`)
      : s.batteryMw > 0.01
        ? L(`discharging at ${fmt(s.batteryMw)} MW`, `${fmt(s.batteryMw)} MWで放電中`)
        : L("idle", "待機中");
  return L(`Now: ${fmt(s.soc * 100, 0)}% full (${fmt(s.soc * PLANT.batteryMwh, 1)} MWh), ${state}.`, `現在:充電率 ${fmt(s.soc * 100, 0)}%(${fmt(s.soc * PLANT.batteryMwh, 1)} MWh)、${state}。`);
};
const cellNow = () => {
  const s = live.now;
  if (!s) return "";
  const seal = { none: ["no", "封止なし"], edge: ["an edge", "端面封止"], glass: ["a glass", "ガラス封止"] }[live.controls.encapsulation] ?? [live.controls.encapsulation, live.controls.encapsulation];
  return L(
    `The pilot row outside is at ${fmt(s.perovskiteHealth * 100, 2)}% health with ${seal[0]} seal, at ${fmt(s.humidity, 0)}% humidity.`,
    `外の試験列は健全度 ${fmt(s.perovskiteHealth * 100, 2)}%(${seal[1]}、湿度 ${fmt(s.humidity, 0)}%)。`
  );
};
const welcomeNow = () => {
  const s = live.now;
  if (!s) return "";
  const scenario = live.controls.elNino ? L("El Niño 2026", "エルニーニョ2026") : L("a normal year", "平年");
  const dark = homesNow().dark;
  return L(
    `Now (${scenario}, ${s.ambient.toFixed(0)} °C): the plant makes ${fmt(s.siliconMw + s.perovskiteMw + s.windMw)} MW for a town using ${fmt(s.loadMw)} MW${dark > 0 ? `, and ${dark.toLocaleString("en")} homes are dark` : ""}.`,
    `現在(${scenario}、${s.ambient.toFixed(0)} °C):発電 ${fmt(s.siliconMw + s.perovskiteMw + s.windMw)} MW、町の需要 ${fmt(s.loadMw)} MW${dark > 0 ? `、${dark.toLocaleString("en")}世帯が停電中` : ""}。`
  );
};

export const BOARDS: BoardSpec[] = [
  {
    get title() {
      return L("Welcome to Seizora", "Seizoraへようこそ");
    },
    glow: "#ffb35c",
    zone: "hall",
    color: "#e8913a",
    art: "sun",
    info: "sky",
    get lines() {
      return [
        L(
          `A solar, wind, and storage microgrid for a town in Cebu: ${TOWN.homes.toLocaleString("en")} homes, a school, a clinic, and shops.`,
          `セブの町のための、太陽光・風力・蓄電のマイクログリッド:${TOWN.homes.toLocaleString("en")}世帯、学校、診療所、店。`
        ),
        L("Garden: the solar farm, a perovskite pilot row, wind turbines, and a battery.", "庭:太陽光発電所、ペロブスカイトの試験列、風力タービン、蓄電池。"),
        L("Classroom: the control room, and a perovskite solar cell, layer by layer.", "教室:コントロールルームと、層ごとに見るペロブスカイト太陽電池。"),
        L("The sky follows real Philippine time and weather, and so does the plant.", "空はフィリピンの実際の時刻と天気に合わせて動き、発電所もそれに従います。"),
      ];
    },
    now: welcomeNow,
    // The hall's free front-right corner, turned toward the spawn point.
    position: [6.2, 0, 14.2],
    rotationY: -2.17,
  },
  {
    get title() {
      return L("The solar farm", "太陽光発電所");
    },
    glow: "#6fa8ff",
    zone: "pond",
    color: "#3b7bff",
    art: "panels",
    info: "silicon",
    get lines() {
      return [
        L(
          "3.6 MW of silicon and a 0.6 MW perovskite pilot (the brown back row). These rows stand in for a farm of about 4 to 5 hectares.",
          "シリコン3.6 MWと、ペロブスカイトの試験列0.6 MW(奥の茶色い列)。この列は約4〜5ヘクタールの発電所の代わりです。"
        ),
        L("Tilted 15° to the south to face the sun's path at this latitude.", "この緯度の太陽の通り道に向くよう、南へ15°傾けてあります。"),
        L("Panels lose output as they heat up, so a bright cool morning can beat a hot afternoon.", "パネルは熱くなると出力が下がるので、明るく涼しい朝が暑い午後に勝つこともあります。"),
      ];
    },
    now: solarNow,
    position: [SOLAR.x, 0, 28.3],
    rotationY: Math.PI,
  },
  {
    get title() {
      return L("Wind turbines", "風力タービン");
    },
    glow: "#45e8c0",
    zone: "pond",
    color: "#1d9f80",
    art: "turbine",
    info: "wind",
    get lines() {
      return [
        L("Scale models of two 1.5 MW turbines: real ones stand about 80 m to the hub, with 77 m rotors.", "1.5 MW機2基の縮尺模型。本物はハブまでの高さ約80 m、ローター直径77 mです。"),
        L("The power in the wind rises with the cube of its speed: double the wind, eight times the power.", "風のエネルギーは風速の3乗で増えます。風が2倍なら8倍です。"),
        L("They start at about 3.5 m/s, reach full power at 12 m/s, and stop above 25 m/s.", "約3.5 m/sで回りはじめ、12 m/sで定格に達し、25 m/sを超えると止まります。"),
      ];
    },
    now: windNow,
    // Beside the steps down to the meadow (GARDEN_STEPS), the turbines
    // beyond them.
    position: [3.4, 0, 36.5],
    rotationY: Math.PI,
  },
  {
    get title() {
      return L("Battery storage", "蓄電池");
    },
    glow: "#b58cff",
    zone: "pond",
    color: "#8a5fe0",
    art: "battery",
    info: "battery",
    get lines() {
      return [
        L("6 MWh of batteries that charge or discharge at up to 3 MW. The strip on the container shows the charge.", "容量6 MWh、最大3 MWで充放電できる蓄電池。コンテナの帯が充電率を示します。"),
        L("They store the midday surplus for the evening peak, when homes light up after sunset.", "昼の余りをためて、日が沈み家々に明かりがともる夕方のピークに使います。"),
        L("Cut off from the main grid, the battery decides how long the lights stay on.", "本線の系統から切り離されたとき、明かりがどれだけもつかは蓄電池しだいです。"),
      ];
    },
    now: batteryNow,
    position: [5.6, 0, 25.6],
    rotationY: Math.PI,
  },
  {
    get title() {
      return L("Inside a perovskite solar cell", "ペロブスカイト太陽電池の中");
    },
    glow: "#ff8f5c",
    zone: "classroom",
    color: "#a8492b",
    art: "layers",
    info: "layers",
    get lines() {
      return [
        L("The perovskite layer is thinner than a thousandth of a millimetre, yet absorbs sunlight strongly.", "ペロブスカイト層は1000分の1ミリより薄いのに、日光を強く吸収します。"),
        L("It can be printed on glass or flexible film: Japan is developing it for walls and roofs.", "ガラスや曲がるフィルムに印刷できます。日本は壁や屋根に使うために開発しています。"),
        L("Moisture, heat, and light break it down, turning it yellow. Watch the model's absorber.", "水分、熱、光で劣化し、黄色くなります。模型の吸収層を見てみましょう。"),
      ];
    },
    now: cellNow,
    position: [7.4, 0, -15.4],
    rotationY: -Math.PI / 2,
  },
];

const BOARD = { w: 2.4, h: 1.5, bottom: 0.85 };
const BOARD_FACE: BoxSpec = { size: [BOARD.w + 0.12, BOARD.h + 0.12, 0.06], at: [0, BOARD.bottom + BOARD.h / 2, -0.04] };
const BOARD_FRAME: BoxSpec[] = [
  BOARD_FACE,
  // The sign lamp's hood over the top edge; its lit strip is in Board.
  { size: [BOARD.w + 0.16, 0.04, 0.2], at: [0, BOARD.bottom + BOARD.h + 0.095, 0.07] },
  { size: [0.09, BOARD.bottom + 0.2, 0.09], at: [-BOARD.w / 2 + 0.2, (BOARD.bottom + 0.2) / 2, -0.06] },
  { size: [0.09, BOARD.bottom + 0.2, 0.09], at: [BOARD.w / 2 - 0.2, (BOARD.bottom + 0.2) / 2, -0.06] },
];

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, b: BoardSpec) {
  ctx.fillStyle = "#fbf8f2";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = b.color;
  ctx.fillRect(0, 0, w, 110);
  ctx.fillStyle = "#fff";
  ctx.font = `700 52px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(b.title, 36, 56);
  ctx.font = `600 22px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("SEIZORA", w - 30, 56);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  art[b.art](ctx, 36, 140, 380, 380);
  ctx.fillStyle = "#1f2430";
  ctx.font = `400 27px ${FONT}`;
  let y = 170;
  for (const line of b.lines) {
    ctx.fillStyle = b.color;
    ctx.fillRect(450, y - 18, 10, 10);
    ctx.fillStyle = "#1f2430";
    y = wrapText(ctx, line, 474, y, w - 510, 36) + 14;
  }
  const now = b.now?.();
  if (now) {
    roundRect(ctx, 36, h - 186, w - 72, 110, 14);
    ctx.fillStyle = "#14223b";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 27px ${FONT}`;
    wrapText(ctx, now, 60, h - 140, w - 120, 36);
  }
  ctx.fillStyle = "#6a7080";
  ctx.font = `400 20px ${FONT}`;
  ctx.fillText(
    L(
      "Click for more and sources · A learning model: the plant is invented and the weather is synthetic.",
      "クリックで詳しい説明と出典 · 学習用モデル:発電所は架空、天気は合成です。"
    ),
    36,
    h - 34
  );
}

/** `spec` is read on every redraw, so its getters follow the language. */
function Board({ spec: b }: { spec: BoardSpec }) {
  const anchor = useRef<THREE.Mesh>(null);
  const texture = useCanvasTexture(1200, 750, (ctx, w, h) => drawBoard(ctx, w, h, b), { hz: 1, anchor, range: 16 });
  const frame = useMerged(BOARD_FRAME);
  // The face, washed from the sign lamp along its top so it reads at night.
  const face = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, lightMap: signWashTexture(), lightMapIntensity: 0 }), [texture]);
  useEffect(() => () => face.dispose(), [face]);
  const strip = useSignLamp(b.zone, [face]);
  return (
    <group position={b.position} rotation={[0, b.rotationY, 0]}>
      <Clickable onClick={() => openInfo(b.info)}>
        <mesh geometry={frame} material={materials.wood} castShadow />
        <mesh ref={anchor} position={[0, BOARD.bottom + BOARD.h / 2, 0.002]} material={face}>
          <planeGeometry args={[BOARD.w, BOARD.h]} />
        </mesh>
      </Clickable>
      {/* The sign lamp's strip, under its hood. */}
      <mesh position={[0, BOARD.bottom + BOARD.h + 0.068, 0.13]} material={strip}>
        <boxGeometry args={[BOARD.w - 0.1, 0.015, 0.04]} />
      </mesh>
      <GlowLines boxes={[BOARD_FACE]} color={b.glow} zone={b.zone} thickness={0.022} />
    </group>
  );
}

export function Exhibits() {
  // The garden's exhibits catch a little of the lamps at night, so the
  // panels and the battery don't go black against the sky.
  useNightLift("pond", [materials.silicon, materials.perovskite], 0.45);
  useNightLift("pond", [materials.container, materials.green, materials.white, materials.steel], 0.22);
  return (
    <>
      <SolarArray />
      <Battery />
      {TURBINES.map((t) => (
        <Turbine key={t.x} {...t} />
      ))}
      <PerovskiteCell />
      {BOARDS.map((b) => (
        <Board key={b.info} spec={b} />
      ))}
    </>
  );
}

/** Collision for the exhibits a visitor can walk up to. */
export function exhibitObstacles() {
  const boards = BOARDS.map((b) => ({ x: b.position[0], z: b.position[2], halfX: BOARD.w / 2 + 0.06, halfZ: 0.15, rotationY: b.rotationY }));
  const rows = [0, 1, 2].map((r) => ({
    x: SOLAR.x,
    z: SOLAR.z + r * ROW_SPACING,
    halfX: ROW_WIDTH / 2 + 0.1,
    halfZ: Math.cos(TILT) * (PANEL.l / 2) + 0.05,
    rotationY: 0,
  }));
  return [
    ...rows,
    { x: SOLAR.x + ROW_WIDTH / 2 + 0.6, z: SOLAR.z + ROW_SPACING, halfX: 0.25, halfZ: 0.15, rotationY: 0 },
    // The battery's pad, turned to run along Z.
    { x: BATTERY.x, z: BATTERY.z + 0.8, halfX: 1.8, halfZ: 4, rotationY: 0 },
    { x: CELL.x, z: CELL.z, halfX: 0.6, halfZ: 0.6, rotationY: 0 },
    // The turbines' footings, out on the meadow Seiza lets you walk onto.
    ...TURBINES.map((t) => ({ x: t.x, z: t.z, halfX: 1.15, halfZ: 1.15, rotationY: 0 })),
    ...boards,
  ];
}
