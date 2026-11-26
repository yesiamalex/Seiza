import { useGLTF } from "@react-three/drei";
import type { WorldConfig } from "../config/worldConfig";
import { isDesignerAvatarUrl } from "../avatar/designer/avatarSpec";
import { preloadWorldModule } from "../worlds/WorldExtension";

/**
 * Getting a world ready before you've even pressed Join: while the join
 * screen is up (choosing a name and an avatar takes a few seconds anyway),
 * the world's own code, its model and walking mesh, and the avatar you've
 * picked are fetched in the background, so entering mostly finds them
 * already here. The crevice (Crevice.tsx) covers whatever's left.
 *
 * Each URL is fetched once. The model is parsed into drei's cache, which
 * the scene reads straight from; the rest lands in the browser's HTTP cache
 * (a revalidation, not a download, when the loader asks again).
 */
const warmed = new Set<string>();

function once(key: string, start: () => unknown) {
  if (warmed.has(key)) return;
  warmed.add(key);
  try {
    const p = start();
    if (p instanceof Promise) p.catch(() => warmed.delete(key));
  } catch {
    warmed.delete(key);
  }
}

const fetchQuietly = (url: string) =>
  fetch(url, { priority: "low" } as RequestInit).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    // Read it through, so the whole file is in the cache.
    return r.arrayBuffer();
  });

/** Starts on everything this world will need on entering. Safe to call often. */
export function warmWorld(world: WorldConfig) {
  once(`module:${world.id}`, () => preloadWorldModule(world.id));
  if (world.sceneUrl) once(`scene:${world.sceneUrl}`, () => useGLTF.preload(world.sceneUrl!));
  if (world.navMeshUrl) once(`nav:${world.navMeshUrl}`, () => fetchQuietly(world.navMeshUrl!));
}

/** And the avatar about to be worn: a file to fetch (a designer avatar is built in code). */
export function warmAvatar(url: string | null | undefined) {
  if (!url || isDesignerAvatarUrl(url) || url.startsWith("blob:")) return;
  once(`avatar:${url}`, () => fetchQuietly(url));
}
