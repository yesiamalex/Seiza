import type { TrackedPose } from "../xr/body/trackingWire";

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
  /** Opted out of seiza endurance: everyone sees this avatar kneel
   *  without dozing off or wincing. Absent means false. */
  calm?: boolean;
}

// "sign" is a text object like "text", but shaped and typeset to be read
// from across the room rather than up close — see createTextTexture's
// "sign" surface and SignObject in src/edit/WorldObjects.tsx.
export const WORLD_OBJECT_KINDS = ["box", "sphere", "cylinder", "model", "text", "sign", "screen", "image", "video", "chair", "bed"] as const;
export type WorldObjectKind = (typeof WORLD_OBJECT_KINDS)[number];

/** Longest text a board or note will hold. Long enough for a notice, short
 *  enough that it stays readable on a panel and cheap to sync. */
export const MAX_OBJECT_TEXT_LENGTH = 600;

/** Object kinds whose `text` field is editable in the world. */
export const TEXT_OBJECT_KINDS = ["text", "sign"] as const;
export function isTextObjectKind(kind: string): boolean {
  return (TEXT_OBJECT_KINDS as readonly string[]).includes(kind);
}

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
  /** Which of the presenter's streams this screen is showing. Absent on
   *  objects from older servers, and treated as "screen". */
  presenterSource?: PresentSource;
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
  /** The mic is on but muted. A muted mic sends nothing, so peers that
   *  have to choose whom to connect to rank someone who can actually be
   *  heard first (see useRealtimeMedia's peer selection). */
  micMuted?: boolean;
}

/** One player's movement, as carried in a batched playersUpdated. */
export interface PlayerMovement {
  id: string;
  position: [number, number, number];
  rotationY: number;
  headPitch?: number;
}

/** What a world screen is showing: the presenter's shared screen, or
 *  their webcam. A screen is just a surface — which stream feeds it is
 *  the presenter's choice. */
export type PresentSource = "screen" | "camera";
export const PRESENT_SOURCES: readonly PresentSource[] = ["screen", "camera"];

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

export type ClientMessage =
  // `caps` names optional behaviours this client understands, so the room
  // can use them without breaking a tab still running an older build:
  // "batch" means it handles playersUpdated.
  // `session` is a random ID made once per page load and sent again on
  // every reconnect from that page. When a join arrives with a session that
  // another connection already holds, the server drops the older one: after
  // a network drop, the old socket can stay open on the server for minutes,
  // and without this it showed as a frozen copy of the player. It's never
  // sent to other players.
  | { type: "join"; displayName: string; avatarUrl: string; roomPassword?: string; caps?: string[]; session?: string }
  | { type: "state"; position: [number, number, number]; rotationY: number; headPitch?: number }
  // A headset player's head and hands, relative to their own body (see
  // src/xr/body/trackingWire.ts), or null once they stop tracking. Its own
  // message rather than part of `state` because it is ephemeral: the
  // server validates and relays it but never stores it, so it can run
  // twice as often without touching what late joiners are sent.
  | { type: "tracking"; pose: TrackedPose | null }
  | { type: "gesture"; gesture: string | null }
  // Changes this player's avatar in place, without reconnecting. Same URL
  // rules as `join` (see sanitizeAssetUrl in worker/room.ts), including
  // designer avatars (`seiza-avatar:v1:…`).
  | { type: "setAvatar"; avatarUrl: string }
  // Takes up or drops a held pose (sitting, kneeling). Separate from
  // `gesture` because it's a state, not a one-shot.
  | { type: "setPosture"; posture: Posture }
  // Opts this player's avatar out of (or back into) seiza endurance, for
  // meetings where a dozing avatar would be out of place.
  | { type: "setCalm"; calm: boolean }
  | { type: "objectAdd"; object: Omit<WorldObject, "id" | "ownerId"> }
  | { type: "objectMove"; id: string; position: [number, number, number]; rotationY: number }
  | { type: "objectRemove"; id: string }
  // Writes on a text board or a note.
  | { type: "objectSetText"; id: string; text: string }
  // Claims a screen to present on, or gives it back up. Only the presenter
  // can release their own screen; leaving the room releases it too.
  // `source` picks which of the presenter's own streams feeds the
  // screen. Omitted means "screen", which is what every client sent
  // before this existed.
  | { type: "objectPresent"; id: string; active: boolean; source?: PresentSource }
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
  // Sets the room's time of day and weather for everyone, or clears it
  // (null) to go back to the world's own sky. Editor-gated like setSkybox.
  | { type: "setRoomSky"; sky: RoomSky | null }
  // Sets one value in the room's world state: shared switches and settings
  // that a world's own code defines (see src/worlds/WorldExtension.tsx).
  // Editor-gated like the rest of Edit Mode.
  | { type: "setWorldState"; key: string; value: WorldStateValue }
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
  | { type: "voiceSignal"; to: string; data: unknown }
  // Together gestures (handshake, high five, hug) need the other person's
  // yes, and the server keeps the score: see TOGETHER below. Ask someone
  // near you; answer a request made to you (`unavailable` declines without
  // saying so: blocked, not taking requests); or withdraw your own.
  | { type: "togetherAsk"; to: string; gesture: TogetherGesture }
  | { type: "togetherAnswer"; id: string; accept: boolean; unavailable?: boolean }
  | { type: "togetherCancel"; id: string };

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
      /** The room's sky override, or null to use the world's own sky.
       *  Older room servers omit it. */
      roomSky?: RoomSky | null;
      /** Shared world state. Older room servers omit it. */
      worldState?: Record<string, WorldStateValue>;
    }
  | { type: "environmentChanged"; url: string | null }
  | { type: "skyboxChanged"; url: string | null }
  | { type: "roomSkyChanged"; sky: RoomSky | null }
  | { type: "worldStateChanged"; key: string; value: WorldStateValue }
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
  // Every player that moved in the last tick (200 ms), in one message, for
  // clients that joined with caps ["batch"]. Replaces one playerUpdated
  // per player per update, which grew with the square of the room's size.
  | { type: "playersUpdated"; updates: PlayerMovement[] }
  | { type: "playerTracking"; id: string; pose: TrackedPose | null }
  | { type: "playerGesture"; id: string; gesture: string | null; seq: number }
  | { type: "playerAvatarChanged"; id: string; avatarUrl: string }
  | { type: "playerPosture"; id: string; posture: Posture }
  | { type: "playerCalm"; id: string; calm: boolean }
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
  | { type: "voiceSignal"; from: string; data: unknown }
  // Your request went out (its id lets you withdraw it).
  | { type: "togetherSent"; id: string; to: string; gesture: TogetherGesture }
  // Someone near you asks for a together gesture.
  | { type: "togetherAsked"; id: string; from: string; gesture: TogetherGesture }
  // A request ended without a yes. `unavailable` covers everything the
  // asker isn't told apart: blocked, not taking requests, asking too often,
  // too far away. `declined` is a plain "no thanks".
  | { type: "togetherClosed"; id: string; reason: "declined" | "unavailable" | "expired" | "cancelled" }
  // Both said yes: each side now plays the gesture, facing `partner`. The
  // server lets each of the two play that one gesture once, for a moment.
  | { type: "togetherStart"; id: string; gesture: TogetherGesture; partner: string; role: "lead" | "follow" }
  // A lasting together gesture (the slow dance) ended: the partner stopped,
  // walked away, or left. Your side stops too.
  | { type: "togetherEnded"; partner: string };

/** Places with a light switch in the built-in world. */
/** `camp` is the campfire on the meadow: a light switch too, so it's lit
 *  or out for everyone in the room. */
export type LightZone = "hall" | "classroom" | "pond" | "camp";
export const LIGHT_ZONES: readonly LightZone[] = ["hall", "classroom", "pond", "camp"];
/** Every light starts on, for a new room and for anything a stored state lacks. */
export const DEFAULT_LIGHTS: Readonly<Record<LightZone, boolean>> = { hall: true, classroom: true, pond: true, camp: true };

/** Weather choices for a room sky. "auto" follows the shared schedule. */
export const ROOM_SKY_WEATHER = ["auto", "clear", "partly", "overcast", "rain", "typhoon"] as const;
export type RoomSkyWeather = (typeof ROOM_SKY_WEATHER)[number];

/** Clock speeds a room sky can run at: real speed, an hour a minute, and
 *  a day in four minutes. */
export const ROOM_SKY_SCALES = [1, 60, 360] as const;

/**
 * A room's own sky, set from the edit panel and shared through the room
 * server, so everyone in the room sees the same time and weather. It
 * overrides the world's `sky` in world.json until it's cleared.
 */
export interface RoomSky {
  /**
   * - "realtime": follow the current time in the Philippines.
   * - "fixed": hold the sky at `hour`.
   * - "running": start at `hour` when it was set (`setAt`) and run at
   *   `scale` times real speed.
   */
  mode: "realtime" | "fixed" | "running";
  /** Philippine time of day, 0 to 24, for "fixed" and "running". */
  hour?: number;
  /** One of ROOM_SKY_SCALES, for "running". */
  scale?: number;
  weather?: RoomSkyWeather;
  /** When a "running" sky was set, in server time (ms since 1970). Set by
   *  the server, so every browser runs the clock from the same moment. */
  setAt?: number;
}

/** A value in a room's world state: small and plain on purpose. */
export type WorldStateValue = string | number | boolean;
/** Limits the room server enforces on world state. */
export const WORLD_STATE_LIMITS = { keys: 64, keyPattern: /^[a-z][a-zA-Z0-9.-]{0,47}$/, stringLength: 64 } as const;

/**
 * Together gestures: played by two people at once, and only when both
 * agree. One person asks someone nearby; the other gets a prompt; only a
 * yes starts it, and no answer within `requestSeconds` is a no. The room
 * server enforces all of this, not just the clients: it refuses any of
 * these gestures from a player it hasn't just seen agree to it, checks the
 * two are within `reach`, and limits how often anyone can ask the same
 * person (`perWindow` per `windowSeconds`, and nothing for `quietSeconds`
 * after a no or no answer). The clips are built in but hidden from the
 * gesture menu, since playing one alone at someone is what consent rules
 * out.
 */
export const TOGETHER_GESTURES = ["handshake", "highfive", "fistbump", "dap", "hug", "slowdance"] as const;
export type TogetherGesture = (typeof TOGETHER_GESTURES)[number];
export const isTogetherGesture = (v: unknown): v is TogetherGesture => (TOGETHER_GESTURES as readonly unknown[]).includes(v);
/**
 * Together gestures that last until either person stops (the slow dance)
 * aren't one clip but a held pose for each: the asker leads, the other
 * follows, as the postures `slowdancelead` and `slowdancefollow`. The
 * server allows those postures only after a yes, ends the dance for both
 * when either stops, and never plays `slowdance` itself as a clip.
 */
export const LASTING_TOGETHER: readonly TogetherGesture[] = ["slowdance"];
export const duetPosture = (gesture: TogetherGesture, role: "lead" | "follow") => `${gesture}${role}`;
/** How far apart partners stand (centre to centre, metres) for a together
 *  gesture: each steps to it on a yes, wherever they were. This is the
 *  slow dance's, both hands held; TOGETHER_SPACING has the others. */
export const DUET_SPACING = 0.75;
/** Spacing per together gesture where it differs from the slow dance's.
 *
 * Measured, not guessed: each clip's contact pose was put on real rigs
 * (VRoid samples, a VRM 1.0 sample, a VRoid Hub model) and the hand's reach
 * read off, so these are twice that, plus the hand's own thickness where
 * the contact is its surface (a palm's, the knuckles'). They're for an arm
 * of REFERENCE_ARM_LENGTH; App scales them by the two partners' own arms
 * (src/avatar/avatarReach.ts), so bigger and smaller avatars meet too.
 */
export const TOGETHER_SPACING: Partial<Record<TogetherGesture, number>> = {
  handshake: 0.65,
  highfive: 0.63,
  fistbump: 0.73,
  dap: 0.62,
  // A hug wraps round the partner, so it comes closest.
  hug: 0.52,
};
export const togetherSpacing = (gesture: TogetherGesture) => TOGETHER_SPACING[gesture] ?? DUET_SPACING;
export const TOGETHER = {
  /** Asking needs the two within this many metres (the server allows a
   *  little more than the menu offers, for movement while asking). */
  reach: 2.5,
  serverReach: 3.5,
  requestSeconds: 20,
  quietSeconds: 30,
  perWindow: 4,
  windowSeconds: 120,
  /** How long after a yes each of the two may start the gesture. */
  grantSeconds: 8,
} as const;
