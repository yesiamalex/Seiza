import { Component, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import type { LightZone, RoomSky, WorldObject, WorldStateValue } from "../multiplayer/types";

/**
 * A world's own in-world code: exhibits, displays, and controls that only
 * that world has. A world opts in by shipping `worlds/<id>/client/index.tsx`
 * (Seizora's is the example) exporting a `Scene` component. It's loaded on
 * its own only when that world runs, so other worlds never download it.
 *
 * What a world's code gets is deliberately small: the room's objects and
 * sky, the shared world state (switches and settings every visitor sees,
 * stored by the room server), whether this visitor may change things, and
 * a place in the HUD to show a card (showWorldOverlay).
 */
export interface WorldSceneProps {
  /** Whether this visitor may change shared things: the same rule as Edit
   *  Mode (anyone, unless the deployment set an editor password). */
  canEdit: boolean;
  connected: boolean;
  objects: Record<string, WorldObject>;
  removeObject: (id: string) => void;
  roomSky: RoomSky | null;
  setRoomSky: (sky: RoomSky | null) => void;
  worldState: Record<string, WorldStateValue>;
  setWorldState: (key: string, value: WorldStateValue) => void;
  /** The room's light switches (hall, classroom, garden), so a world's own
   *  fittings can switch with the room's lamps. Read-only. */
  lights: Record<LightZone, boolean>;
}

export interface WorldModule {
  Scene?: ComponentType<WorldSceneProps>;
}

// Every world's client code, each as its own chunk loaded on demand.
const worldModules = import.meta.glob<WorldModule>("../../worlds/*/client/index.tsx");

/** Renders the running world's own scene code, if it has any. Lives inside
 *  the Canvas. A failure in it is logged and leaves the rest of Seiza alone. */
export function WorldExtension({ worldId, ...props }: WorldSceneProps & { worldId: string }) {
  const [module, setModule] = useState<WorldModule | null>(null);
  useEffect(() => {
    const load = worldModules[`../../worlds/${worldId}/client/index.tsx`];
    if (!load) return;
    let live = true;
    load()
      .then((loaded) => live && setModule(loaded))
      .catch((error) => console.warn(`[seiza] Could not load the "${worldId}" world's own code.`, error));
    return () => {
      live = false;
      showWorldOverlay(null);
    };
  }, [worldId]);
  const Scene = module?.Scene;
  if (!Scene) return null;
  return (
    <WorldErrorBoundary>
      <Scene {...props} />
    </WorldErrorBoundary>
  );
}

class WorldErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[seiza] The world's own code failed; the rest of the world keeps running.", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// --- a card in the HUD -------------------------------------------------------

// The world's scene code runs inside the Canvas, a separate React renderer,
// so a card it opens reaches the HUD through this small store.
let overlay: ReactNode = null;
const listeners = new Set<() => void>();

/** Shows a card over the world (or closes it, with null). */
export function showWorldOverlay(node: ReactNode) {
  overlay = node;
  for (const listener of listeners) listener();
}

/** The HUD side: renders whatever card the world's code has open. */
export function WorldOverlay() {
  const node = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => overlay
  );
  return <>{node}</>;
}
