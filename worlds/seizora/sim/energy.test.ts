import { describe, expect, it } from "vitest";
import { SITES, WeatherState } from "../../../src/sky/weather";
import {
  DEFAULT_CONTROLS,
  evaluateDesign,
  loadFraction,
  Microgrid,
  perovskiteDecayPerHour,
  planeOfArrayIrradiance,
  pvPower,
  SILICON,
  turbinePower,
} from "./energy";

/** Runs the microgrid through a whole day in five-minute steps. */
function runDay(weather: WeatherState, controls = DEFAULT_CONTROLS, grid = new Microgrid()) {
  const snapshots = [];
  for (let m = 0; m < 24 * 60; m += 5) {
    weather.step(5, m);
    snapshots.push(grid.step(5, 120, m / 60, SITES.cebu, weather, controls));
  }
  return { grid, snapshots };
}

describe("solar", () => {
  it("produces nothing at night and close to rating at a clear noon", () => {
    expect(pvPower(1, 0, 25, SILICON)).toBe(0);
    expect(pvPower(1, 1000, 25, SILICON)).toBeGreaterThan(0.8);
  });

  it("loses output as the cells heat up", () => {
    expect(pvPower(1, 1000, 60, SILICON)).toBeLessThan(pvPower(1, 1000, 25, SILICON));
  });

  it("gets more on a south-facing tilt than on an east facade at noon", () => {
    const south = planeOfArrayIrradiance(900, 75, 180, 0.1, 15, 180);
    const eastFacade = planeOfArrayIrradiance(900, 75, 180, 0.1, 90, 90);
    expect(south).toBeGreaterThan(eastFacade);
  });
});

describe("wind", () => {
  it("follows the power curve and cuts out in a typhoon", () => {
    expect(turbinePower(1.5, 2)).toBe(0);
    expect(turbinePower(1.5, 8)).toBeGreaterThan(0);
    expect(turbinePower(1.5, 15)).toBe(1.5);
    expect(turbinePower(1.5, 27)).toBe(0);
  });
});

describe("load", () => {
  it("peaks in the evening", () => {
    expect(loadFraction(19.5)).toBeGreaterThan(loadFraction(3));
    expect(loadFraction(19.5)).toBeGreaterThan(loadFraction(13));
  });
});

describe("Microgrid", () => {
  it("stores the midday surplus and spends it in the evening", () => {
    const { snapshots } = runDay(new WeatherState("clear"));
    const noon = snapshots[12 * 12];
    const evening = snapshots[18 * 12];
    expect(noon.batteryMw).toBeLessThanOrEqual(0); // charging or idle
    expect(evening.batteryMw).toBeGreaterThan(0); // discharging
  });

  it("balances every step when grid-connected", () => {
    const { snapshots } = runDay(new WeatherState("partly"));
    for (const s of snapshots) {
      const balance = s.siliconMw + s.perovskiteMw + s.windMw + s.batteryMw + s.gridMw - s.loadMw;
      expect(Math.abs(balance)).toBeLessThan(1e-9);
    }
  });

  it("sheds load in island mode when the battery runs out on a rainy night", () => {
    const { grid } = runDay(new WeatherState("rain"), { ...DEFAULT_CONTROLS, gridConnected: false, wind: false });
    expect(grid.totals.unservedMwh).toBeGreaterThan(0);
    expect(grid.events.some((e) => e.text.includes("load shed"))).toBe(true);
  });

  it("feathers the turbines in a typhoon", () => {
    const { snapshots } = runDay(new WeatherState("typhoon"));
    expect(snapshots.some((s) => s.turbinesFeathered && s.windMw === 0)).toBe(true);
  });

  it("never lets the battery leave its limits", () => {
    const { snapshots } = runDay(new WeatherState("clear"), { ...DEFAULT_CONTROLS, batteryMode: "charge" });
    for (const s of snapshots) {
      expect(s.soc).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(s.soc).toBeLessThanOrEqual(0.95 + 1e-9);
    }
  });
});

describe("perovskite durability", () => {
  it("fades far faster unsealed in humid heat than in a glass-glass module", () => {
    expect(perovskiteDecayPerHour(90, 55, 900, "none")).toBeGreaterThan(perovskiteDecayPerHour(90, 55, 900, "glass") * 10);
  });

  it("gives a sealed rooftop design a longer life than an unsealed one", () => {
    const base = { absorber: "fac", etl: "sno2", htl: "ptaa", mount: "roof" } as const;
    const sealed = evaluateDesign({ ...base, encapsulation: "glass" }, SITES.cebu);
    const bare = evaluateDesign({ ...base, encapsulation: "none" }, SITES.cebu);
    expect(sealed.t80Months).toBeGreaterThan(bare.t80Months);
    expect(sealed.yieldKwhPerKwp).toBeGreaterThan(900);
    expect(sealed.yieldKwhPerKwp).toBeLessThan(2000);
  });
});
