import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { resolveObstacles, setPlacedObstacles } from "./layout";

const table = (floorY: number) => ({ x: 0, z: 27, halfX: 0.8, halfZ: 0.4, rotationY: 0, floorY });

describe("placed tables", () => {
  afterEach(() => setPlacedObstacles([]));

  it("push a walker out on their own floor", () => {
    setPlacedObstacles([table(0)]);
    const p = new THREE.Vector3(0, 1.6, 27);
    resolveObstacles(p);
    expect(Math.abs(p.z - 27) > 0.4 || Math.abs(p.x) > 0.8).toBe(true);
  });

  it("don't block the floor below or above", () => {
    setPlacedObstacles([table(4.7)]);
    const p = new THREE.Vector3(0, 1.6, 27);
    resolveObstacles(p);
    expect(p.x).toBe(0);
    expect(p.z).toBe(27);
  });
});
