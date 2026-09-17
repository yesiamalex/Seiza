import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

interface NameTagProps {
  name: string;
  position: [number, number, number];
  speaking: boolean;
}

const HEAD_CLEARANCE = 1.9;
const RING_RADIUS_INNER = 0.35;
const RING_RADIUS_OUTER = 0.45;

/** Floating, always-camera-facing label + a pulsing ring at the feet
 *  while the player's mic is active (reuses the voice level data already
 *  computed in useRealtimeMedia — see App.tsx/RemotePlayers.tsx wiring). */
export function NameTag({ name, position, speaking }: NameTagProps) {
  return (
    <>
      <Billboard position={[position[0], position[1] + HEAD_CLEARANCE, position[2]]}>
        <Text
          fontSize={0.16}
          color={speaking ? "#7CFF9E" : "white"}
          outlineWidth={0.012}
          outlineColor="black"
          anchorX="center"
          anchorY="bottom"
        >
          {name}
        </Text>
      </Billboard>
      <SpeakingRing position={position} active={speaking} />
    </>
  );
}

function SpeakingRing({ position, active }: { position: [number, number, number]; active: boolean }) {
  const ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const target = active ? 1 : 0;
    // Smoothly grow/shrink rather than popping, and fully collapse (not
    // just fade) when inactive so it doesn't sit there as a flat disc.
    const current = ref.current.scale.x;
    const next = current + (target - current) * 0.2;
    const pulse = active ? 0.92 + Math.sin(clock.elapsedTime * 6) * 0.08 : 1;
    ref.current.scale.setScalar(Math.max(0.0001, next * pulse));
  });

  return (
    <mesh ref={ref} position={[position[0], position[1] + 0.05, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[RING_RADIUS_INNER, RING_RADIUS_OUTER, 32]} />
      <meshBasicMaterial color="#7CFF9E" transparent opacity={0.85} />
    </mesh>
  );
}
