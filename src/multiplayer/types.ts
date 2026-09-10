export interface PlayerState {
  id: string;
  displayName: string;
  avatarUrl: string;
  position: [number, number, number];
  rotationY: number;
  activeGesture: string | null;
}

export interface WorldObject {
  id: string;
  kind: "box" | "sphere" | "cylinder" | "model";
  modelUrl?: string;
  color: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  ownerId: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

export type ClientMessage =
  | { type: "join"; displayName: string; avatarUrl: string }
  | { type: "state"; position: [number, number, number]; rotationY: number }
  | { type: "gesture"; gesture: string | null }
  | { type: "objectAdd"; object: Omit<WorldObject, "id" | "ownerId"> }
  | { type: "objectMove"; id: string; position: [number, number, number]; rotationY: number }
  | { type: "objectRemove"; id: string }
  | { type: "chat"; text: string }
  // Swaps the room's environment model for everyone, live. `null` falls
  // back to the deployment's own world.json sceneUrl (or the procedural
  // BaseEnvironment when that isn't set either). Editor-gated exactly
  // like object edits — see worker/room.ts.
  | { type: "setEnvironment"; url: string | null }
  // Unlocks editing for this connection if the deployer has configured
  // SEIZA_EDITOR_PASSWORD (see worker/room.ts) — a shared password, not
  // per-user accounts. If the deployer hasn't set one, editing stays
  // open to everyone and this message is never needed.
  | { type: "authEditor"; password: string }
  // Opaque WebRTC signaling payload (SDP offer/answer or ICE candidate),
  // relayed peer-to-peer through the room server. The server never
  // inspects `data` — it just forwards it to the connection named `to`.
  | { type: "voiceSignal"; to: string; data: unknown };

export type ServerMessage =
  | {
      type: "welcome";
      selfId: string;
      players: PlayerState[];
      objects: WorldObject[];
      /** True if this deployment has SEIZA_EDITOR_PASSWORD set — the
       *  client should prompt for it before allowing Edit Mode. */
      editorPasswordRequired: boolean;
      /** Room-level environment override set via the editor, or null to
       *  use the deployment's own world.json sceneUrl. */
      environmentUrl: string | null;
    }
  | { type: "environmentChanged"; url: string | null }
  | { type: "roomFull"; maxOccupants: number }
  | { type: "playerJoined"; player: PlayerState }
  | { type: "playerUpdated"; id: string; position: [number, number, number]; rotationY: number }
  | { type: "playerGesture"; id: string; gesture: string | null }
  | { type: "playerLeft"; id: string }
  | { type: "objectAdded"; object: WorldObject }
  | { type: "objectMoved"; id: string; position: [number, number, number]; rotationY: number }
  | { type: "objectRemoved"; id: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "editorAuthResult"; granted: boolean }
  | { type: "voiceSignal"; from: string; data: unknown };
