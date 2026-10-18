// Gaze selection, for headsets with nothing to point with: a phone in a
// Cardboard-style viewer, or any session with no controllers and no hand
// tracking. Look at a button, then tap the screen (or press the viewer's
// button), or just keep looking for a moment while a ring fills.
//
// Done here rather than through the XR library's gaze pointer because phone
// viewers report a tap in different ways, some as an input that exists only
// for the instant of the tap, which a pointer created on its arrival
// misses. Listening to the session's own `select` events catches every
// kind, and dwelling needs no input at all, for viewers with no button.
//
// A panel opts in with registerGazeTarget(mesh, { keyAt, select }): keyAt
// says which button (if any) is at a point on the panel, so the dwell ring
// restarts when the gaze moves to another button, and select presses it.
import * as THREE from "three";

export interface GazeTarget {
  /** Which button is at this point of the panel (uv 0..1, v up), or null. */
  keyAt: (uv: THREE.Vector2) => string | null;
  /** Presses the button at this point. */
  select: (uv: THREE.Vector2) => void;
}

const targets = new Map<THREE.Object3D, GazeTarget>();

/** Makes a mesh selectable by gaze. Returns the unregister function. */
export function registerGazeTarget(mesh: THREE.Object3D, target: GazeTarget): () => void {
  targets.set(mesh, target);
  return () => {
    if (targets.get(mesh) === target) targets.delete(mesh);
  };
}

/** Whether the session has nothing tracked to point with (set by XrHud). */
export const gazeMode = { active: false };

/** Seconds of steady looking that press a button. */
export const DWELL_SECONDS = 1.1;

export interface GazeHit {
  mesh: THREE.Object3D;
  target: GazeTarget;
  key: string | null;
  uv: THREE.Vector2;
  point: THREE.Vector3;
}

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();

/** What the centre of the view rests on, nearest first, or null. */
export function gazeHit(head: THREE.Vector3, headQuaternion: THREE.Quaternion): GazeHit | null {
  direction.set(0, 0, -1).applyQuaternion(headQuaternion);
  raycaster.set(head, direction);
  raycaster.far = 6;
  const meshes: THREE.Object3D[] = [];
  for (const mesh of targets.keys()) {
    let visible = true;
    for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (!o.visible) visible = false;
    if (visible) meshes.push(mesh);
  }
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit?.uv) return null;
  const target = targets.get(hit.object)!;
  const uv = hit.uv.clone();
  return { mesh: hit.object, target, key: target.keyAt(uv), uv, point: hit.point.clone() };
}

/**
 * A yaw that only follows the head once it has turned well away, then
 * glides after it: where to put something you need to be able to look at
 * (with gaze, the thing at the centre of view is what you select, so
 * anything that turns with your head can never be selected).
 */
export class LazyYaw {
  private yaw: number | null = null;
  private catchingUp = false;
  constructor(
    private readonly start = 0.6,
    private readonly stop = 0.08
  ) {}
  update(headYaw: number, delta: number): number {
    if (this.yaw === null) this.yaw = headYaw;
    const apart = Math.atan2(Math.sin(headYaw - this.yaw), Math.cos(headYaw - this.yaw));
    if (Math.abs(apart) > this.start) this.catchingUp = true;
    if (this.catchingUp) {
      this.yaw += apart * (1 - Math.exp(-4 * delta));
      if (Math.abs(apart) < this.stop) this.catchingUp = false;
    }
    return this.yaw;
  }
}
