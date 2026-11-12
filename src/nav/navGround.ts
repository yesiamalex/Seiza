import * as THREE from "three";
import type { Ground } from "../scene/layout";

/**
 * A model world's ground (layout.ts's Ground), from a navigation mesh baked
 * offline from the world's model (for SeiOU, worlds/seiou/scripts/
 * build-campus.mjs) and loaded here: walkers move along its surface, so
 * they climb stairs and ramps, go through doorways, and stop at walls and
 * drops, with the floor height of whatever level they're on.
 *
 * recast-navigation is imported only when a world asks for this, so other
 * worlds never download its WebAssembly.
 */

type Query = {
  findClosestPoint: (
    position: { x: number; y: number; z: number },
    options?: { halfExtents?: { x: number; y: number; z: number } }
  ) => { success: boolean; polyRef: number; point: { x: number; y: number; z: number } };
  moveAlongSurface: (
    startRef: number,
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number }
  ) => { success: boolean; resultPosition: { x: number; y: number; z: number }; visited: number[] };
  getPolyHeight: (ref: number, position: { x: number; y: number; z: number }) => { success: boolean; height: number };
  raycast: (startRef: number, start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }) => { success: boolean; t: number };
  computePath: (
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    options?: { halfExtents?: { x: number; y: number; z: number } }
  ) => { success: boolean; path?: { x: number; y: number; z: number }[] };
};

/** A move further than this in one step is a teleport, not a walk. */
const TELEPORT = 2.5;
/** How far off the surface a spot may be and still be found, by axis. */
const FIND_NEAR = { x: 1.5, y: 2.5, z: 1.5 };
/** Searching wider, for a spawn or a warp that missed the surface. */
const FIND_WIDE = { x: 6, y: 12, z: 6 };

export class NavGround implements Ground {
  private ref = 0;
  private readonly at = { x: 0, y: 0, z: 0 };
  private readonly scratch = { x: 0, y: 0, z: 0 };

  constructor(readonly query: Query) {}

  place(x: number, y: number, z: number): number {
    for (const extents of [FIND_NEAR, FIND_WIDE]) {
      const found = this.query.findClosestPoint({ x, y, z }, { halfExtents: extents });
      if (found.success && found.polyRef) {
        this.ref = found.polyRef;
        Object.assign(this.at, found.point);
        return found.point.y;
      }
    }
    // Nowhere to stand nearby: stay where asked, on its height.
    this.ref = 0;
    Object.assign(this.at, { x, y, z });
    return y;
  }

  constrain(position: THREE.Vector3): number {
    if (!this.ref || Math.hypot(position.x - this.at.x, position.z - this.at.z) > TELEPORT) {
      // A jump nothing placed (a warp goes through place() first): search
      // from the level the walker was last on, or, at the start, from the
      // feet, which are below the eyes (the camera's position).
      this.place(position.x, this.ref ? this.at.y : position.y - 1.6, position.z);
      position.x = this.at.x;
      position.z = this.at.z;
      return this.at.y;
    }
    this.scratch.x = position.x;
    this.scratch.y = this.at.y;
    this.scratch.z = position.z;
    const moved = this.query.moveAlongSurface(this.ref, this.at, this.scratch);
    if (moved.success && moved.visited.length > 0) {
      this.ref = moved.visited[moved.visited.length - 1];
      this.at.x = moved.resultPosition.x;
      this.at.z = moved.resultPosition.z;
      const h = this.query.getPolyHeight(this.ref, moved.resultPosition);
      this.at.y = h.success ? h.height : moved.resultPosition.y;
    }
    position.x = this.at.x;
    position.z = this.at.z;
    return this.at.y;
  }

  floorAt(x: number, z: number): number {
    if (Math.abs(x - this.at.x) < 1e-3 && Math.abs(z - this.at.z) < 1e-3) return this.at.y;
    const found = this.query.findClosestPoint({ x, y: this.at.y, z }, { halfExtents: FIND_NEAR });
    return found.success && found.polyRef ? found.point.y : this.at.y;
  }

  isWalkable(x: number, z: number): boolean {
    const found = this.query.findClosestPoint({ x, y: this.at.y, z }, { halfExtents: { x: 0.2, y: 1, z: 0.2 } });
    return found.success && !!found.polyRef && Math.hypot(found.point.x - x, found.point.z - z) < 0.05;
  }

  /** How far a third-person camera keeps from a wall it would go through. */
  private static readonly VIEW_MARGIN = 0.35;

  limitView(from: THREE.Vector3, camera: THREE.Vector3): void {
    if (!this.ref) return;
    // Along the floor the walker is on: walls show as the navmesh's edges.
    this.scratch.x = camera.x;
    this.scratch.y = this.at.y;
    this.scratch.z = camera.z;
    const hit = this.query.raycast(this.ref, this.at, this.scratch);
    if (!hit.success || !(hit.t < 1)) return;
    const dx = camera.x - from.x;
    const dz = camera.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-3) return;
    const keep = Math.max(0, hit.t * length - NavGround.VIEW_MARGIN) / length;
    camera.x = from.x + dx * keep;
    camera.z = from.z + dz * keep;
  }

  /** A walking route, for click-to-walk and for guides. */
  path(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const result = this.query.computePath({ x: from.x, y: from.y, z: from.z }, { x: to.x, y: to.y, z: to.z }, { halfExtents: FIND_NEAR });
    if (!result.success || !result.path?.length) return null;
    return result.path.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  }
}

let loaded: Promise<NavGround | null> | null = null;
let loadedUrl = "";

/** Loads a baked navmesh (recast-navigation's exportNavMesh format) once. */
export function loadNavGround(url: string): Promise<NavGround | null> {
  if (loaded && loadedUrl === url) return loaded;
  loadedUrl = url;
  loaded = (async () => {
    try {
      const [{ init, importNavMesh, NavMeshQuery }, response] = await Promise.all([import("recast-navigation"), fetch(url)]);
      if (!response.ok) throw new Error(`${response.status} for ${url}`);
      await init();
      const { navMesh } = importNavMesh(new Uint8Array(await response.arrayBuffer()));
      return new NavGround(new NavMeshQuery(navMesh) as unknown as Query);
    } catch (error) {
      console.warn("[seiza] Could not load the world's navigation mesh; walking is unconstrained.", error);
      return null;
    }
  })();
  return loaded;
}
