import { describe, expect, it } from "vitest";
import { findMirrorSpot } from "./Mirror";
import { constrainWalker, floorHeightAt } from "./layout";
import * as THREE from "three";

describe("a world's own mirror", () => {
  it("stands near arrival on the base grounds, on walkable floor, facing the arrival point", () => {
    const spawn = { x: -13.03, y: -0.6, z: 58.35 };
    const spot = findMirrorSpot(spawn, -1.4);
    expect(spot).not.toBeNull();
    const { x, z, rotationY } = spot!;
    const d = Math.hypot(x - spawn.x, z - spawn.z);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(8);
    const probe = new THREE.Vector3(x, floorHeightAt(x, z) + 1.6, z);
    constrainWalker(probe);
    expect(Math.hypot(probe.x - x, probe.z - z)).toBeLessThan(0.05);
    // The glass (+z at yaw 0) turned toward the arrival point.
    const facing = [Math.sin(rotationY), Math.cos(rotationY)];
    const toSpawn = [(spawn.x - x) / d, (spawn.z - z) / d];
    expect(facing[0] * toSpawn[0] + facing[1] * toSpawn[1]).toBeGreaterThan(0.99);
  });

  it("keeps clear of the portals", () => {
    const spawn = { x: -13.03, y: -0.6, z: 58.35 };
    const free = findMirrorSpot(spawn, -1.4)!;
    const blocked = findMirrorSpot(spawn, -1.4, { at: { x: free.x, z: free.z }, facing: 0, worlds: [{ id: "a", label: "A" }] });
    expect(blocked === null || Math.hypot(blocked.x - free.x, blocked.z - free.z) > 3).toBe(true);
  });
});
