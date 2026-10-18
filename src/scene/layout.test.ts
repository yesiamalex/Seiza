import { describe, expect, it } from "vitest";
import defaultWorld from "../../public/worlds/default/world.json";
import seizoraWorld from "../../worlds/seizora/world/world.json";
import seilayaWorld from "../../worlds/seilaya/world/world.json";
import { CAMPFIRE, FIELD_Y, isBlocked, placedBedSeat, SEATS, SLEEPING_BAG, TENT_DOORSTEP, facingVector } from "./layout";

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
    const bed = SEATS.find((seat) => seat.id === "camp-bed")!;
    expect(bed.pose).toBe("lie");
    expect(bed.position[1]).toBeCloseTo(FIELD_Y + SLEEPING_BAG.top);
    expect(isBlocked(...bed.exit!)).toBe(false);
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
});
