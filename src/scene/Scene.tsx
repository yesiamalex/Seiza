import { Component, Suspense, memo, useEffect, useMemo, type ReactNode } from "react";
import type { LightZone } from "../multiplayer/types";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { BaseEnvironment } from "./BaseEnvironment";
import { Outdoors } from "./Outdoors";
import { ImageSkybox, SunsetSky, SUNSET_HORIZON_COLOR } from "./SunsetSky";
import { deriveObstaclesFromObject, OBSTACLES, setActiveObstacles } from "./layout";
import type { Seat } from "./layout";
import { LightPool } from "./LightPool";
import { SkyDriver } from "../sky/SkyDriver";
import type { SkyConfig } from "../sky/skyState";
import type { RoomSky } from "../multiplayer/types";

interface SceneProps {
  sceneUrl?: string;
  /** True when `sceneUrl` is a model somebody uploaded through the
   *  in-world editor at runtime, rather than the deployment's own
   *  configured `world.json` scene. Only an uploaded one gets collision
   *  derived from it — see SceneModel. */
  environmentIsCustom?: boolean;
  /** Also derive collision boxes from an uploaded environment's own
   *  geometry, on top of the built-in room's (see SceneModel). Off
   *  means the uploaded model's geometry is walked straight through.
   *  Defaults on. */
  environmentCollision?: boolean;
  skyboxUrl?: string | null;
  onFloorDoubleClick?: (point: THREE.Vector3) => void;
  onSit?: (seat: Seat) => void;
  occupiedSeatId?: string | null;
  /** Light-switch state per zone (see BaseEnvironment's switches). */
  lights?: Record<LightZone, boolean>;
  onToggleLight?: (zone: LightZone, on: boolean) => void;
  /** Any value that changes when shadow-casting geometry changes. */
  shadowRefreshKey?: unknown;
  /** The world's sky (world.json `sky`). Absent or "fixed" keeps the
   *  original still sunset; "realtime" moves it (src/sky/). */
  sky?: SkyConfig;
  /** The room's own sky from the edit panel. While set, the sky moves
   *  even if the world's own sky is the still sunset. */
  roomSky?: RoomSky | null;
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

function SceneModel({ sceneUrl, generateCollision }: { sceneUrl: string; generateCollision: boolean }) {
  const { scene } = useGLTF(sceneUrl);

  // A deployer-supplied scene is layered *over* BaseEnvironment rather
  // than replacing it (see the render tree below, and sceneUrl's doc
  // comment in worldConfig.ts), so the built-in room is still standing
  // and its hand-written OBSTACLES are still correct. Geometry brought
  // in by this model, however, has no collision at all: OBSTACLES is a
  // literal list in layout.ts and has never seen it. So the derived
  // boxes are ADDED to the built-in ones, never substituted for them —
  // substituting would delete the collision on walls that are still
  // there, which is a worse bug than the one it fixes.
  //
  // Opt-out rather than mandatory, because derived boxes are
  // approximations from mesh bounding boxes: a deployment whose model
  // is meant to be walked through, or whose derived boxes come out
  // wrong, turns this off and falls back to the built-in room's
  // collision alone.
  //
  // Click-to-move needs no equivalent: useNavMesh already rebuilds from
  // whatever is in the scene graph, so it adapts to this model on its own.
  useEffect(() => {
    if (!generateCollision) return;
    const derived = deriveObstaclesFromObject(scene);
    if (derived.length === 0) {
      console.warn("No collision could be derived from this environment; nothing it adds will be solid.");
      return;
    }
    setActiveObstacles([...OBSTACLES, ...derived]);
    // Reverting is always available and always safe: clearing the
    // uploaded environment from the editor unmounts this component, and
    // this teardown puts the built-in room's own obstacles back exactly
    // as they were. Nothing about the derived set is persisted.
    return () => setActiveObstacles(null);
  }, [scene, generateCollision]);

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
class SceneLoadBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("Deployer-supplied scene failed to load; showing the base environment instead.", error);
  }
  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
  }
}

// Late afternoon: the sun sits low, off the classroom's window wall, so the
// light comes through the windows and rakes across the floor. Shared by the
// light and the sky so the shadows fall the way the sky says they should.
// The lower it sits, the more the atmosphere shader reddens — at the old
// 14° elevation the sky came out pale blue rather than a sunset.
const SUN: [number, number, number] = [-34, 4.6, 14];
/** Haze, so the treeline fades into the sky instead of ending at a hard
 *  edge. It starts well past the building, so nothing indoors is touched. */
const FOG_COLOR = "#e5b489";
const FOG_NEAR = 55;
const FOG_FAR = 210;

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
  environmentIsCustom = false,
  environmentCollision = true,
  skyboxUrl = null,
  onFloorDoubleClick,
  onSit,
  occupiedSeatId,
  lights,
  onToggleLight,
  shadowRefreshKey,
  sky,
  roomSky = null,
}: SceneProps) {
  const moving = sky?.cycle === "realtime" || roomSky !== null;
  // A room sky over a still-sunset world still needs a site to put the sun.
  const skyConfig = useMemo<SkyConfig>(
    () => (sky?.cycle === "realtime" ? sky : { cycle: "realtime", site: sky?.site ?? "manila" }),
    [sky]
  );
  return (
    <>
      <OnDemandShadows refreshKey={shadowRefreshKey} />
      {skyboxUrl ? (
        <SceneLoadBoundary fallback={<SunsetSky sunPosition={SUN} dynamic={moving} />}>
          <Suspense fallback={<SunsetSky sunPosition={SUN} dynamic={moving} />}>
            <ImageSkybox url={skyboxUrl} />
          </Suspense>
        </SceneLoadBoundary>
      ) : (
        <SunsetSky sunPosition={SUN} dynamic={moving} />
      )}
      <fog attach="fog" args={[SUNSET_HORIZON_COLOR, FOG_NEAR, FOG_FAR]} />
      <Outdoors />
      {/* Warm sky above, warmer bounce off the wooden floor below. A big
          share of the light comes from here rather than the sun, which is
          what keeps the shadows soft. */}
      {/* A moving sky brings its own lights, which follow the sun (see
          SkyDriver); the fixed sunset keeps these. */}
      {moving ? (
        <SkyDriver config={skyConfig} room={roomSky} />
      ) : (
        <>
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
        </>
      )}
      {/* The lamps' shared point lights (see LightPool.tsx). */}
      <LightPool />
      <BaseEnvironment
        onFloorDoubleClick={onFloorDoubleClick}
        onSit={onSit}
        occupiedSeatId={occupiedSeatId}
        lights={lights}
        onToggleLight={onToggleLight}
      />
      {sceneUrl && (
        <SceneLoadBoundary>
          <Suspense fallback={null}>
            {/* Collision is derived only for a model uploaded at
                runtime. A deployment's own configured scene is part of
                how that world was authored: whoever set it up also owns
                layout.ts and can put real obstacles there, and deriving
                boxes underneath them would silently double up. */}
            <SceneModel sceneUrl={sceneUrl} generateCollision={environmentIsCustom && environmentCollision} />
          </Suspense>
        </SceneLoadBoundary>
      )}
    </>
  );
});
