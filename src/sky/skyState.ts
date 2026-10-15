import * as THREE from "three";
import type { RoomSky } from "../multiplayer/types";
import { atPhilippineHour, roomSkyNow, roomSkyWeather } from "./roomSky";
import {
  moonPhase,
  moonPosition,
  philippineTime,
  scheduledWeather,
  SITES,
  skyColors,
  sunDirection,
  sunPosition,
  WEATHER,
  WeatherState,
  type Site,
  type WeatherType,
} from "./weather";

/**
 * A world's sky settings (world.json `sky`). Leave it out and the world
 * keeps the original fixed sunset.
 */
export interface SkyConfig {
  /** "realtime" follows Philippine time, so every visitor sees the same
   *  sky; "fixed" is the original still sunset. */
  cycle: "realtime" | "fixed";
  /** A key of SITES, for where the sun is. Defaults to "manila". */
  site?: string;
  /** "auto" follows the shared weather schedule (scheduledWeather);
   *  a weather type holds it. Defaults to "auto". */
  weather?: "auto" | WeatherType;
  /** Speeds the clock up, for demonstrations: 60 makes an hour pass in a
   *  minute. Each visitor's clock then runs from their own page load, so
   *  visitors no longer share a sky; leave it at 1 for a shared one. */
  timeScale?: number;
}

/**
 * The sky this frame, written by SkyClock and read by the sky shader and
 * the lights. Module state, like trackingStore: everything reading it runs
 * in a frame loop, and routing it through React would re-render the scene
 * on every tick.
 */
export const skyState = {
  /** False until SkyClock has run, and always false in a fixed-sky world. */
  active: false,
  sunDirection: new THREE.Vector3(-34, 4.6, 14).normalize(),
  elevation: 7,
  /** 0 at the original sunset and below, 1 in full day. */
  dayness: 0,
  /** 0 while the sun is up, 1 in full night. */
  night: 0,
  /** How much of the sun's disc and glow shows, 0 to 1. */
  sunVisible: 1,
  cloud: 0,
  rain: 0,
  weather: "clear" as WeatherType,
  /** Engine sky colours, linear, for the day half of the sky. */
  dayZenith: new THREE.Color(),
  dayHorizon: new THREE.Color(),
  /** Toward the moon, which follows the sun by its phase (weather.ts). */
  moonDirection: new THREE.Vector3(34, 20, -14).normalize(),
  moonElevation: -90,
  /** Fraction of the moon's disc that is lit, 0 (new) to 1 (full). */
  moonIllumination: 0,
  /** How much of the moon shows: up, and not behind cloud. 0 to 1. */
  moonVisible: 0,
  /** Simulated Philippine time, for anything that wants to show it. */
  dayOfYear: 1,
  hour: 18,
};

/** Sun elevation, in degrees, of the original fixed sunset: the sky looks
 *  exactly as it was designed at and below this point. */
export const ORIGINAL_SUN_ELEVATION = 7;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Reads ?skyHour=, ?skyWeather=, and ?skyScale= from the page URL, for
 *  previewing a time or weather without changing world.json. */
function urlOverrides(): { hour?: number; weather?: WeatherType; scale?: number } {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const hour = Number(q.get("skyHour"));
  const weather = q.get("skyWeather") as WeatherType | null;
  const scale = Number(q.get("skyScale"));
  return {
    hour: q.has("skyHour") && Number.isFinite(hour) ? hour : undefined,
    weather: weather && weather in WEATHER ? weather : undefined,
    scale: Number.isFinite(scale) && scale > 0 ? scale : undefined,
  };
}

/**
 * Keeps skyState in step with a world's sky settings, or with the room's
 * own sky (set from the edit panel) when there is one. Priority: the
 * ?sky… URL preview, then the room sky, then world.json.
 */
export class SkyClock {
  private site: Site;
  private weather: WeatherState | null = null;
  private lastSimMs = 0;
  private readonly startReal: number;
  private readonly startSim: number;
  private readonly scale: number;
  private readonly fixedWeather: WeatherType | null;
  /** The room sky driving the time, unless a URL preview hour overrides it. */
  private readonly room: RoomSky | null;

  constructor(private readonly config: SkyConfig, room: RoomSky | null = null) {
    const o = urlOverrides();
    const now = Date.now();
    this.site = SITES[config.site ?? "manila"] ?? SITES.manila;
    const roomWeather = roomSkyWeather(room);
    const configWeather = config.weather && config.weather !== "auto" ? config.weather : null;
    // A room sky decides the weather completely, "auto" included.
    this.fixedWeather = o.weather ?? (room ? roomWeather : configWeather);

    // A preview hour starts today's clock at that Philippine hour. A room
    // sky's time comes from roomSkyNow, shared with Seizora's control room.
    this.room = o.hour === undefined ? room : null;
    this.startReal = now;
    this.startSim = o.hour !== undefined ? atPhilippineHour(now, o.hour) : now;
    this.scale = o.scale ?? config.timeScale ?? 1;
  }

  /** The simulated instant now. */
  now(): Date {
    if (this.room) return roomSkyNow(this.room);
    return new Date(this.startSim + (Date.now() - this.startReal) * this.scale);
  }

  update(): void {
    const date = this.now();
    const simMs = date.getTime();
    const type = this.fixedWeather ?? scheduledWeather(date);
    if (!this.weather) {
      this.weather = new WeatherState(type);
    } else {
      this.weather.setType(type);
      this.weather.step(Math.max(0, (simMs - this.lastSimMs) / 60000), simMs / 60000);
    }
    this.lastSimMs = simMs;

    const { dayOfYear, hour } = philippineTime(date);
    const sun = sunPosition(dayOfYear, hour, this.site);
    const phase = moonPhase(date);
    const moon = moonPosition(dayOfYear, hour, phase.phase, this.site);
    const cloud = this.weather.effectiveCloud();
    const colors = skyColors(sun.elevation, cloud, this.weather.rain);

    skyState.active = true;
    skyState.sunDirection.set(...sunDirection(sun));
    skyState.elevation = sun.elevation;
    skyState.dayness = smoothstep(ORIGINAL_SUN_ELEVATION, 30, sun.elevation);
    skyState.night = smoothstep(-1, -12, sun.elevation);
    skyState.sunVisible = smoothstep(-3, 1, sun.elevation) * (1 - 0.85 * cloud);
    skyState.moonDirection.set(...sunDirection(moon));
    skyState.moonElevation = moon.elevation;
    skyState.moonIllumination = phase.illumination;
    skyState.moonVisible = smoothstep(-2, 2, moon.elevation) * (1 - 0.9 * cloud);
    skyState.cloud = cloud;
    skyState.rain = this.weather.rain;
    skyState.weather = this.weather.type;
    skyState.dayZenith.setRGB(colors.top[0] / 255, colors.top[1] / 255, colors.top[2] / 255, THREE.SRGBColorSpace);
    skyState.dayHorizon.setRGB(colors.bottom[0] / 255, colors.bottom[1] / 255, colors.bottom[2] / 255, THREE.SRGBColorSpace);
    skyState.dayOfYear = dayOfYear;
    skyState.hour = hour;
  }
}
