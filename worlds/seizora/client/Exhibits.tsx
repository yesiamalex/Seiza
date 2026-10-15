// The plant itself, built into the world: the solar array and its
// perovskite pilot row, the battery, two wind turbines whose rotors turn
// with their real output, the exploded perovskite cell in the classroom,
// and an info board at each, drawn in code, with live numbers.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PLANT } from "../sim/energy";
import type { InfoKey } from "../sim/info";
import { openInfo } from "./InfoCard";
import { Clickable, FONT, fmt, roundRect, standard, useCanvasTexture, useMerged, wrapText, type BoxSpec, type CylinderSpec } from "./kit";
import { live, rotorRpm } from "./live";

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

const materials = {
  silicon: standard("#0d1838", 0.25, 0.35),
  perovskite: standard("#3d1a10", 0.3, 0.25),
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
    <group position={[x, 0, z]}>
      <Clickable onClick={() => openInfo("wind")}>
        <mesh geometry={tower} material={materials.white} castShadow />
        <mesh ref={spin} geometry={rotor} material={materials.white} position={[0, HUB.y, HUB.z]} rotation={[0, 0, phase]} castShadow />
      </Clickable>
      <mesh position={[0, HUB.y + 0.45, 1.25]} material={materials.warning}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
      </mesh>
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

function PerovskiteCell() {
  const pedestal = useMerged([], [{ radiusTop: 0.55, radiusBottom: 0.6, height: 0.9, at: [0, 0.45, 0], segments: 28 }]);
  const layerMaterials = useMemo(
    () =>
      LAYERS.map((l) =>
        standard(l.color, 0.4, l.name === "back contact" ? 0.9 : 0.1, l.opacity ? { transparent: true, opacity: l.opacity, depthWrite: false } : {})
      ),
    []
  );
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
  const postsHeight = y - 0.9;
  const posts = useMerged(
    [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].map(([x, z]) => ({ size: [0.02, postsHeight, 0.02], at: [x, 0.9 + postsHeight / 2, z] }) as BoxSpec)
  );
  return (
    <group position={[CELL.x, 0, CELL.z]}>
      <Clickable onClick={() => openInfo("layers")}>
        <mesh geometry={pedestal} material={materials.wood} castShadow receiveShadow />
        <mesh geometry={posts} material={materials.aluminium} />
        {stack.map((l) => (
          <mesh key={l.name} position={[0, l.at, 0]} material={l.material} castShadow={!l.opacity}>
            <boxGeometry args={[0.9, l.t, 0.9]} />
          </mesh>
        ))}
      </Clickable>
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
    ctx.fillStyle = "#8a5fe0";
    for (let i = 0; i < 4; i++) ctx.fillRect(bx + 14 + i * ((bw - 28) / 4), by + 14, (bw - 28) / 4 - 10, bh - 28);
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
  return `Now: silicon ${fmt(s.siliconMw)} MW, perovskite ${fmt(s.perovskiteMw)} MW. ${fmt(s.poa, 0)} W/m² on the panels, cells at ${fmt(s.cellTemp, 0)} °C.`;
};
const windNow = () => {
  const s = live.now;
  if (!s) return "";
  if (s.turbinesFeathered) return `Now: ${fmt(s.windSpeed, 1)} m/s, past cut-out. Blades feathered, rotors braked: 0 MW.`;
  if (!live.controls.wind) return "Now: the wind breaker is open in the control room, so the rotors are braked.";
  return `Now: ${fmt(s.windSpeed, 1)} m/s of wind gives ${fmt(s.windMw)} MW from both turbines.`;
};
const batteryNow = () => {
  const s = live.now;
  if (!s) return "";
  const state = s.batteryMw < -0.01 ? `charging at ${fmt(-s.batteryMw)} MW` : s.batteryMw > 0.01 ? `discharging at ${fmt(s.batteryMw)} MW` : "idle";
  return `Now: ${fmt(s.soc * 100, 0)}% full (${fmt(s.soc * PLANT.batteryMwh, 1)} MWh), ${state}.`;
};
const cellNow = () => {
  const s = live.now;
  if (!s) return "";
  return `The pilot row outside is at ${fmt(s.perovskiteHealth * 100, 2)}% health with a ${live.controls.encapsulation} seal, at ${fmt(s.humidity, 0)}% humidity.`;
};
const welcomeNow = () => {
  const s = live.now;
  if (!s) return "";
  return `Right now the plant makes ${fmt(s.siliconMw + s.perovskiteMw + s.windMw)} MW for a town using ${fmt(s.loadMw)} MW.`;
};

export const BOARDS: BoardSpec[] = [
  {
    title: "Welcome to Seizora",
    color: "#e8913a",
    art: "sun",
    info: "sky",
    lines: [
      "A solar, wind, and storage microgrid for a Philippine community, from the lab to the grid.",
      "Garden: the solar farm, a perovskite pilot row, wind turbines, and a battery.",
      "Classroom: the control room, and a perovskite solar cell, layer by layer.",
      "The sky follows real Philippine time and weather, and so does the plant.",
    ],
    now: welcomeNow,
    // The hall's free front-right corner, turned toward the spawn point.
    position: [6.2, 0, 14.2],
    rotationY: -2.17,
  },
  {
    title: "The solar farm",
    color: "#3b7bff",
    art: "panels",
    info: "silicon",
    lines: [
      "3.6 MW of silicon panels and a 0.6 MW perovskite pilot row (the back row, in brown).",
      "Tilted 15° to the south to face the sun's path at this latitude.",
      "Panels lose output as they heat up, so a bright cool morning can beat a hot afternoon.",
    ],
    now: solarNow,
    position: [SOLAR.x, 0, 28.3],
    rotationY: Math.PI,
  },
  {
    title: "Wind turbines",
    color: "#1d9f80",
    art: "turbine",
    info: "wind",
    lines: [
      "Two 1.5 MW turbines, 14 m to the hub. Their rotors turn with what they make.",
      "Power rises with the cube of wind speed: double the wind, eight times the power.",
      "They start at about 3 m/s, reach full power at 12 m/s, and stop above 25 m/s.",
    ],
    now: windNow,
    position: [0, 0, 36.5],
    rotationY: Math.PI,
  },
  {
    title: "Battery storage",
    color: "#8a5fe0",
    art: "battery",
    info: "battery",
    lines: [
      "6 MWh of batteries that charge or discharge at up to 3 MW. The strip on the container shows the charge.",
      "They store the midday surplus for the evening peak, when homes light up after sunset.",
      "Cut off from the main grid, the battery decides how long the lights stay on.",
    ],
    now: batteryNow,
    position: [5.6, 0, 25.6],
    rotationY: Math.PI,
  },
  {
    title: "Inside a perovskite solar cell",
    color: "#a8492b",
    art: "layers",
    info: "layers",
    lines: [
      "The perovskite layer is thinner than a thousandth of a millimetre, yet absorbs sunlight strongly.",
      "It can be printed on glass or flexible film: Japan is developing it for walls and roofs.",
      "Moisture, heat, and light break it down, turning it yellow. Watch the model's absorber.",
    ],
    now: cellNow,
    position: [7.4, 0, -15.4],
    rotationY: -Math.PI / 2,
  },
];

const BOARD = { w: 2.4, h: 1.5, bottom: 0.85 };
const BOARD_FRAME: BoxSpec[] = [
  { size: [BOARD.w + 0.12, BOARD.h + 0.12, 0.06], at: [0, BOARD.bottom + BOARD.h / 2, -0.04] },
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
  ctx.fillText("Click for more · A learning model: the plant is invented and the weather is synthetic.", 36, h - 34);
}

function Board(b: BoardSpec) {
  const anchor = useRef<THREE.Mesh>(null);
  const texture = useCanvasTexture(1200, 750, (ctx, w, h) => drawBoard(ctx, w, h, b), { hz: 1, anchor, range: 16 });
  const frame = useMerged(BOARD_FRAME);
  return (
    <group position={b.position} rotation={[0, b.rotationY, 0]}>
      <Clickable onClick={() => openInfo(b.info)}>
        <mesh geometry={frame} material={materials.wood} castShadow />
        <mesh ref={anchor} position={[0, BOARD.bottom + BOARD.h / 2, 0.002]}>
          <planeGeometry args={[BOARD.w, BOARD.h]} />
          <meshStandardMaterial map={texture} roughness={0.85} />
        </mesh>
      </Clickable>
    </group>
  );
}

export function Exhibits() {
  return (
    <>
      <SolarArray />
      <Battery />
      {TURBINES.map((t) => (
        <Turbine key={t.x} {...t} />
      ))}
      <PerovskiteCell />
      {BOARDS.map((b) => (
        <Board key={b.title} {...b} />
      ))}
    </>
  );
}

/** Collision for the exhibits a visitor can walk up to. */
export function exhibitObstacles() {
  const boards = BOARDS.map((b) => ({ x: b.position[0], z: b.position[2], halfX: BOARD.w / 2, halfZ: 0.08, rotationY: b.rotationY }));
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
    ...boards,
  ];
}
