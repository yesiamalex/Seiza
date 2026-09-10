import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useVrmLoader } from "./useVrmLoader";
import type { VRM } from "@pixiv/three-vrm";

export interface VrmAvatarProps {
  url: string;
  position?: [number, number, number];
  rotationY?: number;
  onLoaded?: (vrm: VRM) => void;
}

/**
 * Renders a single VRM avatar. Doesn't know or care whether it's the local
 * player or a remote one — position/rotation are passed in by the caller
 * (see multiplayer/RemotePlayers.tsx for the remote case, App.tsx for the
 * local one).
 */
export function VrmAvatar({ url, position = [0, 0, 0], rotationY = 0, onLoaded }: VrmAvatarProps) {
  const { vrm, error } = useVrmLoader(url || null);
  const notified = useRef(false);

  useEffect(() => {
    notified.current = false;
  }, [url]);

  useEffect(() => {
    if (vrm && !notified.current) {
      notified.current = true;
      onLoaded?.(vrm);
    }
  }, [vrm, onLoaded]);

  useEffect(() => {
    if (error) console.error("VRM load failed:", error);
  }, [error]);

  useFrame((_, delta) => {
    vrm?.update(delta);
  });

  if (!vrm) {
    // No avatar URL, or it failed to load — show a placeholder capsule
    // rather than making the player invisible. Not a real humanoid rig
    // (gestures won't play on it), just enough to see where someone is.
    return (
      <group position={position} rotation={[0, rotationY, 0]}>
        <mesh position={[0, 0.9, 0]}>
          <capsuleGeometry args={[0.3, 1.0, 4, 8]} />
          <meshStandardMaterial color="#999999" />
        </mesh>
      </group>
    );
  }

  return <primitive object={vrm.scene} position={position} rotation={[0, rotationY, 0]} />;
}
