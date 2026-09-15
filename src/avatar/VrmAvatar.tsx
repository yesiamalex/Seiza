import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useVrmLoader } from "./useVrmLoader";
import type { VRM } from "@pixiv/three-vrm";

export interface VrmAvatarProps {
  url: string;
  position?: [number, number, number];
  rotationY?: number;
  onLoaded?: (vrm: VRM | null) => void;
}

// Beyond this much movement in one frame, treat it as a teleport and let
// the spring bones start fresh instead of whipping across the gap.
const TELEPORT_DISTANCE = 1.5;
// Spring-bone integration explodes on long frames (tab switch, hitch).
const MAX_SPRING_DELTA = 1 / 30;

/**
 * Renders one avatar — local, remote, or preview — from any avatar URL
 * useVrmLoader understands (a .vrm file or a designer spec).
 *
 * Orientation: VRM 0.x models face -Z and VRM 1.0 models face +Z (the two
 * specs convert from Unity's axes differently). Seiza's convention is that
 * an avatar at rotationY 0 faces -Z — the direction the camera looks by
 * default — so VRM 1.0 models (including designer avatars) get an extra
 * half turn here. Without it, every VRM 1.0 upload walked backwards.
 *
 * Spring bones (hair, skirts): three-vrm simulates them in world space, so
 * any instant jump in the model's world position flings them. Two guards:
 * the update delta is capped, and a teleport resets the simulation.
 */
export function VrmAvatar({ url, position = [0, 0, 0], rotationY = 0, onLoaded }: VrmAvatarProps) {
  const { vrm, error } = useVrmLoader(url || null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const lastWorld = useRef<THREE.Vector3 | null>(null);
  const scratch = useRef(new THREE.Vector3());

  useEffect(() => {
    onLoadedRef.current?.(vrm);
    lastWorld.current = null;
  }, [vrm]);

  useEffect(() => {
    if (error) console.error("VRM load failed:", error);
  }, [error]);

  useFrame((_, delta) => {
    if (!vrm) return;
    const world = vrm.scene.getWorldPosition(scratch.current);
    if (lastWorld.current && world.distanceTo(lastWorld.current) > TELEPORT_DISTANCE) {
      vrm.springBoneManager?.reset();
    }
    lastWorld.current = (lastWorld.current ?? new THREE.Vector3()).copy(world);
    vrm.update(Math.min(delta, MAX_SPRING_DELTA));
  });

  if (!vrm) {
    // No avatar URL, or it failed to load — a neutral stand-in rather than
    // an invisible player.
    return (
      <group position={position} rotation={[0, rotationY, 0]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.28, 1.0, 6, 12]} />
          <meshStandardMaterial color="#9aa0aa" roughness={0.7} />
        </mesh>
      </group>
    );
  }

  const facingOffset = vrm.meta.metaVersion === "1" ? Math.PI : 0;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={vrm.scene} rotation={[0, facingOffset, 0]} />
    </group>
  );
}
