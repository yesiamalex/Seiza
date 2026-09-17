import { Component, Suspense, type ReactNode } from "react";
import { useGLTF, Sky } from "@react-three/drei";
import type * as THREE from "three";
import { BaseEnvironment } from "./BaseEnvironment";
import type { Seat } from "./layout";

interface SceneProps {
  sceneUrl?: string;
  onFloorDoubleClick?: (point: THREE.Vector3) => void;
  onSit?: (seat: Seat) => void;
  occupiedSeatId?: string | null;
}

function SceneModel({ sceneUrl }: { sceneUrl: string }) {
  const { scene } = useGLTF(sceneUrl);
  return <primitive object={scene} />;
}

/**
 * useGLTF suspends while loading (Suspense's fallback covers that fine)
 * but *throws the error* once the fetch rejects — e.g. no scene.glb at
 * this URL, the common case for a fresh deploy. Suspense alone doesn't
 * catch that; without this boundary a missing/broken deployer scene
 * would crash the whole app instead of just falling back to
 * BaseEnvironment underneath it.
 */
class SceneLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("Deployer-supplied scene failed to load; showing the base environment instead.", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Where the sun is. Shared by the light and the sky so the shadows fall the
// way the sky says they should.
const SUN: [number, number, number] = [16, 22, 12];

/**
 * Lighting is lights and a procedural sky shader, not an image-based
 * environment map. drei's `<Environment preset>` downloads an HDR from a
 * third-party CDN at runtime, which this project shouldn't depend on: a
 * deployment is meant to run entirely on infrastructure the deployer owns,
 * and the room would otherwise go dark whenever that CDN is blocked or
 * offline. `<Sky>` is a shader, so it costs no download.
 *
 * The shadow camera is widened by hand because the default only covers a
 * few metres around the origin — with the built-in world's two rooms, the
 * classroom would have had no shadows at all.
 */
export function Scene({ sceneUrl, onFloorDoubleClick, onSit, occupiedSeatId }: SceneProps) {
  return (
    <>
      <Sky sunPosition={SUN} turbidity={4} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.85} />
      <hemisphereLight args={["#eaf1ff", "#caa87e", 0.9]} />
      <ambientLight intensity={0.32} />
      <directionalLight
        position={SUN}
        intensity={1.25}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <BaseEnvironment onFloorDoubleClick={onFloorDoubleClick} onSit={onSit} occupiedSeatId={occupiedSeatId} />
      {sceneUrl && (
        <SceneLoadBoundary>
          <Suspense fallback={null}>
            <SceneModel sceneUrl={sceneUrl} />
          </Suspense>
        </SceneLoadBoundary>
      )}
    </>
  );
}
