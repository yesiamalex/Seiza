import { describe, expect, it } from "vitest";
import defaultWorld from "../../public/worlds/default/world.json";
import seizoraWorld from "../../worlds/seizora/world/world.json";
import seilayaWorld from "../../worlds/seilaya/world/world.json";
import { CAMPFIRE, FIELD_Y, floorHeightAt, GARDEN_STEPS, isBlocked, OUTDOOR, placedBedSeat, SEATS, SLEEPING_BAG, TENT_DOORSTEP, facingVector } from "./layout";

describe("the campsite", () => {
  it("arrives every world outside the tent's door, facing the fire", () => {
    for (const world of [defaultWorld, seizoraWorld, seilayaWorld]) {
      const spawn = { ...world.spawnPoint, yaw: world.spawnRotationY };
      expect(Math.hypot(spawn.x - TENT_DOORSTEP[0], spawn.z - TENT_DOORSTEP[1])).toBeLessThan(0.05);
      expect(spawn.y).toBe(FIELD_Y);
      expect(isBlocked(spawn.x, spawn.z)).toBe(false);
      const [fx, fz] = facingVector(spawn.yaw);
      const toFire = Math.atan2(CAMPFIRE[0] - spawn.x, CAMPFIRE[1] - spawn.z) - Math.atan2(fx, fz);
      expect(Math.abs(Math.atan2(Math.sin(toFire), Math.cos(toFire)))).toBeLessThan(0.1);
    }
  });

  it("lays you on the sleeping bag and gets you up outside the tent", () => {
    const beds = SEATS.filter((seat) => seat.id.startsWith("camp-bed"));
    // Room for two, side by side.
    expect(beds).toHaveLength(2);
    expect(Math.hypot(beds[0].position[0] - beds[1].position[0], beds[0].position[2] - beds[1].position[2])).toBeGreaterThan(1);
    for (const bed of beds) {
      expect(bed.pose).toBe("lie");
      expect(bed.position[1]).toBeCloseTo(FIELD_Y + SLEEPING_BAG.top);
      expect(isBlocked(...bed.exit!)).toBe(false);
    }
  });

  it("gets you up beside a placed bed, whichever way it turns", () => {
    for (const yaw of [0, 1, 2.5, -2]) {
      const seat = placedBedSeat("b", [3, 0, 3], yaw);
      const [ex, ez] = seat.exit!;
      // Beside the bed: square to the way it lies, past its edge.
      const [fx, fz] = facingVector(yaw);
      expect(Math.abs((ex - 3) * fx + (ez - 3) * fz)).toBeLessThan(1e-9);
      expect(Math.hypot(ex - 3, ez - 3)).toBeGreaterThan(0.9);
    }
  });

  it("walks down the steps from the garden without a jump, and only there", () => {
    let last = floorHeightAt(GARDEN_STEPS.x, OUTDOOR.maxZ - 1);
    for (let z = OUTDOOR.maxZ - 1; z <= OUTDOOR.maxZ + 3; z += 0.05) {
      const y = floorHeightAt(GARDEN_STEPS.x, z);
      expect(Math.abs(y - last)).toBeLessThan(0.05);
      last = y;
    }
    expect(last).toBeCloseTo(FIELD_Y);
    expect(isBlocked(GARDEN_STEPS.x, OUTDOOR.maxZ - 0.1)).toBe(false);
    expect(isBlocked(5, OUTDOOR.maxZ - 0.1)).toBe(true);
  });
});
