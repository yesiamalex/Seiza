/**
 * A held full-body pose, named after the gesture clip that holds it — "sit"
 * when on a chair, "seiza" when kneeling, or a deployment's own clip. null
 * means standing.
 *
 * It's separate from `activeGesture` because a gesture ends and a posture
 * doesn't: a seated player who waves has to stay seated once the wave is
 * over. The server only checks the name's shape; each client resolves it
 * against its own gesture registry and ignores names it doesn't know.
 */
export type Posture = string | null;

export interface PlayerState {
  id: string;
  displayName: string;
  avatarUrl: string;
  position: [number, number, number];
  rotationY: number;
  activeGesture: string | null;
  /** Held pose, or null when standing. See the Posture type. */
  posture: Posture;
  /** Incremented by the server every time this player starts a gesture.
   *  Lets clients replay the same gesture twice in a row, and lets a
   *  newly joined client tell "already playing before I arrived" apart
   *  from "just started" (see RemotePlayers.tsx). */
  gestureSeq: number;
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
  // Changes this player's avatar in place, without reconnecting. Same URL
  // rules as `join` (see sanitizeAssetUrl in worker/room.ts), including
  // designer avatars (`seiza-avatar:v1:…`).
  | { type: "setAvatar"; avatarUrl: string }
  // Takes up or drops a held pose (sitting, kneeling). Separate from
  // `gesture` because it's a state, not a one-shot.
  | { type: "setPosture"; posture: Posture }
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
  | { type: "playerGesture"; id: string; gesture: string | null; seq: number }
  | { type: "playerAvatarChanged"; id: string; avatarUrl: string }
  | { type: "playerPosture"; id: string; posture: Posture }
  | { type: "playerLeft"; id: string }
  | { type: "objectAdded"; object: WorldObject }
  | { type: "objectMoved"; id: string; position: [number, number, number]; rotationY: number }
  | { type: "objectRemoved"; id: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "editorAuthResult"; granted: boolean }
  | { type: "voiceSignal"; from: string; data: unknown };
