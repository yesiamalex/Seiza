import { Component, Suspense, type ReactNode } from "react";
import { useGLTF, Environment } from "@react-three/drei";
import { BaseEnvironment } from "./BaseEnvironment";

interface SceneProps {
  sceneUrl?: string;
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

export function Scene({ sceneUrl }: SceneProps) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
      <Environment preset="sunset" />
      <BaseEnvironment />
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
