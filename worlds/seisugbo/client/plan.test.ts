import { describe, expect, it } from "vitest";
import { SEAT_HEIGHT } from "../../../src/scene/layout";
import { CHAIRS, COURT, COURT_BENCH, seisugboSeats, STORE_BENCH, Y } from "./plan";

describe("Seisugbo's seats", () => {
  const seats = seisugboSeats();

  it("gives the court's bench six places, the store's two, and each chair one, each its own id", () => {
    expect(seats).toHaveLength(6 + 2 + CHAIRS.length);
    expect(new Set(seats.map((s) => s.id)).size).toBe(seats.length);
    for (const seat of seats) expect(seat.id.startsWith("seisugbo-")).toBe(true);
  });

  it("keeps the court's places along its bench, at its height, facing the court", () => {
    for (const seat of seats.filter((s) => s.id.startsWith("seisugbo-court"))) {
      expect(Math.abs(seat.position[0] - COURT_BENCH.x)).toBeLessThan(COURT_BENCH.length / 2);
      expect(seat.position[1] + SEAT_HEIGHT).toBeCloseTo(Y + COURT_BENCH.height);
      expect(seat.position[2]).toBeGreaterThan(COURT.z0);
      expect(seat.rotationY).toBeCloseTo(Math.PI);
    }
  });

  it("keeps the store's places on its bench", () => {
    for (const seat of seats.filter((s) => s.id.startsWith("seisugbo-store"))) {
      expect(Math.abs(seat.position[0] - STORE_BENCH.x)).toBeLessThan(STORE_BENCH.length / 2);
      expect(Math.abs(seat.position[2] - STORE_BENCH.z)).toBeLessThan(0.2);
    }
  });
});
