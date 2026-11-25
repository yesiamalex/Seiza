import { describe, expect, it } from "vitest";
import { addShade, heatIndexC, heatLevel, heatSpeed, heatStage, inDeclaredShade, stepHeat } from "./heat";

describe("heat reactions", () => {
  it("reads a heat index as PAGASA does", () => {
    // 33 °C at 70% humidity feels like the mid-40s: Danger.
    expect(heatIndexC(33, 70)).toBeGreaterThan(42);
    expect(heatLevel(heatIndexC(33, 70))).toBe("danger");
    // Cool air is just its temperature.
    expect(heatIndexC(24, 90)).toBe(24);
    expect(heatLevel(30)).toBe("caution");
    expect(heatLevel(38)).toBe("extreme-caution");
  });

  it("builds on a hot walk, slower in shade, and cools at rest", () => {
    const walk = { speed: 1.4, shaded: false, effort: 1, hi: 42 };
    let sun = 0;
    let shade = 0;
    for (let s = 0; s < 40; s++) {
      sun = stepHeat(sun, walk, 1);
      shade = stepHeat(shade, { ...walk, shaded: true }, 1);
    }
    expect(sun).toBeGreaterThan(0.6);
    expect(shade).toBeLessThan(sun / 2);
    // A night walk builds nothing; resting brings it down.
    expect(stepHeat(0, { ...walk, hi: 25 }, 30)).toBe(0);
    expect(stepHeat(sun, { ...walk, speed: 0 }, 30)).toBeLessThan(sun);
    // A moped is no effort.
    expect(stepHeat(0, { ...walk, effort: 0 }, 30)).toBe(0);
  });

  it("sweats, then pants, then frowns and slows", () => {
    expect([0.1, 0.4, 0.6, 0.9].map(heatStage)).toEqual([0, 1, 2, 3]);
    expect(heatSpeed(0.3)).toBe(1);
    expect(heatSpeed(1)).toBeCloseTo(0.6, 6);
  });

  it("knows the shade a world declares", () => {
    const off = addShade({ x0: 0, x1: 2, z0: 0, z1: 10 });
    expect(inDeclaredShade(1, 5)).toBe(true);
    expect(inDeclaredShade(3, 5)).toBe(false);
    off();
    expect(inDeclaredShade(1, 5)).toBe(false);
  });
});
