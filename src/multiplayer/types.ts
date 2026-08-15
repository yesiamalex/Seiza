export interface PlayerState {
  id: string;
  displayName: string;
  avatarUrl: string;
  position: [number, number, number];
  rotationY: number;
  activeGesture: string | null;
}

export type ClientMessage =
  | { type: "join"; displayName: string; avatarUrl: string }
  | { type: "state"; position: [number, number, number]; rotationY: number }
  | { type: "gesture"; gesture: string | null };

export type ServerMessage =
  | { type: "welcome"; selfId: string; players: PlayerState[] }
  | { type: "playerJoined"; player: PlayerState }
  | { type: "playerUpdated"; id: string; position: [number, number, number]; rotationY: number }
  | { type: "playerGesture"; id: string; gesture: string | null }
  | { type: "playerLeft"; id: string };
