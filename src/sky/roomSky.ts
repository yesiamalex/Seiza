// The time and weather a room sky (set from the edit panel) stands for.
// Plain TypeScript with no DOM or 3D code, shared by the world's sky clock
// (skyState.ts) and Seizora's control room, so the two always agree.
import type { RoomSky } from "../multiplayer/types";
import { philippineTime, type WeatherType } from "./weather";

/** The instant on the same Philippine day as `ref` at Philippine `hour`. */
export function atPhilippineHour(ref: number, hour: number): number {
  return ref + (hour - philippineTime(new Date(ref)).hour) * 3600_000;
}

/**
 * The simulated time a room sky shows at the real moment `now`: the real
 * time, held at its hour, or run from its hour since the server's `setAt`.
 */
export function roomSkyNow(room: RoomSky, now = Date.now()): Date {
  if (room.mode === "fixed") return new Date(atPhilippineHour(now, room.hour ?? 12));
  if (room.mode === "running") {
    const setAt = room.setAt ?? now;
    return new Date(atPhilippineHour(setAt, room.hour ?? 12) + (now - setAt) * (room.scale ?? 1));
  }
  return new Date(now);
}

/** Simulated minutes per real minute: 1 for real time and for a held
 *  sky (the plant keeps running at that hour), `scale` for a running one. */
export function roomSkySpeed(room: RoomSky | null): number {
  return room?.mode === "running" ? (room.scale ?? 1) : 1;
}

/** The weather a room sky fixes, or null when it follows the schedule. */
export function roomSkyWeather(room: RoomSky | null): WeatherType | null {
  return room?.weather && room.weather !== "auto" ? room.weather : null;
}
