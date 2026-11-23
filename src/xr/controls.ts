import { useSyncExternalStore } from "react";
import type * as THREE from "three";

/**
 * A headset player's own settings for how they move and feel things,
 * kept on this device: whether controllers vibrate, how the right stick
 * turns, and whether the left stick walks or aims a teleport. Shown in the
 * headset menu's "Comfort and controls" (App builds the section).
 */
export type Turning = "smooth" | "snap30" | "snap45";
export type Moving = "walk" | "teleport";

export interface XrControls {
  vibration: boolean;
  turning: Turning;
  moving: Moving;
}

const STORAGE_KEY = "seiza-xr-controls";
const DEFAULTS: XrControls = { vibration: true, turning: "snap45", moving: "walk" };

function load(): XrControls {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<XrControls> | null;
    if (!raw || typeof raw !== "object") return DEFAULTS;
    return {
      vibration: typeof raw.vibration === "boolean" ? raw.vibration : DEFAULTS.vibration,
      turning: raw.turning === "smooth" || raw.turning === "snap30" || raw.turning === "snap45" ? raw.turning : DEFAULTS.turning,
      moving: raw.moving === "teleport" || raw.moving === "walk" ? raw.moving : DEFAULTS.moving,
    };
  } catch {
    return DEFAULTS;
  }
}

let current: XrControls = typeof window === "undefined" ? DEFAULTS : load();
const listeners = new Set<() => void>();

export const xrControls = () => current;

export function setXrControls(change: Partial<XrControls>) {
  current = { ...current, ...change };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Private windows and blocked storage: for this visit only.
  }
  listeners.forEach((listener) => listener());
}

export function useXrControls(): XrControls {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => DEFAULTS
  );
}

/** The library's options for the right stick's turning. */
export const turningOptions = (turning: Turning) =>
  turning === "smooth" ? ({ type: "smooth", speed: 2 } as const) : ({ type: "snap", degrees: turning === "snap30" ? 30 : 45 } as const);

type Pulsing = Gamepad & { hapticActuators?: { pulse?: (value: number, ms: number) => Promise<boolean> }[] };

/**
 * A short buzz in a controller, where the headset can and the player
 * hasn't turned vibration off: a hit landing, a blade blocked, a note
 * struck, a menu button pressed. Tracked hands have nothing to buzz.
 */
export function buzz(gl: THREE.WebGLRenderer, hand: "left" | "right", intensity: number, ms: number) {
  if (!current.vibration) return;
  const session = gl.xr.getSession();
  if (!session) return;
  for (const source of session.inputSources) {
    if (source.handedness !== hand) continue;
    void (source.gamepad as Pulsing | undefined)?.hapticActuators?.[0]?.pulse?.(intensity, ms)?.catch(() => {});
  }
}
