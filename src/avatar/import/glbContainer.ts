// A GLB file's two parts, its JSON description and its binary chunk, read
// and written directly. Used to change a model without glTF-Transform's
// writer, which drops extensions it has no class for (VRM's among them).

export class AvatarImportError extends Error {
  // Kept by name, so the UI can tell these apart after a dynamic import.
  override name = "AvatarImportError";
}

/** A glTF's JSON description, loosely typed: only what callers touch. */
export interface GltfJson {
  nodes?: { name?: string; mesh?: number }[];
  skins?: { joints: number[] }[];
  extensionsUsed?: string[];
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function readGlb(bytes: Uint8Array): { json: GltfJson; bin: Uint8Array | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new AvatarImportError("That isn't a .glb file. Export the avatar as GLB (binary glTF).");
  }
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(data)) as GltfJson;
    else if (type === CHUNK_BIN) bin = data;
    offset += 8 + length;
  }
  if (!json) throw new AvatarImportError("That .glb has no model description inside. It may be damaged; export it again.");
  return { json, bin };
}

export function writeGlb(json: GltfJson, bin: Uint8Array | null): Uint8Array<ArrayBuffer> {
  const pad = (n: number) => (4 - (n % 4)) % 4;
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  // The JSON chunk is padded with spaces, the binary one with zeros.
  const jsonPadded = new Uint8Array(jsonBytes.byteLength + pad(jsonBytes.byteLength)).fill(0x20);
  jsonPadded.set(jsonBytes);
  jsonBytes = jsonPadded;
  const binLength = bin ? bin.byteLength + pad(bin.byteLength) : 0;
  const total = 12 + 8 + jsonBytes.byteLength + (bin ? 8 + binLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  if (bin) {
    const at = 20 + jsonBytes.byteLength;
    view.setUint32(at, binLength, true);
    view.setUint32(at + 4, CHUNK_BIN, true);
    out.set(bin, at + 8);
  }
  return out;
}
