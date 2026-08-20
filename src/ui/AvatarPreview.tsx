import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { VrmAvatar } from "../avatar/VrmAvatar";

interface AvatarPreviewProps {
  url: string;
}

/** Small standalone 3D viewport (not the main scene) for previewing an
 *  avatar before joining — drag to rotate, scroll to zoom, via drei's
 *  OrbitControls. Reuses the same VrmAvatar/useVrmLoader path the main
 *  app uses, so what you see here is what you'll look like once you join. */
export function AvatarPreview({ url }: AvatarPreviewProps) {
  return (
    <div style={{ width: "100%", height: 260, borderRadius: 10, overflow: "hidden", background: "#0b0b0e" }}>
      <Canvas camera={{ position: [0, 1.1, 2.4], fov: 35 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} />
        <Suspense fallback={null}>
          <VrmAvatar url={url} position={[0, 0, 0]} />
        </Suspense>
        <OrbitControls target={[0, 1, 0]} enablePan={false} minDistance={1} maxDistance={5} />
      </Canvas>
    </div>
  );
}
