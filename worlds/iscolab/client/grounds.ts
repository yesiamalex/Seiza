// What's solid on ISCOLab's grounds, and where to sit: from plan.ts.
// The navmesh already walks people round the barrier and in at its opening
// (scripts/build-lab.mjs bakes it in); these boxes are what they bump
// into, and what keeps a step from cutting a corner through a post.
import { makeObstacle, type Obstacle, type Seat } from "../../../src/scene/layout";
import { BARRIER_RUNS, BARRIER_THICKNESS, BENCH_LENGTH, BENCHES, FACING_SCREEN, KUBO, KUBO_CENTRE, KUBO_POSTS, SIGN, TABLE, UNDER_CONSTRUCTION } from "./plan";

/** Benches' seats sit this far toward the screen from the bench's middle. */
const SEAT_FORWARD = 0.12;

export function iscolabObstacles(): Obstacle[] {
  const t = BARRIER_THICKNESS / 2;
  const barrier = UNDER_CONSTRUCTION
    ? [
        // Each straight run of it, the way in at the main door left open.
        ...BARRIER_RUNS.map(([a, b]) => makeObstacle((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 + t, Math.abs(b[1] - a[1]) / 2 + t)),
        makeObstacle(SIGN.x, SIGN.z, 0.25, 0.9),
      ]
    : [];
  // The knee walls north and south, from a little in from the open front
  // to the back; the back wall behind the screen.
  const kneeFrom = KUBO.x0 + 0.8;
  return [
    ...barrier,
    ...KUBO_POSTS.map(([x, z]) => makeObstacle(x, z, 0.16, 0.16)),
    makeObstacle((kneeFrom + KUBO.x1) / 2, KUBO.z0, (KUBO.x1 - kneeFrom) / 2, 0.08),
    makeObstacle((kneeFrom + KUBO.x1) / 2, KUBO.z1, (KUBO.x1 - kneeFrom) / 2, 0.08),
    makeObstacle(KUBO.x1, KUBO_CENTRE[1], 0.1, (KUBO.z1 - KUBO.z0) / 2),
    ...BENCHES.map((b) => makeObstacle(b.x, b.z, 0.2, BENCH_LENGTH / 2)),
    makeObstacle(TABLE.x, TABLE.z, TABLE.width / 2, TABLE.length / 2),
  ];
}

/** Two seats to each bench, facing the screen. */
export function iscolabSeats(): Seat[] {
  return BENCHES.flatMap((bench, i) =>
    [-1, 1].map((side) => ({
      id: `iscolab-bench-${i}-${side > 0 ? "s" : "n"}`,
      position: [bench.x + SEAT_FORWARD, 0, bench.z + side * BENCH_LENGTH * 0.25] as [number, number, number],
      rotationY: FACING_SCREEN,
      label: "Bench",
    }))
  );
}
