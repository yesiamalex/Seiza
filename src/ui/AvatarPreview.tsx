import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../avatar/VrmAvatar";
import { AvatarAnimator } from "../avatar/AvatarAnimator";
import { pillButtonStyle } from "./styles";

interface AvatarPreviewProps {
  url: string;
  /** CSS height; fluid by default. */
  height?: string;
  /** Hold this expression instead of a neutral face — the designer uses
   *  it so a face can be judged directly rather than by triggering a
   *  gesture that happens to carry one. */
  expression?: string | null;
}

/**
 * Standalone 3D viewport for looking at an avatar before joining or while
 * designing one. Drag to orbit, scroll or pinch to zoom.
 *
 * Plays the same idle animation the avatar will use in the world, so what
 * you see is what others will see. The T-pose toggle is there for
 * inspecting a model's proportions and rig.
 *
 * The camera sits on the -Z side because every avatar is normalized to
 * face -Z (see VrmAvatar.tsx) — this is looking at its front.
 */
export function AvatarPreview({ url, height = "clamp(260px, 46vh, 460px)", expression = null }: AvatarPreviewProps) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [holdTPose, setHoldTPose] = useState(false);

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden", background: "radial-gradient(90% 80% at 50% 30%, #1a1d28 0%, #0b0b0e 70%)" }}>
      <Canvas camera={{ position: [0, 1.15, -2.9], fov: 36 }} shadows dpr={[1, 2]}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[-2, 4, -3]} intensity={1.35} castShadow />
        <directionalLight position={[2, 2, 3]} intensity={0.35} />
        <Suspense fallback={null}>
          <VrmAvatar url={url} onLoaded={setVrm} />
        </Suspense>
        <AvatarAnimator vrm={vrm} holdTPose={holdTPose} expression={expression} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.7, 40]} />
          <meshStandardMaterial color="#20232e" roughness={1} />
        </mesh>
        <OrbitControls target={[0, 0.9, 0]} enablePan={false} minDistance={1.1} maxDistance={6} maxPolarAngle={Math.PI * 0.62} />
      </Canvas>
      <button
        type="button"
        onClick={() => setHoldTPose((v) => !v)}
        style={{ ...pillButtonStyle, position: "absolute", right: 10, bottom: 10, padding: "6px 12px", fontSize: 12 }}
        aria-pressed={holdTPose}
      >
        {holdTPose ? "Show idle" : "T-pose"}
      </button>
      <span style={{ position: "absolute", left: 12, bottom: 14, fontSize: 11, opacity: 0.55, pointerEvents: "none" }}>
        Drag to rotate
      </span>
    </div>
  );
}
