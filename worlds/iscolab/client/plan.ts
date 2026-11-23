// Where ISCOLab's grounds are, in metres, the lab centred on the origin
// (its floor plan spans x −16 to 16, z −8.5 to 8.5; front, the doorways'
// side, toward +z). Plain numbers and nothing imported, so the bake script
// (scripts/build-lab.mjs) reads this same file for the lawn and for what
// to keep walkers out of, and the world's code builds from it.
//
//        z −18 ┌──────────────────────────────────────────────────────┐
//              │ ┌·····barrier·····┐                                  │
//              │ ·  ┌───────────┐  ·                      ┌────────┐  │
//              │ ·  │    lab    │  ·        meadow     →  │  kubo  │  │
//              │ ·  └───────────┘  ·         arrival      └────────┘  │
//              │ └·················┘                                  │
//        z 28  └──────────────────────────────────────────────────────┘
//            x −24                x 18                  x 46     x 56  x 72

/** The lab is being fixed: a barrier round it (for the look: there's a way
 *  in at the main door), and sessions moved out to the kubo. Set false
 *  (and re-run the bake) when it's done. */
export const UNDER_CONSTRUCTION = true;

/** The lab's walls, for anything placed round them. */
export const LAB = { x0: -16.04, x1: 16.04, z0: -8.47, z1: 8.47 };

/** The meadow: the lab at its west edge, open ground east of it. */
export const LAWN = { x0: -24, x1: 72, z0: -18, z1: 28 };

/** The construction barrier round the lab, this far out from its walls. */
export const BARRIER_GAP = 1.6;
export const BARRIER = { x0: LAB.x0 - BARRIER_GAP, x1: LAB.x1 + BARRIER_GAP, z0: LAB.z0 - BARRIER_GAP, z1: LAB.z1 + BARRIER_GAP };
/** How tall the barrier stands, and how thick it counts as, for walking. */
export const BARRIER_HEIGHT = 1.1;
export const BARRIER_THICKNESS = 0.3;
/** Barrier posts this far apart, with tape between them. */
export const BARRIER_SPACING = 2.4;
/** The way in: the barrier is for the look, and leaves an opening at the
 *  lab's main door (its front doorway at x 6.3), cones either side, so
 *  people can still go in while it's being fixed. */
export const BARRIER_OPENING = { x: 6.3, half: 1.3 };
/** The barrier as straight runs round the lab, the opening left out. */
export const BARRIER_RUNS: [[number, number], [number, number]][] = [
  [[BARRIER.x0, BARRIER.z0], [BARRIER.x1, BARRIER.z0]],
  [[BARRIER.x1, BARRIER.z0], [BARRIER.x1, BARRIER.z1]],
  [[BARRIER.x1, BARRIER.z1], [BARRIER_OPENING.x + BARRIER_OPENING.half, BARRIER.z1]],
  [[BARRIER_OPENING.x - BARRIER_OPENING.half, BARRIER.z1], [BARRIER.x0, BARRIER.z1]],
  [[BARRIER.x0, BARRIER.z1], [BARRIER.x0, BARRIER.z0]],
];

/** The sign, just outside the barrier's east side, facing across the
 *  meadow to where people arrive (+x; a face looks +z at yaw 0). */
export const SIGN = { x: BARRIER.x1 + 1.5, z: 3, rotationY: Math.PI / 2 };
/** Scaffolding up part of the lab's front wall, inside the barrier. */
export const SCAFFOLD = { x0: -12, x1: -2, z0: LAB.z1 + 0.15, z1: LAB.z1 + 1.05, bay: 2, levels: [1.05, 2.1, 3.15] };

/**
 * The temporary kubo for sessions while the lab is being fixed: Tulay's kubo
 * hall (worlds/tulay), at the far side of the meadow. Open on its west
 * side, toward the lab and the arrival point; knee walls of sawali north
 * and south; the screen on its east wall, full height behind it; bamboo
 * benches in rows facing the screen. On the ground, no stilts, so it
 * walks like the meadow.
 */
export const KUBO = { x0: 46, x1: 56, z0: -2, z1: 7, eave: 2.7, ridge: 5.4, overhang: 1.1 };
export const KUBO_CENTRE: [number, number] = [(KUBO.x0 + KUBO.x1) / 2, (KUBO.z0 + KUBO.z1) / 2];
export const KNEE_WALL = 0.95;
/** Posts at the corners, and between them on the long sides. */
export const KUBO_POSTS: [number, number][] = [
  [KUBO.x0, KUBO.z0],
  [KUBO.x0, KUBO_CENTRE[1] - 2.2],
  [KUBO.x0, KUBO_CENTRE[1] + 2.2],
  [KUBO.x0, KUBO.z1],
  [KUBO.x1, KUBO.z0],
  [KUBO.x1, KUBO.z1],
  [KUBO_CENTRE[0], KUBO.z0],
  [KUBO_CENTRE[0], KUBO.z1],
];
export const BENCH_LENGTH = 2.2;
/** Benches in three rows facing the screen (east), two to a row. */
export const BENCHES: { x: number; z: number }[] = [48.4, 50.2, 52].flatMap((x) => [
  { x, z: KUBO_CENTRE[1] - 1.9 },
  { x, z: KUBO_CENTRE[1] + 1.9 },
]);
/** Facing east (+x): avatars face −z at yaw 0. */
export const FACING_SCREEN = -Math.PI / 2;
/** Where the screen hangs: on the east wall, facing the benches (a room
 *  object, world.json's defaultObjects, so it can be shared to). */
export const SCREEN = { x: KUBO.x1 - 0.14, y: 1.75, z: KUBO_CENTRE[1] };
/** The facilitator's table, by the screen; its chair is a room object. */
export const TABLE = { x: KUBO.x1 - 1.3, z: KUBO_CENTRE[1] - 3.1, length: 1.4, width: 0.7 };

/** Where people arrive: on the meadow between the lab and the kubo,
 *  facing the kubo's open side. */
export const SPAWN = { x: 34, z: 12, rotationY: -1.06 };
