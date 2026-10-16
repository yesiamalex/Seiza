// Checks on what's inside an uploaded model or image, before it's stored.
// Everyone in a room downloads and renders what one person uploads, so a
// file that's fine for its uploader can still be an attack on everyone
// else:
//
// - A glTF can point its textures or buffers at any web address. Each
//   visitor's browser would then fetch it, which tells that server their IP
//   address (a tracking pixel) and can poke at their local network.
// - A small file can unpack into something enormous: a 3 MB PNG can be
//   20,000 pixels square (1.6 GB once decoded), and a mesh can have
//   millions of vertices. Either can freeze or crash every tab in the room.
//
// These read only headers and the glTF's JSON, never decode anything, so
// they cost almost nothing per upload. Pure functions, no Workers APIs, so
// they're tested directly.

export interface ModelLimits {
  /** Distinct vertices across every mesh. Parts of a mesh often share one
   *  vertex list (a VRoid avatar has over 100 parts sharing a few), so
   *  each list counts once. */
  maxVertices: number;
  /** Triangles drawn, counting every part: what rendering costs. */
  maxTriangles: number;
  /** Mesh parts, each one a draw call. */
  maxPrimitives: number;
  /** Longest side of any one texture, in pixels. */
  maxTextureSide: number;
  /** All textures' pixels together. */
  maxTexturePixels: number;
  maxImages: number;
}

/**
 * An avatar is one character among many in a room, on phones too. Real
 * ones are far below this: VRoid's samples and a detailed hand-made VRM
 * have 18k to 30k vertices, 25k to 40k triangles, up to 131 parts, and up
 * to 35 textures; an Avaturn export 31k vertices in 5 parts.
 */
export const AVATAR_LIMITS: ModelLimits = {
  maxVertices: 300_000,
  maxTriangles: 500_000,
  maxPrimitives: 512,
  maxTextureSide: 4096,
  maxTexturePixels: 64 * 1024 * 1024,
  maxImages: 64,
};
/** A placed model or a whole environment can be bigger, but not unbounded. */
export const MODEL_LIMITS: ModelLimits = {
  maxVertices: 2_000_000,
  maxTriangles: 3_000_000,
  maxPrimitives: 4096,
  maxTextureSide: 8192,
  maxTexturePixels: 160 * 1024 * 1024,
  maxImages: 128,
};
/** Pictures placed in the world; the editor already shrinks them to 2048. */
export const MAX_IMAGE_SIDE = 4096;

type Result = { ok: true } | { ok: false; reason: string };

interface GltfJson {
  accessors?: { count?: unknown }[];
  meshes?: { primitives?: { attributes?: Record<string, unknown>; indices?: unknown }[] }[];
  buffers?: { uri?: unknown }[];
  bufferViews?: { buffer?: unknown; byteOffset?: unknown; byteLength?: unknown }[];
  images?: { uri?: unknown; bufferView?: unknown; mimeType?: unknown }[];
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** Checks a binary glTF (.glb or .vrm). */
export function checkGlb(buffer: ArrayBuffer, limits: ModelLimits): Result {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) return fail("This isn't a binary glTF file.");
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > buffer.byteLength) return fail("This file is cut short or damaged.");
    if (type === CHUNK_JSON && !json) {
      try {
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length))) as GltfJson;
      } catch {
        return fail("This file's model description isn't valid.");
      }
    } else if (type === CHUNK_BIN && !bin) {
      bin = new Uint8Array(buffer, start, length);
    }
    offset = start + length;
  }
  if (!json || typeof json !== "object") return fail("This file has no model description inside.");
  return checkGltfJson(json, bin, limits);
}

/** Checks a glTF's JSON, with the GLB's binary chunk when there is one. */
export function checkGltfJson(json: GltfJson, bin: Uint8Array | null, limits: ModelLimits): Result {
  // 1. Nothing may be fetched from anywhere else.
  for (const entry of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (entry && typeof entry.uri === "string" && !entry.uri.startsWith("data:")) {
      return fail("This model loads files from elsewhere. Upload a self-contained .glb (or a .gltf with everything embedded).");
    }
  }

  // 2. Geometry: distinct vertices, triangles drawn, and parts.
  const countOf = (index: unknown) => {
    const count = typeof index === "number" ? json.accessors?.[index]?.count : undefined;
    return typeof count === "number" && Number.isFinite(count) && count > 0 ? count : 0;
  };
  const vertexLists = new Set<unknown>();
  let triangles = 0;
  let primitives = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh?.primitives ?? []) {
      primitives++;
      const position = primitive?.attributes?.POSITION;
      vertexLists.add(position);
      triangles += (primitive?.indices !== undefined ? countOf(primitive.indices) : countOf(position)) / 3;
    }
  }
  let vertices = 0;
  for (const list of vertexLists) vertices += countOf(list);
  const n = (value: number) => Math.round(value).toLocaleString("en");
  if (vertices > limits.maxVertices) return fail(`This model has ${n(vertices)} vertices, over the ${n(limits.maxVertices)} limit.`);
  if (triangles > limits.maxTriangles) return fail(`This model has ${n(triangles)} triangles, over the ${n(limits.maxTriangles)} limit.`);
  if (primitives > limits.maxPrimitives) return fail(`This model has ${n(primitives)} mesh parts, over the ${n(limits.maxPrimitives)} limit.`);

  // 3. Texture sizes, read from each image's header.
  const images = json.images ?? [];
  if (images.length > limits.maxImages) return fail(`This model has ${images.length} textures, over the ${limits.maxImages} limit.`);
  let pixels = 0;
  for (const image of images) {
    const bytes = imageBytes(image, json, bin);
    if (!bytes) continue;
    if (!isKnownImage(bytes)) return fail("One of this model's textures isn't a PNG, JPEG, WebP, or GIF image.");
    // A known format whose size can't be read (an unusual JPEG) is let
    // through: it can't be shown to be too big.
    const size = imageSize(bytes);
    if (!size) continue;
    const [w, h] = size;
    if (Math.max(w, h) > limits.maxTextureSide) return fail(`A texture is ${w}×${h} pixels, over the ${limits.maxTextureSide} limit.`);
    pixels += w * h;
  }
  if (pixels > limits.maxTexturePixels) return fail("This model's textures are too large in total. Shrink them and try again.");
  return { ok: true };
}

/** The first bytes of an image, from its buffer view or its data: URI. */
function imageBytes(image: NonNullable<GltfJson["images"]>[number], json: GltfJson, bin: Uint8Array | null): Uint8Array | null {
  if (typeof image?.bufferView === "number") {
    const view = json.bufferViews?.[image.bufferView];
    if (!view || !bin || (view.buffer ?? 0) !== 0) return null;
    const start = typeof view.byteOffset === "number" ? view.byteOffset : 0;
    const length = typeof view.byteLength === "number" ? view.byteLength : 0;
    if (start < 0 || start + length > bin.byteLength) return null;
    return bin.subarray(start, start + length);
  }
  if (typeof image?.uri === "string" && image.uri.startsWith("data:")) {
    const comma = image.uri.indexOf(",");
    if (comma < 0 || !image.uri.slice(0, comma).includes(";base64")) return null;
    // The first 48 KB of the image holds any header below, and decoding
    // only that keeps the check far inside the free plan's 10 ms of CPU
    // per request. (A JPEG whose size sits past it is let through, as
    // above.) The length is a multiple of 4, so the cut base64 decodes.
    try {
      const raw = atob(image.uri.slice(comma + 1, comma + 1 + 65_536));
      return Uint8Array.from(raw, (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  }
  return null;
}

function isKnownImage(b: Uint8Array): boolean {
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpeg = b[0] === 0xff && b[1] === 0xd8;
  const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45;
  return png || jpeg || gif || webp;
}

/** Width and height from a PNG, JPEG, WebP, or GIF header, or null. */
export function imageSize(b: Uint8Array): [number, number] | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // PNG: IHDR is always first.
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return [view.getUint32(16), view.getUint32(20)];
  }
  // GIF: logical screen size.
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return [view.getUint16(6, true), view.getUint16(8, true)];
  }
  // WebP: lossy (VP8), lossless (VP8L), or extended (VP8X).
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === "VP8 ") return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
    if (chunk === "VP8X") {
      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return [w, h];
    }
    return null;
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      const length = view.getUint16(i + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return [view.getUint16(i + 7), view.getUint16(i + 5)];
      i += 2 + length;
    }
    return null;
  }
  return null;
}

function fail(reason: string): Result {
  return { ok: false, reason };
}
