import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { clampToRooms, coastX, FIELD, floorHeightAt, setShore, SHORE, surfaceAt, swimmingAt } from "./layout";

describe("walking down to the beach", () => {
  afterEach(() => setShore(false));

  it("stops at the meadow's edge in a world without a beach", () => {
    const p = new THREE.Vector3(FIELD.maxX + 8, 0, 55);
    clampToRooms(p);
    expect(p.x).toBeLessThanOrEqual(FIELD.maxX);
  });

  it("goes on over the grass, down the sand, and into the shallows", () => {
    setShore(true);
    const onSand = new THREE.Vector3(coastX(55) + 4, 0, 55);
    clampToRooms(onSand);
    expect(onSand.x).toBeCloseTo(coastX(55) + 4);
    // Grass at the outer ground's level, then lower down the sand.
    expect(floorHeightAt(FIELD.maxX + 1, 55)).toBeCloseTo(-0.06);
    expect(floorHeightAt(coastX(55) + 6, 55)).toBeLessThan(-0.06);
    expect(surfaceAt(coastX(55) + SHORE.toWater + 1, 55)).toBe("water");
    // But not off over the horizon.
    const offshore = new THREE.Vector3(coastX(55) + 200, 0, 55);
    clampToRooms(offshore);
    expect(offshore.x).toBeLessThan(100);
  });

  it("wades the shallows, then swims out of your depth, head above the water", () => {
    setShore(true);
    const shallows = coastX(55) + SHORE.toWater + 4;
    expect(swimmingAt(shallows, 55)).toBe(false);
    expect(floorHeightAt(shallows, 55)).toBeGreaterThan(SHORE.seaY - 0.3);
    const deep = coastX(55) + 40;
    expect(swimmingAt(deep, 55)).toBe(true);
    // The floor a swimmer stands on: eyes (1.6 m up) just above the sea.
    const eye = floorHeightAt(deep, 55) + 1.6;
    expect(eye).toBeGreaterThan(SHORE.seaY);
    expect(eye).toBeLessThan(SHORE.seaY + 0.3);
    setShore(false);
    expect(swimmingAt(deep, 55)).toBe(false);
  });
});
