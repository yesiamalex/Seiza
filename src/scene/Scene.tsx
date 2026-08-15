import { Suspense } from "react";
import { useGLTF, Environment } from "@react-three/drei";

interface SceneProps {
  sceneUrl: string;
}

function SceneModel({ sceneUrl }: SceneProps) {
  const { scene } = useGLTF(sceneUrl);
  return <primitive object={scene} />;
}

export function Scene({ sceneUrl }: SceneProps) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
      <Environment preset="sunset" />
      <Suspense fallback={<PlaceholderFloor />}>
        <SceneModel sceneUrl={sceneUrl} />
      </Suspense>
    </>
  );
}

function PlaceholderFloor() {
  // Visible on first run with no scene.glb supplied — see
  // public/worlds/default/README.md. Deliberate, not a bug: a silent blank
  // screen is a worse first-run experience than an obvious placeholder.
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#444444" wireframe />
    </mesh>
  );
}
