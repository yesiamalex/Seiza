#!/usr/bin/env node
// Downloads third-party assets at build/setup time instead of committing
// them (see THIRD_PARTY_ASSETS.md for the rule and each asset's license).
// Runs as the first step of `npm run build`, and on its own via
// `npm run fetch-assets`.
//
// Never fails the build: an asset that can't be fetched is reported and
// skipped, and the rest of the app works without it.
//
// Avatars are shrunk on the way in (shrinkGlbTextures below). VRoid's
// sample models embed 2048px textures and weigh 15-19 MB each, which every
// viewer downloads whenever someone in the room wears one. Capping the
// textures at 1024px cuts that to a fraction without touching anything
// else in the file.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * VRoid Studio sample models released by pixiv under CC0, mirrored on
 * GitHub with direct .vrm links (madjin/vrm-samples). Only models on the
 * CC0 list are included; AvatarSample_A/B/C carry their own conditions of
 * use and are deliberately left out. Each one is listed in
 * THIRD_PARTY_ASSETS.md.
 *
 * @type {{ url: string; destination: string; shrinkTextures?: number }[]}
 */
const MIRROR = "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta";
const ASSETS = [
  { url: `${MIRROR}/Sakurada_Fumiriya.vrm`, destination: "public/avatars/vroid/sakurada-fumiriya.vrm", shrinkTextures: 1024 },
  { url: `${MIRROR}/Sendagaya_Shino.vrm`, destination: "public/avatars/vroid/sendagaya-shino.vrm", shrinkTextures: 1024 },
  { url: `${MIRROR}/HairSample_Female.vrm`, destination: "public/avatars/vroid/sample-female.vrm", shrinkTextures: 1024 },
  { url: `${MIRROR}/HairSample_Male.vrm`, destination: "public/avatars/vroid/sample-male.vrm", shrinkTextures: 1024 },
];

/** Present and complete: a GLB declares its own total length in its
 *  header, so a download cut off half-way is caught and fetched again. */
const exists = async (path) => {
  try {
    const { size } = await stat(path);
    if (size < 12) return false;
    if (!/\.(vrm|glb)$/i.test(path)) return true;
    const header = new DataView((await readFile(path)).buffer);
    return header.getUint32(0, true) === 0x46546c67 && header.getUint32(8, true) === size;
  } catch {
    return false;
  }
};

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

let failures = 0;
for (const asset of ASSETS) {
  const destination = join(ROOT, asset.destination);
  if (await exists(destination)) {
    console.log(`✓ ${asset.destination} (already present)`);
    continue;
  }
  try {
    console.log(`↓ ${asset.url}`);
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let bytes = new Uint8Array(await response.arrayBuffer());
    const original = bytes.length;
    if (asset.shrinkTextures) bytes = await shrinkGlbTextures(bytes, asset.shrinkTextures);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    console.log(`✓ ${asset.destination}  ${mb(original)} → ${mb(bytes.length)}`);
  } catch (error) {
    failures += 1;
    console.warn(`! Skipped ${asset.url}: ${error instanceof Error ? error.message : error}`);
  }
}
if (failures) console.warn(`${failures} asset(s) skipped; the app runs without them.`);

/**
 * Downscales the images embedded in a GLB/VRM and repacks its binary chunk.
 *
 * Deliberately not done with glTF-Transform: its reader drops extensions
 * it has no class for, which includes VRM itself (see src/avatar/
 * optimizeVrm.ts). This edits the container directly instead. It replaces
 * only the image bytes, then lays every buffer view back out in order with
 * updated offsets. The JSON is otherwise untouched, so the VRM humanoid,
 * expressions, spring bones and materials all survive byte-for-byte.
 */
async function shrinkGlbTextures(glb, maxSize) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn("  sharp unavailable; keeping textures at full size.");
    return glb;
  }

  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB file");
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const binLength = view.getUint32(20 + jsonLength, true);
  const bin = glb.subarray(binStart, binStart + binLength);
  if ((json.buffers ?? []).length !== 1) return glb; // only the common single-buffer layout

  // New bytes for each image's buffer view.
  const replaced = new Map();
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined) continue;
    const bufferView = json.bufferViews[image.bufferView];
    const data = bin.subarray(bufferView.byteOffset ?? 0, (bufferView.byteOffset ?? 0) + bufferView.byteLength);
    const input = sharp(Buffer.from(data));
    const meta = await input.metadata();
    if (!meta.width || !meta.height || Math.max(meta.width, meta.height) <= maxSize) continue;
    const resized = input.resize({ width: maxSize, height: maxSize, fit: "inside" });
    const output =
      image.mimeType === "image/jpeg"
        ? await resized.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
        : await resized.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    if (output.length < data.length) replaced.set(image.bufferView, new Uint8Array(output));
  }
  if (replaced.size === 0) return glb;

  // Lay every buffer view back out, 4-byte aligned, in index order.
  const parts = [];
  let offset = 0;
  json.bufferViews.forEach((bufferView, index) => {
    const data =
      replaced.get(index) ??
      bin.subarray(bufferView.byteOffset ?? 0, (bufferView.byteOffset ?? 0) + bufferView.byteLength);
    const padding = (4 - (offset % 4)) % 4;
    if (padding) parts.push(new Uint8Array(padding));
    offset += padding;
    bufferView.byteOffset = offset;
    bufferView.byteLength = data.length;
    parts.push(data);
    offset += data.length;
  });
  const binPadding = (4 - (offset % 4)) % 4;
  if (binPadding) parts.push(new Uint8Array(binPadding));
  const newBinLength = offset + binPadding;
  json.buffers[0].byteLength = offset;

  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPadding) {
    const padded = new Uint8Array(jsonBytes.length + jsonPadding).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }

  const total = 12 + 8 + jsonBytes.length + 8 + newBinLength;
  const out = new Uint8Array(total);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46546c67, true); // "glTF"
  outView.setUint32(4, 2, true);
  outView.setUint32(8, total, true);
  outView.setUint32(12, jsonBytes.length, true);
  outView.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  const binHeader = 20 + jsonBytes.length;
  outView.setUint32(binHeader, newBinLength, true);
  outView.setUint32(binHeader + 4, 0x004e4942, true); // "BIN\0"
  let cursor = binHeader + 8;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}
