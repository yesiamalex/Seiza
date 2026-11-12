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

/** "Ground", "Level 2", …, and "Roof" for the top. */
export function floorName(index: number, count: number): string {
  if (index === 0) return "Ground";
  if (index === count - 1 && count > 2) return "Roof";
  return `Level ${index + 1}`;
}

const W = 0.5;
const H = 0.9;
const PX = 256;
const BUTTON_TOP = 92;
const BUTTON_H = 52;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
/** Kiosks further than this aren't drawn. */
const SHOW_WITHIN = 45;

function Kiosk({ building, floors, here, warp }: { building: string; floors: Floor[]; here: number; warp: (at: [number, number, number]) => void }) {
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
    ctx.fillText("LIFT", PX / 2, 34);
    ctx.fillStyle = "#fff";
    ctx.font = `600 17px ${FONT}`;
    const words = building.split(" ");
    let line = "";
    let y = 60;
    for (const w of words) {
      if (ctx.measureText(`${line} ${w}`).width > PX - 20 && line) {
        ctx.fillText(line, PX / 2, y);
        y += 20;
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    ctx.fillText(line, PX / 2, y);
    floors.forEach((_, i) => {
      const top = BUTTON_TOP + (floors.length - 1 - i) * BUTTON_H;
      ctx.fillStyle = i === here ? "#2f8f6f" : "#2f5f9f";
      ctx.beginPath();
      ctx.roundRect(20, top + 4, PX - 40, BUTTON_H - 8, 12);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(i === here ? `${floorName(i, floors.length)} · here` : floorName(i, floors.length), PX / 2, top + BUTTON_H / 2 + 8);
    });
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [building, floors, here, height]);
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
    </group>
  );
}

export function Lifts({ warp }: { warp: (at: [number, number, number]) => void }) {
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
        b.floors.length < 2 ? [] : b.floors.map((_, i) => <Kiosk key={`${id}-${i}`} building={b.name} floors={b.floors} here={i} warp={warp} />)
      )}
    </>
  );
}
