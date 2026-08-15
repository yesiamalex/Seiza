import type * as Party from "partykit/server";
import type { ClientMessage, PlayerState, ServerMessage, WorldObject } from "../src/multiplayer/types";

// NOTE: this file is not covered by `npm run typecheck` (see tsconfig.json,
// which excludes party/) — PartyKit has its own build/dev toolchain via
// `npx partykit dev`. Not runtime-verified in this scaffold; sanity-check
// against current `partykit` package docs before relying on it, especially
// the exact shape of Party.Server/Party.Connection if the package has
// moved since this was written.

const OBJECTS_STORAGE_KEY = "objects";

/**
 * One room = one deployed world instance's shared multiplayer session.
 * The client currently connects using the world id as the room id (see
 * src/multiplayer/usePartySocket.ts) — a single deployment could still run
 * multiple concurrent rooms (e.g. one per class section) by changing how
 * the client picks a room id, with no server changes needed.
 */
export default class SeizaRoom implements Party.Server {
  players = new Map<string, PlayerState>();
  objects = new Map<string, WorldObject>();

  constructor(readonly party: Party.Party) {}

  // Runs once when the room is first woken up — restores any objects
  // placed by editors in a previous session so edits survive reconnects
  // and room hibernation, not just the lifetime of one browser tab.
  async onStart() {
    const stored = await this.party.storage.get<WorldObject[]>(OBJECTS_STORAGE_KEY);
    if (stored) {
      for (const obj of stored) this.objects.set(obj.id, obj);
    }
  }

  onMessage(raw: string, sender: Party.Connection) {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return; // drop malformed messages rather than crash the room
    }

    switch (message.type) {
      case "join": {
        const player: PlayerState = {
          id: sender.id,
          displayName: message.displayName,
          avatarUrl: message.avatarUrl,
          position: [0, 0, 0],
          rotationY: 0,
          activeGesture: null,
        };
        this.players.set(sender.id, player);

        const welcome: ServerMessage = {
          type: "welcome",
          selfId: sender.id,
          players: Array.from(this.players.values()),
          objects: Array.from(this.objects.values()),
        };
        sender.send(JSON.stringify(welcome));
        this.broadcast({ type: "playerJoined", player }, [sender.id]);
        break;
      }
      case "state": {
        const player = this.players.get(sender.id);
        if (!player) return; // hasn't sent "join" yet — ignore
        player.position = message.position;
        player.rotationY = message.rotationY;
        this.broadcast(
          { type: "playerUpdated", id: sender.id, position: message.position, rotationY: message.rotationY },
          [sender.id]
        );
        break;
      }
      case "gesture": {
        const player = this.players.get(sender.id);
        if (!player) return;
        player.activeGesture = message.gesture;
        this.broadcast({ type: "playerGesture", id: sender.id, gesture: message.gesture }, [sender.id]);
        break;
      }
      case "objectAdd": {
        // No auth/permission system yet — any connected client can edit
        // the shared world. Documented MVP limitation, see README.
        const object: WorldObject = { ...message.object, id: crypto.randomUUID(), ownerId: sender.id };
        this.objects.set(object.id, object);
        this.persistObjects();
        this.broadcast({ type: "objectAdded", object }, []);
        break;
      }
      case "objectMove": {
        const object = this.objects.get(message.id);
        if (!object) return;
        object.position = message.position;
        object.rotationY = message.rotationY;
        this.persistObjects();
        this.broadcast({ type: "objectMoved", id: message.id, position: message.position, rotationY: message.rotationY }, [sender.id]);
        break;
      }
      case "objectRemove": {
        if (!this.objects.delete(message.id)) return;
        this.persistObjects();
        this.broadcast({ type: "objectRemoved", id: message.id }, []);
        break;
      }
      case "voiceSignal": {
        // Pure relay for WebRTC mesh signaling — see src/voice/useVoiceChat.ts.
        // The server never looks at `data`, just forwards it to the named peer.
        const target = this.party.getConnection(message.to);
        target?.send(JSON.stringify({ type: "voiceSignal", from: sender.id, data: message.data } satisfies ServerMessage));
        break;
      }
    }
  }

  onClose(conn: Party.Connection) {
    if (this.players.delete(conn.id)) {
      this.broadcast({ type: "playerLeft", id: conn.id }, []);
    }
  }

  private persistObjects() {
    // Fire-and-forget: fine at the scale this scaffold targets (a handful
    // of edits per session, not a high-frequency write path like position
    // sync). Revisit if editing gets busy enough to matter.
    void this.party.storage.put(OBJECTS_STORAGE_KEY, Array.from(this.objects.values()));
  }

  private broadcast(message: ServerMessage, exclude: string[]) {
    this.party.broadcast(JSON.stringify(message), exclude);
  }
}
