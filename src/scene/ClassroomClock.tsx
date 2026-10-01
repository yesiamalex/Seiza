import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { WorldMaterials } from "./materials";

/**
 * A working wall clock and a tear-off date calendar for the classroom.
 *
 * Both show the viewer's own local time, so everyone sees their own
 * clock, which is what a wall clock in a shared space should do for
 * people in different time zones. Cheap by construction: the clock moves
 * three hand groups, and only when the second changes; the calendar is
 * a small canvas texture redrawn only when the date changes.
 *
 * Both are built facing local +Z; the caller turns them to face the room.
 */

const FACE_RADIUS = 0.24;

export function WallClock({ m }: { m: WorldMaterials }) {
  const hourRef = useRef<THREE.Group>(null);
  const minuteRef = useRef<THREE.Group>(null);
  const secondRef = useRef<THREE.Group>(null);
  const lastSecond = useRef(-1);
  const secondMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.5 }), []);
  useEffect(() => () => secondMaterial.dispose(), [secondMaterial]);

  useFrame(() => {
    const now = new Date();
    const seconds = now.getSeconds();
    if (seconds === lastSecond.current) return;
    lastSecond.current = seconds;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    // Clockwise as seen from the front is a negative turn about +Z.
    if (hourRef.current) hourRef.current.rotation.z = -(hours / 12) * Math.PI * 2;
    if (minuteRef.current) minuteRef.current.rotation.z = -(minutes / 60) * Math.PI * 2;
    if (secondRef.current) secondRef.current.rotation.z = -(seconds / 60) * Math.PI * 2;
  });

  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={m.trim}>
        <cylinderGeometry args={[0.28, 0.28, 0.07, 32]} />
      </mesh>
      <mesh position={[0, 0, 0.036]} material={m.paper}>
        <circleGeometry args={[FACE_RADIUS, 32]} />
      </mesh>
      {/* Hour marks: longer at 12, 3, 6 and 9. */}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const major = i % 3 === 0;
        const r = FACE_RADIUS - (major ? 0.03 : 0.022);
        return (
          <mesh key={i} position={[Math.sin(angle) * r, Math.cos(angle) * r, 0.038]} rotation={[0, 0, -angle]} material={m.beam}>
            <boxGeometry args={[major ? 0.014 : 0.008, major ? 0.04 : 0.024, 0.004]} />
          </mesh>
        );
      })}
      {/* Each hand is a group pivoting at the centre, its bar offset up. */}
      <group ref={hourRef} position={[0, 0, 0.042]}>
        <mesh position={[0, 0.055, 0]} material={m.beam}>
          <boxGeometry args={[0.018, 0.13, 0.006]} />
        </mesh>
      </group>
      <group ref={minuteRef} position={[0, 0, 0.047]}>
        <mesh position={[0, 0.08, 0]} material={m.beam}>
          <boxGeometry args={[0.012, 0.19, 0.006]} />
        </mesh>
      </group>
      <group ref={secondRef} position={[0, 0, 0.052]}>
        <mesh position={[0, 0.07, 0]} material={secondMaterial}>
          <boxGeometry args={[0.005, 0.22, 0.004]} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.056]} rotation={[Math.PI / 2, 0, 0]} material={m.beam}>
        <cylinderGeometry args={[0.012, 0.012, 0.01, 12]} />
      </mesh>
    </group>
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function drawCalendar(ctx: CanvasRenderingContext2D, date: Date) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#fbf8f1";
  ctx.fillRect(0, 0, width, height);
  // Red header band with the month, like a tear-off calendar.
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(0, 0, width, 64);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${MONTHS[date.getMonth()]} ${date.getFullYear()}`, width / 2, 34);
  // Day of the month, large; Sunday in red, as Japanese calendars print it.
  const weekday = date.getDay();
  ctx.fillStyle = weekday === 0 ? "#c0392b" : weekday === 6 ? "#2c5aa0" : "#24201c";
  ctx.font = "bold 132px system-ui, sans-serif";
  ctx.fillText(String(date.getDate()), width / 2, 150);
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.fillText(WEEKDAYS[weekday], width / 2, 228);
}

export function DateCalendar({ m }: { m: WorldMaterials }) {
  const { ctx, texture, material } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 });
    return { ctx, texture, material };
  }, []);
  const shownDate = useRef("");
  const checkTimer = useRef(0);

  useEffect(
    () => () => {
      texture.dispose();
      material.dispose();
    },
    [texture, material]
  );

  useFrame((_, delta) => {
    // Checking once a second is plenty for something that changes daily.
    checkTimer.current -= delta;
    if (checkTimer.current > 0 && shownDate.current) return;
    checkTimer.current = 1;
    const now = new Date();
    const key = now.toDateString();
    if (key === shownDate.current) return;
    shownDate.current = key;
    drawCalendar(ctx, now);
    texture.needsUpdate = true;
  });

  return (
    <group>
      {/* Backing board, then the pad of pages. */}
      <mesh material={m.trim}>
        <boxGeometry args={[0.36, 0.42, 0.02]} />
      </mesh>
      <mesh position={[0, -0.02, 0.012]} material={material}>
        <planeGeometry args={[0.3, 0.3]} />
      </mesh>
      {/* Hanging nail and binding strip. */}
      <mesh position={[0, 0.17, 0.014]} material={m.beam}>
        <boxGeometry args={[0.3, 0.03, 0.008]} />
      </mesh>
    </group>
  );
}
