import type * as THREE from "three";
import type { Ground } from "./layout";
import { MOUNTAIN, mountainHeight } from "./mountainShape";

/**
 * Mt. Makiling in a model world (world.json `mountain: {x, z, y}`): the
 * world's own ground (its navmesh) with the mountain's beside it, so a
 * walker held at the navmesh's edge, heading onto the mountain, carries on
 * up it, and one coming down onto the world's ground goes back onto the
 * navmesh. No rebake: the mountain's floor is its heights (mountainShape).
 */
const TELEPORT = 2.5;
/** Within the mountain's square, a little inside its edges. */
const HALF = 0.49;
const onMountainSquare = (x: number, z: number) => Math.abs(x - MOUNTAIN.x) < MOUNTAIN.size * HALF && Math.abs(z - MOUNTAIN.z) < MOUNTAIN.size * HALF;
const clampToSquare = (v: number, c: number) => Math.max(c - MOUNTAIN.size * HALF + 0.01, Math.min(c + MOUNTAIN.size * HALF - 0.01, v));
const mountainFloor = (x: number, z: number) => MOUNTAIN.y + mountainHeight(x, z);

export class MountainGround implements Ground {
  /** On the mountain (its floor), not the world's ground. */
  private on = false;
  private lastX = 0;
  private lastZ = 0;

  constructor(readonly inner: Ground) {}

  private stand(position: THREE.Vector3, x: number, z: number): number {
    this.on = true;
    position.x = this.lastX = x;
    position.z = this.lastZ = z;
    return mountainFloor(x, z);
  }

  constrain(position: THREE.Vector3): number {
    if (this.on) {
      // A warp, not a walk: back to the world's ground.
      if (Math.hypot(position.x - this.lastX, position.z - this.lastZ) > TELEPORT) {
        this.on = false;
        return this.inner.constrain(position);
      }
      // Down at its foot, where the world's ground is: onto that again.
      if (mountainHeight(position.x, position.z) < 0.05 && this.inner.isWalkable(position.x, position.z)) {
        this.on = false;
        return this.inner.place(position.x, MOUNTAIN.y + 0.5, position.z);
      }
      return this.stand(position, clampToSquare(position.x, MOUNTAIN.x), clampToSquare(position.z, MOUNTAIN.z));
    }
    const wantX = position.x;
    const wantZ = position.z;
    const y = this.inner.constrain(position);
    const held = Math.hypot(wantX - position.x, wantZ - position.z);
    // Held at the world's edge, stepping onto the mountain at about its level.
    if (held > 1e-3 && held < TELEPORT && onMountainSquare(wantX, wantZ) && Math.abs(y - mountainFloor(wantX, wantZ)) < 0.6 && !this.inner.isWalkable(wantX, wantZ))
      return this.stand(position, wantX, wantZ);
    return y;
  }

  floorAt(x: number, z: number): number {
    if (onMountainSquare(x, z) && (this.on || mountainHeight(x, z) > 0.05)) return mountainFloor(x, z);
    return this.inner.floorAt(x, z);
  }

  isWalkable(x: number, z: number): boolean {
    return onMountainSquare(x, z) || this.inner.isWalkable(x, z);
  }

  place(x: number, y: number, z: number): number {
    if (onMountainSquare(x, z) && (mountainHeight(x, z) > 0.05 || !this.inner.isWalkable(x, z))) {
      this.on = true;
      this.lastX = x;
      this.lastZ = z;
      return mountainFloor(x, z);
    }
    this.on = false;
    return this.inner.place(x, y, z);
  }

  limitView(from: THREE.Vector3, camera: THREE.Vector3): void {
    if (!this.on) this.inner.limitView?.(from, camera);
  }

  covered(x: number, y: number, z: number): boolean {
    return !this.on && !!this.inner.covered?.(x, y, z);
  }
}
