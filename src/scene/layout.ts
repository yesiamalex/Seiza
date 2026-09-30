import * as THREE from "three";

/**
 * The floor plan of the built-in world, in one place, because three
 * different systems have to agree on it: the geometry (BaseEnvironment.tsx),
 * where a player is allowed to walk (PlayerRig.tsx), and where a player can
 * sit (the seats below).
 *
 * Two rooms joined by a corridor:
 *
 *        z = 16  ┌──────────────────────┐
 *                │        HALL          │   benches around a tatami
 *        z = -4  └────────┐   ┌─────────┘   platform, reception desk
 *                         │ C │               C = corridor with lockers
 *        z = -10 ┌────────┘   └─────────┐
 *                │      CLASSROOM       │   desks facing a chalkboard
 *        z = -24 └──────────────────────┘
 *
 * Everything is generated from code, so there are still no bundled 3D
 * assets to license (see THIRD_PARTY_ASSETS.md).
 */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const HALL: Rect = { minX: -12, maxX: 12, minZ: -4, maxZ: 16 };
/** Bounded garden beyond the hall entrance. */
export const OUTDOOR: Rect = { minX: -10, maxX: 10, minZ: 16, maxZ: 38 };
export const CORRIDOR: Rect = { minX: -2.6, maxX: 2.6, minZ: -10, maxZ: -4 };
export const CLASSROOM: Rect = { minX: -9, maxX: 9, minZ: -24, maxZ: -10 };
export const ROOMS: Rect[] = [HALL, OUTDOOR, CORRIDOR, CLASSROOM];

export const WALL_HEIGHT = 4.2;
export const WALL_THICKNESS = 0.3;
export const CLASSROOM_WALL_HEIGHT = 3.4;
/** Width of the openings between hall, corridor and classroom. */
export const DOOR_HALF_WIDTH = CORRIDOR.maxX;

/** Chair and bench seat height. The sit clip drops the hips by the same
 *  amount (see scripts/generate-motions.mjs), so feet reach the floor. */
export const SEAT_HEIGHT = 0.45;
/** Eye height while seated, for the first-person camera. */
export const SEATED_EYE_HEIGHT = 1.15;

/** Keeps a walker off the walls and out of the furniture. */
const PLAYER_RADIUS = 0.4;
/** The third-person camera is allowed closer to a wall than the player is,
 *  but still not through it. */
export const CAMERA_RADIUS = 0.25;

export interface Seat {
  id: string;
  /** Floor position the avatar sits at. */
  position: [number, number, number];
  /** Yaw the avatar faces while seated. */
  rotationY: number;
  label: string;
}

const inset = (rect: Rect, by: number): Rect => ({
  minX: rect.minX + by,
  maxX: rect.maxX - by,
  minZ: rect.minZ + by,
  maxZ: rect.maxZ - by,
});

const contains = (rect: Rect, x: number, z: number) => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;

// Insetting every room by the player's radius would leave a gap at each
// doorway, and the clamp would then push a player back and forth across it
// instead of letting them through. The corridor is therefore stretched past
// both openings by enough to overlap the rooms it joins, while the rooms
// themselves stay fully inset so nobody can stand inside a wall.
const CORRIDOR_MOUTH = WALL_THICKNESS / 2 + PLAYER_RADIUS;
const WALKABLE: Rect[] = [
  inset(HALL, PLAYER_RADIUS),
  {
    ...inset(OUTDOOR, PLAYER_RADIUS),
    // Overlap the hall's inset at the entrance so movement can cross the
    // threshold instead of being snapped back by the rectangular clamp.
    minZ: HALL.maxZ - PLAYER_RADIUS,
  },
  {
    ...inset(CORRIDOR, PLAYER_RADIUS),
    minZ: CORRIDOR.minZ - CORRIDOR_MOUTH,
    maxZ: CORRIDOR.maxZ + CORRIDOR_MOUTH,
  },
  inset(CLASSROOM, PLAYER_RADIUS),
];

/**
 * Pulls a position back into the walkable floor plan. Replaces the old
 * circular bounds clamp: with two rooms, a circle would either cut off the
 * corners or let players walk out through the walls. The union of the room
 * rectangles also means the only way between the rooms is the corridor.
 */
export function clampToRooms(position: THREE.Vector3, margin = 0): void {
  for (const room of WALKABLE) {
    if (contains(inset(room, -margin), position.x, position.z)) return;
  }
  let best: { x: number; z: number; distance: number } | null = null;
  for (const room of WALKABLE) {
    const bounds = inset(room, -margin);
    const x = THREE.MathUtils.clamp(position.x, bounds.minX, bounds.maxX);
    const z = THREE.MathUtils.clamp(position.z, bounds.minZ, bounds.maxZ);
    const distance = (x - position.x) ** 2 + (z - position.z) ** 2;
    if (!best || distance < best.distance) best = { x, z, distance };
  }
  if (best) {
    position.x = best.x;
    position.z = best.z;
  }
}

// --- seating ---------------------------------------------------------------

/** Benches face the tatami platform at the centre of the hall. */
export const HALL_CENTRE: [number, number] = [0, 5];
export const BENCH_COUNT = 6;
export const BENCH_RADIUS = 6.4;
export const BENCH_LENGTH = 2.2;

export interface BenchPlacement {
  position: [number, number, number];
  rotationY: number;
}

export const BENCHES: BenchPlacement[] = Array.from({ length: BENCH_COUNT }, (_, i) => {
  // Three-quarter ring, open toward the hall entrance so the room reads as
  // "come in and sit down" rather than a closed circle.
  const angle = Math.PI * 0.32 + (i / (BENCH_COUNT - 1)) * Math.PI * 1.36;
  const x = HALL_CENTRE[0] + Math.cos(angle) * BENCH_RADIUS;
  const z = HALL_CENTRE[1] + Math.sin(angle) * BENCH_RADIUS;
  // An avatar faces -Z at yaw 0, so facing the middle of the hall means
  // pointing -(toward centre): atan2 of the vector from the centre outward.
  return { position: [x, 0, z], rotationY: Math.atan2(x - HALL_CENTRE[0], z - HALL_CENTRE[1]) };
});

/** Benches in the garden, also registered as real seats below. */
export const OUTDOOR_BENCHES: BenchPlacement[] = [
  { position: [-5.2, 0, 23.5], rotationY: -0.16 },
  { position: [5.2, 0, 23.5], rotationY: 0.16 },
];

export const CLASSROOM_ROWS = 3;
export const CLASSROOM_COLUMNS = 4;
// Wide enough that a person fits between the rows: a desk and its chair
// together are about 1.2m deep, and a walker needs 0.8m of clear floor.
export const DESK_SPACING_X = 2.4;
export const DESK_SPACING_Z = 2.35;
export const CLASSROOM_FRONT_Z = -22.4; // chalkboard wall side
export const BOARD_Z = CLASSROOM.minZ + WALL_THICKNESS / 2;

export interface DeskPlacement {
  /** Desk position; the chair sits `CHAIR_OFFSET` behind it. */
  position: [number, number, number];
  row: number;
  column: number;
}

export const CHAIR_OFFSET = 0.78;

export const DESKS: DeskPlacement[] = Array.from({ length: CLASSROOM_ROWS * CLASSROOM_COLUMNS }, (_, i) => {
  const row = Math.floor(i / CLASSROOM_COLUMNS);
  const column = i % CLASSROOM_COLUMNS;
  const x = (column - (CLASSROOM_COLUMNS - 1) / 2) * DESK_SPACING_X;
  const z = CLASSROOM_FRONT_Z + 2.6 + row * DESK_SPACING_Z;
  return { position: [x, 0, z], row, column };
});

// Far enough from the board that the chair behind it doesn't intersect the
// chalk tray.
export const TEACHER_DESK: [number, number, number] = [-3.4, 0, CLASSROOM_FRONT_Z + 0.2];

/**
 * How far forward of the seat's middle an avatar actually sits. Sitting a
 * body exactly on the centre of the seat buries its back in the backrest,
 * which is the clipping you see on any chair that isn't a stool. Wider than
 * a bare anatomical fit needs, because clothing (a skirt, a long coat) has
 * no cloth simulation and doesn't fold the way a real seated person's does —
 * it stays roughly rigid, so it needs the extra clearance from the backrest
 * that a real garment would find for itself.
 */
const SEAT_FORWARD_OFFSET = 0.17;

/** Unit vector an avatar at this yaw faces (avatars face -Z at yaw 0). */
export function facingVector(rotationY: number): [number, number] {
  return [-Math.sin(rotationY), -Math.cos(rotationY)];
}

const seatAt = (x: number, z: number, rotationY: number): [number, number, number] => {
  const [fx, fz] = facingVector(rotationY);
  return [x + fx * SEAT_FORWARD_OFFSET, 0, z + fz * SEAT_FORWARD_OFFSET];
};

/**
 * The seat belonging to a chair a player placed themselves in Edit Mode.
 *
 * Built exactly the way the room's own seats are — forward of the chair's
 * centre by SEAT_FORWARD_OFFSET, for the same backrest-clearance reason —
 * with one addition. The sitting pose is grounded to SEAT_HEIGHT above
 * whatever floor the seat reports (see the grounding pass in
 * AvatarAnimator.tsx), so a chair that has been scaled up has to report a
 * proportionally higher floor, or its occupant sits in mid-air below the
 * cushion. The id is the object's, so occupancy highlighting works without
 * a second registry.
 */
export function placedChairSeat(
  id: string,
  position: [number, number, number],
  rotationY: number,
  scale = 1
): Seat {
  const [fx, fz] = facingVector(rotationY);
  return {
    id,
    position: [
      position[0] + fx * SEAT_FORWARD_OFFSET * scale,
      position[1] + SEAT_HEIGHT * (scale - 1),
      position[2] + fz * SEAT_FORWARD_OFFSET * scale,
    ],
    rotationY,
    label: "Chair",
  };
}

/**
 * Every seat a player can sit on. Avatars face -Z at yaw 0 (see
 * VrmAvatar.tsx), so a seat facing the -Z end of the classroom has yaw 0.
 */
export const SEATS: Seat[] = [
  ...BENCHES.flatMap((bench, i) => {
    const alongX = Math.cos(bench.rotationY);
    const alongZ = -Math.sin(bench.rotationY);
    return [-1, 1].map((side) => ({
      id: `bench-${i}-${side > 0 ? "r" : "l"}`,
      position: seatAt(
        bench.position[0] + alongX * side * BENCH_LENGTH * 0.25,
        bench.position[2] + alongZ * side * BENCH_LENGTH * 0.25,
        bench.rotationY
      ),
      rotationY: bench.rotationY,
      label: "Bench",
    }));
  }),
  ...OUTDOOR_BENCHES.flatMap((bench, i) => {
    const alongX = Math.cos(bench.rotationY);
    const alongZ = -Math.sin(bench.rotationY);
    return [-1, 1].map((side) => ({
      id: `outdoor-bench-${i}-${side > 0 ? "r" : "l"}`,
      position: seatAt(
        bench.position[0] + alongX * side * BENCH_LENGTH * 0.25,
        bench.position[2] + alongZ * side * BENCH_LENGTH * 0.25,
        bench.rotationY
      ),
      rotationY: bench.rotationY,
      label: "Garden bench",
    }));
  }),
  ...DESKS.map((desk) => ({
    id: `desk-${desk.row}-${desk.column}`,
    // Students face the board, which is at the -Z end of the classroom.
    position: seatAt(desk.position[0], desk.position[2] + CHAIR_OFFSET, 0),
    rotationY: 0,
    label: `Desk, row ${desk.row + 1}`,
  })),
  {
    id: "teacher",
    position: seatAt(TEACHER_DESK[0], TEACHER_DESK[2] - CHAIR_OFFSET, Math.PI),
    rotationY: Math.PI, // facing the class
    label: "Teacher's chair",
  },
];

// --- furniture collision ----------------------------------------------------

/** An axis-aligned box in its own frame, rotated about Y in the world. */
export interface Obstacle {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  rotationY: number;
  /** True while this obstacle shouldn't block anyone — an open door's
   *  footprint, most often. A plain mutable field rather than something
   *  reactive on purpose: resolveObstacles runs once a frame from
   *  PlayerRig's useFrame loop, so the door component that owns this
   *  obstacle just flips this directly (see GardenDoor / ClassroomDoor in
   *  BaseEnvironment.tsx) the same way moveTargetRef and touchInput.ts
   *  are written to outside of React state, for the same reason: no
   *  React render is needed for something the physics loop reads 60
   *  times a second anyway. */
  disabled?: boolean;
}

const obstacle = (x: number, z: number, halfX: number, halfZ: number, rotationY = 0): Obstacle => ({
  x,
  z,
  halfX,
  halfZ,
  rotationY,
});

/** The garden door's closed-state footprint (see GardenDoor in
 *  BaseEnvironment.tsx) — spans the doorway at the hall's south wall.
 *  Exported (not just an anonymous entry below) so GardenDoor can flip
 *  `.disabled` on the exact same object that's already sitting in
 *  OBSTACLES, rather than needing a second lookup/id scheme. */
export const GARDEN_DOOR_OBSTACLE: Obstacle = obstacle(0, HALL.maxZ - 0.18, DOOR_HALF_WIDTH - 0.05, 0.22);

/** The new sliding door's closed-state footprint, at the corridor→
 *  classroom threshold (see ClassroomDoor in BaseEnvironment.tsx). */
// Kept in sync by hand with ClassroomDoor's own DOOR_INSET in
// BaseEnvironment.tsx (0.18) rather than importing it, to avoid a
// layout.ts → BaseEnvironment.tsx → layout.ts import cycle; if you
// change one, change the other.
export const CLASSROOM_DOOR_OBSTACLE: Obstacle = obstacle(0, CLASSROOM.maxZ - 0.18, DOOR_HALF_WIDTH - 0.18 - 0.05, 0.16);

/**
 * Furniture players bump into instead of walking through. Deliberately a
 * short list of boxes rather than real physics: it costs one loop per frame,
 * needs no extra dependency, and covers everything in the built-in world
 * that is big enough to walk into.
 */
export const OBSTACLES: Obstacle[] = [
  GARDEN_DOOR_OBSTACLE,
  CLASSROOM_DOOR_OBSTACLE,
  ...BENCHES.map((bench) => obstacle(bench.position[0], bench.position[2], BENCH_LENGTH / 2 + 0.05, 0.32, bench.rotationY)),
  // The outdoor benches were never added here — only the indoor ones —
  // which is exactly why they had no collision at all.
  ...OUTDOOR_BENCHES.map((bench) => obstacle(bench.position[0], bench.position[2], BENCH_LENGTH / 2 + 0.05, 0.32, bench.rotationY)),
  // A desk and its chair are one obstacle, not two. As separate boxes the
  // gap between them is narrower than a person, so a walker got squeezed
  // back and forth between the pair instead of walking around them.
  ...DESKS.map((desk) => obstacle(desk.position[0], desk.position[2] + CHAIR_OFFSET / 2, 0.58, 0.62)),
  obstacle(TEACHER_DESK[0], TEACHER_DESK[2] - CHAIR_OFFSET / 2, 0.95, 0.62),
  obstacle(-7, 13.4, 1.8, 0.45), // reception desk
  // Shoe lockers down one side of the corridor.
  obstacle(CORRIDOR.minX + 0.36, (CORRIDOR.minZ + CORRIDOR.maxZ) / 2 + 0.3, 0.22, 2.4),
  // Lantern posts and planters in the hall.
  ...[
    [-8.6, 0.8],
    [8.6, 0.8],
    [-8.6, 12.2],
    [8.6, 12.2],
  ].map(([x, z]) => obstacle(x, z, 0.22, 0.22)),
  ...[
    [-10.6, 15],
    [10.6, 15],
    [-10.6, -2.4],
    [10.6, -2.4],
  ].map(([x, z]) => obstacle(x, z, 0.5, 0.5)),
];

/**
 * The obstacle set collision is currently resolved against.
 *
 * OBSTACLES above describes the *built-in* room, by hand. A deployment
 * that layers its own uploaded .glb over it (see sceneUrl in
 * worldConfig.ts) brings in geometry this file has never seen and which
 * therefore has no collision. So the active set is swappable: Scene.tsx
 * sets it to the built-in list plus boxes derived from that model, and
 * back to the built-in list alone when the model is cleared.
 *
 * Deliberately a module-level mutable rather than React state, for the
 * same reason `Obstacle.disabled` is: resolveObstacles runs from
 * PlayerRig's useFrame loop, which reads this directly and must not
 * re-render to see a change.
 */
let activeObstacles: Obstacle[] = OBSTACLES;

export function setActiveObstacles(next: Obstacle[] | null): void {
  activeObstacles = next ?? OBSTACLES;
}

export function getActiveObstacles(): readonly Obstacle[] {
  return activeObstacles;
}

/**
 * Derives collision boxes from arbitrary loaded geometry.
 *
 * Produces one axis-aligned box per mesh from its world bounding box,
 * which is crude but is exactly the model `resolveObstacles` already
 * works in, costs nothing per frame beyond the box count, and — unlike
 * steering purely by navmesh — keeps walking behaving identically in the
 * built-in room and a custom one.
 *
 * Meshes are skipped when they are:
 *  - low enough to walk over (rugs, thresholds, floor plates),
 *  - tall but starting above head height (ceilings, beams, hanging lights),
 *  - enormous (the floor or a skybox shell, which would otherwise wrap
 *    the whole world in one box nobody can enter),
 *  - or marked `navIgnore`, the same opt-out the navmesh builder honours.
 */
export function deriveObstaclesFromObject(root: THREE.Object3D): Obstacle[] {
  const MIN_HEIGHT = 0.25; // shorter than this, you step over it
  const MAX_FLOOR_CLEARANCE = 1.9; // starts above this, you walk under it
  const MAX_FOOTPRINT = 40; // metres; bigger than this is the ground, not furniture
  const MIN_FOOTPRINT = 0.12;

  const derived: Obstacle[] = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child instanceof THREE.SkinnedMesh) return; // avatars move; they aren't scenery
    if (!child.visible || child.userData.navIgnore === true) return;

    box.setFromObject(child);
    if (box.isEmpty()) return;
    box.getSize(size);
    box.getCenter(center);

    if (size.y < MIN_HEIGHT) return;
    if (box.min.y > MAX_FLOOR_CLEARANCE) return;
    if (size.x > MAX_FOOTPRINT || size.z > MAX_FOOTPRINT) return;
    if (size.x < MIN_FOOTPRINT && size.z < MIN_FOOTPRINT) return;

    derived.push(obstacle(center.x, center.z, size.x / 2, size.z / 2));
  });

  return derived;
}

/**
 * Pushes a walker out of any furniture they've walked into, along whichever
 * axis of that piece they're least far inside — the cheap, stable way to
 * resolve a box overlap without a physics engine.
 */
export function resolveObstacles(position: THREE.Vector3, radius = PLAYER_RADIUS): void {
  for (const box of activeObstacles) {
    if (box.disabled) continue; // an open door — nothing to bump into here right now
    const sin = Math.sin(-box.rotationY);
    const cos = Math.cos(-box.rotationY);
    const dx = position.x - box.x;
    const dz = position.z - box.z;
    // Into the box's own frame.
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const overlapX = box.halfX + radius - Math.abs(localX);
    const overlapZ = box.halfZ + radius - Math.abs(localZ);
    if (overlapX <= 0 || overlapZ <= 0) continue;

    let pushX = 0;
    let pushZ = 0;
    if (overlapX < overlapZ) pushX = Math.sign(localX || 1) * overlapX;
    else pushZ = Math.sign(localZ || 1) * overlapZ;
    // Back into world space.
    position.x += pushX * cos + pushZ * sin;
    position.z += -pushX * sin + pushZ * cos;
  }
}

/** True if a walker of this radius would be inside a wall or some furniture. */
export function isBlocked(x: number, z: number, radius = PLAYER_RADIUS): boolean {
  const probe = new THREE.Vector3(x, 0, z);
  clampToRooms(probe);
  if (probe.distanceTo(new THREE.Vector3(x, 0, z)) > 1e-4) return true;
  resolveObstacles(probe, radius);
  return probe.distanceTo(new THREE.Vector3(x, 0, z)) > 1e-4;
}

/**
 * Where a player ends up when they get off a seat.
 *
 * Standing straight up would leave them inside the chair, and a fixed step
 * backward works for a bench but walks a student into the desk behind them.
 * So: try behind, then either side, then in front, and take the first spot
 * that is actually free.
 */
export function standUpSpot(position: [number, number, number], rotationY: number): [number, number, number] {
  const [fx, fz] = facingVector(rotationY);
  const norm = (dx: number, dz: number): [number, number] => {
    const length = Math.hypot(dx, dz) || 1;
    return [dx / length, dz / length];
  };
  const directions: [number, number][] = [
    [-fx, -fz], // behind the seat
    [-fz, fx], // to one side
    [fz, -fx], // to the other
    norm(-fx - fz, -fz + fx), // and the diagonals between them
    norm(-fx + fz, -fz - fx),
    [fx, fz], // in front, as a last resort
  ];
  for (const distance of [0.85, 1.2, 1.6]) {
    for (const [dx, dz] of directions) {
      const x = position[0] + dx * distance;
      const z = position[2] + dz * distance;
      if (!isBlocked(x, z)) return [x, position[1], z];
    }
  }
  return [position[0] - fx * 0.85, position[1], position[2] - fz * 0.85];
}

// --- floor height -----------------------------------------------------------

/** The tatami platform is a real step up, so walking onto it should raise
 *  the player rather than sink them into it. */
export const TATAMI = {
  minX: HALL_CENTRE[0] - 4.5,
  maxX: HALL_CENTRE[0] + 4.5,
  minZ: HALL_CENTRE[1] - 3.5,
  maxZ: HALL_CENTRE[1] + 3.5,
  height: 0.13,
};

export function floorHeightAt(x: number, z: number): number {
  return contains(TATAMI, x, z) ? TATAMI.height : 0;
}

/**
 * How high the third-person camera may rise before it would be looking at
 * the room from above. The hall has an open beam ceiling rather than a solid
 * one, so without this the camera simply floated out over the top of the
 * walls and showed a roofless set.
 */
export function ceilingHeightAt(x: number, z: number): number {
  if (contains(CLASSROOM, x, z)) return CLASSROOM_WALL_HEIGHT - 0.25;
  if (contains(CORRIDOR, x, z)) return 2.95;
  return WALL_HEIGHT - 0.5;
}
