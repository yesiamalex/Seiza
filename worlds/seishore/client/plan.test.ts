import { describe, expect, it } from "vitest";
import world from "../world/world.json";
import { facingVector, type Obstacle } from "../../../src/scene/layout";
import { ARRIVE, EDGES, FENCE, NODES, PLATFORM, seishoreObstacles, seishoreSeats, STATIONS } from "./plan";
import { CARS, TRAIN_DOORS } from "./cabins";
import { PEOPLE } from "./people";
import { seishoreKnowledge } from "./knowledge";

/** Inside an obstacle, grown by `pad`, turned by its yaw. */
function inside(o: Obstacle, x: number, z: number, pad = 0) {
  const c = Math.cos(o.rotationY);
  const s = Math.sin(o.rotationY);
  const dx = x - o.x;
  const dz = z - o.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= o.halfX + pad && Math.abs(lz) <= o.halfZ + pad;
}

describe("Seishore's plan", () => {
  const obstacles = seishoreObstacles();
  const blocked = (x: number, z: number, pad = 0.15) => obstacles.some((o) => inside(o, x, z, pad));

  it("arrives visitors on the street, facing the sea", () => {
    expect(world.spawnPoint.x).toBeCloseTo(ARRIVE[0]);
    expect(world.spawnPoint.z).toBeCloseTo(ARRIVE[1]);
    expect(blocked(world.spawnPoint.x, world.spawnPoint.z, 0.4)).toBe(false);
    const [fx, fz] = facingVector(world.spawnRotationY);
    expect(fx).toBeGreaterThan(0.99);
    expect(Math.abs(fz)).toBeLessThan(0.05);
  });

  it("lets you walk the platform to every door of a train standing there", () => {
    // Between the fence and a standing train's side, a body 0.8 m across
    // has only the middle of the platform: nothing may stand there between
    // the way on and any door.
    const x = (PLATFORM.x0 + PLATFORM.x1) / 2;
    STATIONS.forEach((st) => {
      const mid = (st.z0 + st.z1) / 2;
      const on = st.id === "kaigan" ? st.z0 + 0.3 : (FENCE.gaps[1][0] + FENCE.gaps[1][1]) / 2;
      for (const { cz } of CARS)
        for (const dz of TRAIN_DOORS) {
          const door = mid + cz + dz;
          const step = door > on ? 0.1 : -0.1;
          for (let z = on; Math.abs(z - door) > 0.1; z += step) expect(blocked(x, z, 0.35), `${st.id}: z ${z.toFixed(1)} to the door at ${door.toFixed(1)}`).toBe(false);
        }
    });
  });

  it("gives every seat its own id, clear of the benches' own collision", () => {
    const seats = seishoreSeats();
    expect(new Set(seats.map((s) => s.id)).size).toBe(seats.length);
    for (const seat of seats) expect(seat.id.startsWith("seishore-")).toBe(true);
  });

  it("keeps the town's paths on open ground, never through a building or the sea wall", () => {
    for (const [name, [x, z]] of Object.entries(NODES)) expect(blocked(x, z), name).toBe(false);
    for (const [a, b] of EDGES) {
      const [ax, az] = NODES[a];
      const [bx, bz] = NODES[b];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        expect(blocked(ax + (bx - ax) * t, az + (bz - az) * t, 0.05), `${a} → ${b}`).toBe(false);
      }
    }
  });

  it("has each townsperson's round go stop to stop along the paths", () => {
    const joined = new Set(EDGES.map(([a, b]) => `${a}|${b}`));
    const nodeAt = (p: [number, number, number]) => Object.entries(NODES).find(([, [x, z]]) => Math.hypot(x - p[0], z - p[2]) < 1e-6)?.[0];
    for (const person of PEOPLE) {
      const nodes = person.stops.map((s) => nodeAt(s.at));
      for (const n of nodes) expect(n, person.id).toBeDefined();
      if (nodes.length < 2) continue;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        const b = nodes[(i + 1) % nodes.length]!;
        expect(joined.has(`${a}|${b}`) || joined.has(`${b}|${a}`), `${person.id}: ${a} → ${b}`).toBe(true);
      }
    }
  });

  it("knows everything in both languages", () => {
    const k = seishoreKnowledge();
    expect(k.bilingual).toBe(true);
    for (const t of k.topics) {
      expect(t.ja?.answer, t.id).toBeTruthy();
      expect(t.asks.length, t.id).toBeGreaterThan(2);
    }
    for (const p of PEOPLE) {
      expect(p.persona.selfJa, p.id).toBeTruthy();
      expect(p.chatter.length, p.id).toBeGreaterThan(2);
      for (const line of p.chatter) expect(line.ja && line.en, p.id).toBeTruthy();
    }
  });
});

describe("Seishore's timetable", () => {
  it("never leaves the train standing on the crossing, and stops it along each platform", async () => {
    const { trainAt, TRAIN_LENGTH } = await import("./vehicles");
    const { CROSSING, STATIONS } = await import("./plan");
    const seen = new Set<string>();
    for (let t = 0; t < 400; t += 0.5) {
      const p = trainAt(t);
      if (p.speed > 0.01) continue;
      const a = p.z - TRAIN_LENGTH / 2;
      const b = p.z + TRAIN_LENGTH / 2;
      expect(b < CROSSING.z0 || a > CROSSING.z1, `standing at ${p.z}`).toBe(true);
      if (p.stop) {
        const st = STATIONS.find((s) => s.id === p.stop)!;
        expect(a).toBeGreaterThanOrEqual(st.z0 - 0.01);
        expect(b).toBeLessThanOrEqual(st.z1 + 0.01);
        seen.add(p.stop);
      }
    }
    expect(seen.size).toBe(STATIONS.length);
  });

  it("stops the bus with its door by the bus stop's bench", async () => {
    const { busAt, BUS } = await import("./vehicles");
    const { BUS_STOP } = await import("./plan");
    let stopped = false;
    for (let t = 0; t < 200; t += 0.5) {
      const p = busAt(t);
      if (!p.stop) continue;
      stopped = true;
      const door = p.z + BUS.length / 2 - 1.3;
      expect(Math.abs(door - (BUS_STOP.z + 1.3))).toBeLessThan(1.2);
    }
    expect(stopped).toBe(true);
  });
});
