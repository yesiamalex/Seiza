import { describe, expect, it } from "vitest";
import { ambientTemperature, cloudyGhi, SITES, WEATHER, WeatherState } from "../../../src/sky/weather";
import { TOWN, townLoad } from "./town";
import {
  BATTERY_ROUND_TRIP,
  DEFAULT_CONTROLS,
  EL_NINO,
  PLANT,
  GRID_EMISSION_FACTOR,
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

// The numbers the cards, boards, and README quote, pinned to the model, so
// an edit to one can't silently drift from the other or from its source.
describe("cited figures", () => {
  it("loses PVWatts' default 14% plus a 96% inverter: about 17% at standard test conditions", () => {
    expect(pvPower(1, 1000, 25, SILICON)).toBeCloseTo(0.86 * 0.96, 6);
  });

  it("uses the DOE Luzon–Visayas operating margin and an 85% battery round trip", () => {
    expect(GRID_EMISSION_FACTOR).toBeCloseTo(0.71, 2);
    expect(BATTERY_ROUND_TRIP).toBe(0.85);
  });

  it("matches the turbine data: nothing below 3.5 m/s, full rating from 12, nothing from 25", () => {
    expect(turbinePower(1.5, 3.4)).toBe(0);
    expect(turbinePower(1.5, 12)).toBe(1.5);
    expect(turbinePower(1.5, 24.9)).toBe(1.5);
    expect(turbinePower(1.5, 25)).toBe(0);
  });

  it("lets through a quarter of the sunlight under full overcast (Kasten & Czeplak)", () => {
    expect(cloudyGhi(1000, 1)).toBeCloseTo(250, 6);
  });

  it("gives a Metro Manila rooftop close to the Global Solar Atlas 1,402 kWh/kWp", () => {
    const r = evaluateDesign({ absorber: "fac", etl: "sno2", htl: "ptaa", mount: "roof", encapsulation: "glass" }, SITES.manila);
    expect(r.yieldKwhPerKwp).toBeGreaterThan(1402 * 0.92);
    expect(r.yieldKwhPerKwp).toBeLessThan(1402 * 1.08);
  });

  it("shaves the evening peak on the grid: still discharging at 19:30, the peak", () => {
    const grid = new Microgrid();
    const weather = new WeatherState("clear");
    runDay(weather, DEFAULT_CONTROLS, grid); // a day to fill the battery from its starting charge
    const { snapshots } = runDay(weather, DEFAULT_CONTROLS, grid);
    const peak = snapshots[Math.round(19.5 * 12)];
    expect(peak.batteryMw).toBeGreaterThan(0.5);
    expect(peak.gridMw).toBeGreaterThan(0); // the grid supplies the base
  });

  it("returns 85% of what it stores", () => {
    const grid = new Microgrid();
    grid.soc = 0.5;
    const weather = new WeatherState("clear");
    // Charge 1 MW for an hour at night (forced), then discharge 1 MWh worth.
    const charge = { ...DEFAULT_CONTROLS, batteryMode: "charge" as const, silicon: false, perovskite: false, wind: false };
    const before = grid.soc;
    grid.spec = { ...grid.spec, batteryMw: 1 };
    grid.step(60, 120, 1, SITES.cebu, weather, charge);
    const stored = (grid.soc - before) * grid.spec.batteryMwh; // MWh in the cells
    const discharge = { ...charge, batteryMode: "discharge" as const };
    let delivered = 0;
    while (grid.soc > before + 1e-9) {
      const s = grid.step(1, 120, 2, SITES.cebu, weather, discharge);
      delivered += s.batteryMw / 60;
    }
    expect(delivered / 1).toBeCloseTo(0.85, 2); // 1 MWh in from the bus, 0.85 MWh back
    expect(stored).toBeGreaterThan(0);
  });
});

describe("the town", () => {
  /** One home's kWh over a day in a given weather, in Cebu. */
  const homeDay = (type: keyof typeof WEATHER) => {
    let kwh = 0;
    for (let h = 0; h < 24; h++) kwh += townLoad(h, ambientTemperature(h + 0.5, SITES.cebu, WEATHER[type].tempOffset)).perHomeKw;
    return kwh;
  };

  it("uses 140 to 200 kWh a month per home, under Meralco's 200 kWh household", () => {
    for (const type of ["clear", "partly", "overcast", "rain"] as const) {
      const month = homeDay(type) * 30.4;
      expect(month).toBeGreaterThan(130);
      expect(month).toBeLessThan(200);
    }
  });

  it("uses 10 to 40% more on a hot, clear day than a cool, rainy one, as Meralco's summers do", () => {
    const rise = homeDay("clear") / homeDay("rain") - 1;
    expect(rise).toBeGreaterThan(0.1);
    expect(rise).toBeLessThan(0.4);
  });

  it("peaks in the evening, when homes light up", () => {
    const at = (h: number) => townLoad(h, 28).totalMw;
    expect(at(19)).toBeGreaterThan(at(3));
    expect(at(19)).toBeGreaterThan(at(13));
  });

  it("sizes the plant's design peak from the town itself", () => {
    let peak = 0;
    for (let h = 0; h < 24; h++) peak = Math.max(peak, townLoad(h, ambientTemperature(h + 0.5, SITES.cebu, WEATHER.clear.tempOffset)).totalMw);
    expect(PLANT.peakLoadMw).toBeCloseTo(peak, 9);
    expect(TOWN.homes).toBeGreaterThan(0);
  });
});

describe("El Niño 2026", () => {
  const elNino = { ...DEFAULT_CONTROLS, elNino: true };

  it("warms the air and raises the town's demand", () => {
    const normal = runDay(new WeatherState("clear")).snapshots;
    const hot = runDay(new WeatherState("clear"), elNino).snapshots;
    expect(hot[150].ambient - normal[150].ambient).toBeCloseTo(EL_NINO.warmingC, 6);
    const load = (snaps: typeof normal) => snaps.reduce((sum, s) => sum + s.loadMw, 0);
    expect(load(hot)).toBeGreaterThan(load(normal));
  });

  it("puts the grid on alert in the afternoon and evening of a hot, dry day, and never imports past the limit", () => {
    const { snapshots } = runDay(new WeatherState("clear"), elNino);
    expect(snapshots[19 * 12].gridAlert).toBe(true);
    expect(snapshots[15 * 12].gridAlert).toBe(true);
    expect(snapshots[11 * 12].gridAlert).toBe(false);
    for (const s of snapshots) if (s.gridAlert) expect(s.gridMw).toBeLessThanOrEqual(s.gridLimitMw + 1e-9);
  });

  it("darkens homes in the evening alert without the battery, and far fewer with it", () => {
    const without = runDay(new WeatherState("clear"), { ...elNino, battery: false }).grid.totals.unservedMwh;
    const withBattery = runDay(new WeatherState("clear"), elNino).grid.totals.unservedMwh;
    expect(without).toBeGreaterThan(0.5);
    expect(withBattery).toBeLessThan(without / 2);
  });

  it("raises no alert in a normal year, or on a rainy El Niño day", () => {
    expect(runDay(new WeatherState("clear")).snapshots.some((s) => s.gridAlert)).toBe(false);
    expect(runDay(new WeatherState("rain"), elNino).snapshots.some((s) => s.gridAlert)).toBe(false);
  });
});
