export interface WorldConfig {
  id: string;
  displayName: string;
  /** Optional deployer-supplied glTF scene, layered over BaseEnvironment
   *  (see src/scene/Scene.tsx). Omit to use just the procedural base. */
  sceneUrl?: string;
  spawnPoint: { x: number; y: number; z: number };
  defaultAvatarUrl: string;
  enabledGestures: string[];
  maxOccupants: number;
  voiceEnabled: boolean;
  /** Let anyone in the room place/move/remove objects. Default true. */
  editingEnabled?: boolean;
  /** Let new joiners upload their own .vrm on the join screen. Default true. */
  allowAvatarUpload?: boolean;
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
  return (await res.json()) as WorldConfig;
}
