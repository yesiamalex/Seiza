// Which piece (or board) is open for a closer look, shared by the flat
// screen's lightbox (Hud.tsx) and the headset's panel (Xr.tsx), so the two
// never disagree. Opening a piece remembers the row it was opened from, so
// Previous and Next walk along that line, wall, or street.
import { useSyncExternalStore } from "react";

export interface ViewerState {
  /** A piece id from collection.ts, or a board key from info.ts. */
  open: string | null;
  /** The pieces Previous and Next step through. */
  sequence: string[];
}

let state: ViewerState = { open: null, sequence: [] };
const listeners = new Set<() => void>();

function set(next: ViewerState) {
  state = next;
  for (const listener of listeners) listener();
}

export function openPiece(id: string | null, sequence?: string[]) {
  set({ open: id, sequence: id === null ? [] : sequence ?? (state.sequence.includes(id) ? state.sequence : [id]) });
}

export function step(by: 1 | -1) {
  const { open, sequence } = state;
  if (!open || sequence.length < 2) return;
  const i = sequence.indexOf(open);
  set({ open: sequence[(i + by + sequence.length) % sequence.length], sequence });
}

export function getViewer() {
  return state;
}

export function useViewer(): ViewerState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}
