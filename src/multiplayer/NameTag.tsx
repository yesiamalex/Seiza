import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";

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
        {/* A speaker glyph over the head, in addition to the ring at the
            feet. The ring is easy to miss in a crowd or when someone is
            standing behind furniture; the thing you actually look at to
            find out who is talking is the name, so the indicator belongs
            next to it. Drawn from two meshes rather than an icon texture
            to avoid shipping an image and a loader for nine triangles. */}
        <SpeakerGlyph active={speaking} />
      </Billboard>
      <SpeakingRing position={position} active={speaking} />
    </>
  );
}

/** Small speaker cone + two arcs, sitting just above the name. */
function SpeakerGlyph({ active }: { active: boolean }) {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const target = active ? 1 : 0;
    const next = ref.current.scale.x + (target - ref.current.scale.x) * 0.2;
    // Collapse rather than fade, so an inactive glyph occupies nothing
    // and never shows as a speck at distance.
    ref.current.scale.setScalar(Math.max(0.0001, next));
    ref.current.visible = next > 0.02;
    // The arcs breathe while active, which reads as sound without
    // needing a second colour.
    if (active) {
      const pulse = 0.88 + Math.sin(clock.elapsedTime * 7) * 0.12;
      ref.current.children.forEach((child, i) => {
        if (i > 0) child.scale.setScalar(pulse);
      });
    }
  });

  return (
    <group ref={ref} position={[0, 0.3, 0]} scale={0.0001}>
      {/* Cone body */}
      <mesh position={[-0.035, 0, 0]}>
        <boxGeometry args={[0.05, 0.055, 0.001]} />
        <meshBasicMaterial color="#7CFF9E" />
      </mesh>
      {/* Two sound arcs */}
      <mesh position={[0.012, 0, 0]}>
        <ringGeometry args={[0.035, 0.046, 16, 1, -Math.PI / 3, (Math.PI * 2) / 3]} />
        <meshBasicMaterial color="#7CFF9E" transparent opacity={0.95} />
      </mesh>
      <mesh position={[0.012, 0, 0]}>
        <ringGeometry args={[0.058, 0.069, 16, 1, -Math.PI / 3, (Math.PI * 2) / 3]} />
        <meshBasicMaterial color="#7CFF9E" transparent opacity={0.6} />
      </mesh>
    </group>
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
