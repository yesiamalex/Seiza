import { useEffect, useRef } from "react";

/**
 * One open menu at a time.
 *
 * Every panel in the HUD (chat, gestures, media, edit, avatar, roster,
 * admin) keeps its own open state, so opening one never closed another and
 * they stacked on top of each other, which on a phone buried the world
 * entirely. Each registers here instead: opening one announces it, and
 * every other open one closes itself. A tiny module-level channel rather
 * than shared React state, so the components keep owning their state and
 * none of them needs lifting into App.
 */
const listeners = new Set<(openedId: string) => void>();

/** Closes every registered menu (e.g. when the control drawer collapses). */
export function closeAllMenus() {
  for (const listener of [...listeners]) listener("");
}

export function useExclusiveMenu(id: string, open: boolean, close: () => void) {
  const openRef = useRef(open);
  openRef.current = open;
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const listener = (openedId: string) => {
      if (openedId !== id && openRef.current) closeRef.current();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [id]);

  useEffect(() => {
    if (!open) return;
    for (const listener of [...listeners]) listener(id);
  }, [open, id]);
}
