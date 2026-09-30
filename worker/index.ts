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

import { SeizaRoom, timingSafeEqual } from "./room";

export interface Env {
  ASSETS: Fetcher;
  AVATARS: KVNamespace;
  ROOMS: DurableObjectNamespace<SeizaRoom>;
  /** Optional shared editor password — see worker/room.ts. Set via
   *  `wrangler secret put SEIZA_EDITOR_PASSWORD`, never committed to the
   *  repo. Undefined means editing stays open to everyone (the default). */
  SEIZA_EDITOR_PASSWORD?: string;
  /** Optional. When set, supersedes SEIZA_EDITOR_PASSWORD for gating
   *  Edit Mode and additionally unlocks moderation (kick/mute/gather) —
   *  see ADMIN.md. Also a Worker secret: `wrangler secret put
   *  SEIZA_ADMIN_KEY`, never a plaintext wrangler.jsonc var, for the
   *  same reason as SEIZA_EDITOR_PASSWORD above. Undefined means there
   *  is no admin concept active on this deployment at all. */
  SEIZA_ADMIN_KEY?: string;
  /** Maximum simultaneous joined players for the deployed world. */
  SEIZA_MAX_OCCUPANTS?: string;
  /** Optional pair for minting short-lived Cloudflare Realtime TURN
   *  credentials (see handleTurnCredentials below, and README.md's
   *  "Voice/video across different networks" for why this exists at all:
   *  STUN alone — the only thing configured without it — cannot traverse
   *  every NAT, and a peer pair split across two network types where at
   *  least one is restrictive is exactly the "works on the same Wi-Fi,
   *  fails on different ones" symptom this fixes). Create a TURN key at
   *  dash.cloudflare.com -> Realtime -> TURN, then
   *  `wrangler secret put CLOUDFLARE_TURN_KEY_ID` and
   *  `wrangler secret put CLOUDFLARE_TURN_KEY_API_TOKEN`. Neither is a
   *  client-side value — the API token in particular must never reach
   *  the browser, which is the whole reason this endpoint exists instead
   *  of the client calling Cloudflare's TURN API directly. */
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_KEY_API_TOKEN?: string;
}

/** How long a minted TURN credential stays valid. Two hours comfortably
 *  outlives a class or a meeting while keeping a leaked credential
 *  short-lived; the client re-fetches on reload. */
const TURN_CREDENTIAL_TTL_SECONDS = 7200;

/**
 * Mints short-lived ICE server credentials for the calling browser.
 *
 * Returns `{ iceServers: [] }` with a 404 when this deployment has no
 * TURN key configured, which is a valid, supported state: the client
 * falls back to STUN-only and works fine for everyone whose NAT allows
 * it. That is deliberately not an error — most deployments will never
 * set this up, and a red console error on every join would be noise.
 */
/**
 * Credential mints allowed per IP per window.
 *
 * A credential is cheap to mint but expensive to hand out carelessly:
 * anyone holding one can relay traffic through the deployer's Cloudflare
 * Realtime allowance (1,000 GB/month included, $0.05/GB after) until it
 * expires. A browser needs exactly one per page load, so a generous
 * ceiling still shuts down a script looping on this endpoint to harvest
 * relay credentials. Shares the upload limiter's window and, like it,
 * is per-isolate rather than global — good enough to stop a loop, not a
 * distributed abuse defence.
 */
const TURN_MINTS_PER_WINDOW = 20;
const turnMintCounts = new Map<string, { count: number; windowStart: number }>();

function isTurnRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = turnMintCounts.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    turnMintCounts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > TURN_MINTS_PER_WINDOW;
}

async function handleTurnCredentials(request: Request, env: Env): Promise<Response> {
  if (!env.CLOUDFLARE_TURN_KEY_ID || !env.CLOUDFLARE_TURN_KEY_API_TOKEN) {
    return new Response(JSON.stringify({ iceServers: [] }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (isTurnRateLimited(ip)) {
    // Empty list, not an error status the client would retry on: the
    // caller falls back to STUN-only and the page still works.
    return new Response(JSON.stringify({ iceServers: [] }), {
      status: 429,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_TURN_KEY_API_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }),
      }
    );
  } catch {
    return new Response(JSON.stringify({ iceServers: [] }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  if (!upstream.ok) {
    // The upstream body can quote the key id back; don't relay it.
    return new Response(JSON.stringify({ iceServers: [] }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(await upstream.text(), {
    headers: {
      "content-type": "application/json",
      // Credentials are per-browser and time-limited: never let a shared
      // cache hand one browser's TURN credential to another.
      "cache-control": "no-store",
    },
  });
}

export { SeizaRoom };

interface AvatarMetadata {
  contentType: string;
}

interface StoredAssetMetadata {
  contentType: string;
  name: string;
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
const MAX_MODEL_BYTES = 24 * 1024 * 1024;
/**
 * Images get a far smaller ceiling than models, on purpose.
 *
 * The constraint isn't KV's 25MiB per value, it's the free tier's 1GB of
 * total storage and the fact that a room's worth of pictures is meant to be
 * cheap to keep forever. The editor re-encodes every upload client-side
 * (src/edit/compressImage.ts) to at most 2048px and roughly 500KB, so this
 * is a backstop against something that skipped that path, not the normal
 * limit — a wall of photos at 500KB each is ~2000 images per free GB.
 *
 * Video is deliberately NOT uploadable. A single clip would eat a
 * meaningful share of that budget, KV serves whole values with no range
 * requests (so seeking re-downloads the file), and every viewer in every
 * colo costs a fresh read. Videos are referenced by URL instead and served
 * by whoever already hosts them.
 */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Accepted image encodings, with the magic bytes that prove each one. */
const IMAGE_TYPES: Array<{ extension: string; contentType: string; matches: (bytes: Uint8Array) => boolean }> = [
  {
    extension: "webp",
    contentType: "image/webp",
    matches: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  { extension: "png", contentType: "image/png", matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { extension: "jpg", contentType: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { extension: "gif", contentType: "image/gif", matches: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
];

/** Sniffs the encoding from the bytes rather than trusting the filename —
 *  the stored content-type is what browsers will act on. */
function detectImageType(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer.slice(0, 16));
  return IMAGE_TYPES.find((type) => type.matches(bytes)) ?? null;
}
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

    if (url.pathname === "/api/assets" && request.method === "POST") {
      return handleAssetUpload(request, env);
    }
    if (url.pathname === "/api/assets" && request.method === "GET") {
      return handleAssetList(request, env);
    }

    if (url.pathname === "/api/turn-credentials" && request.method === "GET") {
      return handleTurnCredentials(request, env);
    }

    const assetMatch = url.pathname.match(/^\/api\/assets\/([a-f0-9-]+\.(?:glb|gltf|webp|png|jpg|gif))$/);
    if (assetMatch && request.method === "GET") {
      return handleGetAsset(request, assetMatch[1], env);
    }
    if (assetMatch && request.method === "DELETE") {
      return handleAssetDelete(request, assetMatch[1], env);
    }

    const avatarMatch = url.pathname.match(/^\/api\/avatars\/([a-f0-9-]+\.vrm)$/);
    if (avatarMatch && (request.method === "GET" || request.method === "HEAD")) {
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
  //
  // HEAD is answered from the same GET cache entry. A returning visitor's
  // browser uses it to check that their remembered upload still exists
  // before rejoining with it (src/profile/profileStore.ts), and the Cache
  // API only stores GET, so the key is always a GET request.
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const headOnly = request.method === "HEAD";
  const withoutBody = (response: Response) =>
    headOnly ? new Response(null, { status: response.status, headers: response.headers }) : response;

  const cached = await cache.match(cacheKey);
  if (cached) return withoutBody(cached);

  const { value, metadata } = await env.AVATARS.getWithMetadata<AvatarMetadata>(key, "arrayBuffer");
  if (!value) return new Response(headOnly ? null : "Not found", { status: 404 });

  const response = new Response(value, {
    headers: {
      "content-type": metadata?.contentType ?? "model/gltf-binary",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
  await cache.put(cacheKey, response.clone());
  return withoutBody(response);
}

async function handleAssetUpload(request: Request, env: Env): Promise<Response> {
  if (!isEditorAuthorized(request, env)) {
    return jsonError("Editor authorization is required to upload world assets.", 403);
  }
  // A deployment with no SEIZA_EDITOR_PASSWORD leaves this endpoint open
  // by design (editing is open by default — see worker/room.ts). "Open"
  // shouldn't also mean "unlimited 24MB writes into the deployer's KV
  // from anyone on the internet", so the same per-IP limit that guards
  // avatar uploads applies here too. A deployer who configured a password
  // and supplied it is explicitly trusted, and building out a world can
  // legitimately mean more than ten uploads in an hour — so that case
  // skips the limit rather than fighting it.
  if (!hasEditGate(env)) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (isRateLimited(ip)) {
      return jsonError("Too many uploads from this address recently — try again later.", 429);
    }
  }
  const name = (request.headers.get("x-seiza-asset-name") ?? "model.glb").slice(0, 120);
  const wantsImage = (request.headers.get("x-seiza-asset-kind") ?? "").toLowerCase() === "image";
  const limit = wantsImage ? MAX_IMAGE_BYTES : MAX_MODEL_BYTES;
  const limitLabel = wantsImage ? "3MB" : "24MB";
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > limit) return jsonError(`File is too large (max ${limitLabel}).`, 413);

  if (wantsImage) {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > limit) {
      return jsonError(`Image is empty or too large (max ${limitLabel}).`, 413);
    }
    const type = detectImageType(buffer);
    if (!type) return jsonError("Only PNG, JPEG, WebP and GIF images are accepted.", 400);
    return storeAsset(request, env, buffer, type.extension, type.contentType, name);
  }

  const extension = name.toLowerCase().endsWith(".gltf") ? "gltf" : name.toLowerCase().endsWith(".glb") ? "glb" : "";
  if (!extension) return jsonError("Only .glb and .gltf files are accepted.", 400);
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_MODEL_BYTES) return jsonError("Model is empty or too large (max 24MB).", 413);
  if (extension === "glb") {
    const header = new Uint8Array(buffer.slice(0, 4));
    if (!GLTF_MAGIC.every((byte, i) => header[i] === byte)) return jsonError("This .glb file is missing the glTF binary header.", 400);
  } else {
    try {
      const text = new TextDecoder().decode(buffer);
      const json = JSON.parse(text) as {
        asset?: { version?: unknown };
        buffers?: Array<{ uri?: unknown }>;
        images?: Array<{ uri?: unknown }>;
      };
      if (json.asset?.version !== "2.0") return jsonError("Only glTF 2.0 .gltf files are accepted.", 400);
      const externalReferences = [...(json.buffers ?? []), ...(json.images ?? [])].some(
        (entry) => typeof entry.uri === "string" && !entry.uri.startsWith("data:")
      );
      if (externalReferences) return jsonError("This .gltf references external files. Upload a self-contained .gltf or a bundled .glb.", 400);
    } catch {
      return jsonError("This .gltf file is not valid JSON.", 400);
    }
  }
  return storeAsset(
    request,
    env,
    buffer,
    extension,
    extension === "glb" ? "model/gltf-binary" : "model/gltf+json",
    name
  );
}

/**
 * Writes a validated world asset to KV and returns the URL to place it by.
 *
 * Deliberately NO expirationTtl, unlike avatars. A placed object lives in
 * the room's Durable Object storage indefinitely and references this key by
 * URL — expiring the file out from under it after 30 days would silently rot
 * a deployed world into broken objects. World assets are deployer-curated
 * content with an explicit Delete button; avatars are ephemeral per-visitor
 * uploads. Different lifecycles, so: different retention.
 */
async function storeAsset(
  request: Request,
  env: Env,
  buffer: ArrayBuffer,
  extension: string,
  contentType: string,
  name: string
): Promise<Response> {
  const key = `${crypto.randomUUID()}.${extension}`;
  await env.AVATARS.put(key, buffer, {
    metadata: { contentType, name } satisfies StoredAssetMetadata,
  });
  await caches.default.delete(new Request(new URL("/api/assets", request.url)));
  return new Response(JSON.stringify({ id: key, url: `/api/assets/${key}`, name, kind: assetKind(key) }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

/** What a stored key is, from its extension — the editor groups the asset
 *  library by this so models and pictures don't sit in one undifferentiated
 *  list. */
function assetKind(key: string): "model" | "image" | null {
  if (/\.(?:glb|gltf)$/i.test(key)) return "model";
  if (/\.(?:webp|png|jpg|gif)$/i.test(key)) return "image";
  return null;
}

async function handleAssetList(request: Request, env: Env): Promise<Response> {
  if (!isEditorAuthorized(request, env)) {
    return jsonError("Editor authorization is required to list world assets.", 403);
  }
  // Only edge-cache the listing on deployments where it isn't behind a
  // password. Cloudflare's Cache API keys on URL, not headers, so a
  // `public` cached copy of an authorized listing is the wrong thing to
  // leave lying around for shared proxies/browsers on a password-gated
  // deployment — the KV list operations saved aren't worth that.
  const cacheable = !hasEditGate(env);
  if (cacheable) {
    const cached = await caches.default.match(request);
    if (cached) return cached;
  }
  const listed = await env.AVATARS.list({ limit: 100 });
  const assets = listed.keys
    .filter((entry) => assetKind(entry.name) !== null)
    .map((entry) => ({
      id: entry.name,
      url: `/api/assets/${entry.name}`,
      name: (entry.metadata as StoredAssetMetadata | null)?.name ?? entry.name,
      kind: assetKind(entry.name),
    }));
  const response = new Response(JSON.stringify({ assets, truncated: listed.list_complete === false }), {
    headers: {
      "content-type": "application/json",
      "cache-control": cacheable ? "public, max-age=30, s-maxage=30" : "private, no-store",
    },
  });
  if (cacheable) await caches.default.put(request, response.clone());
  return response;
}

async function handleAssetDelete(request: Request, key: string, env: Env): Promise<Response> {
  if (!isEditorAuthorized(request, env)) {
    return jsonError("Editor authorization is required to delete world assets.", 403);
  }
  await env.AVATARS.delete(key);
  await caches.default.delete(new Request(new URL("/api/assets", request.url)));
  await caches.default.delete(new Request(new URL(`/api/assets/${key}`, request.url)));
  return new Response(null, { status: 204 });
}

async function handleGetAsset(request: Request, key: string, env: Env): Promise<Response> {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const { value, metadata } = await env.AVATARS.getWithMetadata<StoredAssetMetadata>(key, "arrayBuffer");
  if (!value) return new Response("Not found", { status: 404 });
  const response = new Response(value, {
    headers: {
      "content-type": metadata?.contentType ?? (key.endsWith(".glb") ? "model/gltf-binary" : "model/gltf+json"),
      // Stored bytes are sniffed on upload, but a stale metadata record
      // shouldn't let a stored file be interpreted as something else.
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
  await cache.put(request, response.clone());
  return response;
}

/**
 * A deployment with neither SEIZA_EDITOR_PASSWORD nor SEIZA_ADMIN_KEY
 * configured leaves the asset endpoints open — that's the documented
 * default (editing is open unless a deployer opts into one of the two
 * secrets; see worker/room.ts). When either IS set, an asset endpoint
 * accepts whichever one matches, compared in constant time by the same
 * helper the WebSocket path uses so the two can't drift apart. The admin
 * key is checked via its own header (x-seiza-admin-key) rather than
 * overloading x-seiza-editor-password, so a request can unambiguously
 * prove *which* secret it's presenting.
 */
function isEditorAuthorized(request: Request, env: Env): boolean {
  if (!env.SEIZA_EDITOR_PASSWORD && !env.SEIZA_ADMIN_KEY) return true;
  if (env.SEIZA_ADMIN_KEY && timingSafeEqual(request.headers.get("x-seiza-admin-key"), env.SEIZA_ADMIN_KEY)) return true;
  if (env.SEIZA_EDITOR_PASSWORD && timingSafeEqual(request.headers.get("x-seiza-editor-password"), env.SEIZA_EDITOR_PASSWORD)) {
    return true;
  }
  return false;
}

/** Whether *either* secret is configured — used only for the "should this
 *  response be treated as public/cacheable and rate-limited" questions
 *  around it, which care about "is this deployment gated at all", not
 *  about which specific secret is doing the gating. */
function hasEditGate(env: Env): boolean {
  return !!(env.SEIZA_EDITOR_PASSWORD || env.SEIZA_ADMIN_KEY);
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
