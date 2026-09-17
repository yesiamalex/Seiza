import { Component, Suspense, memo, useEffect, type ReactNode } from "react";
import { useGLTF, Sky } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { BaseEnvironment } from "./BaseEnvironment";
import type { Seat } from "./layout";

interface SceneProps {
  sceneUrl?: string;
  onFloorDoubleClick?: (point: THREE.Vector3) => void;
  onSit?: (seat: Seat) => void;
  occupiedSeatId?: string | null;
  /** Any value that changes when shadow-casting geometry changes. */
  shadowRefreshKey?: unknown;
}

/** How often the frozen shadow map refreshes anyway, to pick up geometry
 *  that arrived late (a streamed glTF, a newly joined player). */
const SHADOW_HEARTBEAT_MS = 2000;

/**
 * The built-in world doesn't move, so re-rendering the whole scene into the
 * shadow map on every single frame was pure waste — and it was the most
 * expensive thing on the page after the avatars. This renders shadows on
 * demand instead: once at startup, whenever shadow-casting geometry
 * changes, and on a slow heartbeat for anything that loads late.
 *
 * Avatars don't cast shadows (see VrmAvatar.tsx), so nothing that moves
 * continuously depends on this being per-frame.
 */
function OnDemandShadows({ refreshKey }: { refreshKey?: unknown }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    const heartbeat = window.setInterval(() => {
      gl.shadowMap.needsUpdate = true;
    }, SHADOW_HEARTBEAT_MS);
    return () => {
      window.clearInterval(heartbeat);
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, refreshKey]);

  return null;
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

// Late afternoon: the sun sits low, off the classroom's window wall, so the
// light comes through the windows and rakes across the floor. Shared by the
// light and the sky so the shadows fall the way the sky says they should.
const SUN: [number, number, number] = [-34, 9, 14];

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
/**
 * Memoized, and worth being careful about: the built-in world is a few
 * hundred meshes, and without this every unrelated state change in App —
 * playing a gesture, a voice level tick five times a second — re-rendered
 * all of them. Keep every prop here stable (see App.tsx's callbacks).
 */
export const Scene = memo(function Scene({
  sceneUrl,
  onFloorDoubleClick,
  onSit,
  occupiedSeatId,
  shadowRefreshKey,
}: SceneProps) {
  return (
    <>
      <OnDemandShadows refreshKey={shadowRefreshKey} />
      {/* Higher turbidity and rayleigh is what turns the sky orange.
          `distance` (drei's Sky defaults to 1000) has to stay inside the
          Canvas camera's far plane (App.tsx sets it to 260, tightened to
          stop nearby surfaces z-fighting) or the sky dome sits beyond the
          far clip and never renders at all — which is what made the newly
          opened windows look out at nothing, rather than the sunset. */}
      <Sky sunPosition={SUN} distance={200} turbidity={9} rayleigh={2.6} mieCoefficient={0.012} mieDirectionalG={0.92} />
      {/* Warm sky above, warmer bounce off the wooden floor below. A big
          share of the light comes from here rather than the sun, which is
          what keeps the shadows soft. */}
      <hemisphereLight args={["#ffe3c2", "#d9b48a", 1.05]} />
      <ambientLight intensity={0.42} color="#ffeada" />
      <directionalLight
        position={SUN}
        intensity={0.95}
        color="#ffcd96"
        castShadow
        // 1024 is plenty for a room this size and a quarter of the fill
        // cost of 2048 on the frames where shadows do get re-rendered.
        shadow-mapSize={[1024, 1024]}
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
});
