/**
 * Seizora's microgrid: a solar farm with a perovskite pilot row, two wind
 * turbines, a battery, and a community load, run minute by minute from
 * Seiza's shared weather engine (src/sky/weather.ts).
 *
 * A learning model. The physics is the standard textbook kind (irradiance
 * on a tilted panel, temperature derating, a turbine power curve, battery
 * efficiency and limits), but the plant is invented and the weather is
 * synthetic; real estimates need measured equipment data and local
 * weather records. Each constant below names its source; the full list is
 * in references.ts and worlds/seizora/README.md.
 */
import {
  ambientTemperature,
  clearSkyGhi,
  cloudyGhi,
  sunPosition,
  WeatherState,
  type Site,
} from "../../../src/sky/weather";

export interface PlantSpec {
  /** Silicon PV, MW peak. */
  siliconMwp: number;
  /** Perovskite pilot, MW peak. */
  perovskiteMwp: number;
  /** Number of wind turbines and each one's rating, MW. */
  turbines: number;
  turbineMw: number;
  /** Battery energy, MWh, and power limit, MW. */
  batteryMwh: number;
  batteryMw: number;
  /** Peak community load, MW. */
  peakLoadMw: number;
}

/**
 * The plant. A community microgrid of this size would cover about 4 to 5
 * hectares of panels (4.2 MWp at about 20% module efficiency is roughly
 * 2.1 ha of modules, spaced in rows) and use turbines with rotors about
 * 70 to 77 m across on towers about 80 m tall. The garden shows a few rows
 * and two scale-model turbines standing in for it.
 */
export const PLANT: PlantSpec = {
  siliconMwp: 3.6,
  perovskiteMwp: 0.6,
  turbines: 2,
  turbineMw: 1.5,
  batteryMwh: 6,
  batteryMw: 3,
  peakLoadMw: 3.2,
};

/** Panel tilt and facing used for the farm: 15° toward the south. */
const TILT_DEG = 15;
/** CO2 per MWh of grid generation the plant displaces: the Luzon–Visayas
 *  simple operating margin, 0.7122 tCO2/MWh (DOE Philippines, 2015–2017
 *  National Grid Emission Factor). */
export const GRID_EMISSION_FACTOR = 0.71;

/** Round-trip efficiency of the battery: 85%, the representative value for
 *  utility-scale lithium-ion storage (Cole & Frazier, 2019); the US fleet
 *  averaged 82% in 2019 (EIA, 2021). */
export const BATTERY_ROUND_TRIP = 0.85;
export const BATTERY_ONE_WAY_EFFICIENCY = Math.sqrt(BATTERY_ROUND_TRIP);
export const SOC_MIN = 0.1;
export const SOC_MAX = 0.95;
/**
 * Peak shaving: grid-connected, Auto covers only the part of the load above
 * this level, so a battery far smaller than the evening's energy can still
 * flatten its peak for the whole evening while the grid supplies the base.
 * This is the usual job of a grid-tied community battery. In island mode
 * there is no grid to supply the base, so Auto covers all it can.
 */
export const PEAK_SHAVE_FRACTION = 0.65;

// --- solar -------------------------------------------------------------------

/**
 * Irradiance on a tilted panel, from horizontal irradiance: the direct part
 * scales with the cosine of the angle between the sun and the panel, and
 * the diffuse part (more of it under cloud) comes evenly from the visible
 * sky, the isotropic model (Duffie & Beckman, 2013, ch. 2). The split
 * between direct and diffuse is a simple function of cloud rather than a
 * fitted correlation, and light reflected from the ground is left out (it
 * matters little at 15° of tilt, more on a facade), so this shows why tilt
 * and orientation matter rather than predicting a site.
 */
export function planeOfArrayIrradiance(ghi: number, sunEl: number, sunAz: number, cloud: number, tiltDeg = TILT_DEG, facingAzDeg = 180): number {
  if (ghi <= 0 || sunEl <= 0) return 0;
  const d = Math.PI / 180;
  const diffuseShare = 0.15 + 0.75 * cloud;
  const beamHorizontal = ghi * (1 - diffuseShare);
  const cosZenith = Math.sin(sunEl * d);
  const cosIncidence =
    Math.sin(sunEl * d) * Math.cos(tiltDeg * d) + Math.cos(sunEl * d) * Math.sin(tiltDeg * d) * Math.cos((sunAz - facingAzDeg) * d);
  const beam = cosZenith > 0.05 ? (beamHorizontal * Math.max(0, cosIncidence)) / cosZenith : 0;
  const diffuse = ghi * diffuseShare * ((1 + Math.cos(tiltDeg * d)) / 2);
  return Math.max(0, beam + diffuse);
}

/** Cell temperature from ambient and irradiance by the NOCT method,
 *  T = Ta + (NOCT − 20) / 800 × G, with a NOCT of 45 °C (Duffie & Beckman,
 *  2013, ch. 23), and a simple allowance for wind cooling the panel. */
export function cellTemperature(ambient: number, poa: number, wind: number): number {
  return ambient + ((45 - 20) / 800) * poa * (1 - Math.min(0.3, wind * 0.02));
}

export interface CellTech {
  label: string;
  /** Power change per °C above 25 °C. */
  tempCoeff: number;
}
/** Crystalline silicon loses about 0.3 to 0.45% of its power per °C;
 *  0.35% is typical of today's modules (Dupré, Vaillon & Green, 2015). */
export const SILICON: CellTech = { label: "Silicon", tempCoeff: -0.0035 };
/** −0.17% per °C, measured between 25 and 85 °C and validated outdoors
 *  (Jošt et al., 2020). */
export const PEROVSKITE: CellTech = { label: "Perovskite", tempCoeff: -0.0017 };

/** PVWatts' default system losses, 14% (soiling, shading, mismatch,
 *  wiring, connections, light-induced degradation, nameplate, and
 *  availability), and its nominal inverter efficiency, 96% (Dobos, 2014). */
export const SYSTEM_LOSSES = 0.14;
export const INVERTER_EFFICIENCY = 0.96;

/** PV output in MW (AC) for a plant rating, plane-of-array irradiance, and
 *  cell temperature; `health` is the remaining fraction after degradation.
 *  Ratings are at standard test conditions, 1,000 W/m² and 25 °C. */
export function pvPower(mwp: number, poa: number, cellTemp: number, tech: CellTech, health = 1): number {
  const derate = 1 + tech.tempCoeff * (cellTemp - 25);
  return Math.max(0, mwp * (poa / 1000) * derate * (1 - SYSTEM_LOSSES) * INVERTER_EFFICIENCY * health);
}

// --- perovskite durability -----------------------------------------------------

export type Encapsulation = "none" | "edge" | "glass";
export const ENCAPSULATION: Record<Encapsulation, { label: string; protection: number }> = {
  none: { label: "None (lab cell)", protection: 1 },
  edge: { label: "Edge seal", protection: 0.04 },
  glass: { label: "Glass-glass with edge seal", protection: 0.0025 },
};

/**
 * Fraction of output lost per hour of exposure. Moisture, oxygen, heat,
 * and light are the known stressors of perovskite cells (Boyd et al.,
 * 2019), and moisture is the one encapsulation keeps out. The rates here
 * are illustrative, set so the ordering matches the literature (an
 * unsealed cell in humid heat fails within weeks; an edge-sealed one over
 * months; a glass-glass module keeps about 97% after a year here), not
 * fitted to measured modules. T80, the time to 80% of initial output, is
 * the stability measure the ISOS consensus reports (Khenkin et al., 2020).
 */
export function perovskiteDecayPerHour(humidity: number, cellTemp: number, poa: number, enc: Encapsulation): number {
  const moisture = Math.pow(Math.max(0, humidity - 30) / 70, 2) * 0.004;
  const heat = Math.max(0, cellTemp - 45) * 0.00004;
  const light = (poa / 1000) * 0.00002;
  return (moisture + heat + light) * ENCAPSULATION[enc].protection;
}

// --- wind ----------------------------------------------------------------------

/** A 1.5 MW turbine's operating range: it starts making power at about
 *  3.5 m/s, reaches its rating at 12 m/s, and shuts down when the
 *  ten-minute average passes 25 m/s (GE 1.5 MW data). */
export const CUT_IN = 3.5;
export const RATED_SPEED = 12;
export const CUT_OUT = 25;

/**
 * One turbine's output in MW at a hub-height wind speed. The power carried
 * by the wind is P = ½ρAv³ (Manwell, McGowan & Rogers, 2009), so between
 * cut-in and rated speed the output follows the cube of the wind speed;
 * above rated speed the blades pitch to hold the rating.
 */
export function turbinePower(ratedMw: number, wind: number): number {
  if (wind < CUT_IN || wind >= CUT_OUT) return 0;
  if (wind >= RATED_SPEED) return ratedMw;
  return (ratedMw * (wind ** 3 - CUT_IN ** 3)) / (RATED_SPEED ** 3 - CUT_IN ** 3);
}

// --- load ------------------------------------------------------------------------

/** Community load as a fraction of peak: a small morning rise, a midday
 *  plateau (school and clinic), and the evening peak when homes light up.
 *  An illustrative shape for a small rural community, not a measured
 *  feeder profile. */
export function loadFraction(hour: number, temp = 28): number {
  const g = (mu: number, sigma: number) => Math.exp(-(((hour - mu) / sigma) ** 2) / 2);
  const base = 0.38 + 0.18 * g(7.5, 1.4) + 0.3 * g(13, 3) + 0.55 * g(19.5, 1.8);
  const cooling = Math.max(0, temp - 30) * 0.02; // air conditioning on hot afternoons
  return Math.min(1, base + cooling);
}

// --- the plant ----------------------------------------------------------------------

export type BatteryMode = "auto" | "charge" | "hold" | "discharge";

export interface Controls {
  silicon: boolean;
  perovskite: boolean;
  wind: boolean;
  battery: boolean;
  gridConnected: boolean;
  batteryMode: BatteryMode;
  encapsulation: Encapsulation;
}

export const DEFAULT_CONTROLS: Controls = {
  silicon: true,
  perovskite: true,
  wind: true,
  battery: true,
  gridConnected: true,
  batteryMode: "auto",
  encapsulation: "glass",
};

export interface Snapshot {
  hour: number;
  dayOfYear: number;
  sunElevation: number;
  ghi: number;
  poa: number;
  ambient: number;
  cellTemp: number;
  windSpeed: number;
  cloud: number;
  humidity: number;
  rain: number;
  siliconMw: number;
  perovskiteMw: number;
  windMw: number;
  /** Positive when the battery discharges into the grid, negative when it charges. */
  batteryMw: number;
  loadMw: number;
  /** Positive when importing from the main grid, negative when exporting. */
  gridMw: number;
  /** Load the island could not serve (grid disconnected). */
  unservedMw: number;
  soc: number;
  perovskiteHealth: number;
  turbinesFeathered: boolean;
}

export interface Totals {
  generatedMwh: number;
  loadMwh: number;
  importedMwh: number;
  exportedMwh: number;
  unservedMwh: number;
  co2AvoidedT: number;
}

export interface PlantEvent {
  hour: number;
  dayOfYear: number;
  text: string;
  level: "info" | "warn";
}

export class Microgrid {
  soc = 0.55;
  perovskiteHealth = 1;
  totals: Totals = { generatedMwh: 0, loadMwh: 0, importedMwh: 0, exportedMwh: 0, unservedMwh: 0, co2AvoidedT: 0 };
  events: PlantEvent[] = [];
  last: Snapshot | null = null;
  private feathered = false;
  private lowSocWarned = false;

  constructor(public spec: PlantSpec = PLANT) {}

  /** Advances by `minutes` at the given simulated time and weather. */
  step(minutes: number, dayOfYear: number, hour: number, site: Site, weather: WeatherState, c: Controls): Snapshot {
    const hours = minutes / 60;
    const sun = sunPosition(dayOfYear, hour, site);
    const cloud = weather.effectiveCloud();
    const ghi = cloudyGhi(clearSkyGhi(sun.elevation), cloud);
    const poa = planeOfArrayIrradiance(ghi, sun.elevation, sun.azimuth, cloud);
    const ambient = ambientTemperature(hour, site, weather.tempOffset);
    const wind = weather.windSpeed();
    const cellTemp = cellTemperature(ambient, poa, wind);

    // Perovskite ageing runs whether or not its breaker is closed: an
    // installed module weathers either way.
    this.perovskiteHealth = Math.max(
      0,
      this.perovskiteHealth * (1 - perovskiteDecayPerHour(weather.humidity, cellTemp, poa, c.encapsulation) * hours)
    );

    const siliconMw = c.silicon ? pvPower(this.spec.siliconMwp, poa, cellTemp, SILICON) : 0;
    const perovskiteMw = c.perovskite ? pvPower(this.spec.perovskiteMwp, poa, cellTemp, PEROVSKITE, this.perovskiteHealth) : 0;

    const feathered = wind >= CUT_OUT;
    if (feathered !== this.feathered) {
      this.log(dayOfYear, hour, feathered ? `Wind ${wind.toFixed(1)} m/s is past cut-out: turbines feathered and braked.` : "Wind back below cut-out: turbines restarting.", feathered ? "warn" : "info");
      this.feathered = feathered;
    }
    const windMw = c.wind ? this.spec.turbines * turbinePower(this.spec.turbineMw, wind) : 0;
    const generation = siliconMw + perovskiteMw + windMw;
    const loadMw = this.spec.peakLoadMw * loadFraction(hour, ambient);

    // Battery dispatch.
    let batteryMw = 0;
    const net = generation - loadMw; // surplus when positive
    const energy = this.spec.batteryMwh;
    const maxDischarge = c.battery ? Math.min(this.spec.batteryMw, (Math.max(0, this.soc - SOC_MIN) * energy * BATTERY_ONE_WAY_EFFICIENCY) / Math.max(hours, 1e-6)) : 0;
    const maxCharge = c.battery ? Math.min(this.spec.batteryMw, (Math.max(0, SOC_MAX - this.soc) * energy) / BATTERY_ONE_WAY_EFFICIENCY / Math.max(hours, 1e-6)) : 0;
    if (c.battery) {
      switch (c.batteryMode) {
        case "auto": {
          if (net >= 0) {
            batteryMw = -Math.min(net, maxCharge); // store the surplus
          } else {
            const threshold = c.gridConnected ? PEAK_SHAVE_FRACTION * this.spec.peakLoadMw : 0;
            const aboveThreshold = Math.max(0, loadMw - Math.max(threshold, generation));
            batteryMw = Math.min(c.gridConnected ? aboveThreshold : -net, maxDischarge);
          }
          break;
        }
        case "charge":
          batteryMw = -maxCharge;
          break;
        case "discharge":
          batteryMw = maxDischarge;
          break;
        case "hold":
          batteryMw = 0;
          break;
      }
    }
    // Without the grid, the battery cannot charge from it: cap charging at the surplus.
    if (!c.gridConnected && batteryMw < 0) batteryMw = -Math.min(-batteryMw, Math.max(0, net));
    if (batteryMw > 0) this.soc -= (batteryMw * hours) / BATTERY_ONE_WAY_EFFICIENCY / energy;
    else this.soc -= (batteryMw * hours * BATTERY_ONE_WAY_EFFICIENCY) / energy;
    this.soc = Math.min(SOC_MAX, Math.max(SOC_MIN, this.soc));

    let balance = generation + batteryMw - loadMw; // what's left after load and battery
    let gridMw = 0;
    let unservedMw = 0;
    if (c.gridConnected) {
      gridMw = -balance; // import a shortfall, export a surplus
    } else if (balance < 0) {
      unservedMw = -balance; // island: shed what can't be served
    }
    balance = 0;

    if (!c.gridConnected && unservedMw > 0.05 && !this.lowSocWarned) {
      this.log(dayOfYear, hour, `Island mode: ${unservedMw.toFixed(2)} MW of load shed. The battery is ${(this.soc * 100).toFixed(0)}% full.`, "warn");
      this.lowSocWarned = true;
    }
    if (unservedMw < 0.01) this.lowSocWarned = false;

    this.totals.generatedMwh += generation * hours;
    this.totals.loadMwh += (loadMw - unservedMw) * hours;
    this.totals.importedMwh += Math.max(0, gridMw) * hours;
    this.totals.exportedMwh += Math.max(0, -gridMw) * hours;
    this.totals.unservedMwh += unservedMw * hours;
    this.totals.co2AvoidedT += generation * hours * GRID_EMISSION_FACTOR;

    this.last = {
      hour, dayOfYear, sunElevation: sun.elevation, ghi, poa, ambient, cellTemp, windSpeed: wind, cloud,
      humidity: weather.humidity, rain: weather.rain, siliconMw, perovskiteMw, windMw, batteryMw, loadMw,
      gridMw, unservedMw, soc: this.soc, perovskiteHealth: this.perovskiteHealth, turbinesFeathered: feathered,
    };
    return this.last;
  }

  private log(dayOfYear: number, hour: number, text: string, level: PlantEvent["level"]) {
    this.events.unshift({ dayOfYear, hour, text, level });
    this.events.length = Math.min(this.events.length, 40);
  }
}

// --- the perovskite lab (stations 1 to 3) --------------------------------------------

// Layer options. Efficiencies are illustrative module-level values below
// the best research cells (single-junction perovskite cells reach about
// 27%; NREL chart). Bandgaps are typical for each composition. The
// stability multipliers follow the literature's ordering (Boyd et al.,
// 2019): methylammonium is volatile, so MAPbI₃ fades fastest; TiO₂ is
// photocatalytic under UV, so SnO₂ lasts longer; doped Spiro-OMeTAD
// absorbs moisture, while inorganic NiOₓ is the most robust. Higher means
// faster fade. Cost indices are relative, for comparison only.
export const ABSORBERS = {
  mapi: { label: "MAPbI₃ (1.60 eV)", efficiency: 0.205, stability: 1.6, cost: 1 },
  fac: { label: "FA–Cs mixed cation (1.55 eV)", efficiency: 0.235, stability: 0.8, cost: 1.1 },
  wide: { label: "Wide-gap for tandems (1.68 eV)", efficiency: 0.19, stability: 1.1, cost: 1.15 },
} as const;
export const ETLS = {
  sno2: { label: "SnO₂", efficiency: 1.0, stability: 0.9, cost: 1 },
  tio2: { label: "TiO₂ (mesoporous)", efficiency: 0.98, stability: 1.15, cost: 1.1 },
} as const;
export const HTLS = {
  spiro: { label: "Spiro-OMeTAD", efficiency: 1.0, stability: 1.5, cost: 1.4 },
  ptaa: { label: "PTAA", efficiency: 0.99, stability: 1.0, cost: 1.3 },
  niox: { label: "NiOₓ (inorganic)", efficiency: 0.96, stability: 0.7, cost: 0.9 },
} as const;
export const MOUNTS = {
  roof: { label: "Rooftop, 15° south", tilt: 15, facing: 180 },
  facade: { label: "Building facade, facing east", tilt: 90, facing: 90 },
  shelter: { label: "Transit-shelter canopy, 5°", tilt: 5, facing: 180 },
} as const;

/** Clear-sky irradiance lost to humid tropical haze and aerosols, on
 *  average, which the Haurwitz clear-sky model leaves out. Calibrated so a
 *  15° rooftop in Metro Manila yields close to the 1,402 kWh/kWp the Global
 *  Solar Atlas gives there (DOE Philippines). */
const TROPICAL_HAZE = 0.82;

export interface LabDesign {
  absorber: keyof typeof ABSORBERS;
  etl: keyof typeof ETLS;
  htl: keyof typeof HTLS;
  encapsulation: Encapsulation;
  mount: keyof typeof MOUNTS;
}

export interface LabResult {
  /** Illustrative starting efficiency. */
  efficiency: number;
  /** Relative cost index, 1 = baseline. */
  costIndex: number;
  /** First-year yield in kWh per kW peak at the chosen site and mount. */
  yieldKwhPerKwp: number;
  /** Months until output falls to 80% (T80), capped at 25 years. */
  t80Months: number;
  /** Remaining output at the end of each month of the first year. */
  monthlyHealth: number[];
}

/**
 * Stations 1 to 3 in one calculation: the layer choices set a starting
 * efficiency, a cost index, and a stability multiplier; a year of the
 * site's synthetic weather (twelve sampled days, hourly) gives the yield
 * for the mount and the fade under Philippine humidity and heat.
 */
export function evaluateDesign(design: LabDesign, site: Site, wetSeasonShare = 0.5): LabResult {
  const a = ABSORBERS[design.absorber];
  const e = ETLS[design.etl];
  const h = HTLS[design.htl];
  const m = MOUNTS[design.mount];
  const efficiency = a.efficiency * e.efficiency * h.efficiency;
  const costIndex = a.cost * e.cost * h.cost * (design.encapsulation === "glass" ? 1.25 : design.encapsulation === "edge" ? 1.1 : 1);
  const stability = a.stability * e.stability * h.stability;

  let yieldKwh = 0;
  let health = 1;
  const monthlyHealth: number[] = [];
  for (let month = 0; month < 12; month++) {
    const day = 15 + month * 30.4;
    const wet = month >= 5 && month <= 10;
    // Typical monthly cloud cover, and the haze of a humid tropical sky
    // (TROPICAL_HAZE): together they bring a year close to the Global Solar
    // Atlas figure for Philippine rooftops.
    const cloud = wet ? 0.55 + 0.3 * wetSeasonShare : 0.45;
    const humidity = wet ? 85 : 72;
    for (let hour = 0; hour < 24; hour++) {
      const sun = sunPosition(day, hour + 0.5, site);
      const ghi = cloudyGhi(clearSkyGhi(sun.elevation), cloud) * TROPICAL_HAZE;
      const poa = planeOfArrayIrradiance(ghi, sun.elevation, sun.azimuth, cloud, m.tilt, m.facing);
      const temp = cellTemperature(ambientTemperature(hour + 0.5, site), poa, 3);
      // A month is about 30.4 of this sampled day.
      yieldKwh += (poa / 1000) * (1 + PEROVSKITE.tempCoeff * (temp - 25)) * (1 - SYSTEM_LOSSES) * INVERTER_EFFICIENCY * health * 30.4;
      health *= 1 - perovskiteDecayPerHour(humidity, temp, poa, design.encapsulation) * stability * 30.4;
    }
    monthlyHealth.push(Math.max(0, health));
  }
  // Extrapolate T80 from the first year's average fade.
  const yearlyLoss = 1 - monthlyHealth[11];
  let t80Months: number;
  if (monthlyHealth.findIndex((v) => v < 0.8) >= 0) t80Months = monthlyHealth.findIndex((v) => v < 0.8) + 1;
  else t80Months = yearlyLoss > 0 ? Math.min(300, Math.round((Math.log(0.8) / Math.log(1 - yearlyLoss)) * 12)) : 300;
  return { efficiency, costIndex, yieldKwhPerKwp: yieldKwh, t80Months, monthlyHealth };
}
