import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PooledLight } from "./LightPool";
import { skyState } from "../sky/skyState";

/** Brightness of the sunlight through a window wall at the original still
 *  sunset. */
const WINDOW_SUN_INTENSITY = 5;
/** How far west the original sunset sits (the x of its direction), so that
 *  sun gives exactly WINDOW_SUN_INTENSITY. */
const ORIGINAL_SUN_WEST = 0.917;

/**
 * The glow of a low sun coming in through a room's two window walls: the
 * west one in the afternoon, the east one in the morning. Each side is one
 * pooled point light, so a room's pair costs nothing extra to draw (see
 * LightPool.tsx). With the moving sky it follows the sun: strongest when
 * the sun is low on that side, and gone at night, under cloud, and with
 * the sun high overhead. A fixed-sky world keeps the original sunset glow
 * from the west.
 *
 * Put each light about 4m in from its wall. At about 1m, inverse-square
 * falloff blew the plaster beside it out to white.
 */
export function WindowSun({ west, east }: { west: [number, number, number]; east: [number, number, number] }) {
  const westIntensity = useRef(WINDOW_SUN_INTENSITY);
  const eastIntensity = useRef(0);
  useFrame(() => {
    if (!skyState.active) return;
    const { x } = skyState.sunDirection;
    // A high sun lights only a strip by the wall, not the room.
    const low = 1 - THREE.MathUtils.smoothstep(skyState.elevation, 30, 65);
    const k = WINDOW_SUN_INTENSITY * skyState.sunVisible * low;
    westIntensity.current = k * Math.min(1, Math.max(0, -x) / ORIGINAL_SUN_WEST);
    eastIntensity.current = k * Math.min(1, Math.max(0, x) / ORIGINAL_SUN_WEST);
  });
  return (
    <>
      <PooledLight position={west} intensityRef={westIntensity} distance={19} color="#ffbe86" />
      <PooledLight position={east} intensityRef={eastIntensity} distance={19} color="#ffd9a8" />
    </>
  );
}
