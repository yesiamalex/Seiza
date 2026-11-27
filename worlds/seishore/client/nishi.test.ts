import { describe, expect, it } from "vitest";
import { LOOP_STOPS, loopLegs, NISHI, NISHI_SHOPS, nishiObstacles, RING, shopFront } from "./nishi";
import { timeline } from "./vehicles";

describe("Nishi-machi", () => {
  const legs = loopLegs();
  const total = legs.reduce((a, l) => a + l.seconds, 0);
  const at = timeline(legs);

  it("drives the community bus round its ring without a jump, on the road", () => {
    let last = at(0);
    for (let t = 0.05; t < total * 2; t += 0.05) {
      const p = at(t);
      // A twentieth of a second never takes it more than a metre (no jumps between legs).
      expect(Math.hypot(p.x - last.x, p.z - last.z), `t ${t.toFixed(2)}`).toBeLessThan(1);
      // Always on the ring: near one of its four roads.
      const onRoad =
        Math.abs(p.x - RING.east) <= RING.half + 0.5 || Math.abs(p.x - RING.west) <= RING.half + 0.5 || Math.abs(p.z - RING.north) <= RING.half + 0.5 || Math.abs(p.z - RING.south) <= RING.half + 0.5;
      expect(onRoad, `${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBe(true);
      last = p;
    }
  });

  it("stops at every one of its stops, doors open", () => {
    const seen = new Set<string>();
    for (let t = 0; t < total; t += 0.5) {
      const p = at(t);
      if (p.stop) seen.add(p.stop);
    }
    expect([...seen].sort()).toEqual(LOOP_STOPS.map((s) => s.id).sort());
  });

  it("keeps its shops inside the quarter, apart, and the street clear", () => {
    for (const s of NISHI_SHOPS) {
      const f = shopFront(s);
      expect(s.x0).toBeGreaterThan(NISHI.minX);
      expect(f.z0).toBeGreaterThan(RING.south + RING.half);
      expect(f.z1).toBeLessThan(RING.north - RING.half);
      expect(s.door[0]).toBeGreaterThan(s.x0);
      expect(s.door[1]).toBeLessThan(s.x1);
    }
    // Down the middle of Nishi-dōri, nothing in the way.
    const blocks = nishiObstacles();
    for (let x = -62; x < -25; x += 0.25) {
      const hit = blocks.some((o) => Math.abs(x - o.x) < o.halfX + 0.4 && Math.abs(55 - o.z) < o.halfZ + 0.4);
      expect(hit, `x ${x}`).toBe(false);
    }
  });
});
