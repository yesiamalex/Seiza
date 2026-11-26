import { describe, expect, it } from "vitest";
import { BUS_DOORS, busCabin, CARS, clearAt, TRAIN_DOORS, trainCabin } from "./cabins";
import { BUS, CAR, TRAIN_LENGTH } from "./vehicles";

/** The player's own radius (layout.ts's PLAYER_RADIUS). */
const R = 0.4;

describe("the train's inside", () => {
  const cabin = trainCabin();
  it("has an aisle you can walk the whole way down, between the cars too", () => {
    const cab = TRAIN_LENGTH / 2 - (CAR.length / 2 - 4.7);
    for (let z = -cab + R + 0.05; z <= cab - R - 0.05; z += 0.1) expect(clearAt(cabin, 0, z, R, false), `z ${z.toFixed(2)}`).toBe(true);
  });
  it("walks in through each door on the platforms' side while they're open, and not when shut", () => {
    for (const { cz } of CARS)
      for (const dz of TRAIN_DOORS) {
        for (let x = -CAR.width / 2 - 0.6; x <= 0; x += 0.1) expect(clearAt(cabin, x, cz + dz, R, true), `x ${x.toFixed(2)}`).toBe(true);
        expect(clearAt(cabin, -CAR.width / 2 + 0.03, cz + dz, R, false)).toBe(false);
      }
  });
  it("gets up from every seat into the aisle", () => {
    for (const s of cabin.seats) expect(clearAt(cabin, s.exit[0], s.exit[1], R, false), s.id).toBe(true);
  });
});

describe("the bus's inside", () => {
  const cabin = busCabin();
  it("walks in at either door and down to the back", () => {
    for (const [a, b] of BUS_DOORS) for (let x = BUS.width / 2 + 0.6; x >= 0.25; x -= 0.1) expect(clearAt(cabin, x, (a + b) / 2, R, true), `x ${x.toFixed(2)} at ${a}`).toBe(true);
    // In from the front door past the driver, then down the aisle.
    for (let z = 3.45; z >= 1.9; z -= 0.1) expect(clearAt(cabin, 0.2, z, R, false), `front ${z.toFixed(2)}`).toBe(true);
    for (let z = 1.9; z >= -3.15; z -= 0.1) expect(clearAt(cabin, 0, z, R, false), `aisle ${z.toFixed(2)}`).toBe(true);
  });
  it("gets up from every seat into the aisle", () => {
    for (const s of cabin.seats) expect(clearAt(cabin, s.exit[0], s.exit[1], R, false), s.id).toBe(true);
  });
  it("keeps everything inside its body", () => {
    for (const b of cabin.blocks) {
      expect(Math.abs(b.x) + b.hx).toBeLessThanOrEqual(BUS.width / 2 + 1e-6);
      expect(Math.abs(b.z) + b.hz).toBeLessThanOrEqual(BUS.length / 2 + 1e-6);
    }
  });
});
