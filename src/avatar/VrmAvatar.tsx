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

  useFrame((_, delta) => {
    vrm?.update(delta);
  });

  if (error) {
    // Deliberately visible in the console rather than failing silently —
    // very likely on first run, see public/worlds/default/README.md.
    console.error("VRM load failed:", error);
    return null;
  }

  if (!vrm) return null;

  return <primitive object={vrm.scene} position={position} rotation={[0, rotationY, 0]} />;
}
