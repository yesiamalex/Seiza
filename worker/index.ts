// Cloudflare Worker `main` script. Handles the avatar-upload API and
// falls through to the static SPA build (via the `ASSETS` binding) for
// everything else. This is separate from the realtime room server
// (party/room.ts, deployed via PartyKit) — see wrangler.jsonc for why
// the deploy is still two pieces rather than one.
//
// Not covered by `npm run typecheck` (root tsconfig only includes
// `src/`, same as party/) — see worker/tsconfig.json for editor support
// via @cloudflare/workers-types, and sanity-check R2/Fetcher API shapes
// against current Cloudflare docs before relying on this in production.

export interface Env {
  ASSETS: Fetcher;
  AVATARS: R2Bucket;
}

const MAX_AVATAR_BYTES = 25 * 1024 * 1024;
// .vrm files are glTF-binary (.glb) under the hood — this is the .glb
// magic header, not a VRM-specific signature. Good enough to reject
// obviously-wrong uploads without a full glTF/VRM validator.
const GLTF_MAGIC = [0x67, 0x6c, 0x54, 0x46]; // ASCII "glTF"

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

    if (url.pathname === "/api/avatars" && request.method === "POST") {
      return handleUpload(request, env);
    }

    const avatarMatch = url.pathname.match(/^\/api\/avatars\/([a-f0-9-]+\.vrm)$/);
    if (avatarMatch && request.method === "GET") {
      return handleGetAvatar(avatarMatch[1], env);
    }

    return env.ASSETS.fetch(request);
  },
};

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
  await env.AVATARS.put(key, buffer, { httpMetadata: { contentType: "model/gltf-binary" } });

  return new Response(JSON.stringify({ url: `/api/avatars/${key}` }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

async function handleGetAvatar(key: string, env: Env): Promise<Response> {
  const object = await env.AVATARS.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "model/gltf-binary",
      // Keys are random UUIDs, one file per key, never overwritten —
      // safe to cache aggressively.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
