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
  /** Where this player is looking vertically, in radians, or 0 for level.
   *  Only sent in first person — see headPitch in PlayerRig.tsx for why
   *  third person deliberately reports 0 rather than the camera's own
   *  angle. Clamped by the server to the neck's real range. */
  headPitch: number;
  activeGesture: string | null;
  /** Held pose, or null when standing. See the Posture type. */
  posture: Posture;
  /** Live stream ids, so receivers know what each stream is for. */
  media: PlayerMedia;
  /** Incremented by the server every time this player starts a gesture.
   *  Lets clients replay the same gesture twice in a row, and lets a
   *  newly joined client tell "already playing before I arrived" apart
   *  from "just started" (see RemotePlayers.tsx). */
  gestureSeq: number;
}

export const WORLD_OBJECT_KINDS = ["box", "sphere", "cylinder", "model", "text", "screen", "image", "video", "chair"] as const;
export type WorldObjectKind = (typeof WORLD_OBJECT_KINDS)[number];

/** Longest text a board or note will hold. Long enough for a notice, short
 *  enough that it stays readable on a panel and cheap to sync. */
export const MAX_OBJECT_TEXT_LENGTH = 600;

/** Longest asset URL accepted for an image or a video, matching the room
 *  server's own cap (MAX_URL_LENGTH in worker/room.ts). */
export const MAX_OBJECT_SRC_LENGTH = 2048;

export interface WorldObject {
  id: string;
  kind: WorldObjectKind;
  modelUrl?: string;
  /**
   * Where an "image" or "video" object gets its picture.
   *
   * Kept separate from `modelUrl` rather than overloading it: they're
   * fetched by different loaders and validated against different rules, and
   * a world stored before images existed still deserializes unchanged.
   *
   * Images are uploaded to this deployment and come back as
   * `/api/assets/<id>.webp`. Videos are referenced by URL and never
   * uploaded — see the note on the Video button in src/edit/EditToolbar.tsx
   * for why Workers KV is the wrong place to keep video.
   */
  src?: string;
  color: string;
  position: [number, number, number];
  rotationY: number;
  /** Tilt about X. Lets a note lie flat on a desk instead of standing up. */
  pitch?: number;
  scale: number;
  ownerId: string;
  /** Contents of a "text" object: first line is the heading. */
  text?: string;
  /** Who is presenting on a "screen" object, or null when it's free. */
  presenterId?: string | null;
}

/**
 * Which of a player's live streams is which.
 *
 * WebRTC hands a receiver a stream but not what it's for, so each player
 * publishes the ids here and every client matches the incoming stream to
 * the right place: the microphone to spatial audio, the camera to the panel
 * beside their avatar, the screen to whichever display they're presenting on.
 */
export interface PlayerMedia {
  mic?: string | null;
  camera?: string | null;
  screen?: string | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

export type ClientMessage =
  | { type: "join"; displayName: string; avatarUrl: string; roomPassword?: string }
  | { type: "state"; position: [number, number, number]; rotationY: number; headPitch?: number }
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
  // Writes on a text board or a note.
  | { type: "objectSetText"; id: string; text: string }
  // Claims a screen to present on, or gives it back up. Only the presenter
  // can release their own screen; leaving the room releases it too.
  | { type: "objectPresent"; id: string; active: boolean }
  // Publishes which live stream is which (see PlayerMedia).
  | { type: "setMedia"; media: PlayerMedia }
  | { type: "chat"; text: string }
  // Swaps the room's environment model for everyone, live. `null` falls
  // back to the deployment's own world.json sceneUrl (or the procedural
  // BaseEnvironment when that isn't set either). Editor-gated exactly
  // like object edits — see worker/room.ts.
  | { type: "setEnvironment"; url: string | null }
  // Swaps the sky for everyone, live: an uploaded 360° panorama (2:1) or a
  // cube-map cross (4:3 / 3:4). `null` restores the built-in sunset.
  // Editor-gated and URL-checked exactly like setEnvironment.
  | { type: "setSkybox"; url: string | null }
  // Flips a room's lights for everyone. Not editor-gated: like writing on
  // a board, using a light switch is taking part, not restructuring.
  | { type: "setLight"; zone: LightZone; on: boolean }
  // Unlocks editing for this connection if the deployer has configured
  // SEIZA_EDITOR_PASSWORD (see worker/room.ts) — a shared password, not
  // per-user accounts. If the deployer hasn't set one, editing stays
  // open to everyone and this message is never needed.
  | { type: "authEditor"; password: string }
  // Unlocks *admin* status for this connection if the deployer has
  // configured SEIZA_ADMIN_KEY (see worker/room.ts and ADMIN.md). When an
  // admin key is configured it supersedes SEIZA_EDITOR_PASSWORD as far as
  // the client's Edit Mode gate goes (see App.tsx), and a successful
  // authAdmin also sets isEditor server-side — an admin can always edit,
  // on top of the moderation actions below. A deployment with no admin
  // key configured has no admin concept active at all: none of the
  // adminX messages below are ever honored there, at any privilege
  // level, because there's no key to have proven you hold.
  | { type: "authAdmin"; key: string }
  // --- Admin-only moderation (see ADMIN.md) ----------------------------
  // The server re-checks admin status on every one of these; the client
  // only hides the UI for a non-admin, it never enforces the permission.
  /** Disconnects `targetId`. The target gets `youWereKicked` first, then
   *  the socket is closed; everyone else just sees the ordinary
   *  `playerLeft` any disconnect produces. */
  | { type: "adminKick"; targetId: string }
  /** Tells `targetId`'s own client to enable/disable its microphone.
   *  "Mute" is enforceable this way; "unmute" is really a request the
   *  target's client fulfills, since the server never has access to
   *  anyone's audio to begin with (media is peer-to-peer — see
   *  src/media/useRealtimeMedia.ts). */
  | { type: "adminSetMute"; targetId: string; muted: boolean }
  // Asks the server to relay `gatherRequest` (this connection's current
  // known position) to every other connection in the room. There's no
  // adminTeleportTo counterpart: an admin moving *themselves* to another
  // player's position needs no server involvement — every client already
  // knows every other player's position from ordinary `state` sync (see
  // App.tsx's teleportToPlayer).
  | { type: "adminGatherAll" }
  // Sets or clears (password: null) a password required to join this
  // room at all — see ADMIN.md's "room entry password" section for why
  // this is deliberately a *third*, separate secret from the editor
  // password and the admin key, and deliberately mutable at runtime
  // (persisted in this room's own Durable Object storage) rather than a
  // Worker secret like the other two: it's the one of the three whose
  // worst-case leak is "an uninvited guest gets in", not "someone can
  // edit or moderate", and the one most likely to change per-event.
  | { type: "adminSetRoomPassword"; password: string | null }
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
       *  client should prompt for it before allowing Edit Mode. Ignored
       *  by the client when adminKeyRequired is true (see App.tsx). */
      editorPasswordRequired: boolean;
      /** True if this deployment has SEIZA_ADMIN_KEY set. When true, the
       *  admin key — not the editor password — gates Edit Mode, and a
       *  successful authAdmin additionally grants the moderation actions
       *  in ClientMessage. When false, there is no admin concept active
       *  in this room at all (see authAdmin's doc comment). */
      adminKeyRequired: boolean;
      /** Whether this room currently has an entry password set (via
       *  adminSetRoomPassword) — never the password itself. Visible to
       *  everyone already in the room (you only reach `welcome` at all
       *  once past the gate) mainly so an admin's UI can show current
       *  status without having to remember whether they set one. */
      roomPasswordSet: boolean;
      /** Room-level environment override set via the editor, or null to
       *  use the deployment's own world.json sceneUrl. */
      environmentUrl: string | null;
      /** Room-level sky image set via the editor, or null for the
       *  built-in sunset. */
      skyboxUrl: string | null;
      /** Light-switch state per zone. Older room servers omit it (all on). */
      lights?: Record<LightZone, boolean>;
    }
  | { type: "environmentChanged"; url: string | null }
  | { type: "skyboxChanged"; url: string | null }
  | { type: "lightChanged"; zone: LightZone; on: boolean }
  | { type: "roomFull"; maxOccupants: number }
  // Sent instead of welcome when this room has an entry password (see
  // adminSetRoomPassword) and the join message either omitted one or got
  // it wrong. The connection is left open — the client just resends
  // `join` with the correct password over the same socket, the same
  // retry shape authEditor/authAdmin already use, rather than needing to
  // reconnect.
  | { type: "passwordRequired" }
  | { type: "playerJoined"; player: PlayerState }
  | { type: "playerUpdated"; id: string; position: [number, number, number]; rotationY: number; headPitch?: number }
  | { type: "playerGesture"; id: string; gesture: string | null; seq: number }
  | { type: "playerAvatarChanged"; id: string; avatarUrl: string }
  | { type: "playerPosture"; id: string; posture: Posture }
  | { type: "playerLeft"; id: string }
  | { type: "objectAdded"; object: WorldObject }
  | { type: "objectMoved"; id: string; position: [number, number, number]; rotationY: number }
  /** A whole object changed (its text, or who is presenting on it). */
  | { type: "objectUpdated"; object: WorldObject }
  | { type: "objectRemoved"; id: string }
  | { type: "playerMedia"; id: string; media: PlayerMedia }
  | { type: "chat"; message: ChatMessage }
  | { type: "editorAuthResult"; granted: boolean }
  | { type: "adminAuthResult"; granted: boolean }
  // Sent to a connection just before the server closes it in response to
  // an adminKick, so that client can show "an admin removed you from
  // this room" instead of the ordinary reconnect-and-retry a dropped
  // connection otherwise gets.
  | { type: "youWereKicked" }
  // Sent only to the targeted connection; that client is what actually
  // enables/disables the microphone track (see useRealtimeMedia.ts's
  // forceMute) and re-publishes its PlayerMedia — the server has no
  // access to anyone's audio to mute it directly, since media never
  // passes through the server at all.
  | { type: "forceMute"; muted: boolean }
  // Broadcast to every connection except the requesting admin, in
  // response to adminGatherAll. Each receiving client teleports its own
  // local avatar to `position` and resumes reporting its position from
  // there via ordinary `state` messages — nothing here moves anyone's
  // avatar directly, consistent with every player always being the sole
  // authority over their own position.
  | { type: "gatherRequest"; position: [number, number, number] }
  | { type: "voiceSignal"; from: string; data: unknown };

/** Rooms with a light switch in the built-in world. */
export type LightZone = "hall" | "classroom";
export const LIGHT_ZONES: readonly LightZone[] = ["hall", "classroom"];
