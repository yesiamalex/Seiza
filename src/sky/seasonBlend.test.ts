import { describe, expect, it } from "vitest";
import { advanceSeason, seasonWeight, skyState } from "./skyState";

// One module-level blend, so these run in order, each from where the last left off.
describe("a change of season", () => {
  it("shows the first season at once", () => {
    advanceSeason("autumn", 0);
    expect(skyState.season).toBe("autumn");
    expect(seasonWeight("autumn")).toBe(1);
    expect(seasonWeight("winter")).toBe(0);
  });

  it("blends a new season in over a few seconds", () => {
    advanceSeason("winter", 10_000);
    expect(seasonWeight("autumn")).toBeCloseTo(1);
    expect(seasonWeight("winter")).toBeCloseTo(0);
    advanceSeason("winter", 14_000);
    expect(seasonWeight("autumn")).toBeCloseTo(0.5);
    expect(seasonWeight("winter")).toBeCloseTo(0.5);
    expect(seasonWeight("autumn") + seasonWeight("winter")).toBeCloseTo(1);
    advanceSeason("winter", 30_000);
    expect(seasonWeight("winter")).toBe(1);
    expect(skyState.seasonFrom).toBeNull();
  });

  it("turns back from where it had got to, without a jump", () => {
    advanceSeason("spring", 40_000);
    advanceSeason("spring", 42_000); // a quarter of the way to spring
    const springBefore = seasonWeight("spring");
    advanceSeason("winter", 42_000); // and back
    expect(seasonWeight("spring")).toBeCloseTo(springBefore);
    advanceSeason("winter", 60_000);
    expect(seasonWeight("winter")).toBe(1);
    expect(seasonWeight("spring")).toBe(0);
  });

  it("can blend to no season at all", () => {
    advanceSeason(null, 70_000);
    advanceSeason(null, 74_000);
    expect(seasonWeight("winter")).toBeCloseTo(0.5);
    advanceSeason(null, 90_000);
    expect(seasonWeight("winter")).toBe(0);
  });
});
