import type { CustomGestureConfig } from "../avatar/gestures";

export interface WorldConfig {
  id: string;
  displayName: string;
  /** Optional deployer-supplied glTF scene, layered over BaseEnvironment
   *  (see src/scene/Scene.tsx). Omit to use just the procedural base. */
  sceneUrl?: string;
  spawnPoint: { x: number; y: number; z: number };
  /** Avatar a first-time visitor starts with: a .vrm URL, or "" to start
   *  from the built-in avatar designer's default look. */
  defaultAvatarUrl: string;
  /** Optional allowlist of built-in gesture names (see
   *  src/avatar/builtinMotions.generated.ts). Omit or leave empty to offer
   *  every built-in. Custom gestures are always offered. */
  enabledGestures?: string[];
  /**
   * A deployment's own `.vrma` gesture clips. A custom gesture with the
   * same `name` as a built-in replaces it; any other name is added
   * alongside. See src/avatar/gestures.ts and public/gestures/README.md.
   */
  customGestures?: CustomGestureConfig[];
  maxOccupants: number;
  voiceEnabled: boolean;
  /** Let anyone in the room place/move/remove objects. Default true. */
  editingEnabled?: boolean;
  /** Let new joiners upload their own .vrm on the join screen. Default true. */
  allowAvatarUpload?: boolean;
  /**
   * Ready-to-pick avatars offered on the join screen and in the in-world
   * avatar menu (e.g. a businessman / businesswoman / casual set), so a
   * visitor doesn't have to supply their own file to look like anything.
   *
   * Empty by default: this repo can't ship VRM binaries it hasn't
   * license-verified (THIRD_PARTY_ASSETS.md). Genuinely CC0 avatars do
   * exist though — VRoid Studio's own sample models and the Open Source
   * Avatars collection are both CC0 — so a deployer can populate this in
   * one config edit. See THIRD_PARTY_ASSETS.md for sources and
   * scripts/fetch-assets.mjs for wiring them into a setup step.
   */
  defaultAvatars?: AvatarPreset[];
}

export interface AvatarPreset {
  label: string;
  /** Same-origin path (e.g. /avatars/businessman.vrm) or absolute URL. */
  url: string;
}

const WORLD_ID = import.meta.env.VITE_SEIZA_WORLD_ID ?? "default";

/**
 * Loads /worlds/<id>/world.json. This is the entire "one world per
 * deployment" mechanism: forking the repo and changing VITE_SEIZA_WORLD_ID
 * (plus adding a new folder under public/worlds/) reconfigures the whole
 * app with no code changes.
 */
export async function loadWorldConfig(): Promise<WorldConfig> {
  const res = await fetch(`/worlds/${WORLD_ID}/world.json`);
  if (!res.ok) {
    throw new Error(
      `Could not load world config for "${WORLD_ID}" (${res.status}). ` +
        `Check public/worlds/${WORLD_ID}/world.json exists.`
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `World config for "${WORLD_ID}" was not JSON (${contentType || "unknown content type"}). ` +
        `Check public/worlds/${WORLD_ID}/world.json exists and is valid JSON.`
    );
  }
  try {
    return (await res.json()) as WorldConfig;
  } catch {
    throw new Error(`World config for "${WORLD_ID}" contains invalid JSON.`);
  }
}
