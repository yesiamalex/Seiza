import { describe, expect, it } from "vitest";
import { CLASSROOM, HALL, soundZoneAt, throughWalls, wallsBetween } from "./layout";

const mid = (r: { minX: number; maxX: number; minZ: number; maxZ: number }): [number, number] => [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2];

describe("walls between voices", () => {
  it("knows the building's rooms and outside", () => {
    expect(soundZoneAt(...mid(CLASSROOM))).toBe("classroom");
    expect(soundZoneAt(...mid(HALL))).toBe("hall");
    expect(soundZoneAt(0, 60)).toBe("outside");
  });
  it("counts the openings between: none in the same room, more further apart", () => {
    expect(wallsBetween("hall", "hall")).toBe(0);
    expect(wallsBetween("hall", "outside")).toBe(1);
    expect(wallsBetween("hall", "classroom")).toBe(2);
    expect(wallsBetween("classroom", "outside")).toBe(3);
    // A world's own rooms open onto outside: one from outside, two from each other.
    expect(wallsBetween("konbini", "outside")).toBe(1);
    expect(wallsBetween("konbini", "cafe")).toBe(2);
  });
  it("leaves a voice in the same room exactly as it is", () => {
    expect(throughWalls(0)).toEqual({ volume: 1, cutoff: 20000 });
    expect(throughWalls(1).volume).toBeGreaterThan(throughWalls(2).volume);
    expect(throughWalls(1).cutoff).toBeGreaterThan(throughWalls(2).cutoff);
  });
});
