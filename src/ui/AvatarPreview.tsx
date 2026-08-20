import { Suspense, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../avatar/VrmAvatar";
import { applyTPose } from "../avatar/applyTPose";

interface AvatarPreviewProps {
  url: string;
}

/** Small standalone 3D viewport (not the main scene) for previewing an
 *  avatar before joining — drag to rotate, scroll to zoom, via drei's
 *  OrbitControls. Reuses the same VrmAvatar/useVrmLoader path the main
 *  app uses, so what you see here is what you'll look like once you join.
 *
 *  Explicitly T-posed on load (see applyTPose.ts) — a raw VRM's default
 *  bone rotations vary file to file, which makes side by side comparison
 *  misleading. The main multiplayer scene deliberately does *not* do
 *  this (see useProceduralGait.ts) — an idle standing pose there should
 *  look natural, not T-posed; this is specific to the inspection
 *  context here. */
export function AvatarPreview({ url }: AvatarPreviewProps) {
  const handleLoaded = useCallback((vrm: VRM) => {
    applyTPose(vrm);
  }, []);

  return (
    <div
      style={{
        width: "100%",
        // Fluid but capped both ways: noticeably bigger than before on a
        // normal screen, without taking over a short/landscape mobile
        // viewport.
        height: "clamp(280px, 46vh, 460px)",
        borderRadius: 10,
        overflow: "hidden",
        background: "#0b0b0e",
      }}
    >
      <Canvas camera={{ position: [0, 1.0, 3], fov: 40 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} />
        <Suspense fallback={null}>
          <VrmAvatar url={url} position={[0, 0, 0]} onLoaded={handleLoaded} />
        </Suspense>
        <OrbitControls target={[0, 1, 0]} enablePan={false} minDistance={1.2} maxDistance={6} />
      </Canvas>
    </div>
  );
}
