// Four portals, one per group, to each group's own space in FrameVR. They
// stand in a row between the path from the garden and the covered court,
// each a ring in its group's colour around a slowly turning swirl. Click
// one and a card asks before opening the group's FrameVR room in a new tab
// (Hud.tsx), so nobody leaves by accident and the room stays open behind.
//
// Cheap: per portal, one ring and one disc; the swirl is the disc turning
// and its glow pulsing, done by changing two numbers a frame.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Obstacle } from "../../../src/scene/layout";
import { registerGazeTarget } from "../../../src/xr/hud/gaze";
import { GROUP_COLORS, type Group } from "./collection";
import { canvasTexture, Clickable, FONT, noRaycast, useDrawDistance } from "./kit";
import { Y } from "./plan";
import { openPiece } from "./viewer";

export const PORTALS: { group: Group; url: string; z: number }[] = [
  { group: "A", url: "https://framevr.io/meijixup-a", z: 51.0 },
  { group: "B", url: "https://framevr.io/meijixup-b", z: 48.4 },
  { group: "C", url: "https://framevr.io/meijixup-c", z: 45.8 },
  { group: "D", url: "https://framevr.io/meijixup-d", z: 43.2 },
];
const X = 3.6;
const RADIUS = 0.85;
const CENTRE_Y = Y + 1.15;

export const PORTAL_BY_GROUP = Object.fromEntries(PORTALS.map((p) => [p.group, p])) as Record<Group, (typeof PORTALS)[number]>;

function swirlTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    // Spiral arms, so the turning shows.
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 6;
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      for (let t = 0; t < 1; t += 0.02) {
        const a = arm * ((Math.PI * 2) / 3) + t * 5;
        const r = 10 + t * (w / 2 - 16);
        const x = w / 2 + Math.cos(a) * r;
        const y = h / 2 + Math.sin(a) * r;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function labelTexture(group: Group) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "rgba(20,22,30,0.82)";
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 24);
    ctx.fill();
    ctx.fillStyle = GROUP_COLORS[group];
    ctx.textAlign = "center";
    ctx.font = `800 46px ${FONT}`;
    ctx.fillText(`GROUP ${group}`, w / 2, 58);
    ctx.fillStyle = "#fff";
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText("Portal to FrameVR", w / 2, 100);
  });
}

function Portal({ group, z }: { group: Group; z: number }) {
  const disc = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(GROUP_COLORS[group]), [group]);
  const m = useMemo(
    () => ({
      ring: new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      disc: new THREE.MeshBasicMaterial({ map: swirlTexture(), color, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      label: new THREE.MeshBasicMaterial({ map: labelTexture(group), transparent: true, toneMapped: false }),
      post: new THREE.MeshLambertMaterial({ color: "#3a3f48" }),
    }),
    [color, group]
  );
  useEffect(
    () => () => {
      for (const material of Object.values(m)) {
        (material as THREE.MeshBasicMaterial).map?.dispose();
        material.dispose();
      }
    },
    [m]
  );
  const phase = useMemo(() => "ABCD".indexOf(group) * 1.3, [group]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (disc.current) disc.current.rotation.z = -t * 0.8;
    m.disc.opacity = 0.75 + 0.2 * Math.sin(t * 1.7);
  });
  const open = () => openPiece(`portal:${group}`);
  useEffect(() => {
    const mesh = disc.current;
    if (!mesh) return;
    return registerGazeTarget(mesh, { keyAt: () => group, select: open });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);
  return (
    // Facing west, toward the path from the garden.
    <group position={[X, CENTRE_Y, z]} rotation={[0, -Math.PI / 2, 0]}>
      <Clickable onClick={open}>
        <mesh ref={disc} material={m.disc} userData={{ navIgnore: true }}>
          <circleGeometry args={[RADIUS * 0.94, 40]} />
        </mesh>
      </Clickable>
      <mesh material={m.ring} raycast={noRaycast} userData={{ navIgnore: true }}>
        <torusGeometry args={[RADIUS, 0.07, 8, 48]} />
      </mesh>
      <mesh position={[0, -RADIUS - 0.18, 0]} material={m.post} raycast={noRaycast} userData={{ navIgnore: true }}>
        <boxGeometry args={[0.5, 0.36, 0.3]} />
      </mesh>
      <mesh position={[0, RADIUS + 0.32, 0]} material={m.label} raycast={noRaycast} userData={{ navIgnore: true }}>
        <planeGeometry args={[1.3, 0.32]} />
      </mesh>
    </group>
  );
}

export function Portals() {
  const area = useRef<THREE.Group>(null);
  useDrawDistance(area, [X, 47], 60);
  return (
    <group ref={area}>
      {PORTALS.map((p) => (
        <Portal key={p.group} group={p.group} z={p.z} />
      ))}
    </group>
  );
}

export function portalObstacles(): Obstacle[] {
  return PORTALS.map((p) => ({ x: X, z: p.z, halfX: 0.2, halfZ: RADIUS, rotationY: 0 }));
}
