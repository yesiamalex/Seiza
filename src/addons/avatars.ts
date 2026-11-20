import type { VRM } from "@pixiv/three-vrm";

/**
 * Every loaded avatar in the room, by player id, for room modes that hand
 * someone a sword or a light stick. This visitor's own is under LOCAL_AVATAR
 * (their id isn't known until the room answers). Registered by
 * RemotePlayers.tsx and App.tsx; read from a frame loop, so not React state.
 */
export const LOCAL_AVATAR = "local";

const avatars = new Map<string, VRM>();
let version = 0;

export function setAddonAvatar(id: string, vrm: VRM | null) {
  if (vrm) avatars.set(id, vrm);
  else avatars.delete(id);
  version += 1;
}

export function getAddonAvatar(id: string): VRM | null {
  return avatars.get(id) ?? null;
}

/** Changes whenever an avatar is loaded, swapped, or gone. */
export function addonAvatarsVersion() {
  return version;
}
