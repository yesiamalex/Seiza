import { useSyncExternalStore } from "react";

/**
 * The pen: whether this visitor is drawing, and in which colour (an index
 * into STROKE_COLORS). On a flat screen, the Draw button turns it on; in a
 * headset, the menu's Draw section. While it's on, a drag draws instead of
 * looking around (PlayerRig), a click doesn't open boards, and in a headset
 * a pinch draws instead of aiming a teleport.
 */
export interface Pen {
  on: boolean;
  color: number;
}

let pen: Pen = { on: false, color: 0 };
const listeners = new Set<() => void>();

export const penState = () => pen;
export function setPen(change: Partial<Pen>) {
  pen = { ...pen, ...change };
  listeners.forEach((l) => l());
}
export function usePen(): Pen {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pen,
    () => pen
  );
}
