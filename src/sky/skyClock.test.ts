import { afterEach, describe, expect, it, vi } from "vitest";
import { SkyClock, skyState } from "./skyState";

afterEach(() => vi.restoreAllMocks());

describe("SkyClock's weather", () => {
  it("brings a changed weather setting in within seconds, not half an hour", () => {
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const clear = new SkyClock({ cycle: "realtime", weather: "clear" });
    clear.update();
    expect(skyState.rain).toBeLessThan(0.05);

    // The room's weather is set to rain: a new clock, as SkyDriver makes.
    const rain = new SkyClock({ cycle: "realtime", weather: "rain" });
    rain.update();
    for (let i = 0; i < 60 * 6; i++) {
      now += 1000 / 60;
      rain.update();
    }
    expect(skyState.weather).toBe("rain");
    expect(skyState.rain).toBeGreaterThan(0.5);
  });

  it("carries the same weather on smoothly across a new clock (a reconnect)", () => {
    let now = 2_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const a = new SkyClock({ cycle: "realtime", weather: "overcast" });
    for (let i = 0; i < 10; i++) {
      now += 16;
      a.update();
    }
    const cloud = skyState.cloud;
    const b = new SkyClock({ cycle: "realtime", weather: "overcast" });
    b.update();
    expect(Math.abs(skyState.cloud - cloud)).toBeLessThan(0.02);
  });
});
