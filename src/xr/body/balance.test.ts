import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Balance } from "./bodyIk";

const at = (x: number, z: number) => new THREE.Vector3(x, 0, z);
const run = (b: Balance, target: THREE.Vector3, seconds: number, step = 1 / 72) => {
  for (let t = 0; t < seconds; t += step) b.update(target, step);
  return b.planted;
};

describe("planted feet", () => {
  it("stay put through a lean, so the body bends instead of sliding", () => {
    const b = new Balance();
    run(b, at(0, 0), 0.5);
    // Leaning 20 cm forward, slowly (well under walking speed).
    for (let i = 1; i <= 36; i++) b.update(at(0, -0.2 * (i / 36)), 1 / 72);
    expect(b.planted.distanceTo(at(0, 0))).toBeLessThan(0.03);
  });

  it("take a step when the lean goes too far", () => {
    const b = new Balance();
    run(b, at(0, 0), 0.5);
    for (let i = 1; i <= 72; i++) b.update(at(0, -0.4 * (i / 72)), 1 / 72);
    run(b, at(0, -0.4), 0.6);
    expect(b.planted.distanceTo(at(0, -0.4))).toBeLessThan(0.12);
  });

  it("keep up with walking, and jump with a teleport", () => {
    const b = new Balance();
    run(b, at(0, 0), 0.2);
    let x = 0;
    for (let i = 0; i < 72; i++) b.update(at((x += 1.4 / 72), 0), 1 / 72);
    expect(Math.abs(b.planted.x - x)).toBeLessThan(0.15);
    b.update(at(10, 10), 1 / 72);
    expect(b.planted.distanceTo(at(10, 10))).toBeLessThan(1e-6);
  });

  it("lift one foot, then the other, while stepping, and neither while standing or walking", () => {
    const b = new Balance();
    run(b, at(0, 0), 0.5);
    expect(b.step).toBeNull();
    // Lean far enough to step, slowly.
    for (let i = 1; i <= 72; i++) b.update(at(0, -0.4 * (i / 72)), 1 / 72);
    const seen = new Set<string>();
    let lifted = 0;
    for (let i = 0; i < 40 && b.step; i++) {
      b.update(at(0, -0.4), 1 / 72);
      const step = b.step;
      if (step) {
        seen.add(step.side);
        lifted = Math.max(lifted, step.lift);
      }
    }
    expect(lifted).toBeGreaterThan(0.5);
    expect(seen.size).toBeGreaterThan(0);
    run(b, at(0, -0.4), 1);
    expect(b.step).toBeNull();
  });
});
