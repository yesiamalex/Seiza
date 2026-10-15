import { DurableObject } from "cloudflare:workers";
import {
  LIGHT_ZONES,
  MAX_OBJECT_TEXT_LENGTH,
  WORLD_OBJECT_KINDS,
  type ClientMessage,
  DEFAULT_LIGHTS,
  type LightZone,
  type RoomSky,
  ROOM_SKY_SCALES,
  ROOM_SKY_WEATHER,
  type PlayerMedia,
  type PlayerMovement,
  type PlayerState,
  type Posture,
  type ServerMessage,
  isTextObjectKind,
  PRESENT_SOURCES,
  type PresentSource,
  type WorldObject,
  type WorldObjectKind,
} from "../src/multiplayer/types";
import { sanitizeTrackedPose, TRACKING_MIN_INTERVAL_MS } from "../src/xr/body/trackingWire";
import type { Env } from "./index";

const OBJECTS_STORAGE_KEY = "objects";
const ENVIRONMENT_STORAGE_KEY = "environmentUrl";
const SKYBOX_STORAGE_KEY = "skyboxUrl";
const ROOM_SKY_STORAGE_KEY = "roomSky";
const LIGHTS_STORAGE_KEY = "lights";
/** A switch can't be flicked faster than this per connection, so a held
 *  click or a script can't strobe the room for everyone. */
const LIGHT_MIN_INTERVAL_MS = 300;
const ROOM_PASSWORD_STORAGE_KEY = "roomPassword";
// No permission system yet (see class doc below) — these are the actual
// abuse guards for an open room: a cap on total placed objects (storage
// growth + everyone's render load) and a per-connection minimum gap
// between chat messages (spam). Neither is configurable per-deployment
// yet; if that turns out to matter, it belongs in world.json alongside
// editingEnabled/allowAvatarUpload.
const MAX_OBJECTS = 300;
const CHAT_MIN_INTERVAL_MS = 400;
const VALID_OBJECT_KINDS = new Set<string>(WORLD_OBJECT_KINDS);
// Writing on a board, taking over a screen and publishing stream ids are all
// broadcast to the whole room, so each gets a minimum gap per connection.
const TEXT_EDIT_MIN_INTERVAL_MS = 250;
const PRESENT_MIN_INTERVAL_MS = 400;
const MEDIA_MIN_INTERVAL_MS = 300;
// MediaStream ids are browser-generated (UUID-ish, occasionally braced).
const STREAM_ID = /^[A-Za-z0-9._:{}-]{1,128}$/;
const BOUNDS_LIMIT = 100; // generous outer bound — BaseEnvironment's own radius is smaller; this just rejects nonsense values, not enforcing gameplay bounds
// A shared password, not per-user accounts — this project's "lean,
// anyone-can-self-deploy" constraint rules out standing up real auth
// infrastructure for a small self-hosted room. Deployers set this via
// `wrangler secret put SEIZA_EDITOR_PASSWORD` (a Worker secret, never
// committed to the repo — see DOCS.md). Undefined = editing stays open to
// everyone, the original/default behavior. A brute-force attempt on one
// WebSocket connection gets cut off after MAX_AUTH_ATTEMPTS; this is a
// deterrent, not a guarantee — nothing stops opening many connections —
// appropriate for the classroom-scale threat model this targets, not a
// claim of real security hardening.
const MAX_AUTH_ATTEMPTS = 5;
// Same shared-secret model and threat-model caveat as
// SEIZA_EDITOR_PASSWORD above, for a deliberately separate, more
// powerful capability: an admin key both supersedes the editor password
// for Edit Mode (see editingRequiresAuth below) and unlocks the
// moderation actions (adminKick/adminSetMute/adminGatherAll). Kept as a
// wholly separate secret and attempt counter from the editor password so
// guessing one doesn't consume the other's attempt budget, and so a
// deployment can run with only a plain editor password and no admin
// concept at all (the common case) with zero behavior change here.
const MAX_ADMIN_AUTH_ATTEMPTS = 5;
// `join` is client-controlled like everything else on this socket, and
// both of these get broadcast to every other player and stored in this
// connection's attachment (which has a hard 16KB serialization limit —
// an unbounded displayName would throw there and break the connection).
const MAX_DISPLAY_NAME_LENGTH = 32; // matches JoinScreen.tsx's input maxLength
const MAX_URL_LENGTH = 2000;
// Same rule as isValidGestureName in src/avatar/gestures.ts. The server
// doesn't know which clips a deployment has — clients resolve names
// against world.json — so it only checks the shape, which keeps anything
// odd out of every other client's state.
const GESTURE_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const GESTURE_MIN_INTERVAL_MS = 250;
// Roughly 70 degrees each way — past this a neck stops being a neck.
const MAX_HEAD_PITCH = 1.22;
// Every avatar change makes everyone in the room download and build a
// model, so rapid switching is throttled per connection.
const AVATAR_CHANGE_MIN_INTERVAL_MS = 1500;
// Designer avatars are data, not files: `seiza-avatar:v1:` + base64url JSON
// (see src/avatar/designer/avatarSpec.ts). Real specs are a few hundred
// characters; the cap only bounds abuse. Receivers re-validate every field.
const DESIGNER_AVATAR_URL = /^seiza-avatar:v1:[A-Za-z0-9_-]{1,1200}$/;

interface ConnectionAttachment {
  connId: string;
  player: PlayerState | null; // null until this connection sends "join"
  lastChatAt?: number;
  lastGestureAt?: number;
  lastLightAt?: number;
  lastAvatarChangeAt?: number;
  lastTextAt?: number;
  lastPresentAt?: number;
  lastMediaAt?: number;
  isEditor?: boolean;
  authAttempts?: number;
  /** Set once this connection's authAdmin succeeds. Distinct from
   *  isEditor (which authAdmin also sets to true) so the room can tell
   *  "can edit" apart from "can moderate" — see canModerate(). */
  isAdmin?: boolean;
  adminAuthAttempts?: number;
  /** Joined with caps ["batch"]: gets movement as one playersUpdated per
   *  tick instead of a playerUpdated per player per update. */
  batch?: boolean;
  /** The page-load session this connection joined with (see "join" in
   *  types.ts). Kept on the server only. */
  session?: string;
}

/** A page-load session ID: a UUID in practice; anything else is ignored. */
const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;

/** How often batched movement goes out: the client's own send rate. */
const MOVEMENT_FLUSH_MS = 200;
/** A moving player's position is written to the socket's stored
 *  attachment at most this often. Only a room woken from hibernation
 *  reads it back, and the next update corrects it within seconds. */
const POSITION_PERSIST_MS = 10_000;

/**
 * One Durable Object instance = one deployed world instance's shared
 * multiplayer session. This replaces the previous PartyKit-based
 * party/room.ts — see DOCS.md's deploy section for why: PartyKit's last
 * real release was over a year old (unmaintained), and its dev CLI has
 * an unfixed Windows path bug that made local testing impossible on some
 * machines. Same protocol (src/multiplayer/types.ts), same behavior,
 * just running on Cloudflare's own primitive instead of a third-party
 * layer on top of it — and as a side effect, this collapses the
 * previous two-piece deploy into one Worker.
 *
 * Uses the WebSocket Hibernation API (`ctx.acceptWebSocket`, not
 * `ws.accept()`) so idle rooms don't pin billed compute. Per-connection
 * player state is deliberately NOT kept in a plain in-memory field —
 * hibernation can evict this object between messages, which would lose
 * an ordinary class property. Instead each connection's state travels
 * with it via serializeAttachment/deserializeAttachment (max 16KB,
 * comfortably enough for one PlayerState), and `ctx.getWebSockets()` is
 * the source of truth for "who's currently connected," re-derived fresh
 * on every call rather than cached.
 */
export class SeizaRoom extends DurableObject<Env> {
  objects = new Map<string, WorldObject>();
  environmentUrl: string | null = null;
  skyboxUrl: string | null = null;
  /** Time-of-day and weather override from the edit panel (see RoomSky). */
  roomSky: RoomSky | null = null;
  lights: Record<LightZone, boolean> = { ...DEFAULT_LIGHTS };
  /** Entry password for this room, or null when anyone can join. Unlike
   *  SEIZA_EDITOR_PASSWORD/SEIZA_ADMIN_KEY (Worker secrets, fixed at
   *  deploy time), this is mutable at runtime via adminSetRoomPassword
   *  and lives in this room's own Durable Object storage — see that
   *  case's doc comment in types.ts for why this one secret is treated
   *  differently from the other two. */
  roomPassword: string | null = null;
  /**
   * When each connection last sent a body-tracking pose, for throttling.
   *
   * Deliberately in memory rather than on the socket attachment the other
   * throttles use. Tracking arrives ten times a second per headset, and
   * every attachment write re-serializes it; this way the hot path costs a
   * map lookup. Losing it when the object hibernates is harmless — the
   * worst case is one pose let through early.
   */
  private lastTrackingAt = new Map<string, number>();
  /** In-memory copies of each socket's attachment (see att()). */
  private attachments = new WeakMap<WebSocket, ConnectionAttachment>();
  /** Movement waiting for the next flush, latest per player. */
  private pendingMovement = new Map<string, PlayerMovement>();
  private movementTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPositionPersist = new Map<string, number>();
  private ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Durable Object constructors can't be async — blockConcurrencyWhile
    // is the standard way to finish async setup (here: restoring
    // previously-placed objects) before the first request is handled.
    // This is the DO-native equivalent of PartyKit's `onStart()` hook
    // the previous version of this file used.
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<WorldObject[]>(OBJECTS_STORAGE_KEY);
      if (stored) for (const obj of stored) this.objects.set(obj.id, obj);
      this.environmentUrl = (await ctx.storage.get<string | null>(ENVIRONMENT_STORAGE_KEY)) ?? null;
      this.skyboxUrl = (await ctx.storage.get<string | null>(SKYBOX_STORAGE_KEY)) ?? null;
      this.roomSky = (await ctx.storage.get<RoomSky | null>(ROOM_SKY_STORAGE_KEY)) ?? null;
      this.lights = { ...this.lights, ...((await ctx.storage.get<Record<LightZone, boolean>>(LIGHTS_STORAGE_KEY)) ?? {}) };
      this.roomPassword = (await ctx.storage.get<string | null>(ROOM_PASSWORD_STORAGE_KEY)) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET" && new URL(request.url).pathname.endsWith("/sky")) {
      await this.ready;
      return Response.json({ roomSky: this.roomSky }, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    await this.ready;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const connId = crypto.randomUUID();
    server.serializeAttachment({ connId, player: null } satisfies ConnectionAttachment);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    await this.ready;
    if (typeof raw !== "string") return;
    const attachment = this.att(ws);
    if (!attachment) return; // shouldn't happen — fetch() always attaches before accepting

    let message: ClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return; // drop malformed messages rather than crash the room
    }

    switch (message.type) {
      case "join": {
        const maxOccupants = Math.max(1, Number.parseInt(this.env.SEIZA_MAX_OCCUPANTS ?? "16", 10) || 16);
        if (this.listPlayers().length >= maxOccupants) {
          ws.send(JSON.stringify({ type: "roomFull", maxOccupants } satisfies ServerMessage));
          ws.close(1008, "Room is full");
          return;
        }
        // Checked before anything else about the join: no point telling
        // someone the room is full, or letting them look at a room
        // roster, before they've actually proven they're allowed in at
        // all. The connection is left open either way — see
        // "passwordRequired"'s doc comment in types.ts for the retry
        // shape (client just resends `join` with the password filled in,
        // same as authEditor/authAdmin's retry pattern).
        if (this.roomPassword && !timingSafeEqual(message.roomPassword ?? "", this.roomPassword)) {
          ws.send(JSON.stringify({ type: "passwordRequired" } satisfies ServerMessage));
          return;
        }
        // Same reasoning as validateNewObject below: the ClientMessage
        // type is a compile-time assertion about a JSON.parse result, not
        // a guarantee. An unvalidated avatarUrl here would be the exact
        // "make every other client's browser fetch an arbitrary URL"
        // hole that objectAdd already guards against.
        const displayName = sanitizeDisplayName(message.displayName);
        const avatarUrl = sanitizeAssetUrl(message.avatarUrl, { allowEmpty: true });
        if (avatarUrl === null) return;
        const player: PlayerState = {
          id: attachment.connId,
          displayName,
          avatarUrl,
          position: [0, 0, 0],
          rotationY: 0,
          headPitch: 0,
          activeGesture: null,
          gestureSeq: 0,
          posture: null,
          media: {},
        };
        const caps = Array.isArray(message.caps) ? message.caps : [];
        const session = typeof message.session === "string" && SESSION_ID.test(message.session) ? message.session : undefined;
        // A reconnect from the same page replaces its old connection now,
        // rather than leaving a frozen copy until that socket times out.
        if (session) this.dropOtherSessionConnections(ws, session);
        this.save(ws, {
          connId: attachment.connId,
          player,
          batch: caps.includes("batch"),
          ...(session ? { session } : {}),
        } satisfies ConnectionAttachment);

        const welcome: ServerMessage = {
          type: "welcome",
          selfId: attachment.connId,
          players: this.listPlayers(),
          objects: Array.from(this.objects.values()),
          editorPasswordRequired: !!this.env.SEIZA_EDITOR_PASSWORD,
          adminKeyRequired: !!this.env.SEIZA_ADMIN_KEY,
          roomPasswordSet: !!this.roomPassword,
          environmentUrl: this.environmentUrl,
          skyboxUrl: this.skyboxUrl,
          lights: this.lights,
          roomSky: this.roomSky,
        };
        ws.send(JSON.stringify(welcome));
        this.broadcast({ type: "playerJoined", player }, attachment.connId);
        break;
      }
      case "state": {
        if (!attachment.player) return;
        // Unvalidated position used to be relayed straight through. A
        // NaN/Infinity here propagates into every other client's
        // Three.js transforms (and the ground-speed estimate feeding
        // AvatarAnimator), so one bad or malicious client could
        // visually break the room for everyone.
        if (!Array.isArray(message.position) || message.position.length !== 3) return;
        if (!message.position.every(isFiniteInBounds)) return;
        if (typeof message.rotationY !== "number" || !Number.isFinite(message.rotationY)) return;
        // Optional and clamped rather than merely validated: this drives
        // a neck rotation on every other client, and a value outside a
        // neck's range would fold an avatar's head through its own body
        // rather than just look wrong.
        const headPitch =
          typeof message.headPitch === "number" && Number.isFinite(message.headPitch)
            ? Math.max(-MAX_HEAD_PITCH, Math.min(MAX_HEAD_PITCH, message.headPitch))
            : 0;
        attachment.player.position = message.position;
        attachment.player.rotationY = message.rotationY;
        attachment.player.headPitch = headPitch;
        // Kept in memory every time, written to storage now and then:
        // serializing the attachment on every update was most of the
        // cost of a busy room.
        const now = Date.now();
        if (now - (this.lastPositionPersist.get(attachment.connId) ?? 0) > POSITION_PERSIST_MS) {
          this.lastPositionPersist.set(attachment.connId, now);
          this.save(ws, attachment);
        }
        const movement = { id: attachment.connId, position: message.position, rotationY: message.rotationY, headPitch };
        this.pendingMovement.set(attachment.connId, movement);
        this.scheduleMovementFlush();
        // Tabs still running a build from before batching get each
        // update as it arrives, as they always did.
        this.broadcast({ type: "playerUpdated", ...movement }, attachment.connId, (other) => !other.batch);
        break;
      }
      case "tracking": {
        if (!attachment.player) return;
        // Relayed, never stored: a pose is stale a tenth of a second
        // later, and late joiners get the next one soon enough. A null
        // (the player left VR) always goes through, unthrottled, so no
        // avatar is left frozen in its last tracked pose.
        const pose = sanitizeTrackedPose(message.pose);
        if (pose === undefined) return;
        if (pose !== null) {
          const now = Date.now();
          const last = this.lastTrackingAt.get(attachment.connId) ?? 0;
          if (now - last < TRACKING_MIN_INTERVAL_MS) return;
          this.lastTrackingAt.set(attachment.connId, now);
        }
        this.broadcast({ type: "playerTracking", id: attachment.connId, pose }, attachment.connId);
        break;
      }
      case "gesture": {
        if (!attachment.player) return;
        const gesture = message.gesture;
        if (gesture !== null && (typeof gesture !== "string" || !GESTURE_NAME.test(gesture))) return;
        const player = attachment.player;
        if (gesture !== null) {
          const now = Date.now();
          if (attachment.lastGestureAt && now - attachment.lastGestureAt < GESTURE_MIN_INTERVAL_MS) return;
          attachment.lastGestureAt = now;
          // Only starting a gesture bumps the sequence; clearing one
          // (gesture: null, sent when a clip ends) just updates state.
          player.gestureSeq = (player.gestureSeq ?? 0) + 1;
        }
        player.activeGesture = gesture;
        this.save(ws, attachment);
        this.broadcast(
          { type: "playerGesture", id: attachment.connId, gesture, seq: player.gestureSeq ?? 0 },
          attachment.connId
        );
        break;
      }
      case "setPosture": {
        if (!attachment.player) return;
        // Same shape rule as a gesture name, since a posture *is* the name
        // of a clip. null means standing.
        const raw = message.posture;
        if (raw !== null && (typeof raw !== "string" || !GESTURE_NAME.test(raw))) return;
        const posture = raw as Posture;
        if (attachment.player.posture === posture) return;
        attachment.player.posture = posture;
        this.save(ws, attachment);
        this.broadcast({ type: "playerPosture", id: attachment.connId, posture }, attachment.connId);
        break;
      }
      case "setCalm": {
        if (!attachment.player || typeof message.calm !== "boolean") return;
        if ((attachment.player.calm ?? false) === message.calm) return;
        attachment.player.calm = message.calm;
        this.save(ws, attachment);
        this.broadcast({ type: "playerCalm", id: attachment.connId, calm: message.calm }, attachment.connId);
        break;
      }
      case "setAvatar": {
        if (!attachment.player) return;
        const avatarUrl = sanitizeAssetUrl(message.avatarUrl, { allowEmpty: true });
        if (avatarUrl === null || avatarUrl === attachment.player.avatarUrl) return;
        const now = Date.now();
        if (attachment.lastAvatarChangeAt && now - attachment.lastAvatarChangeAt < AVATAR_CHANGE_MIN_INTERVAL_MS) return;
        attachment.lastAvatarChangeAt = now;
        attachment.player.avatarUrl = avatarUrl;
        this.save(ws, attachment);
        this.broadcast({ type: "playerAvatarChanged", id: attachment.connId, avatarUrl }, attachment.connId);
        break;
      }
      case "authEditor": {
        if (!attachment.player) return;
        const required = this.env.SEIZA_EDITOR_PASSWORD;
        if (!required) {
          // No password configured on this deployment — editing is open
          // to everyone anyway, so there's nothing to grant.
          ws.send(JSON.stringify({ type: "editorAuthResult", granted: true } satisfies ServerMessage));
          break;
        }
        const attempts = attachment.authAttempts ?? 0;
        if (attempts >= MAX_AUTH_ATTEMPTS) {
          ws.send(JSON.stringify({ type: "editorAuthResult", granted: false } satisfies ServerMessage));
          break;
        }
        const granted = timingSafeEqual(message.password, required);
        attachment.isEditor = granted || attachment.isEditor;
        attachment.authAttempts = granted ? attempts : attempts + 1;
        this.save(ws, attachment);
        ws.send(JSON.stringify({ type: "editorAuthResult", granted } satisfies ServerMessage));
        break;
      }
      case "authAdmin": {
        if (!attachment.player) return;
        const required = this.env.SEIZA_ADMIN_KEY;
        if (!required) {
          // No admin key configured on this deployment — there is no
          // admin concept active at all (see authAdmin's doc comment in
          // types.ts); reporting granted:false here (rather than true,
          // the way authEditor reports success when its secret is unset)
          // is deliberate — "no key exists" and "you proved you hold the
          // key" are not the same thing, and moderation is powerful
          // enough that this shouldn't default to on.
          ws.send(JSON.stringify({ type: "adminAuthResult", granted: false } satisfies ServerMessage));
          break;
        }
        const attempts = attachment.adminAuthAttempts ?? 0;
        if (attempts >= MAX_ADMIN_AUTH_ATTEMPTS) {
          ws.send(JSON.stringify({ type: "adminAuthResult", granted: false } satisfies ServerMessage));
          break;
        }
        const granted = timingSafeEqual(message.key, required);
        if (granted) {
          attachment.isAdmin = true;
          attachment.isEditor = true; // admin implies editor — see editingRequiresAuth's call sites
        }
        attachment.adminAuthAttempts = granted ? attempts : attempts + 1;
        this.save(ws, attachment);
        ws.send(JSON.stringify({ type: "adminAuthResult", granted } satisfies ServerMessage));
        break;
      }
      case "objectAdd": {
        // Gated on isEditor only when editing actually requires proving
        // something (editingRequiresAuth — an editor password or an admin
        // key configured) — the default, no-secret deployment keeps
        // editing open to everyone, same as before this feature existed.
        // What's ALWAYS enforced regardless: a room-wide object cap and
        // basic shape/range validation, since those aren't permission
        // questions — they're "don't let one client wedge the room for
        // everyone."
        if (this.editingRequiresAuth() && !attachment.isEditor) return;
        if (this.objects.size >= MAX_OBJECTS) return;
        const validated = validateNewObject(message.object);
        if (!validated) return;
        const object: WorldObject = { ...validated, id: crypto.randomUUID(), ownerId: attachment.connId };
        this.objects.set(object.id, object);
        this.persistObjects();
        this.broadcast({ type: "objectAdded", object });
        break;
      }
      case "objectMove": {
        if (this.editingRequiresAuth() && !attachment.isEditor) return;
        const object = this.objects.get(message.id);
        if (!object) return;
        // Same NaN/Infinity concern as "state" above — and this one is
        // persisted, so a bad value would survive restarts too.
        if (!Array.isArray(message.position) || message.position.length !== 3) return;
        if (!message.position.every(isFiniteInBounds)) return;
        if (typeof message.rotationY !== "number" || !Number.isFinite(message.rotationY)) return;
        object.position = message.position;
        object.rotationY = message.rotationY;
        this.persistObjects();
        // Sender needs this echo too — an object's position lives only
        // in synced client state (unlike player position, which each
        // client tracks locally regardless), so skipping the sender
        // would snap their own drag back to the stale pre-move value on
        // the next unrelated re-render. See src/edit/WorldObjects.tsx.
        this.broadcast({ type: "objectMoved", id: message.id, position: message.position, rotationY: message.rotationY });
        break;
      }
      case "objectRemove": {
        if (this.editingRequiresAuth() && !attachment.isEditor) return;
        if (!this.objects.delete(message.id)) return;
        this.persistObjects();
        this.broadcast({ type: "objectRemoved", id: message.id });
        break;
      }
      case "objectSetText": {
        // Deliberately NOT editor-gated, on the same principle as
        // objectPresent below: writing on a board that already exists is
        // using the room, not restructuring it. Placing, moving, or
        // deleting the board stays an edit; what gets written on it does
        // not. A class where only the person holding the editor password
        // can write on the notice board is a class with one participant.
        //
        // Everything below this line still applies to everyone, because
        // none of it is a permission question: you must be a joined
        // player, there's a per-connection rate limit, and the text is
        // sanitized. An editor/admin can still delete a board outright,
        // which is the moderation escape hatch for anything written on it.
        if (!attachment.player) return;
        const object = this.objects.get(message.id);
        if (!object || !isTextObjectKind(object.kind)) return;
        const now = Date.now();
        if (attachment.lastTextAt && now - attachment.lastTextAt < TEXT_EDIT_MIN_INTERVAL_MS) return;
        if (typeof message.text !== "string") return;
        attachment.lastTextAt = now;
        this.save(ws, attachment);
        object.text = sanitizeText(message.text);
        this.persistObjects();
        // Echoed to everyone including the writer: an object's text lives
        // only in synced state, same reasoning as objectMoved.
        this.broadcast({ type: "objectUpdated", object });
        break;
      }
      case "objectPresent": {
        // Deliberately not editor-gated: presenting is using the room, not
        // changing it. A screen can only be claimed when free, and only the
        // presenter can give it back.
        if (!attachment.player) return;
        const object = this.objects.get(message.id);
        if (!object || object.kind !== "screen") return;
        const now = Date.now();
        if (attachment.lastPresentAt && now - attachment.lastPresentAt < PRESENT_MIN_INTERVAL_MS) return;
        attachment.lastPresentAt = now;
        this.save(ws, attachment);
        if (message.active === true) {
          if (object.presenterId && object.presenterId !== attachment.connId) return; // taken
          object.presenterId = attachment.connId;
          // Which of the presenter's streams this screen shows. Validated
          // against the known set rather than relayed as given, since it
          // is echoed to every other client.
          object.presenterSource = PRESENT_SOURCES.includes(message.source as PresentSource)
            ? (message.source as PresentSource)
            : "screen";
        } else {
          if (object.presenterId !== attachment.connId) return;
          object.presenterId = null;
          object.presenterSource = undefined;
        }
        // Not persisted deliberately: who is presenting is about who is
        // currently connected, and persisting it would restore a presenter
        // who has long since left.
        this.broadcast({ type: "objectUpdated", object });
        break;
      }
      case "setMedia": {
        if (!attachment.player) return;
        const now = Date.now();
        if (attachment.lastMediaAt && now - attachment.lastMediaAt < MEDIA_MIN_INTERVAL_MS) return;
        const media = sanitizeMedia(message.media);
        if (!media) return;
        attachment.lastMediaAt = now;
        attachment.player.media = media;
        this.save(ws, attachment);
        this.broadcast({ type: "playerMedia", id: attachment.connId, media }, attachment.connId);
        break;
      }
      case "setEnvironment": {
        if (this.editingRequiresAuth() && !attachment.isEditor) return;
        // null clears the override; anything else goes through the same
        // URL sanitizer as placed models, since this makes every client
        // in the room fetch it.
        let next: string | null = null;
        if (message.url !== null) {
          next = sanitizeAssetUrl(message.url, { allowEmpty: false });
          if (!next) return;
        }
        this.environmentUrl = next;
        void this.ctx.storage.put(ENVIRONMENT_STORAGE_KEY, next);
        this.broadcast({ type: "environmentChanged", url: next });
        break;
      }
      case "setSkybox": {
        if (this.editingRequiresAuth() && !attachment.isEditor) return;
        // Same rules as the environment: every client fetches this, so it
        // goes through the asset URL sanitizer. A designer-avatar spec is a
        // valid avatar URL but never an image, so it's refused here.
        let next: string | null = null;
        if (message.url !== null) {
          next = sanitizeAssetUrl(message.url, { allowEmpty: false });
          if (!next || next.startsWith("seiza-avatar:")) return;
        }
        if (next === this.skyboxUrl) return;
        this.skyboxUrl = next;
        void this.ctx.storage.put(SKYBOX_STORAGE_KEY, next);
        this.broadcast({ type: "skyboxChanged", url: next });
        break;
      }
      case "setRoomSky": {
        if (this.editingRequiresAuth() && !attachment.isEditor) return;
        const next = message.sky === null ? null : sanitizeRoomSky(message.sky, Date.now());
        if (next === undefined) return; // malformed: ignore rather than guess
        this.roomSky = next;
        void this.ctx.storage.put(ROOM_SKY_STORAGE_KEY, next);
        this.broadcast({ type: "roomSkyChanged", sky: next });
        break;
      }
      case "setLight": {
        if (!attachment.player) return;
        if (!LIGHT_ZONES.includes(message.zone) || typeof message.on !== "boolean") return;
        const now = Date.now();
        if (attachment.lastLightAt && now - attachment.lastLightAt < LIGHT_MIN_INTERVAL_MS) return;
        attachment.lastLightAt = now;
        this.save(ws, attachment);
        if (this.lights[message.zone] === message.on) return;
        this.lights = { ...this.lights, [message.zone]: message.on };
        void this.ctx.storage.put(LIGHTS_STORAGE_KEY, this.lights);
        this.broadcast({ type: "lightChanged", zone: message.zone, on: message.on });
        break;
      }
      case "chat": {
        if (!attachment.player) return;
        const now = Date.now();
        if (attachment.lastChatAt && now - attachment.lastChatAt < CHAT_MIN_INTERVAL_MS) return;
        if (typeof message.text !== "string") return;
        const text = message.text.trim().slice(0, 500);
        if (!text) return;
        attachment.lastChatAt = now;
        this.save(ws, attachment);
        // Ephemeral by design — not persisted to ctx.storage like
        // objects are, so history doesn't carry across a reconnect.
        this.broadcast({
          type: "chat",
          message: { id: crypto.randomUUID(), senderId: attachment.connId, senderName: attachment.player.displayName, text, sentAt: now },
        });
        break;
      }
      case "voiceSignal": {
        // Pure relay for WebRTC mesh signaling — see src/media/useRealtimeMedia.ts.
        // This server never looks at `data`, just forwards it to the named peer.
        const target = this.findConnection(message.to);
        target?.send(JSON.stringify({ type: "voiceSignal", from: attachment.connId, data: message.data } satisfies ServerMessage));
        break;
      }
      case "adminKick": {
        if (!attachment.isAdmin) return;
        const target = this.findConnection(message.targetId);
        if (!target || message.targetId === attachment.connId) return;
        target.send(JSON.stringify({ type: "youWereKicked" } satisfies ServerMessage));
        // The "close" code here is informational only (never surfaced to
        // the client, which already has youWereKicked); webSocketClose
        // still runs normally and broadcasts playerLeft to everyone else.
        target.close(4001, "Removed by an admin");
        break;
      }
      case "adminSetMute": {
        if (!attachment.isAdmin) return;
        const target = this.findConnection(message.targetId);
        if (!target) return;
        target.send(JSON.stringify({ type: "forceMute", muted: !!message.muted } satisfies ServerMessage));
        break;
      }
      case "adminGatherAll": {
        if (!attachment.isAdmin || !attachment.player) return;
        this.broadcast({ type: "gatherRequest", position: attachment.player.position }, attachment.connId);
        break;
      }
      case "adminSetRoomPassword": {
        if (!attachment.isAdmin) return;
        const password = typeof message.password === "string" ? message.password.slice(0, 200) : null;
        this.roomPassword = password && password.length > 0 ? password : null;
        void this.ctx.storage.put(ROOM_PASSWORD_STORAGE_KEY, this.roomPassword);
        // No broadcast/ack here on purpose: the admin who just set it
        // already knows what they sent (their own UI updates
        // optimistically), and no one already connected is affected —
        // this only ever gates a *future* join, never an existing
        // session. A live "someone else changed the room password"
        // notice to other already-open admin panels would be a
        // reasonable follow-up, not implemented here.
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const attachment = this.att(ws);
    if (attachment?.player) this.removePlayer(attachment.connId);
    if (attachment) {
      this.lastTrackingAt.delete(attachment.connId);
      this.lastPositionPersist.delete(attachment.connId);
      this.pendingMovement.delete(attachment.connId);
    }
    this.attachments.delete(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  /** Tells everyone a player has gone, and frees any screen they held. */
  private removePlayer(connId: string) {
    // Free any screen they were presenting on, or it would stay claimed by
    // someone who isn't here any more.
    for (const object of this.objects.values()) {
      if (object.kind === "screen" && object.presenterId === connId) {
        object.presenterId = null;
        this.broadcast({ type: "objectUpdated", object });
      }
    }
    this.broadcast({ type: "playerLeft", id: connId });
  }

  /**
   * Removes every other connection that joined with this page-load session.
   *
   * When a laptop's network drops, its socket usually isn't closed cleanly,
   * so the server keeps it (and its player) until the connection times out,
   * which can take minutes. Meanwhile the page reconnects on a new socket
   * and joins again, and everyone saw two of that person, one frozen. The
   * old player is removed straight away, and its socket closed. Clearing
   * its player first stops webSocketClose from announcing it a second time.
   */
  private dropOtherSessionConnections(current: WebSocket, session: string) {
    for (const other of this.ctx.getWebSockets()) {
      if (other === current) continue;
      const attachment = this.att(other);
      if (attachment?.session !== session) continue;
      if (attachment.player) this.removePlayer(attachment.connId);
      this.lastTrackingAt.delete(attachment.connId);
      this.lastPositionPersist.delete(attachment.connId);
      this.pendingMovement.delete(attachment.connId);
      this.save(other, { ...attachment, player: null, session: undefined });
      try {
        other.close(4002, "Replaced by a newer connection from the same page");
      } catch {
        // Already closing or dead, which is the usual case here.
      }
    }
  }

  /** Whether Edit Mode requires proving *something* on this deployment —
   *  either secret satisfies it (see authEditor/authAdmin, both of which
   *  set attachment.isEditor on success). True the moment either secret
   *  is configured, even before anyone's authenticated; every objectX/
   *  setEnvironment/setSkybox case checks this alongside isEditor. */
  private editingRequiresAuth(): boolean {
    return !!(this.env.SEIZA_EDITOR_PASSWORD || this.env.SEIZA_ADMIN_KEY);
  }

  private listPlayers(): PlayerState[] {    return this.ctx
      .getWebSockets()
      .map((ws) => (this.att(ws))?.player)
      .filter((p): p is PlayerState => !!p);
  }

  private findConnection(connId: string): WebSocket | undefined {
    return this.ctx
      .getWebSockets()
      .find((ws) => (this.att(ws))?.connId === connId);
  }

  /** Broadcasts to every connected, joined player except `excludeConnId`
   *  (if given) — mirrors the previous PartyKit version's exclude-list
   *  broadcast, just re-derived from ctx.getWebSockets() each call
   *  instead of an in-memory connection list. */
  private broadcast(message: ServerMessage, excludeConnId?: string, only?: (attachment: ConnectionAttachment) => boolean) {
    const json = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = this.att(ws);
      if (!attachment?.player) continue; // hasn't joined yet
      if (excludeConnId && attachment.connId === excludeConnId) continue;
      if (only && !only(attachment)) continue;
      try {
        ws.send(json);
      } catch {
        // A socket that's already closing throws on send. Without this,
        // one dead peer aborts the whole loop and everyone after it in
        // the iteration order silently misses the message.
      }
    }
  }

  /**
   * A socket's attachment, from memory when this instance already has it.
   * deserializeAttachment() copies the stored value out every time, and
   * broadcast() used to do that for every socket on every message. After
   * the room wakes from hibernation the cache is empty and fills again
   * from storage, one socket at a time.
   */
  private att(ws: WebSocket): ConnectionAttachment | null {
    let attachment = this.attachments.get(ws);
    if (!attachment) {
      attachment = (ws.deserializeAttachment() as ConnectionAttachment | null) ?? undefined;
      if (attachment) this.attachments.set(ws, attachment);
    }
    return attachment ?? null;
  }

  /** Stores an attachment, in memory and on the socket. */
  private save(ws: WebSocket, attachment: ConnectionAttachment) {
    this.attachments.set(ws, attachment);
    ws.serializeAttachment(attachment);
  }

  /** Sends everything that moved since the last tick as one message. */
  private scheduleMovementFlush() {
    if (this.movementTimer !== null) return;
    this.movementTimer = setTimeout(() => {
      this.movementTimer = null;
      if (this.pendingMovement.size === 0) return;
      const updates = Array.from(this.pendingMovement.values());
      this.pendingMovement.clear();
      // The same message for everyone; each client skips its own entry.
      this.broadcast({ type: "playersUpdated", updates }, undefined, (attachment) => !!attachment.batch);
    }, MOVEMENT_FLUSH_MS);
  }

  private persistObjects() {
    // Fire-and-forget: fine at the scale this scaffold targets (a handful
    // of edits per session, not a high-frequency write path like position
    // sync). Revisit if editing gets busy enough to matter.
    void this.ctx.storage.put(OBJECTS_STORAGE_KEY, Array.from(this.objects.values()));
  }
}

/**
 * `message` came from `JSON.parse` on a client-controlled string, cast to
 * `ClientMessage` with no runtime check — the TypeScript type is a
 * compile-time assertion, not a guarantee about what's actually on the
 * wire. This is the one place that actually validates shape/range before
 * anything gets stored and broadcast to everyone in the room, including
 * restricting pasted model URLs to http(s) — the paste-a-URL feature
 * (src/edit/EditToolbar.tsx) means any connected client can make every
 * other client's browser fetch an arbitrary URL, so at minimum that
 * can't be a `javascript:`/`data:`/`file:` scheme.
 */
function validateNewObject(input: unknown): Omit<WorldObject, "id" | "ownerId"> | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;

  if (typeof obj.kind !== "string" || !VALID_OBJECT_KINDS.has(obj.kind)) return null;
  const kind = obj.kind as WorldObjectKind;

  if (typeof obj.color !== "string" || obj.color.length === 0 || obj.color.length > 32) return null;

  if (!Array.isArray(obj.position) || obj.position.length !== 3 || !obj.position.every(isFiniteInBounds)) return null;
  const position = obj.position as [number, number, number];

  if (typeof obj.rotationY !== "number" || !Number.isFinite(obj.rotationY)) return null;

  if (typeof obj.scale !== "number" || !Number.isFinite(obj.scale)) return null;
  const scale = Math.min(20, Math.max(0.05, obj.scale));

  let modelUrl: string | undefined;
  if (kind === "model") {
    const sanitized = sanitizeAssetUrl(obj.modelUrl, { allowEmpty: false });
    if (!sanitized) return null;
    modelUrl = sanitized;
  }

  // Images and videos carry a URL every other client's browser will load,
  // so it goes through exactly the same scheme check as models and avatars
  // — an image object is just as good a way to point a room full of
  // browsers at an arbitrary URL as a model object is.
  let src: string | undefined;
  if (kind === "image" || kind === "video") {
    const sanitized = sanitizeAssetUrl(obj.src, { allowEmpty: false });
    if (!sanitized || sanitized.startsWith("seiza-avatar:")) return null;
    src = sanitized;
  }

  // Tilt, so a note can lie flat on a desk. Clamped rather than rejected:
  // it's cosmetic, and a nonsense value shouldn't lose the whole object.
  const pitch =
    typeof obj.pitch === "number" && Number.isFinite(obj.pitch) ? Math.min(Math.PI, Math.max(-Math.PI, obj.pitch)) : 0;

  const text = isTextObjectKind(kind) ? sanitizeText(obj.text) : undefined;
  // `presenterId` is never accepted from a client: a screen is claimed
  // through objectPresent, which checks it's actually free.
  const presenterId = kind === "screen" ? null : undefined;

  return { kind, modelUrl, src, color: obj.color, position, rotationY: obj.rotationY, pitch, scale, text, presenterId };
}

/**
 * Board and note text. Control characters go (they'd break rendering and
 * could smuggle escapes into a deployer's logs) but ordinary newlines stay,
 * because the first line is the heading and the rest is the body.
 */
function sanitizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  let cleaned = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || (code >= 0x20 && code !== 0x7f)) cleaned += ch;
  }
  return cleaned.slice(0, MAX_OBJECT_TEXT_LENGTH);
}

/** Stream ids are opaque browser-generated strings; anything else is dropped. */
function sanitizeMedia(input: unknown): PlayerMedia | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  const media: PlayerMedia = {};
  for (const key of ["mic", "camera", "screen"] as const) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || !STREAM_ID.test(value)) return null;
    media[key] = value;
  }
  if (raw.micMuted === true) media.micMuted = true;
  return media;
}

/**
 * Shared by placed-object modelUrls and join avatarUrls. Accepts either a
 * same-origin absolute path (what this deployment's own upload endpoints
 * hand back — `/api/assets/<id>.glb`, `/api/avatars/<id>.vrm`) or an
 * explicit http(s) URL (the paste-a-URL feature).
 *
 * The same-origin case is why this exists: uploading a model returned a
 * relative URL from worker/index.ts, which the old http(s)-only check
 * rejected — so every asset-library upload was silently dropped by the
 * server while the UI reported success.
 *
 * Designer avatars (`seiza-avatar:v1:…`) are also accepted. They aren't
 * fetched at all — clients build the model from the encoded spec — so the
 * only check needed is that the payload is plain base64url of bounded size.
 *
 * Returns null for anything else. The schemes being excluded are the
 * point: `javascript:`, `data:`, `file:`, and protocol-relative `//host`
 * (which looks same-origin but isn't). Any connected client can make
 * every other client's browser fetch whatever this returns.
 */
function sanitizeAssetUrl(input: unknown, { allowEmpty }: { allowEmpty: boolean }): string | null {
  if (typeof input !== "string") return null;
  const url = input.trim();
  if (url.length === 0) return allowEmpty ? "" : null;
  if (url.length > MAX_URL_LENGTH) return null;
  if (url.startsWith("seiza-avatar:")) return DESIGNER_AVATAR_URL.test(url) ? url : null;
  if (url.startsWith("//")) return null; // protocol-relative → cross-origin
  if (url.startsWith("/")) return url; // same-origin path
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

function sanitizeDisplayName(input: unknown): string {
  if (typeof input !== "string") return "guest";
  // Strip control characters (including newlines) so a name can't break
  // up the chat/nameplate rendering or smuggle terminal escapes into a
  // deployer's logs.
  let cleaned = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    // Drop C0 controls and DEL; everything printable (incl. non-Latin) stays.
    if (code >= 0x20 && code !== 0x7f) cleaned += ch;
  }
  cleaned = cleaned.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : "guest";
}

/**
 * Constant-time string comparison for the shared editor password. The
 * realistic threat model here is small (network jitter swamps the timing
 * signal of a JS string compare, and MAX_AUTH_ATTEMPTS caps guesses per
 * connection), but this costs nothing and removes the question.
 */
export function timingSafeEqual(a: unknown, b: string): boolean {
  if (typeof a !== "string") return false;
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  // Compare over a fixed length so the loop count doesn't leak the
  // candidate's length; the length check is folded into the result.
  const length = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return mismatch === 0;
}

function isFiniteInBounds(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= BOUNDS_LIMIT;
}

/**
 * Checks a room sky from a client. Returns null for "no override",
 * undefined for anything malformed, and otherwise a clean copy. The server
 * stamps `setAt` itself, so a running clock starts from one shared moment.
 */
export function sanitizeRoomSky(raw: unknown, now: number): RoomSky | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;
  const mode = input.mode;
  if (mode !== "realtime" && mode !== "fixed" && mode !== "running") return undefined;
  const weather = ROOM_SKY_WEATHER.includes(input.weather as never) ? (input.weather as RoomSky["weather"]) : "auto";
  if (mode === "realtime") return { mode, weather };
  if (typeof input.hour !== "number" || !Number.isFinite(input.hour)) return undefined;
  // Wrapped into a day, to the minute.
  const hour = Math.round((((input.hour % 24) + 24) % 24) * 60) / 60;
  if (mode === "fixed") return { mode, hour, weather };
  const scale = ROOM_SKY_SCALES.includes(input.scale as never) ? (input.scale as number) : 1;
  return { mode, hour, scale, weather, setAt: now };
}
