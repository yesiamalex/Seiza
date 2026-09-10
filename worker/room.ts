import { DurableObject } from "cloudflare:workers";
import type { ClientMessage, PlayerState, ServerMessage, WorldObject } from "../src/multiplayer/types";
import type { Env } from "./index";

const OBJECTS_STORAGE_KEY = "objects";
const ENVIRONMENT_STORAGE_KEY = "environmentUrl";
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
// `join` is client-controlled like everything else on this socket, and
// both of these get broadcast to every other player and stored in this
// connection's attachment (which has a hard 16KB serialization limit —
// an unbounded displayName would throw there and break the connection).
const MAX_DISPLAY_NAME_LENGTH = 32; // matches JoinScreen.tsx's input maxLength
const MAX_URL_LENGTH = 2000;

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
  environmentUrl: string | null = null;
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
        const maxOccupants = Math.max(1, Number.parseInt(this.env.SEIZA_MAX_OCCUPANTS ?? "16", 10) || 16);
        if (this.listPlayers().length >= maxOccupants) {
          ws.send(JSON.stringify({ type: "roomFull", maxOccupants } satisfies ServerMessage));
          ws.close(1008, "Room is full");
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
          activeGesture: null,
        };
        ws.serializeAttachment({ connId: attachment.connId, player } satisfies ConnectionAttachment);

        const welcome: ServerMessage = {
          type: "welcome",
          selfId: attachment.connId,
          players: this.listPlayers(),
          objects: Array.from(this.objects.values()),
          editorPasswordRequired: !!this.env.SEIZA_EDITOR_PASSWORD,
          environmentUrl: this.environmentUrl,
        };
        ws.send(JSON.stringify(welcome));
        this.broadcast({ type: "playerJoined", player }, attachment.connId);
        break;
      }
      case "state": {
        if (!attachment.player) return;
        // Unvalidated position used to be relayed straight through. A
        // NaN/Infinity here propagates into every other client's
        // Three.js transforms (and the speed estimate feeding
        // useProceduralGait), so one bad or malicious client could
        // visually break the room for everyone.
        if (!Array.isArray(message.position) || message.position.length !== 3) return;
        if (!message.position.every(isFiniteInBounds)) return;
        if (typeof message.rotationY !== "number" || !Number.isFinite(message.rotationY)) return;
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
        const granted = timingSafeEqual(message.password, required);
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
      case "setEnvironment": {
        if (this.env.SEIZA_EDITOR_PASSWORD && !attachment.isEditor) return;
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
      try {
        ws.send(json);
      } catch {
        // A socket that's already closing throws on send. Without this,
        // one dead peer aborts the whole loop and everyone after it in
        // the iteration order silently misses the message.
      }
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
    const sanitized = sanitizeAssetUrl(obj.modelUrl, { allowEmpty: false });
    if (!sanitized) return null;
    modelUrl = sanitized;
  }

  return { kind, modelUrl, color: obj.color, position, rotationY: obj.rotationY, scale };
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
