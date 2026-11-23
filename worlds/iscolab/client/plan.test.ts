import { beforeAll, describe, expect, it } from "vitest";
import type { NavMeshQuery as Query } from "recast-navigation";
import { BARRIER, KUBO, LAB, LAWN, SCREEN, SIGN, SPAWN } from "./plan";
import { iscolabObstacles, iscolabSeats } from "./grounds";

// The app's types leave Node out, so the file reader is typed by hand.
let readFileSync: (path: URL, encoding?: "utf8") => Uint8Array & string;
const file = (name: string) => new URL(`../world/${name}`, import.meta.url);
let query: Query;

beforeAll(async () => {
  ({ readFileSync } = await import(/* @vite-ignore */ `node:${"fs"}`));
  const { init, importNavMesh, NavMeshQuery } = await import("recast-navigation");
  await init();
  query = new NavMeshQuery(importNavMesh(new Uint8Array(readFileSync(file("models/lab.navmesh")))).navMesh);
});

/** Whether the navmesh walks from one point to another. */
function walks(from: [number, number], to: [number, number]) {
  const at = ([x, z]: [number, number]) => {
    const r = query.findClosestPoint({ x, y: 0, z }, { halfExtents: { x: 1, y: 1, z: 1 } });
    expect(r.success && r.polyRef, `ground near ${x}, ${z}`).toBeTruthy();
    return { ...r.point };
  };
  const b = at(to);
  const path = query.computePath(at(from), b, { halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }).path ?? [];
  const end = path[path.length - 1];
  return !!end && Math.hypot(end.x - b.x, end.z - b.z) < 0.3;
}

const inside = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

describe("ISCOLab's grounds", () => {
  it("has the lab at the meadow's west edge, and room for the kubo across it", () => {
    expect(LAB.x0 - LAWN.x0).toBeLessThan(10);
    expect(LAWN.x1 - KUBO.x1).toBeGreaterThan(5);
    for (const [x, z] of [
      [BARRIER.x0, BARRIER.z0],
      [BARRIER.x1, BARRIER.z1],
      [KUBO.x0, KUBO.z0],
      [KUBO.x1, KUBO.z1],
      [SIGN.x, SIGN.z],
      [SPAWN.x, SPAWN.z],
    ])
      expect(inside(LAWN, x, z), `${x}, ${z}`).toBe(true);
    // The kubo, the sign, and the arrival point are all clear of the barrier.
    expect(KUBO.x0 - KUBO.overhang).toBeGreaterThan(BARRIER.x1 + 10);
    expect(SIGN.x).toBeGreaterThan(BARRIER.x1);
  });

  it("walks from the arrival point to the kubo, and into the lab through the barrier's way in", () => {
    expect(walks([SPAWN.x, SPAWN.z], [(KUBO.x0 + KUBO.x1) / 2, (KUBO.z0 + KUBO.z1) / 2])).toBe(true);
    expect(walks([SPAWN.x, SPAWN.z], [0, 0])).toBe(true);
    // Its rooms are still joined up inside, for when it opens.
    expect(walks([6.3, LAB.z1 + 0.8], [0, 0])).toBe(true);
  });

  it("starts a room with the kubo's screen and board where the plan puts them", () => {
    const world = JSON.parse(readFileSync(file("world.json"), "utf8")) as {
      spawnPoint: { x: number; z: number };
      spawnRotationY: number;
      defaultObjects: { kind: string; position: [number, number, number] }[];
    };
    expect([world.spawnPoint.x, world.spawnPoint.z, world.spawnRotationY]).toEqual([SPAWN.x, SPAWN.z, SPAWN.rotationY]);
    const screen = world.defaultObjects.find((o) => o.kind === "screen")!;
    expect(screen.position).toEqual([SCREEN.x, SCREEN.y, SCREEN.z]);
    for (const o of world.defaultObjects) expect(inside(KUBO, o.position[0] + 0.01, o.position[2]), o.kind).toBe(true);
  });

  it("gives every bench seat room to sit, inside the kubo", () => {
    const obstacles = iscolabObstacles();
    for (const seat of iscolabSeats()) {
      const [x, , z] = seat.position;
      expect(inside(KUBO, x, z), seat.id).toBe(true);
      // Clear of everything but its own bench's box.
      const blocking = obstacles.filter((o) => Math.abs(x - o.x) < o.halfX && Math.abs(z - o.z) < o.halfZ);
      expect(blocking.length, seat.id).toBeLessThanOrEqual(1);
    }
  });
});
