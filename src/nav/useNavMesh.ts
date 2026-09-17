import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Runtime navmesh for click-to-move, built from whatever environment
 * geometry is actually in the scene — the procedural BaseEnvironment, or
 * an uploaded/configured glTF world, or a swapped-in room environment.
 * That's the reason for generating at runtime rather than shipping a
 * pre-authored navmesh file: the default room is generated in code, and
 * an editor can replace the whole environment live, so there's no
 * authoring step where a navmesh could have been baked.
 *
 * Everything here is best-effort and additive: if the WASM module fails
 * to load, generation fails, or a query finds no route, findPath returns
 * null and the caller falls back to the previous straight-line walk. A
 * broken navmesh degrades movement to what it was before, never worse.
 *
 * recast-navigation is dynamically imported so its WASM payload isn't
 * part of the initial bundle — most sessions never click the floor.
 */

// Voxel sizes in world units; walkable* are expressed in voxels.
const NAV_CONFIG = {
  cs: 0.2,
  ch: 0.2,
  // ~0.4 units of clearance, so paths keep an avatar's width off walls
  // instead of clipping the corner of every doorway.
  walkableRadius: 2,
  walkableHeight: 8,
  walkableClimb: 1,
};

type NavMeshQueryLike = {
  computePath: (
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number }
  ) => { success: boolean; path?: Array<{ x: number; y: number; z: number }> };
};

export interface NavMeshApi {
  /** Waypoints from `from` to `to`, or null when there's no navmesh or
   *  no route — caller should fall back to walking straight. */
  findPath: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3[] | null;
  /** Rebuild from the current contents of `sourceRef`. Safe to call
   *  repeatedly; calls collapse while one is in flight. */
  rebuild: () => void;
}

export function useNavMesh(sourceRef: React.MutableRefObject<THREE.Object3D | null>): NavMeshApi {
  const queryRef = useRef<NavMeshQueryLike | null>(null);
  const buildingRef = useRef(false);
  const rebuildTimerRef = useRef<number | null>(null);

  const build = useCallback(async () => {
    const root = sourceRef.current;
    if (!root || buildingRef.current) return;
    buildingRef.current = true;
    try {
      const [{ init, NavMeshQuery }, { threeToSoloNavMesh }] = await Promise.all([
        import("recast-navigation"),
        import("@recast-navigation/three"),
      ]);
      await init();

      const meshes: THREE.Mesh[] = [];
      root.traverse((child) => {
        // Skinned meshes are avatars — they move, and baking them in
        // would carve player-shaped holes into the walkable area.
        // `navIgnore` opts out interaction helpers, like the click-to-sit
        // pads floating above each chair, which would otherwise show up as
        // little walkable platforms in mid-air.
        if (
          child instanceof THREE.Mesh &&
          !(child instanceof THREE.SkinnedMesh) &&
          child.visible &&
          child.userData.navIgnore !== true
        ) {
          meshes.push(child);
        }
      });
      if (meshes.length === 0) return;

      const { success, navMesh } = threeToSoloNavMesh(meshes, NAV_CONFIG);
      queryRef.current = success && navMesh ? (new NavMeshQuery(navMesh) as unknown as NavMeshQueryLike) : null;
    } catch (error) {
      // Non-fatal by design — click-to-move just stays straight-line.
      console.warn("Navmesh generation failed; click-to-move will walk in a straight line.", error);
      queryRef.current = null;
    } finally {
      buildingRef.current = false;
    }
  }, [sourceRef]);

  const rebuild = useCallback(() => {
    if (rebuildTimerRef.current !== null) window.clearTimeout(rebuildTimerRef.current);
    // Debounced: an environment swap triggers this while the glTF is
    // still streaming in, and object edits can arrive in bursts.
    rebuildTimerRef.current = window.setTimeout(() => {
      rebuildTimerRef.current = null;
      void build();
    }, 600);
  }, [build]);

  useEffect(() => {
    return () => {
      if (rebuildTimerRef.current !== null) window.clearTimeout(rebuildTimerRef.current);
    };
  }, []);

  const findPath = useCallback((from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null => {
    const query = queryRef.current;
    if (!query) return null;
    try {
      const result = query.computePath({ x: from.x, y: from.y, z: from.z }, { x: to.x, y: to.y, z: to.z });
      if (!result.success || !result.path || result.path.length === 0) return null;
      return result.path.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    } catch (error) {
      console.warn("Navmesh path query failed; walking straight instead.", error);
      return null;
    }
  }, []);

  return { findPath, rebuild };
}
