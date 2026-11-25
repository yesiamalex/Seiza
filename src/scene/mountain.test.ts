import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { clampToRooms, floorHeightAt, OUTER_GROUND_Y, setMountain, SUMMIT_BENCHES } from "./layout";
import { MAKILING_SUMMIT_M, mountainHeight, realAltitude, SUMMIT, TRAIL_FROM } from "./mountainShape";

describe("Mt. Makiling", () => {
  afterEach(() => setMountain(true));

  it("is the real mountain's shape, its summit near 1,090 m", () => {
    expect(MAKILING_SUMMIT_M).toBeGreaterThan(1000);
    expect(MAKILING_SUMMIT_M).toBeLessThan(1150);
    expect(realAltitude(SUMMIT[0], SUMMIT[1])).toBeCloseTo(MAKILING_SUMMIT_M, -1);
  });

  it("can be walked from the trail's foot to the summit, the floor rising", () => {
    const foot = new THREE.Vector3(TRAIL_FROM[0], 0, TRAIL_FROM[1]);
    const top = new THREE.Vector3(SUMMIT[0], 0, SUMMIT[1]);
    clampToRooms(foot);
    clampToRooms(top);
    expect(top.x).toBeCloseTo(SUMMIT[0]);
    expect(top.z).toBeCloseTo(SUMMIT[1]);
    expect(floorHeightAt(SUMMIT[0], SUMMIT[1])).toBeGreaterThan(floorHeightAt(foot.x, foot.z) + 5);
    expect(floorHeightAt(SUMMIT[0], SUMMIT[1])).toBeCloseTo(OUTER_GROUND_Y + mountainHeight(SUMMIT[0], SUMMIT[1]));
  });

  it("puts its benches on the summit's ground", () => {
    for (const b of SUMMIT_BENCHES) expect(b.position[1]).toBeCloseTo(floorHeightAt(b.position[0], b.position[2]));
  });

  it("isn't there in a world that turns it off", () => {
    setMountain(false);
    const top = new THREE.Vector3(SUMMIT[0], 0, SUMMIT[1]);
    clampToRooms(top);
    expect(Math.hypot(top.x - SUMMIT[0], top.z - SUMMIT[1])).toBeGreaterThan(5);
  });
});
