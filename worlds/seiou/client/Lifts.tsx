// Lift kiosks: one on every floor of every building, listing that
// building's floors; click (or point and pull the trigger, or look and tap
// in a phone viewer) to go to one. The model doesn't include every
// staircase, so without these some floors couldn't be reached at all.
//
// The floors come from world/models/floors.json, which the build script
// (scripts/build-campus.mjs) works out from the navmesh: each building's
// levels, a spot to stand on each, and whether it can be walked to. So they
// follow the model when it's rebuilt.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { registerGazeTarget } from "../../../src/xr/hud/gaze";
import { LightSwitch } from "../../../src/scene/LightSwitch";
import type { WorldStateValue } from "../../../src/multiplayer/types";
import { isOn, useLightZones } from "./RoomLights";
import { L, useLang } from "../../../src/i18n/lang";
import { wrapLines } from "../../../src/ui/wrapLines";

/** Each building's name in Japanese, by its id in floors.json. */
const BUILDING_JA: Record<string, string> = {
  main: "本館",
  tlh: "ティーチング・アンド・ラーニング・ハブ",
  ccdl: "CCDL",
  ar: "アカデミック・レジデンス",
  wcmpb: "ワールドクラス・マルチメディア制作棟",
};

export interface Floor {
  at: [number, number, number];
  walk: boolean;
}
export type FloorPlan = Record<string, { name: string; floors: Floor[] }>;

let plan: Promise<FloorPlan | null> | null = null;
/** The buildings' floors (loaded once). */
export function loadFloors(): Promise<FloorPlan | null> {
  plan ??= fetch("/worlds/seiou/models/floors.json")
    .then((r) => (r.ok ? (r.json() as Promise<FloorPlan>) : null))
    .catch(() => null);
  return plan;
}

/** "Ground", "Level 2", …, and "Roof" for the top (in Japanese, 1階,
 *  2階, …, 屋上: Japan counts the ground floor as the first). */
export function floorName(index: number, count: number): string {
  if (index === 0) return L("Ground", "1階");
  if (index === count - 1 && count > 2) return L("Roof", "屋上");
  return L(`Level ${index + 1}`, `${index + 1}階`);
}

const W = 0.5;
const H = 0.9;
const PX = 256;
const BUTTON_TOP = 92;
const BUTTON_H = 52;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
/** Kiosks further than this aren't drawn. */
const SHOW_WITHIN = 45;

/** A floor's light switch, beside its kiosk (see RoomLights.tsx). */
interface KioskLight {
  on: boolean;
  onToggle?: (on: boolean) => void;
}

function Kiosk({ building, floors, here, warp, light }: { building: string; floors: Floor[]; here: number; warp: (at: [number, number, number]) => void; light?: KioskLight }) {
  const lang = useLang();
  const face = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const height = BUTTON_TOP + floors.length * BUTTON_H + 20;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = PX;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1b2430";
    ctx.fillRect(0, 0, PX, height);
    ctx.fillStyle = "#e8c37a";
    ctx.font = `700 24px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(L("LIFT", "エレベーター"), PX / 2, 34);
    ctx.fillStyle = "#fff";
    ctx.font = `600 17px ${FONT}`;
    let y = 60;
    for (const line of wrapLines(ctx, building, PX - 20).slice(0, 2)) {
      ctx.fillText(line, PX / 2, y);
      y += 20;
    }
    floors.forEach((_, i) => {
      const top = BUTTON_TOP + (floors.length - 1 - i) * BUTTON_H;
      ctx.fillStyle = i === here ? "#2f8f6f" : "#2f5f9f";
      ctx.beginPath();
      ctx.roundRect(20, top + 4, PX - 40, BUTTON_H - 8, 12);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(i === here ? L(`${floorName(i, floors.length)} · here`, `${floorName(i, floors.length)}・現在地`) : floorName(i, floors.length), PX / 2, top + BUTTON_H / 2 + 8);
    });
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [building, floors, here, height, lang]);
  useEffect(() => () => texture.dispose(), [texture]);

  const floorAt = (uv: THREE.Vector2) => {
    const y = (1 - uv.y) * height;
    const row = Math.floor((y - BUTTON_TOP) / BUTTON_H);
    if (row < 0 || row >= floors.length) return null;
    const index = floors.length - 1 - row;
    return index === here ? null : index;
  };
  const go = (uv?: THREE.Vector2) => {
    const index = uv ? floorAt(uv) : null;
    if (index !== null) warp(floors[index].at);
  };
  useEffect(() => {
    const m = face.current;
    if (!m) return;
    return registerGazeTarget(m, { keyAt: (uv) => (floorAt(uv) === null ? null : String(floorAt(uv))), select: (uv) => go(uv) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floors, here]);

  // Beside the spot you arrive at, facing it; drawn only when near.
  const at = floors[here].at;
  useFrame(({ camera }) => {
    if (group.current) group.current.visible = Math.hypot(camera.position.x - at[0], camera.position.z - at[2]) < SHOW_WITHIN;
  });
  const panelH = (W * height) / PX;
  return (
    <group ref={group} position={[at[0] + 1.1, at[1], at[2]]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 0.55, -0.03]} userData={{ navIgnore: true }}>
        <boxGeometry args={[W + 0.08, 1.1, 0.05]} />
        <meshLambertMaterial color="#3a4250" />
      </mesh>
      <mesh
        ref={face}
        position={[0, 1.1 + panelH / 2 - H / 2, 0]}
        userData={{ navIgnore: true }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          go(event.uv ?? undefined);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[W, panelH]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {light && (
        // A post beside the kiosk, with the floor's light switch on it.
        <group position={[0.5, 0, 0]}>
          <mesh position={[0, 0.62, -0.02]} userData={{ navIgnore: true }}>
            <boxGeometry args={[0.07, 1.24, 0.05]} />
            <meshLambertMaterial color="#3a4250" />
          </mesh>
          <group position={[0, 1.3, 0]}>
            <LightSwitch on={light.on} onToggle={light.onToggle} />
          </group>
        </group>
      )}
    </group>
  );
}

export function Lifts({
  warp,
  worldState = {},
  setWorldState,
}: {
  warp: (at: [number, number, number]) => void;
  /** The room's world state and its setter, for the floors' light switches. */
  worldState?: Record<string, WorldStateValue>;
  setWorldState?: (key: string, value: WorldStateValue) => void;
}) {
  const zones = useLightZones();
  useLang();
  const [floors, setFloors] = useState<FloorPlan | null>(null);
  useEffect(() => {
    let live = true;
    void loadFloors().then((f) => live && setFloors(f));
    return () => {
      live = false;
    };
  }, []);
  if (!floors) return null;
  return (
    <>
      {Object.entries(floors).flatMap(([id, b]) =>
        b.floors.length < 2 ? [] : b.floors.map((_, i) => {
          const zone = zones.find((z) => z.building === id && z.floor === i);
          const on = zone ? isOn(worldState, zone.key) : true;
          return (
            <Kiosk
              key={`${id}-${i}`}
              building={L(b.name, BUILDING_JA[id] ?? b.name)}
              floors={b.floors}
              here={i}
              warp={warp}
              light={zone ? { on, onToggle: setWorldState && ((next) => setWorldState(zone.key, next)) } : undefined}
            />
          );
        })
      )}
    </>
  );
}
