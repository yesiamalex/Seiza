// Players this viewer has chosen not to see or hear, for this visit only.
// Nothing here is sent anywhere: hiding someone changes only your own view.
// A world's own code sets it (see WorldSceneProps.setPlayerFilter); Seilaya
// uses it for blocking, its personal-space bubble, and its refuge room.
import { useSyncExternalStore } from "react";

export interface PlayerFilter {
  /** Not drawn for this viewer: avatar, name tag, chat bubble, camera. Their
   *  voice and chat still come through (a personal-space bubble, say). */
  hidden: ReadonlySet<string>;
  /** Hidden, and also silenced: no voice, and their chat messages and
   *  bubbles don't show. */
  blocked: ReadonlySet<string>;
}

const EMPTY: PlayerFilter = { hidden: new Set(), blocked: new Set() };
let current: PlayerFilter = EMPTY;
const listeners = new Set<() => void>();

export function setPlayerFilter(filter: { hidden?: Iterable<string>; blocked?: Iterable<string> } | null) {
  current = filter ? { hidden: new Set(filter.hidden ?? []), blocked: new Set(filter.blocked ?? []) } : EMPTY;
  for (const listener of listeners) listener();
}

export function getPlayerFilter(): PlayerFilter {
  return current;
}

/** Not drawn for this viewer (hidden or blocked). Cheap: read every frame. */
export function isPlayerHidden(id: string): boolean {
  return current.hidden.has(id) || current.blocked.has(id);
}

export function isPlayerBlocked(id: string): boolean {
  return current.blocked.has(id);
}

/** The filter, re-rendering when it changes. */
export function usePlayerFilter(): PlayerFilter {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current
  );
}
