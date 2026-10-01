import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

/**
 * A wall light switch: a plate, a rocker that tilts to show which way it's
 * set, and a small locator lamp that glows when the lights are off. Japanese
 * switches commonly have one (a "hotaru" switch), and it is what makes a
 * switch findable in a dark room.
 *
 * Built facing local +Z; the caller turns it to face the room. Clicking
 * anywhere on it, including a generous invisible margin so it's easy to
 * hit on a phone, flips it. The switch itself holds no state: the room
 * server does, so everyone sees the same lights.
 */
export function LightSwitch({ on, onToggle }: { on: boolean; onToggle?: (on: boolean) => void }) {
  const materials = useMemo(
    () => ({
      plate: new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.55 }),
      rocker: new THREE.MeshStandardMaterial({ color: "#fbf9f4", roughness: 0.45 }),
      locator: new THREE.MeshStandardMaterial({ color: "#6fd18a", emissive: new THREE.Color("#4cff7a"), emissiveIntensity: 0 }),
      hitArea: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    }),
    []
  );
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);
  materials.locator.emissiveIntensity = on ? 0 : 1.6;

  const toggle = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onToggle?.(!on);
  };
  const pointer = (cursor: string) => () => {
    if (onToggle) document.body.style.cursor = cursor;
  };

  return (
    // A little larger than a real switch: at true size it was a speck from
    // across the room, and fiddly to tap on a phone.
    <group scale={1.6} onClick={toggle} onPointerOver={pointer("pointer")} onPointerOut={pointer("")}>
      <mesh material={materials.plate} castShadow>
        <boxGeometry args={[0.09, 0.14, 0.012]} />
      </mesh>
      {/* Tilted top-in when on, bottom-in when off, like a real rocker. */}
      <mesh position={[0, 0.008, 0.01]} rotation={[on ? -0.22 : 0.22, 0, 0]} material={materials.rocker}>
        <boxGeometry args={[0.042, 0.065, 0.014]} />
      </mesh>
      <mesh position={[0, -0.045, 0.008]} material={materials.locator}>
        <boxGeometry args={[0.012, 0.006, 0.004]} />
      </mesh>
      <mesh material={materials.hitArea}>
        <boxGeometry args={[0.28, 0.32, 0.06]} />
      </mesh>
    </group>
  );
}
