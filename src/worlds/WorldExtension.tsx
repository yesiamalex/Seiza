import { Component, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import type * as THREE from "three";
import type { LightZone, PlayerState, RoomSky, WorldObject, WorldStateValue } from "../multiplayer/types";

/**
 * A world's own in-world code: exhibits, displays, and controls that only
 * that world has. A world opts in by shipping `worlds/<id>/client/index.tsx`
 * (Seizora's is the example) exporting a `Scene` component. It's loaded on
 * its own only when that world runs, so other worlds never download it.
 *
 * What a world's code gets is deliberately small: the room's objects and
 * sky, the shared world state (switches and settings every visitor sees,
 * stored by the room server), whether this visitor may change things, and
 * a place in the HUD to show a card (showWorldOverlay). For worlds with
 * their own social features (Seilaya's consent gestures and safety tools),
 * it also gets the players, its own gestures to play, a way to move this
 * visitor, private messages between visitors, and a per-viewer filter for
 * who this visitor sees and hears.
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
  /** This visitor's id, or null before joining. */
  selfId: string | null;
  /** Everyone in the room, this visitor included. Read-only. */
  players: Record<string, PlayerState>;
  /** Where this visitor is now (read it when needed; it changes every frame). */
  getSelfPosition: () => [number, number, number];
  /** Plays a gesture on this visitor's avatar, for everyone, by name: a
   *  built-in or one from world.json's customGestures (hidden ones too). */
  playGesture: (name: string) => void;
  /** Moves this visitor to a spot. */
  warp: (position: [number, number, number]) => void;
  /** Turns this visitor to face a point on the floor, without moving them.
   *  Does nothing in a headset, where only the player turns their view. */
  faceToward: (x: number, z: number) => void;
  /** A small private message to one other visitor, relayed by the room
   *  server without reading it. Arrives through onWorldMessage. */
  sendWorldMessage: (to: string, data: unknown) => void;
  /** Who this visitor doesn't see (hidden) or neither sees nor hears
   *  (blocked), for this visit only. See src/multiplayer/playerFilter.ts. */
  setPlayerFilter: (filter: { hidden?: Iterable<string>; blocked?: Iterable<string> } | null) => void;
  /** A walking route between two points along the world's navigation
   *  mesh (the one click-to-walk uses), or null when there's none yet:
   *  for guides who lead the way (src/guides/). */
  findPath: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3[] | null;
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

// --- private messages between visitors -----------------------------------------

type WorldMessageHandler = (from: string, data: unknown) => void;
const messageHandlers = new Set<WorldMessageHandler>();

/** Receives the world messages other visitors send this one. Returns the
 *  unsubscribe function. */
export function onWorldMessage(handler: WorldMessageHandler): () => void {
  messageHandlers.add(handler);
  return () => messageHandlers.delete(handler);
}

/** The most a world message may be, as JSON. The room server drops
 *  anything bigger (worker/room.ts); checked here too, since a message
 *  comes from another browser and is never trusted. */
const MAX_WORLD_MESSAGE_CHARS = 1024;

/**
 * App's side: hands a world message to the world's code. A world without
 * its own code listening (Seiza's default world, Seizora) drops every one
 * unread, so nothing another visitor sends this way is ever shown. A
 * world that listens gets only small plain objects, and must still check
 * every field: another browser wrote them.
 */
export function deliverWorldMessage(from: string, data: unknown) {
  if (messageHandlers.size === 0) return;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return;
  let size = 0;
  try {
    size = JSON.stringify(data).length;
  } catch {
    return;
  }
  if (size > MAX_WORLD_MESSAGE_CHARS) return;
  for (const handler of messageHandlers) {
    try {
      handler(from, data);
    } catch (error) {
      console.warn("[seiza] A world message handler failed.", error);
    }
  }
}

/** World messages travel on the room's existing peer-to-peer relay (the
 *  one WebRTC signalling uses), wrapped so they can't be mistaken for
 *  signalling: `{ world: data }`. */
export function wrapWorldMessage(data: unknown) {
  return { world: data };
}

export function unwrapWorldMessage(data: unknown): { data: unknown } | null {
  return typeof data === "object" && data !== null && "world" in data ? { data: (data as { world: unknown }).world } : null;
}
