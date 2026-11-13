// Seinag's solar station, by the drive where visitors arrive: an open shed
// whose sloped roof carries its own panels, housing the live dashboard,
// the console that runs the campus plant for everyone, the battery
// cabinet, Seizora's perovskite lab bench, and study boards outside its
// west side, toward the arrival point.
//
// Local space: the shed's floor centre at the origin, its open front
// facing +Z (south, toward the drive), so its roof slopes up to the north
// and the panels on it face the sun.
import { useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { RoomSky, RoomSkyWeather, WorldStateValue } from "../../../src/multiplayer/types";
import type { Obstacle } from "../../../src/scene/layout";
import { skyState } from "../../../src/sky/skyState";
import { SITES, WEATHER } from "../../../src/sky/weather";
import { L, useLang } from "../../../src/i18n/lang";
import { Clickable, FONT, hhmm, roundRect, standard, useCanvasTexture, useMerged, usePrismX, wrapText, type BoxSpec } from "../../seizora/client/kit";
import { CONSOLE, drawConsole, layout, TOP_H, TOP_LENGTH, TOP_TILT, TOP_W, type Row } from "../../seizora/client/ControlRoom";
import { LAB, LabBench } from "../../seizora/client/Lab";
import { openCard, type CardKey } from "./cards";
import { DashboardScreen } from "./Dashboard";
import { dayTotals, KEYS, live } from "./live";
import { moduleMeshes } from "./module";
import { CAMPUS, ROOFTOP_MWP } from "./plant";

/** Where the station stands: its floor centre, on the grass north of the
 *  drive, ahead and to the left of where visitors arrive. */
export const STATION = { x: 79, y: 0.12, z: -12 };
const W = 9, D = 5.2;
const FRONT_H = 2.8, BACK_H = 3.5;
const SLOPE = Math.atan2(BACK_H - FRONT_H, D + 0.6);
const roofY = (z: number) => (FRONT_H + BACK_H) / 2 - z * Math.tan(SLOPE);

// --- the structure ---------------------------------------------------------------------------

const SLAB: BoxSpec[] = [{ size: [W + 0.4, 0.15, D + 0.4], at: [0, 0.075, 0] }];
const STEEL: BoxSpec[] = [
  ...[-1, 1].flatMap((sx) => [
    { size: [0.14, FRONT_H, 0.14], at: [sx * (W / 2 - 0.1), FRONT_H / 2, D / 2 - 0.1] } as BoxSpec,
    { size: [0.14, BACK_H, 0.14], at: [sx * (W / 2 - 0.1), BACK_H / 2, -D / 2 + 0.1] } as BoxSpec,
    // Rafters along each side, under the roof.
    { size: [0.1, 0.18, D + 0.6], at: [sx * (W / 2 - 0.1), roofY(0) - 0.14, 0], rotation: [SLOPE, 0, 0] } as BoxSpec,
  ]),
  { size: [0.1, 0.18, D + 0.6], at: [0, roofY(0) - 0.14, 0], rotation: [SLOPE, 0, 0] },
  // The front beam, which carries the sign.
  { size: [W, 0.16, 0.14], at: [0, FRONT_H - 0.08, D / 2 - 0.1] },
];
const ROOF: BoxSpec[] = [{ size: [W + 0.6, 0.06, D + 0.9], at: [0, roofY(0) + 0.03, 0], rotation: [SLOPE, 0, 0] }];
/** The back wall: timber cladding to the roof, the dashboard on it. */
const WALL: BoxSpec[] = [{ size: [W - 0.2, BACK_H - 0.15, 0.14], at: [0, (BACK_H - 0.15) / 2 + 0.15, -D / 2 + 0.07] }];

const concrete = standard("#b9b4aa", 0.92, 0);
const steel = standard("#4a525e", 0.45, 0.65);
const roofMetal = standard("#9aa1ab", 0.55, 0.35);
const timber = standard("#8a6544", 0.75, 0.05);
const cabinetPaint = standard("#e6e8ec", 0.5, 0.2);

function Structure() {
  const slab = useMerged(SLAB);
  const frame = useMerged(STEEL);
  const roof = useMerged(ROOF);
  const wall = useMerged(WALL);
  // The roof's own modules: four across, three up the slope, lying on it.
  const roofModules = useMemo(() => {
    const spots: [number, number, number][] = [];
    for (const x of [-3.1, -1.05, 1.05, 3.1]) for (const z of [-1.55, -0.25, 1.05]) spots.push([x, roofY(z) + 0.06, z]);
    return moduleMeshes(spots, 0.03, SLOPE - (15 * Math.PI) / 180);
  }, []);
  return (
    <>
      <mesh geometry={slab} material={concrete} receiveShadow />
      <mesh geometry={frame} material={steel} castShadow />
      <mesh geometry={roof} material={roofMetal} castShadow receiveShadow />
      <mesh geometry={wall} material={timber} castShadow receiveShadow />
      <primitive object={roofModules.face} />
      <primitive object={roofModules.frame} />
      {/* A warm strip under the front beam, so the station reads at night. */}
      <mesh position={[0, FRONT_H - 0.17, D / 2 - 0.1]}>
        <boxGeometry args={[W - 0.6, 0.03, 0.06]} />
        <meshBasicMaterial color="#ffe2a8" toneMapped={false} />
      </mesh>
    </>
  );
}

// --- the sign --------------------------------------------------------------------------------

function Sign() {
  const lang = useLang();
  const texture = useCanvasTexture(
    1600,
    150,
    (ctx, w, h) => {
      ctx.fillStyle = "#16213a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffcf6e";
      ctx.font = `800 64px ${FONT}`;
      ctx.textBaseline = "middle";
      ctx.fillText(L("☀ SEINAG SOLAR STATION", "☀ SEINAG ソーラーステーション"), 40, h / 2 + 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#9fb0d6";
      ctx.font = `500 34px ${FONT}`;
      ctx.fillText(L("Hypothetical rooftop solar for UPOU", "UPOUの屋根の仮想ソーラー"), w - 40, h / 2 + 2);
    },
    { deps: [lang] }
  );
  return (
    <mesh position={[0, FRONT_H + 0.22, D / 2 + 0.02]}>
      <planeGeometry args={[W - 1, ((W - 1) * 150) / 1600]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

// --- the console -----------------------------------------------------------------------------

export interface StationProps {
  canEdit: boolean;
  connected: boolean;
  roomSky: RoomSky | null;
  setRoomSky: (sky: RoomSky | null) => void;
  worldState: Record<string, WorldStateValue>;
  setWorldState: (key: string, value: WorldStateValue) => void;
}

function useRows({ roomSky, setRoomSky, setWorldState }: StationProps): Row[] {
  const c = live.controls;
  const weather: RoomSkyWeather = roomSky?.weather ?? "auto";
  const sky = (next: RoomSky) => setRoomSky(next.mode === "realtime" && (next.weather ?? "auto") === "auto" ? null : next);
  const setWeather = (w: RoomSkyWeather) => {
    if (!roomSky || roomSky.mode === "realtime") sky({ mode: "realtime", weather: w });
    else if (roomSky.mode === "running") sky({ ...roomSky, hour: skyState.hour, weather: w });
    else sky({ ...roomSky, weather: w });
  };
  const fixedHour = roomSky?.mode === "fixed" ? roomSky.hour : undefined;
  const toggle = (label: string, key: string, on: boolean) => ({ label, active: on, tone: "toggle" as const, run: () => setWorldState(key, !on) });
  return [
    {
      title: L("BREAKERS", "ブレーカー"),
      buttons: [toggle(L("Rooftop solar", "屋根のソーラー"), KEYS.solar, c.silicon), toggle(L("Battery", "蓄電池"), KEYS.battery, c.battery), toggle(L("Grid tie", "系統連系"), KEYS.grid, c.gridConnected)],
    },
    {
      title: L("BATTERY", "蓄電池"),
      buttons: (["auto", "charge", "hold", "discharge"] as const).map((mode) => ({
        label: L(mode[0].toUpperCase() + mode.slice(1), { auto: "自動", charge: "充電", hold: "保持", discharge: "放電" }[mode]),
        active: c.batteryMode === mode,
        run: () => setWorldState(KEYS.batteryMode, mode),
      })),
    },
    {
      title: L("TIME", "時刻"),
      buttons: [
        { label: L("Real time", "実時間"), active: !roomSky || roomSky.mode === "realtime", run: () => sky({ mode: "realtime", weather }) },
        ...[6, 10, 12, 14, 18, 0].map((hour) => ({ label: hhmm(hour), active: fixedHour === hour, run: () => sky({ mode: "fixed", hour, weather }) })),
        { label: L("Run 360×", "360倍速"), active: roomSky?.mode === "running", run: () => sky({ mode: "running", hour: skyState.hour, scale: 360, weather }) },
      ],
    },
    {
      title: L("WEATHER", "天気"),
      buttons: (["auto", "clear", "partly", "overcast", "rain", "typhoon"] as const).map((w) => ({
        label: w === "auto" ? L("Auto", "自動") : w === "partly" ? L("Cloudy", "くもり") : L(WEATHER[w].label, WEATHER[w].labelJa),
        active: weather === w,
        run: () => setWeather(w),
      })),
    },
  ];
}

function Console(props: StationProps) {
  const { canEdit, connected, roomSky, worldState } = props;
  const lang = useLang();
  const rows = useRows(props);
  const rects = useMemo(() => layout(rows), [rows]);
  const [hovered, setHovered] = useState(-1);
  const enabled = canEdit && connected;
  const note = !connected
    ? L("Not connected", "未接続")
    : canEdit
      ? L("Changes are shared with everyone here", "変更はここにいる全員に共有されます")
      : L("Only editors can change the plant", "発電所を操作できるのは編集者だけです");
  const texture = useCanvasTexture(TOP_W, TOP_H, (ctx, w, h) => drawConsole(ctx, w, h, rows, rects, enabled, hovered, note), {
    deps: [worldState, roomSky, hovered, enabled, note, lang],
  });
  const half = CONSOLE.depth / 2;
  const body = usePrismX(
    [
      [half, 0],
      [half, CONSOLE.front],
      [-half, CONSOLE.back],
      [-half, 0],
    ],
    CONSOLE.width
  );
  const bodyMaterial = useMemo(() => standard("#2b2f38", 0.55, 0.35), []);
  const pick = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const uv = event.uv;
    if (!uv) return -1;
    const x = uv.x * TOP_W, y = (1 - uv.y) * TOP_H;
    return rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  };
  return (
    // The operator stands on the +Z side, facing the dashboard.
    <group position={[0, 0.15, 0.3]}>
      <mesh geometry={body} material={bodyMaterial} castShadow />
      <mesh
        position={[0, (CONSOLE.front + CONSOLE.back) / 2 + 0.004, 0]}
        rotation={[-Math.PI / 2 + TOP_TILT, 0, 0]}
        onClick={(event) => {
          event.stopPropagation();
          const k = pick(event);
          if (k < 0 || !enabled) return;
          rows[rects[k].row].buttons[rects[k].index].run();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerMove={(event) => {
          const k = pick(event);
          if (k !== hovered) setHovered(k);
          document.body.style.cursor = k >= 0 ? (enabled ? "pointer" : "not-allowed") : "";
        }}
        onPointerOut={() => {
          setHovered(-1);
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[CONSOLE.width - 0.04, TOP_LENGTH - 0.04]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// --- the battery cabinet ---------------------------------------------------------------------

const CABINET = { w: 1.5, h: 1.9, d: 0.7, x: W / 2 - 1.2, z: -D / 2 + 0.55 };

function Battery() {
  const lang = useLang();
  const anchor = useRef<THREE.Mesh>(null);
  const face = useCanvasTexture(
    300,
    380,
    (ctx, w, h) => {
      ctx.fillStyle = "#eef0f3";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#2a3245";
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(L("BATTERY", "蓄電池"), 24, 46);
      ctx.font = `500 20px ${FONT}`;
      ctx.fillStyle = "#59606d";
      ctx.fillText(`${Math.round(CAMPUS.batteryMwh * 1000)} kWh · ${Math.round(CAMPUS.batteryMw * 1000)} kW`, 24, 76);
      // The charge strip.
      const s = live.now;
      const soc = s?.soc ?? 0;
      roundRect(ctx, 24, 100, w - 48, 200, 12);
      ctx.fillStyle = "#1c2236";
      ctx.fill();
      roundRect(ctx, 30, 106 + (188 * (1 - soc)), w - 60, 188 * soc, 8);
      ctx.fillStyle = s && s.batteryMw < -0.001 ? "#7CFF9E" : "#9b72ee";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `800 44px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(soc * 100)}%`, w / 2, 215);
      ctx.fillStyle = "#2a3245";
      ctx.font = `600 22px ${FONT}`;
      ctx.fillText(
        !s ? "" : s.batteryMw < -0.001 ? L(`charging ${Math.round(-s.batteryMw * 1000)} kW`, `充電 ${Math.round(-s.batteryMw * 1000)} kW`) : s.batteryMw > 0.001 ? L(`giving ${Math.round(s.batteryMw * 1000)} kW`, `放電 ${Math.round(s.batteryMw * 1000)} kW`) : L("resting", "待機中"),
        w / 2,
        340
      );
    },
    { hz: 1, anchor, range: 25, deps: [lang] }
  );
  return (
    <group position={[CABINET.x, 0.15, CABINET.z]}>
      <Clickable onClick={() => openCard("battery")}>
        <mesh position={[0, CABINET.h / 2, 0]} material={cabinetPaint} castShadow>
          <boxGeometry args={[CABINET.w, CABINET.h, CABINET.d]} />
        </mesh>
        <mesh ref={anchor} position={[0, CABINET.h * 0.55, CABINET.d / 2 + 0.003]}>
          <planeGeometry args={[CABINET.w * 0.62, CABINET.w * 0.62 * (380 / 300)]} />
          <meshBasicMaterial map={face} toneMapped={false} />
        </mesh>
      </Clickable>
    </group>
  );
}

// --- the study boards -----------------------------------------------------------------------

interface Board {
  card: CardKey;
  color: string;
  title: () => string;
  lines: () => string[];
  now: () => string;
}

const kw = (mw: number) => `${Math.round(mw * 1000)} kW`;

const BOARDS: Board[] = [
  {
    card: "solar",
    color: "#e8913a",
    title: () => L("Solar on UPOU's roofs", "UPOUの屋根に太陽光を"),
    lines: () => [
      L(`${Math.round(ROOFTOP_MWP * 1000)} kW of modules on four roofs, placed wherever a whole module fits.`, `4つの屋根に合計${Math.round(ROOFTOP_MWP * 1000)} kW。パネルがまるごと収まる場所に配置。`),
      L("Tilted 15° to the south, toward the sun's path at this latitude.", "この緯度の太陽の通り道に向けて、南へ15°。"),
      L("Hot panels make less: a cool, bright morning can beat a hot noon.", "熱いパネルは発電が減ります。涼しく明るい朝が暑い正午に勝つことも。"),
    ],
    now: () => {
      const s = live.now;
      if (!s) return "";
      return s.sunElevation <= 0 ? L("Now: the sun is down, so the roofs make nothing.", "現在:日が沈み、屋根の発電はゼロです。") : L(`Now: ${kw(s.siliconMw)}, cells at ${Math.round(s.cellTemp)} °C.`, `現在:${kw(s.siliconMw)}、セル温度 ${Math.round(s.cellTemp)} °C。`);
    },
  },
  {
    card: "load",
    color: "#3b7bff",
    title: () => L("What the campus uses", "キャンパスの使用量"),
    lines: () => [
      L("Offices and classrooms from 7 to 6, lights and servers through the night.", "7時〜18時は事務室と教室、夜は照明とサーバー。"),
      L("Aircon rises with the heat: a hot afternoon is the busiest hour.", "暑いほどエアコンが増え、暑い午後がいちばんの山。"),
      L("A campus uses its power by day, when the sun shines: a good match.", "キャンパスは日中に電気を使うので、太陽光と相性がよいのです。"),
    ],
    now: () => {
      const s = live.now;
      if (!s) return "";
      return L(`Now: using ${kw(s.loadMw)}, ${Math.round(Math.min(1, s.siliconMw / Math.max(0.001, s.loadMw)) * 100)}% from the sun.`, `現在:${kw(s.loadMw)}を使用、${Math.round(Math.min(1, s.siliconMw / Math.max(0.001, s.loadMw)) * 100)}%を太陽で。`);
    },
  },
  {
    card: "battery",
    color: "#8a5fe0",
    title: () => L("Storing the sun", "太陽をためる"),
    lines: () => [
      L(`A ${Math.round(CAMPUS.batteryMwh * 1000)} kWh battery keeps the midday surplus for the evening.`, `${Math.round(CAMPUS.batteryMwh * 1000)} kWhの蓄電池が、昼の余りを夕方のためにためます。`),
      L("About 15% is lost on the round trip; it stays between 10% and 95%.", "出し入れで約15%が失われ、充電率は10〜95%に保たれます。"),
      L("Switch it, or the grid tie, at the console: everyone here sees it.", "操作盤で蓄電池や系統連系を切り替えられます。全員に共有されます。"),
    ],
    now: () => {
      const t = dayTotals();
      return live.now ? L(`24 h: ${(t.solarMwh * 1000).toFixed(0)} kWh from the roofs, ${Math.round(t.ownShare * 100)}% without the grid.`, `24時間:屋根から${(t.solarMwh * 1000).toFixed(0)} kWh、${Math.round(t.ownShare * 100)}%を系統なしで。`) : "";
    },
  },
];

const BOARD = { w: 1.5, h: 0.95, bottom: 0.85 };
const BOARD_FRAME: BoxSpec[] = [
  { size: [BOARD.w + 0.1, BOARD.h + 0.1, 0.05], at: [0, BOARD.bottom + BOARD.h / 2, -0.035] },
  { size: [0.07, BOARD.bottom + 0.1, 0.07], at: [-BOARD.w / 2 + 0.15, (BOARD.bottom + 0.1) / 2, -0.05] },
  { size: [0.07, BOARD.bottom + 0.1, 0.07], at: [BOARD.w / 2 - 0.15, (BOARD.bottom + 0.1) / 2, -0.05] },
];

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, b: Board) {
  ctx.fillStyle = "#fbf8f2";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = b.color;
  ctx.fillRect(0, 0, w, 96);
  ctx.fillStyle = "#fff";
  ctx.font = `800 46px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(b.title(), 32, 50);
  ctx.textBaseline = "alphabetic";
  ctx.font = `400 28px ${FONT}`;
  let y = 150;
  for (const line of b.lines()) {
    ctx.fillStyle = b.color;
    ctx.fillRect(32, y - 18, 10, 10);
    ctx.fillStyle = "#1f2430";
    y = wrapText(ctx, line, 56, y, w - 90, 36) + 12;
  }
  const now = b.now();
  if (now) {
    roundRect(ctx, 28, h - 150, w - 56, 90, 12);
    ctx.fillStyle = "#14223b";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 26px ${FONT}`;
    wrapText(ctx, now, 48, h - 112, w - 96, 32);
  }
  ctx.fillStyle = "#6a7080";
  ctx.font = `400 20px ${FONT}`;
  ctx.fillText(L("Click for more · Hypothetical: not UPOU's plan", "クリックで詳しく · 仮想:UPOUの計画ではありません"), 32, h - 22);
}

function StudyBoard({ board, position, rotationY }: { board: Board; position: [number, number, number]; rotationY: number }) {
  const lang = useLang();
  const anchor = useRef<THREE.Mesh>(null);
  const texture = useCanvasTexture(960, 608, (ctx, w, h) => drawBoard(ctx, w, h, board), { hz: 1, anchor, range: 20, deps: [lang] });
  const frame = useMerged(BOARD_FRAME);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Clickable onClick={() => openCard(board.card)}>
        <mesh geometry={frame} material={steel} castShadow />
        <mesh ref={anchor} position={[0, BOARD.bottom + BOARD.h / 2, 0.001]}>
          <planeGeometry args={[BOARD.w, BOARD.h]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </Clickable>
    </group>
  );
}

// --- the station ----------------------------------------------------------------------------

/** Where the lab bench goes in the shed: on the west side, its user facing
 *  west, with its back to the boards outside. */
const BENCH = { x: -W / 2 + 1.2, z: -0.4, rotationY: -Math.PI / 2 };

export function Station(props: StationProps) {
  return (
    <group position={[STATION.x, STATION.y, STATION.z]}>
      <Structure />
      <Sign />
      <group position={[0, 1.95, -D / 2 + 0.16]}>
        <DashboardScreen width={2.8} />
      </group>
      <Console {...props} />
      <Battery />
      {/* Seizora's perovskite lab bench, in Metro Manila's weather. */}
      <group position={[BENCH.x, 0.15, BENCH.z]} rotation={[0, BENCH.rotationY, 0]}>
        <group position={[-LAB.x, 0, -LAB.z]}>
          <LabBench site={SITES.manila} />
        </group>
      </group>
      {BOARDS.map((board, i) => (
        <StudyBoard key={board.card} board={board} position={[-W / 2 - 0.9, 0, -1.7 + i * 1.7]} rotationY={-Math.PI / 2} />
      ))}
    </group>
  );
}

/** What visitors bump into, in world space. */
export function stationObstacles(): Obstacle[] {
  const at = (x: number, z: number, halfX: number, halfZ: number, rotationY = 0): Obstacle => ({ x: STATION.x + x, z: STATION.z + z, halfX, halfZ, rotationY });
  return [
    at(0, -D / 2 + 0.07, W / 2 - 0.1, 0.12),
    at(0, 0.3, CONSOLE.width / 2, CONSOLE.depth / 2),
    at(CABINET.x, CABINET.z, CABINET.w / 2, CABINET.d / 2),
    at(BENCH.x, BENCH.z, LAB.depth / 2, LAB.width / 2),
    ...BOARDS.map((_, i) => at(-W / 2 - 0.9, -1.7 + i * 1.7, 0.08, BOARD.w / 2)),
  ];
}
