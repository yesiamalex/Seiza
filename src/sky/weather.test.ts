import { describe, expect, it } from "vitest";
import { clearSkyGhi, cloudyGhi, SITES, skyColors, sunPosition, WeatherState } from "./weather";

describe("sunPosition", () => {
  it("puts the sun high near local noon and below the horizon at midnight in Cebu", () => {
    const noon = sunPosition(172, 12, SITES.cebu);
    expect(noon.elevation).toBeGreaterThan(70);
    expect(sunPosition(172, 0, SITES.cebu).elevation).toBeLessThan(-40);
  });

  it("rises in the east and sets in the west", () => {
    const morning = sunPosition(80, 7, SITES.manila);
    const evening = sunPosition(80, 17, SITES.manila);
    expect(morning.azimuth).toBeGreaterThan(45);
    expect(morning.azimuth).toBeLessThan(135);
    expect(evening.azimuth).toBeGreaterThan(225);
    expect(evening.azimuth).toBeLessThan(315);
  });
});

describe("irradiance", () => {
  it("is zero at night and about 1,000 W/m² under a high clear sun", () => {
    expect(clearSkyGhi(-5)).toBe(0);
    expect(clearSkyGhi(80)).toBeGreaterThan(950);
    expect(clearSkyGhi(80)).toBeLessThan(1100);
  });

  it("drops to about a quarter under full cloud", () => {
    expect(cloudyGhi(1000, 1)).toBeCloseTo(250, 0);
    expect(cloudyGhi(1000, 0)).toBe(1000);
  });
});

describe("WeatherState", () => {
  it("eases toward a new weather type rather than jumping", () => {
    const w = new WeatherState("clear");
    w.setType("rain");
    w.step(5, 5);
    expect(w.cloud).toBeGreaterThan(0.05);
    expect(w.cloud).toBeLessThan(0.5);
    for (let t = 10; t < 300; t += 5) w.step(5, t);
    expect(w.cloud).toBeGreaterThan(0.9);
  });

  it("brings typhoon-strength wind", () => {
    const w = new WeatherState("typhoon");
    w.step(1, 1);
    expect(w.windSpeed()).toBeGreaterThan(15);
  });
});

describe("skyColors", () => {
  it("changes smoothly through dusk: no jump between neighbouring elevations", () => {
    let previous = skyColors(20);
    for (let e = 19.5; e >= -18; e -= 0.5) {
      const next = skyColors(e);
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(next.bottom[c] - previous.bottom[c])).toBeLessThan(25);
        expect(Math.abs(next.top[c] - previous.top[c])).toBeLessThan(25);
      }
      previous = next;
    }
  });

  it("is dark at night and greyer under cloud by day", () => {
    const night = skyColors(-30);
    expect(Math.max(...night.top)).toBeLessThan(30);
    expect(night.daylight).toBe(0);
    const clear = skyColors(45, 0);
    const cloudy = skyColors(45, 1);
    const saturation = (c: number[]) => Math.max(...c) - Math.min(...c);
    expect(saturation(cloudy.top)).toBeLessThan(saturation(clear.top));
  });
});
