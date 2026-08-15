import type * as Party from "partykit/server";
import type { ClientMessage, PlayerState, ServerMessage } from "../src/multiplayer/types";

// NOTE: this file is not covered by `npm run typecheck` (see tsconfig.json,
// which excludes party/) — PartyKit has its own build/dev toolchain via
// `npx partykit dev`. Not runtime-verified in this scaffold; sanity-check
// against current `partykit` package docs before relying on it, especially
// the exact shape of Party.Server/Party.Connection if the package has
// moved since this was written.

/**
 * One room = one deployed world instance's shared multiplayer session.
 * The client currently connects using the world id as the room id (see
 * src/multiplayer/usePartySocket.ts) — a single deployment could still run
 * multiple concurrent rooms (e.g. one per class section) by changing how
 * the client picks a room id, with no server changes needed.
 */
export default class SeizaRoom implements Party.Server {
  players = new Map<string, PlayerState>();

  constructor(readonly party: Party.Party) {}

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
    }
  }

  onClose(conn: Party.Connection) {
    if (this.players.delete(conn.id)) {
      this.broadcast({ type: "playerLeft", id: conn.id }, []);
    }
  }

  private broadcast(message: ServerMessage, exclude: string[]) {
    this.party.broadcast(JSON.stringify(message), exclude);
  }
}
