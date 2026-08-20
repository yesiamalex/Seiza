import { DurableObject } from "cloudflare:workers";
import type { ClientMessage, PlayerState, ServerMessage, WorldObject } from "../src/multiplayer/types";
import type { Env } from "./index";

const OBJECTS_STORAGE_KEY = "objects";
// No permission system yet (see class doc below) — these are the actual
// abuse guards for an open room: a cap on total placed objects (storage
// growth + everyone's render load) and a per-connection minimum gap
// between chat messages (spam). Neither is configurable per-deployment
// yet; if that turns out to matter, it belongs in world.json alongside
// editingEnabled/allowAvatarUpload.
const MAX_OBJECTS = 300;
const CHAT_MIN_INTERVAL_MS = 400;
const VALID_OBJECT_KINDS = new Set(["box", "sphere", "cylinder", "model"]);
const BOUNDS_LIMIT = 100; // generous outer bound — BaseEnvironment's own radius is smaller; this just rejects nonsense values, not enforcing gameplay bounds
// A shared password, not per-user accounts — this project's "lean,
// anyone-can-self-deploy" constraint rules out standing up real auth
// infrastructure for a small self-hosted room. Deployers set this via
// `wrangler secret put SEIZA_EDITOR_PASSWORD` (a Worker secret, never
// committed to the repo — see README). Undefined = editing stays open to
// everyone, the original/default behavior. A brute-force attempt on one
// WebSocket connection gets cut off after MAX_AUTH_ATTEMPTS; this is a
// deterrent, not a guarantee — nothing stops opening many connections —
// appropriate for the classroom-scale threat model this targets, not a
// claim of real security hardening.
const MAX_AUTH_ATTEMPTS = 5;

interface ConnectionAttachment {
  connId: string;
  player: PlayerState | null; // null until this connection sends "join"
  lastChatAt?: number;
  isEditor?: boolean;
  authAttempts?: number;
}

/**
 * One Durable Object instance = one deployed world instance's shared
 * multiplayer session. This replaces the previous PartyKit-based
 * party/room.ts — see README's deploy section for why: PartyKit's last
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
    });
  }

  async fetch(request: Request): Promise<Response> {
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
    const attachment = ws.deserializeAttachment() as ConnectionAttachment | null;
    if (!attachment) return; // shouldn't happen — fetch() always attaches before accepting

    let message: ClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return; // drop malformed messages rather than crash the room
    }

    switch (message.type) {
      case "join": {
        const player: PlayerState = {
          id: attachment.connId,
          displayName: message.displayName,
          avatarUrl: message.avatarUrl,
          position: [0, 0, 0],
          rotationY: 0,
          activeGesture: null,
        };
        ws.serializeAttachment({ connId: attachment.connId, player } satisfies ConnectionAttachment);

        const welcome: ServerMessage = {
          type: "welcome",
          selfId: attachment.connId,
          players: this.listPlayers(),
          objects: Array.from(this.objects.values()),
          editorPasswordRequired: !!this.env.SEIZA_EDITOR_PASSWORD,
        };
        ws.send(JSON.stringify(welcome));
        this.broadcast({ type: "playerJoined", player }, attachment.connId);
        break;
      }
      case "state": {
        if (!attachment.player) return;
        attachment.player.position = message.position;
        attachment.player.rotationY = message.rotationY;
        ws.serializeAttachment(attachment);
        this.broadcast(
          { type: "playerUpdated", id: attachment.connId, position: message.position, rotationY: message.rotationY },
          attachment.connId
        );
        break;
      }
      case "gesture": {
        if (!attachment.player) return;
        attachment.player.activeGesture = message.gesture;
        ws.serializeAttachment(attachment);
        this.broadcast({ type: "playerGesture", id: attachment.connId, gesture: message.gesture }, attachment.connId);
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
        const granted = message.password === required;
        attachment.isEditor = granted || attachment.isEditor;
        attachment.authAttempts = granted ? attempts : attempts + 1;
        ws.serializeAttachment(attachment);
        ws.send(JSON.stringify({ type: "editorAuthResult", granted } satisfies ServerMessage));
        break;
      }
      case "objectAdd": {
        // Gated on isEditor only when a password is actually configured
        // (this.env.SEIZA_EDITOR_PASSWORD) — the default, no-password
        // deployment keeps editing open to everyone, same as before this
        // feature existed. What's ALWAYS enforced regardless: a room-wide
        // object cap and basic shape/range validation, since those aren't
        // permission questions — they're "don't let one client wedge the
        // room for everyone."
        if (this.env.SEIZA_EDITOR_PASSWORD && !attachment.isEditor) return;
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
        if (this.env.SEIZA_EDITOR_PASSWORD && !attachment.isEditor) return;
        const object = this.objects.get(message.id);
        if (!object) return;
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
        if (this.env.SEIZA_EDITOR_PASSWORD && !attachment.isEditor) return;
        if (!this.objects.delete(message.id)) return;
        this.persistObjects();
        this.broadcast({ type: "objectRemoved", id: message.id });
        break;
      }
      case "chat": {
        if (!attachment.player) return;
        const now = Date.now();
        if (attachment.lastChatAt && now - attachment.lastChatAt < CHAT_MIN_INTERVAL_MS) return;
        const text = message.text.trim().slice(0, 500);
        if (!text) return;
        attachment.lastChatAt = now;
        ws.serializeAttachment(attachment);
        // Ephemeral by design — not persisted to ctx.storage like
        // objects are, so history doesn't carry across a reconnect.
        this.broadcast({
          type: "chat",
          message: { id: crypto.randomUUID(), senderId: attachment.connId, senderName: attachment.player.displayName, text, sentAt: now },
        });
        break;
      }
      case "voiceSignal": {
        // Pure relay for WebRTC mesh signaling — see src/voice/useVoiceChat.ts.
        // This server never looks at `data`, just forwards it to the named peer.
        const target = this.findConnection(message.to);
        target?.send(JSON.stringify({ type: "voiceSignal", from: attachment.connId, data: message.data } satisfies ServerMessage));
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as ConnectionAttachment | null;
    if (attachment?.player) {
      this.broadcast({ type: "playerLeft", id: attachment.connId });
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  private listPlayers(): PlayerState[] {
    return this.ctx
      .getWebSockets()
      .map((ws) => (ws.deserializeAttachment() as ConnectionAttachment | null)?.player)
      .filter((p): p is PlayerState => !!p);
  }

  private findConnection(connId: string): WebSocket | undefined {
    return this.ctx
      .getWebSockets()
      .find((ws) => (ws.deserializeAttachment() as ConnectionAttachment | null)?.connId === connId);
  }

  /** Broadcasts to every connected, joined player except `excludeConnId`
   *  (if given) — mirrors the previous PartyKit version's exclude-list
   *  broadcast, just re-derived from ctx.getWebSockets() each call
   *  instead of an in-memory connection list. */
  private broadcast(message: ServerMessage, excludeConnId?: string) {
    const json = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as ConnectionAttachment | null;
      if (!attachment?.player) continue; // hasn't joined yet
      if (excludeConnId && attachment.connId === excludeConnId) continue;
      ws.send(json);
    }
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
  const kind = obj.kind as WorldObject["kind"];

  if (typeof obj.color !== "string" || obj.color.length === 0 || obj.color.length > 32) return null;

  if (!Array.isArray(obj.position) || obj.position.length !== 3 || !obj.position.every(isFiniteInBounds)) return null;
  const position = obj.position as [number, number, number];

  if (typeof obj.rotationY !== "number" || !Number.isFinite(obj.rotationY)) return null;

  if (typeof obj.scale !== "number" || !Number.isFinite(obj.scale)) return null;
  const scale = Math.min(20, Math.max(0.05, obj.scale));

  let modelUrl: string | undefined;
  if (kind === "model") {
    if (typeof obj.modelUrl !== "string" || obj.modelUrl.length === 0 || obj.modelUrl.length > 2000) return null;
    if (!/^https:\/\//i.test(obj.modelUrl) && !/^http:\/\//i.test(obj.modelUrl)) return null;
    modelUrl = obj.modelUrl;
  }

  return { kind, modelUrl, color: obj.color, position, rotationY: obj.rotationY, scale };
}

function isFiniteInBounds(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= BOUNDS_LIMIT;
}
