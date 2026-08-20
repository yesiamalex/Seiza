// Cloudflare Worker `main` script. Handles the avatar-upload API, routes
// WebSocket upgrades to the room Durable Object (room.ts), and falls
// through to the static SPA build (via the `ASSETS` binding) for
// everything else. This is now a single deploy — see README's deploy
// section for why that's a change from earlier (this project used to
// run its realtime room server on PartyKit, deployed separately; that's
// been replaced by room.ts, a plain Durable Object bound directly here).
//
// Avatars are stored in Workers KV, not R2. R2 requires a payment
// method on file to activate at all (even to stay within its free
// tier); Workers KV doesn't. Since this is meant to be deployable by
// anyone forking the repo with zero billing setup, KV is the right
// default here — see the README's deploy section for the tradeoff
// (KV is eventually consistent, unlike R2's strong read-after-write).
//
// Not covered by `npm run typecheck` (root tsconfig only includes
// `src/`) — see worker/tsconfig.json for editor support via
// @cloudflare/workers-types, and sanity-check API shapes against
// current Cloudflare docs before relying on this in production.

import { SeizaRoom } from "./room";

export interface Env {
  ASSETS: Fetcher;
  AVATARS: KVNamespace;
  ROOMS: DurableObjectNamespace<SeizaRoom>;
  /** Optional shared editor password — see worker/room.ts. Set via
   *  `wrangler secret put SEIZA_EDITOR_PASSWORD`, never committed to the
   *  repo. Undefined means editing stays open to everyone (the default). */
  SEIZA_EDITOR_PASSWORD?: string;
}

export { SeizaRoom };

interface AvatarMetadata {
  contentType: string;
}

// KV's per-value limit is 25 MiB, hard — this isn't a policy choice we
// can relax, KV will reject the write above it regardless of what this
// code does. Staying at 24MB for a small safety margin rather than
// sitting right at the literal boundary. (Unlike R2, which supports up
// to 5TiB and had headroom to spare — see the KV-vs-R2 tradeoff note
// elsewhere in this file.) The client (JoinScreen.tsx) warns well below
// this for "this is a large file" reasons that aren't about hitting the
// technical ceiling — that's a separate, softer threshold.
const MAX_AVATAR_BYTES = 24 * 1024 * 1024;
// .vrm files are glTF-binary (.glb) under the hood — this is the .glb
// magic header, not a VRM-specific signature. Good enough to reject
// obviously-wrong uploads without a full glTF/VRM validator.
const GLTF_MAGIC = [0x67, 0x6c, 0x54, 0x46]; // ASCII "glTF"

// Uploaded avatars are documented as ephemeral, uploader-owned content,
// not curated by the deployer (see THIRD_PARTY_ASSETS.md) — KV's native
// per-key TTL makes that literally true instead of just a policy, and
// keeps long-running deployments comfortably under the 1GB free-tier
// storage cap without any separate cleanup job.
const AVATAR_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Best-effort, per-isolate rate limiting only — this Map is reset
// whenever Cloudflare recycles the isolate, and provides no protection
// across multiple isolates/colos. A deployment that gets meaningful
// traffic should put real Cloudflare Rate Limiting rules in front of
// POST /api/avatars instead of relying on this alone.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_UPLOADS = 10;
const uploadCounts = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = uploadCounts.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    uploadCounts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_UPLOADS;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/rooms/")) {
      return routeToRoom(request, url, env);
    }

    if (url.pathname === "/api/avatars" && request.method === "POST") {
      return handleUpload(request, env);
    }

    const avatarMatch = url.pathname.match(/^\/api\/avatars\/([a-f0-9-]+\.vrm)$/);
    if (avatarMatch && request.method === "GET") {
      return handleGetAvatar(request, avatarMatch[1], env);
    }

    return env.ASSETS.fetch(request);
  },
};

/** One Durable Object instance per room id (the world id — see
 *  src/multiplayer/useRoomSocket.ts) — `idFromName` deterministically
 *  maps the same room id to the same instance every time. */
function routeToRoom(request: Request, url: URL, env: Env): Response | Promise<Response> {
  const roomId = decodeURIComponent(url.pathname.slice("/rooms/".length));
  if (!roomId) return new Response("Missing room id", { status: 400 });
  const id = env.ROOMS.idFromName(roomId);
  const stub = env.ROOMS.get(id);
  return stub.fetch(request);
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (isRateLimited(ip)) {
    return jsonError("Too many uploads from this address recently — try again later.", 429);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_AVATAR_BYTES) {
    return jsonError(`File too large (max ${MAX_AVATAR_BYTES / (1024 * 1024)}MB).`, 413);
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0) return jsonError("Empty upload.", 400);
  if (buffer.byteLength > MAX_AVATAR_BYTES) {
    return jsonError(`File too large (max ${MAX_AVATAR_BYTES / (1024 * 1024)}MB).`, 413);
  }

  const header = new Uint8Array(buffer.slice(0, 4));
  const isGlb = GLTF_MAGIC.every((byte, i) => header[i] === byte);
  if (!isGlb) {
    return jsonError("Not a valid .vrm file (missing glTF-binary header).", 400);
  }

  const key = `${crypto.randomUUID()}.vrm`;
  await env.AVATARS.put(key, buffer, {
    expirationTtl: AVATAR_TTL_SECONDS,
    metadata: { contentType: "model/gltf-binary" } satisfies AvatarMetadata,
  });

  return new Response(JSON.stringify({ url: `/api/avatars/${key}` }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

async function handleGetAvatar(request: Request, key: string, env: Env): Promise<Response> {
  // Every peer in a room fetches every other peer's avatar, and the same
  // avatar gets re-fetched on every page reload — without edge caching
  // that's a KV read per fetch per colo, which adds up fast against the
  // free tier's 100k reads/day. Keys are random UUIDs that are never
  // overwritten (only TTL-expired), so caching the response at
  // Cloudflare's edge (not just the immutable Cache-Control header,
  // which only helps the *browser's own* cache) is safe and cheap: a
  // cache hit costs zero KV reads.
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const { value, metadata } = await env.AVATARS.getWithMetadata<AvatarMetadata>(key, "arrayBuffer");
  if (!value) return new Response("Not found", { status: 404 });

  const response = new Response(value, {
    headers: {
      "content-type": metadata?.contentType ?? "model/gltf-binary",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
  await cache.put(request, response.clone());
  return response;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
