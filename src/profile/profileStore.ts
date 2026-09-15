import { sanitizeAvatarSpec, type AvatarSpec } from "../avatar/designer/avatarSpec";

/**
 * Remembers who you were between visits, entirely in this browser.
 *
 * IndexedDB, not cookies: a cookie holds ~4KB and is sent to the server
 * with every request, so it can't store an avatar file and would leak the
 * profile into every API call. IndexedDB holds the uploaded .vrm itself
 * (megabytes are fine) and never leaves the device.
 *
 * What's stored per world:
 * - display name and avatar choice (designer spec / preset / upload / default)
 * - for uploads: the original file, so your own avatar renders instantly
 *   from disk, and so it can be re-uploaded silently if the deployment's
 *   copy has expired (uploads live 30 days in KV — see worker/index.ts).
 *
 * Every function here fails soft. Private browsing, blocked storage, or a
 * quota error means "nothing remembered", never a broken join.
 */

export type StoredAvatarChoice =
  | { kind: "designer"; spec: AvatarSpec }
  | { kind: "preset"; url: string }
  | { kind: "upload"; remoteUrl: string; fileName: string }
  | { kind: "default" };

export interface StoredProfile {
  version: 1;
  displayName: string;
  avatar: StoredAvatarChoice;
  savedAt: number;
}

interface StoredUpload {
  blob: Blob;
  fileName: string;
}

const DB_NAME = "seiza";
const DB_VERSION = 1;
const STORE = "profile";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const profileKey = (worldId: string) => `profile:${worldId}`;
const uploadKey = (worldId: string) => `upload:${worldId}`;

function sanitizeProfile(value: unknown): StoredProfile | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<StoredProfile> & { avatar?: Record<string, unknown> };
  if (raw.version !== 1 || typeof raw.displayName !== "string" || !raw.avatar) return null;
  const displayName = raw.displayName.slice(0, 32);
  const a = raw.avatar;
  let avatar: StoredAvatarChoice;
  if (a.kind === "designer") avatar = { kind: "designer", spec: sanitizeAvatarSpec(a.spec) };
  else if (a.kind === "preset" && typeof a.url === "string") avatar = { kind: "preset", url: a.url };
  else if (a.kind === "upload" && typeof a.remoteUrl === "string" && typeof a.fileName === "string")
    avatar = { kind: "upload", remoteUrl: a.remoteUrl, fileName: a.fileName };
  else avatar = { kind: "default" };
  return { version: 1, displayName, avatar, savedAt: typeof raw.savedAt === "number" ? raw.savedAt : 0 };
}

export async function loadProfile(worldId: string): Promise<StoredProfile | null> {
  try {
    return sanitizeProfile(await withStore("readonly", (s) => s.get(profileKey(worldId))));
  } catch {
    return null;
  }
}

export async function saveProfile(worldId: string, profile: Omit<StoredProfile, "version" | "savedAt">): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.put({ ...profile, version: 1, savedAt: Date.now() }, profileKey(worldId)));
  } catch (error) {
    console.warn("Could not remember your profile in this browser:", error);
  }
}

export async function saveUploadedAvatarFile(worldId: string, blob: Blob, fileName: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.put({ blob, fileName } satisfies StoredUpload, uploadKey(worldId)));
  } catch (error) {
    console.warn("Could not keep a local copy of your avatar file:", error);
  }
}

export async function loadUploadedAvatarFile(worldId: string): Promise<StoredUpload | null> {
  try {
    const value = await withStore<StoredUpload | undefined>("readonly", (s) => s.get(uploadKey(worldId)));
    return value && value.blob instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

export async function forgetProfile(worldId: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(profileKey(worldId)));
    await withStore("readwrite", (s) => s.delete(uploadKey(worldId)));
  } catch {
    // Nothing to forget.
  }
}

/** Uploads a .vrm to this deployment and returns its URL. */
export async function uploadAvatarFile(blob: Blob): Promise<string> {
  const response = await fetch("/api/avatars", { method: "POST", body: blob });
  const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !payload.url) throw new Error(payload.error ?? `Avatar upload failed (${response.status}).`);
  return payload.url;
}

/**
 * Makes sure a remembered upload is still reachable by other players.
 * Returns the URL to join with, re-uploading the local copy if the
 * deployment's copy expired or was removed. Null if neither works.
 */
export async function ensureUploadedAvatarAvailable(worldId: string, remoteUrl: string): Promise<string | null> {
  try {
    const head = await fetch(remoteUrl, { method: "HEAD" });
    // The content-type check matters: an unknown path can fall through to
    // the single-page-app fallback and answer 200 with HTML.
    if (head.ok && (head.headers.get("content-type") ?? "").includes("gltf")) return remoteUrl;
  } catch {
    // Offline or blocked — try the local copy below.
  }
  const local = await loadUploadedAvatarFile(worldId);
  if (!local) return null;
  try {
    return await uploadAvatarFile(local.blob);
  } catch {
    return null;
  }
}
