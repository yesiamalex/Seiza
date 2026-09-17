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
export const CORRIDOR: Rect = { minX: -2.6, maxX: 2.6, minZ: -10, maxZ: -4 };
export const CLASSROOM: Rect = { minX: -9, maxX: 9, minZ: -24, maxZ: -10 };
export const ROOMS: Rect[] = [HALL, CORRIDOR, CLASSROOM];

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

/** Keeps a walker off the walls without real collision. */
const PLAYER_RADIUS = 0.4;

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
export function clampToRooms(position: THREE.Vector3): void {
  for (const room of WALKABLE) {
    if (contains(room, position.x, position.z)) return;
  }
  let best: { x: number; z: number; distance: number } | null = null;
  for (const room of WALKABLE) {
    const x = THREE.MathUtils.clamp(position.x, room.minX, room.maxX);
    const z = THREE.MathUtils.clamp(position.z, room.minZ, room.maxZ);
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
  return { position: [x, 0, z], rotationY: Math.atan2(HALL_CENTRE[0] - x, HALL_CENTRE[1] - z) };
});

export const CLASSROOM_ROWS = 3;
export const CLASSROOM_COLUMNS = 4;
export const DESK_SPACING_X = 2.1;
export const DESK_SPACING_Z = 2.0;
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
 * Every seat a player can sit on. Avatars face -Z at yaw 0 (see
 * VrmAvatar.tsx), so a seat facing the -Z end of the classroom has yaw 0.
 */
export const SEATS: Seat[] = [
  ...BENCHES.flatMap((bench, i) => {
    const alongX = Math.cos(bench.rotationY);
    const alongZ = -Math.sin(bench.rotationY);
    return [-1, 1].map((side) => ({
      id: `bench-${i}-${side > 0 ? "r" : "l"}`,
      position: [
        bench.position[0] + alongX * side * BENCH_LENGTH * 0.25,
        0,
        bench.position[2] + alongZ * side * BENCH_LENGTH * 0.25,
      ] as [number, number, number],
      rotationY: bench.rotationY,
      label: "Bench",
    }));
  }),
  ...DESKS.map((desk) => ({
    id: `desk-${desk.row}-${desk.column}`,
    // Students face the board, which is at the -Z end of the classroom.
    position: [desk.position[0], 0, desk.position[2] + CHAIR_OFFSET] as [number, number, number],
    rotationY: 0,
    label: `Desk, row ${desk.row + 1}`,
  })),
  {
    id: "teacher",
    position: [TEACHER_DESK[0], 0, TEACHER_DESK[2] - CHAIR_OFFSET],
    rotationY: Math.PI, // facing the class
    label: "Teacher's chair",
  },
];
