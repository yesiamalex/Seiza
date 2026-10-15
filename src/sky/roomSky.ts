// The time and weather a room sky (set from the edit panel) stands for.
// Plain TypeScript with no DOM or 3D code, shared by the world's sky clock
// (skyState.ts) and the edit panel's Sky and time controls.
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

/** The weather a room sky fixes, or null when it follows the schedule. */
export function roomSkyWeather(room: RoomSky | null): WeatherType | null {
  return room?.weather && room.weather !== "auto" ? room.weather : null;
}
