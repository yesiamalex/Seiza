import { describe, expect, it } from "vitest";
import { MAX_LEAD_S, RemoteMotion, STOPPED_AFTER_S } from "./remoteMotion";

const out: [number, number, number] = [0, 0, 0];

/** A player walking along x at `speed`, an update every 0.2 s. */
function walking(speed: number, updates: number) {
  const m = new RemoteMotion();
  for (let i = 0; i < updates; i++) m.observe(i * 0.2 * speed, 0, 0, i * 0.2);
  return { m, lastAt: (updates - 1) * 0.2, lastX: (updates - 1) * 0.2 * speed };
}

describe("RemoteMotion", () => {
  it("carries a walking avatar on between updates, at its pace", () => {
    const { m, lastAt, lastX } = walking(3, 5);
    m.predict(lastAt + 0.1, out);
    expect(out[0]).toBeCloseTo(lastX + 0.3, 1);
  });

  it("doesn't carry it further than a short lead", () => {
    const { m, lastAt, lastX } = walking(3, 5);
    m.predict(lastAt + 0.4, out);
    expect(out[0]).toBeCloseTo(lastX + 3 * MAX_LEAD_S, 1);
  });

  it("stops when the player says so with the same position again", () => {
    const { m, lastAt, lastX } = walking(3, 5);
    m.observe(lastX, 0, 0, lastAt + 0.2);
    m.predict(lastAt + 0.35, out);
    expect(out[0]).toBe(lastX);
  });

  it("stops when updates stop coming", () => {
    const { m, lastAt, lastX } = walking(3, 5);
    m.predict(lastAt + STOPPED_AFTER_S + 0.05, out);
    expect(out[0]).toBe(lastX);
  });

  it("doesn't fling an avatar after a teleport", () => {
    const m = new RemoteMotion();
    m.observe(0, 0, 0, 0);
    m.observe(40, 0, 0, 0.2);
    m.predict(0.3, out);
    expect(out[0]).toBe(40);
  });

  it("doesn't predict height", () => {
    const m = new RemoteMotion();
    m.observe(0, 0, 0, 0);
    m.observe(0.6, 0.5, 0, 0.2);
    m.predict(0.3, out);
    expect(out[1]).toBe(0.5);
  });
});
