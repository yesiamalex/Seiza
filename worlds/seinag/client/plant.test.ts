import { describe, expect, it } from "vitest";
import { WeatherState } from "../../../src/sky/weather";
import { DEFAULT_CONTROLS } from "../../seizora/sim/energy";
import { campusLoad, CAMPUS, newCampusPlant, ROOFTOP_MWP, SITE } from "./plant";

const controls = { ...DEFAULT_CONTROLS, perovskite: false, wind: false };

/** Runs a clear day in March and returns its hourly snapshots. */
function day(type: "clear" | "rain") {
  const plant = newCampusPlant();
  const weather = new WeatherState(type);
  const out = [];
  for (let minute = 0; minute < 24 * 60; minute += 10) {
    weather.step(10, minute);
    out.push(plant.step(10, 80, minute / 60, SITE, weather, controls));
  }
  return out;
}

describe("Seinag's campus solar", () => {
  it("is sized by what fits on the roofs", () => {
    expect(ROOFTOP_MWP).toBeGreaterThan(0.05);
    expect(ROOFTOP_MWP).toBeLessThan(0.3);
    expect(CAMPUS.peakLoadMw).toBeGreaterThan(0.15);
    expect(CAMPUS.peakLoadMw).toBeLessThan(0.4);
  });

  it("makes nothing at night and most around noon", () => {
    const d = day("clear");
    expect(d[0].siliconMw).toBe(0);
    const noon = d[72];
    expect(noon.siliconMw).toBeGreaterThan(ROOFTOP_MWP * 0.5);
    expect(noon.siliconMw).toBeLessThan(ROOFTOP_MWP);
  });

  it("makes less in the rain", () => {
    const clear = day("clear").reduce((t, s) => t + s.siliconMw, 0);
    const rain = day("rain").reduce((t, s) => t + s.siliconMw, 0);
    expect(rain).toBeLessThan(clear * 0.6);
  });

  it("uses more on a working afternoon than at night, and more in the heat", () => {
    expect(campusLoad(14, 32)).toBeGreaterThan(campusLoad(2, 26) * 3);
    expect(campusLoad(14, 34)).toBeGreaterThan(campusLoad(14, 28));
  });
});
