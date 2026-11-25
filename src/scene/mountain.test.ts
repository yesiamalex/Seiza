import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { ceilingHeightAt, clampToRooms, floorHeightAt, OUTER_GROUND_Y, setMountain, SUMMIT_BENCHES, viewFloorAt, type Ground } from "./layout";
import { MountainGround } from "./mountainGround";
import { MAKILING_SUMMIT_M, MOUNTAIN, mountainHeight, placeMountain, realAltitude, SUMMIT, TRAIL_FROM } from "./mountainShape";

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

  it("keeps a camera above the hill's whole surface, past where you can walk", () => {
    // Near its edge, outside the walkable square, the hill is still drawn.
    const x = MOUNTAIN.x + MOUNTAIN.size * 0.495;
    const z = MOUNTAIN.z;
    if (mountainHeight(x, z) > 0) expect(viewFloorAt(x, z)).toBeGreaterThanOrEqual(OUTER_GROUND_Y + mountainHeight(x, z) - 1e-6);
    expect(viewFloorAt(SUMMIT[0], SUMMIT[1])).toBeCloseTo(floorHeightAt(SUMMIT[0], SUMMIT[1]));
    // Open sky over it: no ceiling to hold a camera down inside the hill.
    expect(ceilingHeightAt(SUMMIT[0], SUMMIT[1])).toBe(Infinity);
    expect(ceilingHeightAt(TRAIL_FROM[0], TRAIL_FROM[1] + 10)).toBe(Infinity);
  });

  it("isn't there in a world that turns it off", () => {
    setMountain(false);
    const top = new THREE.Vector3(SUMMIT[0], 0, SUMMIT[1]);
    clampToRooms(top);
    expect(Math.hypot(top.x - SUMMIT[0], top.z - SUMMIT[1])).toBeGreaterThan(5);
  });
});

describe("Mt. Makiling in a model world", () => {
  // A lawn like SeiOU's: flat at 0.2, walkable up to z 202.
  const lawn = (): Ground => {
    const at = { x: 0, z: 0 };
    const clamp = (p: THREE.Vector3) => {
      p.z = Math.min(202, p.z);
      at.x = p.x;
      at.z = p.z;
      return 0.2;
    };
    return { constrain: clamp, floorAt: () => 0.2, isWalkable: (_x, z) => z <= 202, place: (x, _y, z) => clamp(new THREE.Vector3(x, 0, z)) };
  };
  afterEach(() => placeMountain());

  it("walks off the lawn's edge up the trail, and back down onto the lawn", () => {
    placeMountain({ x: -55, z: 252.9, y: 0.2 });
    const g = new MountainGround(lawn());
    const p = new THREE.Vector3(TRAIL_FROM[0], 0, 200);
    expect(g.constrain(p)).toBeCloseTo(0.2);
    // Step by step up the trail to the summit.
    let y = 0;
    for (let z = 200.5; z <= SUMMIT[1]; z += 0.5) {
      p.set(SUMMIT[0], 0, z);
      y = g.constrain(p);
      expect(p.z).toBeCloseTo(z);
    }
    expect(y).toBeGreaterThan(5);
    expect(y).toBeCloseTo(0.2 + mountainHeight(p.x, p.z));
    // And back down onto the lawn.
    for (let z = SUMMIT[1]; z >= 199; z -= 0.5) {
      p.set(SUMMIT[0], 0, z);
      y = g.constrain(p);
    }
    expect(y).toBeCloseTo(0.2);
    p.set(SUMMIT[0], 0, 150);
    g.constrain(p);
    expect(p.z).toBeLessThanOrEqual(202);
  });

  it("puts the meadow's mountain back where it was", () => {
    const before = [...SUMMIT];
    placeMountain({ x: 500, z: 500 });
    expect(SUMMIT[0]).not.toBeCloseTo(before[0]);
    placeMountain();
    expect(SUMMIT).toEqual(before);
  });
});
