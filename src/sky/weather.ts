/**
 * Seiza's weather and sky engine.
 *
 * Sun position, clear-sky and cloudy irradiance, a live weather state that
 * eases between weather types, and sky gradient colours that change
 * continuously through twilight and the golden hour. Pure TypeScript with
 * no DOM and no three.js, so any world can use it: a world's sky and
 * lighting can follow it, and Seizora's solar simulation reads the same
 * numbers.
 *
 * Nothing in the base world uses it yet; the default world's sky is still
 * the fixed sunset in src/scene/SunsetSky.tsx. The weather is synthetic, a
 * learning model, not a forecast.
 */

const DEG = Math.PI / 180;

export interface Site {
  label: string;
  /** Degrees north. */
  lat: number;
  /** Degrees east. */
  lon: number;
  /** Mean daily temperature in °C, before the weather's offset. */
  meanTemp: number;
}

/** Philippine sites. All share UTC+8. */
export const SITES: Record<string, Site> = {
  cebu: { label: "Cebu", lat: 10.31, lon: 123.89, meanTemp: 28 },
  manila: { label: "Metro Manila", lat: 14.6, lon: 120.98, meanTemp: 28 },
  davao: { label: "Davao", lat: 7.07, lon: 125.61, meanTemp: 27.5 },
  baguio: { label: "Baguio", lat: 16.41, lon: 120.6, meanTemp: 19 },
};
const TZ_MERIDIAN = 120; // UTC+8

export interface SunPosition {
  /** Degrees above the horizon; negative below it. */
  elevation: number;
  /** Degrees from north, clockwise. */
  azimuth: number;
}

/**
 * Sun position for a day of the year (1 to 365) and local clock time in
 * hours (0 to 24), from the standard declination and equation-of-time
 * approximations: accurate to well under a degree, plenty for a sky.
 */
export function sunPosition(dayOfYear: number, hour: number, site: Site): SunPosition {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // minutes
  const solarTime = hour + (4 * (site.lon - TZ_MERIDIAN) + equationOfTime) / 60;
  const hourAngle = 15 * (solarTime - 12) * DEG;
  const declination = 23.45 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365) * DEG;
  const lat = site.lat * DEG;
  const sinEl = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = Math.asin(clamp(sinEl, -1, 1));
  const cosAz = (Math.sin(declination) - Math.sin(elevation) * Math.sin(lat)) / (Math.cos(elevation) * Math.cos(lat));
  let azimuth = Math.acos(clamp(cosAz, -1, 1)) / DEG;
  if (hourAngle > 0) azimuth = 360 - azimuth;
  return { elevation: elevation / DEG, azimuth };
}

/** Clear-sky global horizontal irradiance in W/m² (Haurwitz model). */
export function clearSkyGhi(elevationDeg: number): number {
  if (elevationDeg <= 0) return 0;
  const s = Math.sin(elevationDeg * DEG);
  return 1098 * s * Math.exp(-0.057 / s);
}

/** Irradiance reaching the ground under a cloud cover from 0 to 1
 *  (Kasten and Czeplak's cloud factor). */
export function cloudyGhi(clearGhi: number, cloud: number): number {
  return clearGhi * (1 - 0.75 * Math.pow(clamp(cloud, 0, 1), 3.4));
}

/** Ambient temperature in °C: coolest before dawn, warmest mid-afternoon. */
export function ambientTemperature(hour: number, site: Site, offset = 0): number {
  return site.meanTemp + offset + 4 * Math.cos(((hour - 14.5) / 24) * 2 * Math.PI);
}

export type WeatherType = "clear" | "partly" | "overcast" | "rain" | "typhoon";

export interface WeatherProfile {
  label: string;
  /** Cloud cover, 0 to 1. */
  cloud: number;
  /** Mean wind at turbine hub height, m/s. */
  wind: number;
  /** Gust amplitude, m/s. */
  gust: number;
  /** Rain intensity, 0 to 1. */
  rain: number;
  /** Relative humidity, percent. */
  humidity: number;
  /** Degrees added to the site's daily temperature cycle. */
  tempOffset: number;
}

export const WEATHER: Record<WeatherType, WeatherProfile> = {
  clear: { label: "Clear", cloud: 0.05, wind: 5, gust: 1.5, rain: 0, humidity: 65, tempOffset: 1.5 },
  partly: { label: "Partly cloudy", cloud: 0.4, wind: 6.5, gust: 2.5, rain: 0, humidity: 72, tempOffset: 0.5 },
  overcast: { label: "Overcast", cloud: 0.85, wind: 7, gust: 2.5, rain: 0.05, humidity: 82, tempOffset: -1 },
  rain: { label: "Rain", cloud: 0.95, wind: 9, gust: 4, rain: 0.7, humidity: 92, tempOffset: -2.5 },
  typhoon: { label: "Typhoon", cloud: 1, wind: 28, gust: 9, rain: 1, humidity: 97, tempOffset: -3.5 },
};

// Deterministic smooth noise, so gusts and passing clouds look alive and a
// run can still be replayed exactly.
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function smoothNoise(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

/** About this many simulated minutes for the weather to settle after a
 *  change of type: rain arrives over half an hour, not at a cut. */
const SETTLE_MINUTES = 25;

/** The live weather: each quantity eases toward the current type's values,
 *  with gusts and passing clouds riding on top as smooth noise. */
export class WeatherState {
  type: WeatherType;
  cloud: number;
  wind: number;
  rain: number;
  humidity: number;
  tempOffset: number;
  gust = 0;
  drift = 0;

  constructor(type: WeatherType = "clear") {
    const w = WEATHER[type];
    this.type = type;
    this.cloud = w.cloud;
    this.wind = w.wind;
    this.rain = w.rain;
    this.humidity = w.humidity;
    this.tempOffset = w.tempOffset;
  }

  setType(type: WeatherType): void {
    if (WEATHER[type]) this.type = type;
  }

  /** Advances by `minutes` of simulated time. `t` is the absolute
   *  simulated time in minutes, which seeds the noise. */
  step(minutes: number, t: number): void {
    const w = WEATHER[this.type];
    const k = 1 - Math.exp(-minutes / SETTLE_MINUTES);
    this.cloud += (w.cloud - this.cloud) * k;
    this.wind += (w.wind - this.wind) * k;
    this.rain += (w.rain - this.rain) * k;
    this.humidity += (w.humidity - this.humidity) * k;
    this.tempOffset += (w.tempOffset - this.tempOffset) * k;
    this.gust = (smoothNoise(t / 7) - 0.5) * 2 * w.gust;
    this.drift = (smoothNoise(t / 18 + 40) - 0.5) * 0.3;
  }

  /** Cloud cover including passing clouds, which only appear when the sky
   *  is neither clear nor fully overcast. */
  effectiveCloud(): number {
    const passing = this.cloud > 0.02 && this.cloud < 0.98 ? this.drift : 0;
    return clamp(this.cloud + passing, 0, 1);
  }

  windSpeed(): number {
    return Math.max(0, this.wind + this.gust);
  }
}

// --- sky colour --------------------------------------------------------------

export type Rgb = [number, number, number];

interface SkyKey {
  el: number;
  top: Rgb;
  bottom: Rgb;
}

// Zenith and horizon colours by sun elevation in degrees. Interpolated
// continuously with a smoothstep inside each segment, so dawn and dusk pass
// through twilight and the golden hour as gradients, with no visible step
// at a keyframe.
const SKY_KEYS: SkyKey[] = [
  { el: -18, top: [6, 9, 22], bottom: [12, 16, 34] }, // night
  { el: -10, top: [12, 18, 44], bottom: [36, 34, 70] }, // nautical twilight
  { el: -4, top: [30, 44, 94], bottom: [150, 92, 96] }, // civil twilight
  { el: 2, top: [58, 92, 160], bottom: [242, 150, 92] }, // sunrise and sunset
  { el: 10, top: [70, 130, 205], bottom: [246, 200, 150] }, // golden hour
  { el: 25, top: [62, 140, 225], bottom: [176, 214, 240] }, // day
  { el: 90, top: [44, 120, 220], bottom: [160, 205, 240] }, // high sun
];
const OVERCAST_TOP: Rgb = [128, 136, 146];
const OVERCAST_BOTTOM: Rgb = [176, 182, 188];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export interface SkyColors {
  /** Zenith colour, 0 to 255 per channel. */
  top: Rgb;
  /** Horizon colour. */
  bottom: Rgb;
  /** 0 at night to 1 in full day, for scaling lights. */
  daylight: number;
}

/** Sky gradient for a sun elevation, cloud cover, and rain intensity. */
export function skyColors(elevationDeg: number, cloud = 0, rain = 0): SkyColors {
  const e = clamp(elevationDeg, -18, 90);
  let i = 0;
  while (i < SKY_KEYS.length - 2 && e > SKY_KEYS[i + 1].el) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const t = (e - a.el) / (b.el - a.el);
  const s = t * t * (3 - 2 * t);
  let top = mix(a.top, b.top, s);
  let bottom = mix(a.bottom, b.bottom, s);
  const daylight = clamp((e + 6) / 16, 0, 1);
  const grey = Math.min(1, cloud * 0.9) * daylight;
  top = mix(top, OVERCAST_TOP, grey);
  bottom = mix(bottom, OVERCAST_BOTTOM, grey);
  const dim = 1 - 0.35 * rain - 0.25 * cloud * (1 - daylight);
  const round = (c: Rgb): Rgb => [Math.round(c[0] * dim), Math.round(c[1] * dim), Math.round(c[2] * dim)];
  return { top: round(top), bottom: round(bottom), daylight };
}

// --- the shared clock ----------------------------------------------------------

/** Philippine time (UTC+8) for an instant, as day of year and hour. */
export function philippineTime(date: Date): { dayOfYear: number; hour: number } {
  const shifted = new Date(date.getTime() + 8 * 3600_000);
  const start = Date.UTC(shifted.getUTCFullYear(), 0, 0);
  const midnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return {
    dayOfYear: Math.floor((midnight - start) / 86400000),
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60 + shifted.getUTCSeconds() / 3600,
  };
}

/** Length of one block of scheduled weather, in hours. */
const WEATHER_BLOCK_HOURS = 3;

/**
 * The weather a world shows at an instant when it follows a schedule
 * rather than a panel: chosen per three-hour block from a hash of the date,
 * so every visitor's browser arrives at the same weather with nothing sent
 * over the network. The odds follow the Philippine seasons: mostly fair
 * from December to May, and wetter in the southwest monsoon from June to
 * November. Typhoons are never scheduled; a world can still show one by
 * fixing its weather.
 */
export function scheduledWeather(date: Date): WeatherType {
  const blockIndex = Math.floor(date.getTime() / (WEATHER_BLOCK_HOURS * 3600_000));
  const month = new Date(date.getTime() + 8 * 3600_000).getUTCMonth(); // 0 = January
  const wet = month >= 5 && month <= 10;
  const odds: [WeatherType, number][] = wet
    ? [["clear", 0.2], ["partly", 0.3], ["overcast", 0.25], ["rain", 0.25]]
    : [["clear", 0.45], ["partly", 0.35], ["overcast", 0.12], ["rain", 0.08]];
  let r = hash(blockIndex * 1.37 + 0.5);
  for (const [type, p] of odds) {
    if ((r -= p) < 0) return type;
  }
  return "clear";
}

/** A unit vector toward the sun in Seiza's world axes: north is -Z, east
 *  is +X, up is +Y. */
export function sunDirection(sun: SunPosition): [number, number, number] {
  const el = sun.elevation * DEG;
  const az = sun.azimuth * DEG;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
}

/** Day of the year, 1 to 366, for a date. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const now = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((now - start) / 86400000);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
