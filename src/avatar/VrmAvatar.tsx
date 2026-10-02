import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useVrmLoader } from "./useVrmLoader";
import { stirPond } from "../scene/pondActivity";
import { extendHairCollision } from "./springColliders";
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
const SHADOW_RADIUS = 0.34;

/**
 * Soft blob shadow under every avatar.
 *
 * Avatars deliberately don't cast real shadows: a skinned mesh has to be
 * re-rendered into the shadow map every frame it moves, which is exactly the
 * per-frame cost the rest of the world avoids (see Scene.tsx). A single
 * textured disc costs one draw call, always points the right way, and does
 * the job a contact shadow actually does — telling you where someone's feet
 * are.
 */
let shadowTexture: THREE.Texture | null | undefined;
function getShadowTexture(): THREE.Texture | null {
  if (shadowTexture !== undefined) return shadowTexture;
  if (typeof document === "undefined") return (shadowTexture = null);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return (shadowTexture = null);
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, "rgba(0,0,0,0.55)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.28)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(canvas);
  return shadowTexture;
}
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
    // Once per model: lets long hair collide with the hips and thighs, not
    // just the torso, so crouching and kneeling don't pass it through the
    // legs (see springColliders.ts).
    if (vrm) extendHairCollision(vrm);
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
    // Wading ripples (pondActivity.ts): a distance check, and only does
    // anything for an avatar actually standing in the pond.
    stirPond(vrm.scene.uuid, world.x, world.z);
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
  const shadow = getShadowTexture();
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={vrm.scene} rotation={[0, facingOffset, 0]} />
      {shadow && (
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={{ navIgnore: true }} renderOrder={-1}>
          <circleGeometry args={[SHADOW_RADIUS, 20]} />
          <meshBasicMaterial map={shadow} transparent depthWrite={false} opacity={0.75} />
        </mesh>
      )}
    </group>
  );
}
