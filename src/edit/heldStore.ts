/**
 * Objects someone is holding or has just thrown, and where they are this
 * moment: written by your own grab (Grab.tsx) every frame and by the room's
 * "objectHeld" relay ten times a second, read every frame by each placed
 * object (WorldObjects.tsx) to draw it there instead of where it was last
 * put down. Plain module state, not React state, so a ball in flight
 * re-renders nothing.
 *
 * Nothing here is saved. Letting go (or a throw coming to rest) sends one
 * "objectDrop", which the room keeps; until its echo arrives, the last
 * place here holds the object where it landed (HELD_STALE_MS).
 */
export interface HeldObject {
  position: [number, number, number];
  rotationY: number;
  /** Who: a connection id, or null for this visitor. */
  by: string | null;
  /** performance.now() when last moved. */
  at: number;
}

export const heldObjects = new Map<string, HeldObject>();

/** After this long without a move, an object goes back to where the room
 *  has it: the holder left, or the drop's echo has long arrived. */
export const HELD_STALE_MS = 2500;

/** Throws from others, waiting for Grab.tsx to fly them here too. */
export const remoteThrows: { id: string; by: string; position: [number, number, number]; velocity: [number, number, number]; rotationY: number }[] = [];

export function heldNow(id: string): HeldObject | null {
  const held = heldObjects.get(id);
  if (!held) return null;
  if (performance.now() - held.at > HELD_STALE_MS) {
    heldObjects.delete(id);
    return null;
  }
  return held;
}

/** A tap or click on a ball, on a flat screen: Grab.tsx picks it up. */
export const flatPick = { id: null as string | null };
