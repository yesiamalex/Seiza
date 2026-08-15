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

export type ClientMessage =
  | { type: "join"; displayName: string; avatarUrl: string }
  | { type: "state"; position: [number, number, number]; rotationY: number }
  | { type: "gesture"; gesture: string | null }
  | { type: "objectAdd"; object: Omit<WorldObject, "id" | "ownerId"> }
  | { type: "objectMove"; id: string; position: [number, number, number]; rotationY: number }
  | { type: "objectRemove"; id: string }
  // Opaque WebRTC signaling payload (SDP offer/answer or ICE candidate),
  // relayed peer-to-peer through the room server. The server never
  // inspects `data` — it just forwards it to the connection named `to`.
  | { type: "voiceSignal"; to: string; data: unknown };

export type ServerMessage =
  | { type: "welcome"; selfId: string; players: PlayerState[]; objects: WorldObject[] }
  | { type: "playerJoined"; player: PlayerState }
  | { type: "playerUpdated"; id: string; position: [number, number, number]; rotationY: number }
  | { type: "playerGesture"; id: string; gesture: string | null }
  | { type: "playerLeft"; id: string }
  | { type: "objectAdded"; object: WorldObject }
  | { type: "objectMoved"; id: string; position: [number, number, number]; rotationY: number }
  | { type: "objectRemoved"; id: string }
  | { type: "voiceSignal"; from: string; data: unknown };
