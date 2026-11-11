import { describe, expect, it } from "vitest";
import { Route, type RoutePosition } from "./route";

const out: RoutePosition = { x: 0, y: 0, z: 0, heading: null };

describe("Route", () => {
  const route = new Route(
    [
      { at: [0, 0, 0], wait: 10 },
      { at: [10, 0, 0], wait: 5 },
    ],
    1
  );

  it("waits at a stop, standing", () => {
    route.at(5, out);
    expect(out.x).toBe(0);
    expect(out.heading).toBeNull();
  });

  it("walks between stops, eased, facing the way it goes", () => {
    route.at(15, out);
    expect(out.x).toBeCloseTo(5, 5);
    expect(out.heading).toBeCloseTo(Math.PI / 2, 5);
  });

  it("loops, on the same clock for everyone", () => {
    expect(route.loop).toBe(35);
    route.at(35 + 5, out);
    expect(out.x).toBe(0);
  });

  it("follows a path when it has one", () => {
    const viaCorner = new Route(
      [
        { at: [0, 0, 0], wait: 0 },
        { at: [10, 0, 10], wait: 0 },
      ],
      1,
      (a, b) => [a, [10, 0, 0], b]
    );
    viaCorner.at(10, out);
    expect(out.x).toBeCloseTo(10, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });
});
