// The control room, at the front of the classroom: a live display across
// the chalkboard wall that the desks already face, and a console beside
// the teacher's desk to run the plant and the sky.
import { useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { RoomSky, RoomSkyWeather, WorldStateValue } from "../../../src/multiplayer/types";
import { skyState } from "../../../src/sky/skyState";
import { WEATHER } from "../../../src/sky/weather";
import { PLANT, type Controls } from "../sim/energy";
import type { InfoKey } from "../sim/info";
import { openInfo } from "./InfoCard";
import { FONT, fmt, GlowLines, hhmm, roundRect, standard, useCanvasTexture, useMerged, usePrismX, useSignLamp, wrapText, type BoxSpec } from "./kit";
import { dayTotals, homesNow, KEYS, lessonNow, live, SITE, TOWN_LINE } from "./live";
import { EL_NINO } from "../sim/energy";
import { TOWN } from "../sim/town";

export const COLORS = {
  silicon: "#4f8bff",
  perovskite: "#d0763f",
  wind: "#25b892",
  battery: "#9b72ee",
  grid: "#f0a03c",
  load: "#ffffff",
  panel: "#121a2c",
  text: "#e8ecf6",
  muted: "#8f9bbf",
};

// --- the display ----------------------------------------------------------------

const DISPLAY = { width: 5.4, height: 2.3, x: 0, y: 2.05, z: -23.55 };
const CANVAS_W = 1600;
const CANVAS_H = Math.round((CANVAS_W * DISPLAY.height) / DISPLAY.width);

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  info: InfoKey;
}

function skyLabel(room: RoomSky | null): { text: string; color: string } {
  if (!room || room.mode === "realtime") return { text: "LIVE · real Philippine time", color: "#7CFF9E" };
  if (room.mode === "fixed") return { text: `ROOM SKY · held at ${hhmm(room.hour ?? 12)}`, color: "#ffc35c" };
  return { text: `ROOM SKY · running ${room.scale ?? 1}×`, color: "#ffc35c" };
}

function drawDisplay(ctx: CanvasRenderingContext2D, w: number, h: number, room: RoomSky | null, regions: Region[]) {
  regions.length = 0;
  const s = live.now;
  const c = live.controls;
  ctx.fillStyle = "#0a0f1c";
  ctx.fillRect(0, 0, w, h);

  // Header: what this is and who it serves on the left; the time, the
  // weather, and the scenario (normal year or El Niño) on the right.
  ctx.fillStyle = "#16213a";
  ctx.fillRect(0, 0, w, 74);
  ctx.fillStyle = "#ffcf6e";
  ctx.font = `700 30px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText("☀ SEIZORA CONTROL ROOM", 28, 25);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(`Serving a town in ${SITE.label}: ${TOWN_LINE}`, 28, 56);
  regions.push({ x: 28, y: 42, w: 600, h: 30, info: "load" });
  const tag = skyLabel(room);
  ctx.textAlign = "right";
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = tag.color;
  ctx.fillText(tag.text, w - 28, 25);
  if (s) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `600 26px ${FONT}`;
    const weather = skyState.weatherState ? WEATHER[skyState.weatherState.type].label : "";
    ctx.fillText(`${hhmm(s.hour)} PHT · ${weather} · ${fmt(s.ambient, 0)} °C`, w - 28 - ctx.measureText(tag.text).width - 50, 25);
  }
  const scenario = c.elNino
    ? `EL NIÑO 2026 · clear skies, +${EL_NINO.warmingC} °C · grid alerts 2–4 & 6–9 p.m.`
    : "NORMAL YEAR · weather from the shared schedule";
  ctx.font = `700 19px ${FONT}`;
  ctx.fillStyle = c.elNino ? "#ffb347" : COLORS.muted;
  ctx.fillText(scenario, w - 28, 56);
  regions.push({ x: w - 28 - ctx.measureText(scenario).width, y: 42, w: ctx.measureText(scenario).width, h: 30, info: "elnino" });
  ctx.textAlign = "left";
  if (!s) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 32px ${FONT}`;
    ctx.fillText("Starting the plant…", 40, h / 2);
    return;
  }

  // Power flow: three sources over a bus, the load, battery, and grid under it.
  const node = (x: number, y: number, label: string, mw: number, sub: string, color: string, on: boolean, info: InfoKey) => {
    const nw = 180, nh = 128;
    roundRect(ctx, x, y, nw, nh, 14);
    ctx.fillStyle = on ? COLORS.panel : "#1a1a1f";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = on ? color : "#444";
    ctx.stroke();
    ctx.fillStyle = on ? COLORS.muted : "#666";
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText(label, x + 14, y + 24);
    ctx.fillStyle = on ? color : "#777";
    ctx.font = `700 44px ${FONT}`;
    ctx.fillText(on ? fmt(mw) : "OFF", x + 14, y + 70);
    ctx.font = `500 18px ${FONT}`;
    ctx.fillStyle = on ? COLORS.muted : "#666";
    ctx.fillText(on ? `MW · ${sub}` : "breaker open", x + 14, y + 108);
    regions.push({ x, y, w: nw, h: nh, info });
  };
  const top = 96;
  node(28, top, "SILICON PV", s.siliconMw, `${PLANT.siliconMwp} MWp`, COLORS.silicon, c.silicon, "silicon");
  node(222, top, "PEROVSKITE", s.perovskiteMw, `${fmt(s.perovskiteHealth * 100, 1)}% health`, COLORS.perovskite, c.perovskite, "perovskite");
  node(416, top, "WIND × 2", s.windMw, s.turbinesFeathered ? "feathered" : `${fmt(s.windSpeed, 1)} m/s`, COLORS.wind, c.wind, "wind");
  // The bus.
  ctx.fillStyle = "#2b3550";
  ctx.fillRect(28, top + 146, 568, 14);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText("13.8 kV BUS", 260, top + 186);
  const low = top + 204;
  const { perHomeKw, dark } = homesNow();
  node(28, low, "TOWN LOAD", s.loadMw - s.unservedMw, dark > 0 ? `${dark.toLocaleString("en")} homes dark` : `${TOWN.homes.toLocaleString("en")} homes lit`, COLORS.load, true, "load");
  node(222, low, "BATTERY", s.batteryMw, s.batteryMw > 0.01 ? "discharging" : s.batteryMw < -0.01 ? "charging" : "idle", COLORS.battery, c.battery, "battery");
  node(416, low, "MAIN GRID", s.gridMw, !c.gridConnected ? "island mode" : s.gridAlert ? `ALERT, ${fmt(s.gridLimitMw)} max` : s.gridMw > 0.01 ? "importing" : s.gridMw < -0.01 ? "exporting" : "balanced", s.gridAlert ? "#ff6b6b" : COLORS.grid, c.gridConnected, s.gridAlert ? "elnino" : "grid");
  // Battery charge.
  const socY = low + 146;
  roundRect(ctx, 28, socY, 568, 34, 10);
  ctx.fillStyle = "#1c2236";
  ctx.fill();
  roundRect(ctx, 28, socY, 568 * s.soc, 34, 10);
  ctx.fillStyle = COLORS.battery;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText(`Battery ${fmt(s.soc * 100, 0)}% · ${fmt(s.soc * PLANT.batteryMwh, 1)} of ${PLANT.batteryMwh} MWh · ${c.batteryMode}`, 40, socY + 18);
  regions.push({ x: 28, y: socY, w: 568, h: 34, info: "battery" });

  // Conditions.
  const cx = 630;
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText("CONDITIONS", cx, top + 10);
  const rows: [string, string][] = [
    ["Sun", s.sunElevation > 0 ? `${fmt(s.sunElevation, 0)}° up` : "below horizon"],
    ["Sunlight", `${fmt(s.ghi, 0)} W/m²`],
    ["On panels", `${fmt(s.poa, 0)} W/m²`],
    ["Air / cells", `${fmt(s.ambient, 0)} / ${fmt(s.cellTemp, 0)} °C`],
    ["Wind", `${fmt(s.windSpeed, 1)} m/s`],
    ["Cloud", `${fmt(s.cloud * 100, 0)}%`],
    ["Humidity", `${fmt(s.humidity, 0)}%`],
    ["One home", `${fmt(perHomeKw * 1000, 0)} W now`],
  ];
  rows.forEach(([k, v], i) => {
    const y = top + 50 + i * 42;
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 21px ${FONT}`;
    ctx.fillText(k, cx, y);
    ctx.fillStyle = COLORS.text;
    ctx.font = `600 25px ${FONT}`;
    ctx.fillText(v, cx + 130, y);
  });
  regions.push({ x: cx, y: top, w: 300, h: 50 + 6.5 * 42, info: "sky" });
  regions.push({ x: cx, y: top + 50 + 6.5 * 42, w: 300, h: 42, info: "load" });

  // The last 24 hours, stacked: silicon, perovskite, wind, battery out; load as a line.
  const gx = 960, gy = top, gw = w - gx - 28, gh = 250;
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText("LAST 24 HOURS", gx, gy + 10);
  const plotY = gy + 30, plotH = gh - 30;
  roundRect(ctx, gx, plotY, gw, plotH, 10);
  ctx.fillStyle = "#0f1626";
  ctx.fill();
  const history = live.history;
  const maxMw = PLANT.siliconMwp + PLANT.perovskiteMwp + PLANT.turbines * PLANT.turbineMw;
  if (history.length > 1) {
    const xAt = (i: number) => gx + (i / (history.length - 1)) * gw;
    const yAt = (mw: number) => plotY + plotH - (Math.min(mw, maxMw) / maxMw) * (plotH - 8);
    const layers: [(x: (typeof history)[number]) => number, string][] = [
      [(p) => p.siliconMw, COLORS.silicon],
      [(p) => p.perovskiteMw, COLORS.perovskite],
      [(p) => p.windMw, COLORS.wind],
      [(p) => Math.max(0, p.batteryMw), COLORS.battery],
    ];
    const base = history.map(() => 0);
    for (const [value, color] of layers) {
      ctx.beginPath();
      history.forEach((p, i) => ctx.lineTo(xAt(i), yAt(base[i] + value(p))));
      for (let i = history.length - 1; i >= 0; i--) ctx.lineTo(xAt(i), yAt(base[i]));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      history.forEach((p, i) => (base[i] += value(p)));
    }
    ctx.beginPath();
    history.forEach((p, i) => ctx.lineTo(xAt(i), yAt(p.loadMw)));
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.font = `500 17px ${FONT}`;
  const legend: [string, string][] = [["Silicon", COLORS.silicon], ["Perovskite", COLORS.perovskite], ["Wind", COLORS.wind], ["Battery out", COLORS.battery], ["Load", "#fff"]];
  let lx = gx;
  for (const [label, color] of legend) {
    ctx.fillStyle = color;
    ctx.fillRect(lx, gy + gh + 14, 14, 14);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(label, lx + 20, gy + gh + 22);
    lx += ctx.measureText(label).width + 44;
  }
  regions.push({ x: gx, y: gy, w: gw, h: gh, info: "load" });

  // Totals over those 24 hours.
  const t = dayTotals();
  const tiles: [string, string][] = [
    ["Generated", `${fmt(t.generatedMwh, 1)} MWh`],
    ["From the plant", `${fmt(t.renewableShare * 100, 0)}%`],
    ["CO₂ avoided", `${fmt(t.co2AvoidedT, 1)} t`],
    ["In / out of grid", `${fmt(t.importedMwh, 1)} / ${fmt(t.exportedMwh, 1)}`],
    ["Unserved", `${fmt(t.unservedMwh, 2)} MWh`],
  ];
  const tw = (gw - 4 * 10) / 5;
  tiles.forEach(([k, v], i) => {
    const x = gx + i * (tw + 10), y = gy + gh + 44;
    roundRect(ctx, x, y, tw, 84, 10);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText(k, x + 10, y + 22);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(v, x + 10, y + 58);
  });

  // What's happening, and why.
  const ly = h - 92;
  ctx.fillStyle = "#16213a";
  ctx.fillRect(0, ly, w, 92);
  ctx.fillStyle = "#ffcf6e";
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText("NOW", 28, ly + 30);
  ctx.fillStyle = COLORS.text;
  ctx.font = `500 25px ${FONT}`;
  wrapText(ctx, lessonNow(), 100, ly + 30, w - 140, 32);
}

const DISPLAY_FRAME: BoxSpec = { size: [DISPLAY.width + 0.16, DISPLAY.height + 0.16, 0.06], at: [0, 0, -0.04] };

function Display({ roomSky }: { roomSky: RoomSky | null }) {
  const anchor = useRef<THREE.Mesh>(null);
  const regions = useMemo<Region[]>(() => [], []);
  const texture = useCanvasTexture(CANVAS_W, CANVAS_H, (ctx, w, h) => drawDisplay(ctx, w, h, roomSky, regions), {
    hz: 3,
    anchor,
    range: 28,
    deps: [roomSky],
  });
  // The frame, and a sign lamp's hood over its top edge.
  const frame = useMerged([DISPLAY_FRAME, { size: [DISPLAY.width + 0.2, 0.05, 0.22], at: [0, DISPLAY.height / 2 + 0.13, 0.08] }]);
  const strip = useSignLamp("classroom", []);
  const frameMaterial = useMemo(() => standard("#1b1d22", 0.5, 0.3), []);
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const uv = event.uv;
    if (!uv) return;
    const x = uv.x * CANVAS_W, y = (1 - uv.y) * CANVAS_H;
    const hit = regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (hit) openInfo(hit.info);
  };
  return (
    <group position={[DISPLAY.x, DISPLAY.y, DISPLAY.z]}>
      <mesh geometry={frame} material={frameMaterial} />
      <GlowLines boxes={[DISPLAY_FRAME]} color="#5fd4ff" zone="classroom" thickness={0.025} />
      <mesh position={[0, DISPLAY.height / 2 + 0.1, 0.15]} material={strip}>
        <boxGeometry args={[DISPLAY.width - 0.1, 0.015, 0.04]} />
      </mesh>
      <mesh
        ref={anchor}
        onClick={onClick}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <planeGeometry args={[DISPLAY.width, DISPLAY.height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// --- the console ---------------------------------------------------------------------

/** Where the console stands: the front-right of the classroom, mirroring
 *  the teacher's desk, with its operator facing the display. */
export const CONSOLE = { x: 3.4, z: -21.95, width: 3.0, depth: 0.9, front: 0.8, back: 1.06 };
/** The sloped top: its tilt toward the operator, and its length. */
const TOP_TILT = Math.atan2(CONSOLE.back - CONSOLE.front, CONSOLE.depth);
const TOP_LENGTH = Math.hypot(CONSOLE.depth, CONSOLE.back - CONSOLE.front);
/** The console's outline: round its sloped top, and round its foot. */
const CONSOLE_GLOW: BoxSpec[] = [
  { size: [CONSOLE.width, 0, TOP_LENGTH], at: [0, (CONSOLE.front + CONSOLE.back) / 2, 0], rotation: [TOP_TILT, 0, 0] },
  { size: [CONSOLE.width, 0, CONSOLE.depth], at: [0, 0.015, 0] },
];
const TOP_W = 1536;
const TOP_H = Math.round((TOP_W * TOP_LENGTH) / CONSOLE.width);

type Action = { label: string; active: boolean; run: () => void; tone?: "toggle" };
interface Row {
  title: string;
  buttons: Action[];
}

interface ConsoleProps {
  canEdit: boolean;
  connected: boolean;
  roomSky: RoomSky | null;
  setRoomSky: (sky: RoomSky | null) => void;
  controls: Controls;
  setWorldState: (key: string, value: WorldStateValue) => void;
}

function useRows({ roomSky, setRoomSky, controls, setWorldState }: ConsoleProps): Row[] {
  const weather: RoomSkyWeather = roomSky?.weather ?? "auto";
  const sky = (next: RoomSky) => setRoomSky(next.mode === "realtime" && (next.weather ?? "auto") === "auto" ? null : next);
  const setWeather = (w: RoomSkyWeather) => {
    if (!roomSky || roomSky.mode === "realtime") sky({ mode: "realtime", weather: w });
    else if (roomSky.mode === "running") sky({ ...roomSky, hour: skyState.hour, weather: w });
    else sky({ ...roomSky, weather: w });
  };
  const holdAt = (hour: number) => sky({ mode: "fixed", hour, weather });
  const fixedHour = roomSky?.mode === "fixed" ? roomSky.hour : undefined;
  const toggle = (label: string, key: string, on: boolean): Action => ({ label, active: on, tone: "toggle", run: () => setWorldState(key, !on) });
  return [
    {
      title: "BREAKERS",
      buttons: [
        toggle("Silicon PV", KEYS.silicon, controls.silicon),
        toggle("Perovskite", KEYS.perovskite, controls.perovskite),
        toggle("Wind", KEYS.wind, controls.wind),
        toggle("Battery", KEYS.battery, controls.battery),
        toggle("Grid tie", KEYS.grid, controls.gridConnected),
      ],
    },
    {
      title: "BATTERY · SEAL",
      buttons: [
        ...(["auto", "charge", "hold", "discharge"] as const).map((mode) => ({
          label: mode[0].toUpperCase() + mode.slice(1),
          active: controls.batteryMode === mode,
          run: () => setWorldState(KEYS.batteryMode, mode),
        })),
        ...(["glass", "edge", "none"] as const).map((seal) => ({
          label: seal === "glass" ? "Glass seal" : seal === "edge" ? "Edge seal" : "No seal",
          active: controls.encapsulation === seal,
          run: () => setWorldState(KEYS.seal, seal),
        })),
      ],
    },
    {
      title: "TIME",
      buttons: [
        { label: "Real time", active: !roomSky || roomSky.mode === "realtime", run: () => sky({ mode: "realtime", weather }) },
        ...[6, 10, 12, 14, 18, 0].map((hour) => ({ label: hhmm(hour), active: fixedHour === hour, run: () => holdAt(hour) })),
        { label: "Run 360×", active: roomSky?.mode === "running", run: () => sky({ mode: "running", hour: skyState.hour, scale: 360, weather }) },
      ],
    },
    {
      title: "WEATHER",
      buttons: [
        ...(["auto", "clear", "partly", "overcast", "rain", "typhoon"] as const).map((w) => ({
          label: w === "auto" ? "Auto" : w === "partly" ? "Cloudy" : WEATHER[w].label,
          active: weather === w,
          run: () => setWeather(w),
        })),
        // The El Niño 2026 scenario: its dry, clear skies on the sky
        // everyone sees, and its heat and grid alerts in the plant.
        {
          label: "El Niño",
          active: controls.elNino,
          tone: "toggle" as const,
          run: () => {
            setWorldState(KEYS.elNino, !controls.elNino);
            setWeather(controls.elNino ? "auto" : "clear");
          },
        },
      ],
    },
  ];
}

interface ButtonRect {
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  index: number;
}

function layout(rows: Row[]): ButtonRect[] {
  const rects: ButtonRect[] = [];
  const left = 250, right = TOP_W - 24, rowH = (TOP_H - 70) / rows.length;
  rows.forEach((row, r) => {
    const gap = 10;
    const bw = (right - left - gap * (row.buttons.length - 1)) / row.buttons.length;
    row.buttons.forEach((_, i) => rects.push({ x: left + i * (bw + gap), y: 60 + r * rowH + 8, w: bw, h: rowH - 16, row: r, index: i }));
  });
  return rects;
}

function drawConsole(ctx: CanvasRenderingContext2D, w: number, h: number, rows: Row[], rects: ButtonRect[], enabled: boolean, hovered: number, note: string) {
  ctx.fillStyle = "#1d2433";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffcf6e";
  ctx.font = `700 30px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText("PLANT AND SKY CONSOLE", 24, 32);
  ctx.textAlign = "right";
  ctx.fillStyle = enabled ? "#9fb0d6" : "#ffb347";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(note, w - 24, 32);
  ctx.textAlign = "left";
  const rowH = (h - 70) / rows.length;
  rows.forEach((row, r) => {
    ctx.fillStyle = "#9fb0d6";
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(row.title, 24, 60 + r * rowH + rowH / 2);
  });
  rects.forEach((rect, k) => {
    const action = rows[rect.row].buttons[rect.index];
    const toggleOff = action.tone === "toggle" && !action.active;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fillStyle = toggleOff ? "#5a2228" : action.active ? (action.tone === "toggle" ? "#1f5a3a" : "#2c4f9e") : "#2a3245";
    if (k === hovered && enabled) ctx.fillStyle = action.active ? "#3d6ad0" : "#3a4560";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = toggleOff ? "#ff6b6b" : action.active ? (action.tone === "toggle" ? "#7CFF9E" : "#8fb3ff") : "#3c465e";
    ctx.stroke();
    ctx.fillStyle = enabled ? "#fff" : "#9aa0ad";
    ctx.font = `600 ${rect.w < 140 ? 22 : 25}px ${FONT}`;
    ctx.textAlign = "center";
    const label = action.tone === "toggle" ? `${action.label} ${action.active ? "ON" : "OFF"}` : action.label;
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.textAlign = "left";
  });
}

function Console(props: ConsoleProps) {
  const { canEdit, connected, controls, roomSky } = props;
  const rows = useRows(props);
  const rects = useMemo(() => layout(rows), [rows]);
  const [hovered, setHovered] = useState(-1);
  const enabled = canEdit && connected;
  const note = !connected ? "Not connected" : canEdit ? "Changes are shared with everyone here" : "Only editors can change the plant";
  const texture = useCanvasTexture(TOP_W, TOP_H, (ctx, w, h) => drawConsole(ctx, w, h, rows, rects, enabled, hovered, note), {
    deps: [controls, roomSky, hovered, enabled, note],
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
    <group position={[CONSOLE.x, 0, CONSOLE.z]}>
      <mesh geometry={body} material={bodyMaterial} castShadow />
      <GlowLines boxes={CONSOLE_GLOW} color="#5fd4ff" zone="classroom" thickness={0.022} />
      {/* The top, tilted toward the operator, who stands on the +Z side. */}
      <mesh
        position={[0, (CONSOLE.front + CONSOLE.back) / 2 + 0.004, 0]}
        rotation={[-Math.PI / 2 + TOP_TILT, 0, 0]}
        onClick={(event) => {
          event.stopPropagation();
          const k = pick(event);
          if (k < 0 || !enabled) return;
          const rect = rects[k];
          rows[rect.row].buttons[rect.index].run();
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

export function ControlRoom(props: ConsoleProps) {
  return (
    <>
      <Display roomSky={props.roomSky} />
      <Console {...props} />
    </>
  );
}
