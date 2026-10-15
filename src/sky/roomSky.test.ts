import { describe, expect, it } from "vitest";
import { roomSkyNow, roomSkySpeed, roomSkyWeather } from "./roomSky";
import { philippineTime } from "./weather";

const phtHour = (date: Date) => philippineTime(date).hour;
// 2026-03-10 02:00 UTC is 10:00 in the Philippines.
const T = Date.UTC(2026, 2, 10, 2, 0, 0);

describe("room sky time", () => {
  it("follows the real clock in real time", () => {
    expect(roomSkyNow({ mode: "realtime" }, T).getTime()).toBe(T);
  });

  it("holds a fixed sky at its hour on the same day", () => {
    const held = { mode: "fixed" as const, hour: 18.5 };
    expect(phtHour(roomSkyNow(held, T))).toBeCloseTo(18.5);
    expect(phtHour(roomSkyNow(held, T + 3 * 3600_000))).toBeCloseTo(18.5);
    expect(philippineTime(roomSkyNow(held, T)).dayOfYear).toBe(philippineTime(new Date(T)).dayOfYear);
  });

  it("runs from its hour at its speed since the server set it", () => {
    const running = { mode: "running" as const, hour: 6, scale: 60, setAt: T };
    expect(phtHour(roomSkyNow(running, T))).toBeCloseTo(6);
    // Two real minutes at 60x is two hours.
    expect(phtHour(roomSkyNow(running, T + 2 * 60_000))).toBeCloseTo(8);
    expect(roomSkySpeed(running)).toBe(60);
    expect(roomSkySpeed({ mode: "fixed", hour: 6 })).toBe(1);
    expect(roomSkySpeed(null)).toBe(1);
  });

  it("fixes the weather only when one is chosen", () => {
    expect(roomSkyWeather({ mode: "realtime", weather: "rain" })).toBe("rain");
    expect(roomSkyWeather({ mode: "realtime", weather: "auto" })).toBeNull();
    expect(roomSkyWeather(null)).toBeNull();
  });
});
