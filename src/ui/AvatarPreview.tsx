import { Suspense, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../avatar/VrmAvatar";

interface AvatarPreviewProps {
  url: string;
}

/** Small standalone 3D viewport (not the main scene) for previewing an
 *  avatar before joining — drag to rotate, scroll to zoom, via drei's
 *  OrbitControls. Reuses the same VrmAvatar/useVrmLoader path the main
 *  app uses, so what you see here is what you'll look like once you join.
 *
 *  Explicitly normalized to a clean T-pose on load — a raw VRM's default
 *  bone rotations vary file to file (some export in a relaxed A-pose,
 *  some with quirks from whatever tool made them), which makes side by
 *  side comparison misleading. The main multiplayer scene deliberately
 *  does *not* do this (see useProceduralGait.ts) — an idle standing pose
 *  there should look natural, not T-posed; this reset is specific to the
 *  inspection context here. */
export function AvatarPreview({ url }: AvatarPreviewProps) {
  const handleLoaded = useCallback((vrm: VRM) => {
    vrm.humanoid?.resetNormalizedPose();
  }, []);

  return (
    <div style={{ width: "100%", height: 260, borderRadius: 10, overflow: "hidden", background: "#0b0b0e" }}>
      <Canvas camera={{ position: [0, 1.1, 2.4], fov: 35 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} />
        <Suspense fallback={null}>
          <VrmAvatar url={url} position={[0, 0, 0]} onLoaded={handleLoaded} />
        </Suspense>
        <OrbitControls target={[0, 1, 0]} enablePan={false} minDistance={1} maxDistance={5} />
      </Canvas>
    </div>
  );
}
