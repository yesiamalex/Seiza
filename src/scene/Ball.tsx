import { useMemo } from "react";
import * as THREE from "three";

/** A ball, resting on the floor: its object's position is where it touches. */
export const BALL_RADIUS = 0.11;

/** A beach ball's look: six panels round its middle, one colour and white,
 *  so a throw shows it spinning. Drawn up from the ground it rests on. */
export function Ball({ color = "#e85d4f" }: { color?: string }) {
  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.SphereGeometry(BALL_RADIUS, 24, 16);
    const colors: number[] = [];
    const a = new THREE.Color(color);
    const b = new THREE.Color("#f5f2ea");
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const angle = Math.atan2(position.getZ(i), position.getX(i));
      const panel = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 6);
      const c = Math.abs(position.getY(i)) > BALL_RADIUS * 0.9 ? b : panel % 2 ? a : b;
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.translate(0, BALL_RADIUS, 0);
    return { geometry, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }) };
  }, [color]);
  return <mesh geometry={geometry} material={material} castShadow />;
}
