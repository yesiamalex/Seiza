import type { CustomGestureConfig } from "../avatar/gestures";
import type { WorldObjectKind } from "../multiplayer/types";
import type { SkyConfig } from "../sky/skyState";

export interface WorldConfig {
  id: string;
  displayName: string;
  /** Optional deployer-supplied glTF scene, layered over BaseEnvironment
   *  (see src/scene/Scene.tsx). Omit to use just the procedural base. */
  sceneUrl?: string;
  /**
   * Also derive collision boxes from `sceneUrl`'s own geometry, in
   * addition to the built-in room's hand-written ones (see
   * `deriveObstaclesFromObject` in src/scene/layout.ts). Defaults to true.
   *
   * A deployer scene is layered over BaseEnvironment rather than
   * replacing it, so the built-in collision always stays active; this
   * only controls whether the added geometry is solid too. The boxes are
   * approximations from per-mesh bounding boxes, so set this to false
   * when the model is meant to be walked through, or when the derived
   * boxes come out wrong.
   *
   * Click-to-move is unaffected either way: the navmesh is rebuilt from
   * whatever is actually in the scene (src/nav/useNavMesh.ts).
   */
  environmentCollision?: boolean;
  /**
   * The sky. Leave it out for the original still sunset. With
   * `{ "cycle": "realtime" }` the sun follows Philippine time and the
   * weather follows a shared schedule, so every visitor sees the same sky
   * (see src/sky/). An uploaded skybox image covers the sky, though the
   * lights still follow it. An editor can override it for one room from
   * the edit panel (RoomSky in src/multiplayer/types.ts).
   */
  sky?: SkyConfig;
  spawnPoint: { x: number; y: number; z: number };
  /** Which way a visitor faces on arrival, in radians about the vertical
   *  (0 looks toward -Z; facing (-sin y, -cos y)). Default 0. */
  spawnRotationY?: number;
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
   * The default world lists four CC0 VRoid Studio samples, which
   * scripts/fetch-assets.mjs downloads (and shrinks) at build time rather
   * than the repo committing them. Only license-verified models belong
   * here (THIRD_PARTY_ASSETS.md); `author`/`license` show as a credit line. Genuinely CC0 avatars do
   * exist though — VRoid Studio's own sample models and the Open Source
   * Avatars collection are both CC0 — so a deployer can populate this in
   * one config edit. See THIRD_PARTY_ASSETS.md for sources and
   * scripts/fetch-assets.mjs for wiring them into a setup step.
   */
  defaultAvatars?: AvatarPreset[];
  /**
   * Objects this world starts with: notice boards, notes on desks, a screen
   * to present on. They are placed once, by the first person to enter an
   * empty room, and then live in the room like anything else — movable,
   * writable, deletable. Leave it out and the room simply starts bare.
   */
  defaultObjects?: DefaultWorldObject[];
}

export interface DefaultWorldObject {
  kind: WorldObjectKind;
  position: [number, number, number];
  rotationY?: number;
  /** Tilt about X; use -1.5708 to lay a note flat on a desk. */
  pitch?: number;
  scale?: number;
  color?: string;
  /** For "text": first line is the heading. */
  text?: string;
  modelUrl?: string;
}

export interface AvatarPreset {
  label: string;
  /** Same-origin path (e.g. /avatars/businessman.vrm) or absolute URL. */
  url: string;
  /** Who made the model, shown under the preset list (e.g. "pixiv Inc. (VRoid Studio sample)"). */
  author?: string;
  /** The license it's used under, e.g. "CC0 1.0". */
  license?: string;
  /** Where the license terms can be checked. */
  licenseUrl?: string;
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
