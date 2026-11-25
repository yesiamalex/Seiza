import { describe, expect, it } from "vitest";
import { parseExerEvent } from "./ride";
import { slopeFactor, VEHICLES, VEHICLE_SPECS, buildVehicle, riderPose } from "./vehicles";
import { newBodyPose } from "../body";
import { connectRideSource, disconnectRideSource, latestReading, registerRideSource, rideSources, type TrainerReading } from "../sport";

describe("ExerSeiza's rides", () => {
  it("go slower uphill, a little faster down, a moped least changed", () => {
    for (const v of VEHICLES) {
      expect(slopeFactor(v, 0)).toBe(1);
      expect(slopeFactor(v, 0.1)).toBeLessThan(1);
      expect(slopeFactor(v, -0.1)).toBeGreaterThan(1);
      expect(slopeFactor(v, 1)).toBeGreaterThanOrEqual(0.35);
    }
    expect(slopeFactor("moped", 0.1)).toBeGreaterThan(slopeFactor("bike", 0.1));
  });

  it("build with wheels to turn, and pose their riders", () => {
    for (const v of VEHICLES) {
      const built = buildVehicle(v);
      expect(built.wheels.length, v).toBeGreaterThan(0);
      const pose = riderPose(v, 0, newBodyPose());
      expect(Number.isFinite(pose.lean + pose.drop + pose.left[2] + pose.right[2]), v).toBe(true);
    }
    // Pedals half a turn apart: one foot up while the other is down.
    const p = riderPose("bike", 0, newBodyPose());
    expect(p.left[2]).not.toBeCloseTo(p.right[2], 3);
    expect(VEHICLE_SPECS.bike.bell).toBe("bell");
  });

  it("read only well-formed events", () => {
    expect(parseExerEvent({ k: "lo", v: "bike" })).toEqual({ k: "lo", vehicle: "bike" });
    expect(parseExerEvent({ k: "lo", v: "" })).toEqual({ k: "lo", vehicle: null });
    expect(parseExerEvent({ k: "lo", v: "tank" })).toBeNull();
    expect(parseExerEvent({ k: "bell" })).toEqual({ k: "bell" });
    expect(parseExerEvent({ k: "hu" })).toEqual({ k: "hu" });
  });
});

describe("SportSeiza's ride sources", () => {
  it("take readings from a connected source, and ignore stale ones", async () => {
    let send: (r: TrainerReading) => void = () => {};
    const gradients: number[] = [];
    registerRideSource({ id: "test", label: ["Test", "テスト"], connect: async () => {}, disconnect: () => {}, onReading: (l) => ((send = l), () => {}), setGradient: (g) => gradients.push(g) });
    expect(rideSources().some((s) => s.id === "test")).toBe(true);
    await connectRideSource("test");
    send({ speed: 5, at: performance.now() });
    expect(latestReading()?.speed).toBe(5);
    send({ speed: 5, at: performance.now() - 5000 });
    expect(latestReading()).toBeNull();
    disconnectRideSource();
  });
});
