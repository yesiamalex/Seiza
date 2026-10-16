// Shrinks an uploaded VRM's textures in the browser before upload, without
// touching any VRM data.
//
// The previous version re-saved the whole file with glTF-Transform, whose
// writer drops every extension it has no class for, VRM's included. Its own
// safety check then caught the loss and fell back to the original, so for
// any real VRM it never shrank anything.
//
// This edits the file directly instead, the way scripts/fetch-assets.mjs
// shrinks the bundled presets: only the image bytes change, the binary
// chunk is laid back out with new offsets, and the JSON is otherwise left
// alone, so the humanoid rig, expressions, spring bones, and materials
// survive byte for byte. That's checked before the result is used.
//
// Most of a typical VRoid export's size is PNG textures, stored losslessly
// at up to 4096 px. Colour textures become WebP (which keeps transparency)
// at up to TEXTURE_SIZE. Textures that hold data rather than colour
// (normal maps, MToon's shading and outline masks) stay lossless PNG and
// are only resized, because lossy compression would change their values.
//
// The editor's model uploads (EditToolbar.tsx) use it too: a plain .glb has
// no VRM data, and its textures shrink the same way. It needs no library,
// only the browser's canvas.
import { readGlb, writeGlb, type GltfJson } from "./import/glbContainer";

export interface OptimizeResult {
  blob: Blob;
  originalBytes: number;
  optimizedBytes: number;
  applied: boolean;
  reason?: string;
}

/** Longest side any texture keeps: the bundled presets' size too. */
const TEXTURE_SIZE = 1024;
const WEBP_QUALITY = 0.85;
/** Only worth using if it saves at least a tenth. */
const MIN_USEFUL_SAVINGS_RATIO = 0.9;

interface Json extends GltfJson {
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  textures?: { source?: number; extensions?: Record<string, { source?: number }> }[];
  bufferViews?: { buffer?: number; byteOffset?: number; byteLength: number }[];
  buffers?: { byteLength: number; uri?: string }[];
  materials?: Record<string, unknown>[];
  extensionsRequired?: string[];
}

export async function optimizeVrmAvatar(file: File): Promise<OptimizeResult> {
  const originalBytes = file.size;
  const keep = (reason: string): OptimizeResult => ({ blob: file, originalBytes, optimizedBytes: originalBytes, applied: false, reason });
  try {
    const input = new Uint8Array(await file.arrayBuffer());
    const { json: raw, bin } = readGlb(input);
    const json = raw as Json;
    if (!bin || (json.buffers ?? []).length !== 1 || json.buffers?.[0]?.uri) {
      return keep("This file's layout isn't one the optimizer handles, so it's uploaded as is.");
    }
    const vrmBefore = vrmData(json);

    const colorImages = colorImageIndices(json);
    const replaced = new Map<number, { bytes: Uint8Array; mimeType: string }>();
    for (const [index, image] of (json.images ?? []).entries()) {
      if (image.bufferView === undefined || image.uri) continue;
      const view = json.bufferViews?.[image.bufferView];
      if (!view || (view.buffer ?? 0) !== 0) continue;
      const start = view.byteOffset ?? 0;
      const data = bin.subarray(start, start + view.byteLength);
      const result = await reencode(data, image.mimeType ?? "image/png", colorImages.has(index));
      if (result && result.bytes.byteLength < data.byteLength) replaced.set(index, result);
    }
    if (replaced.size === 0) return keep("Its textures are already small, so it's uploaded as is.");

    // Image bytes go back into their own buffer views; WebP images are
    // pointed to through EXT_texture_webp, as glTF requires.
    const viewBytes = new Map<number, Uint8Array>();
    let webp = false;
    for (const [index, result] of replaced) {
      const image = json.images![index];
      viewBytes.set(image.bufferView!, result.bytes);
      image.mimeType = result.mimeType;
      if (result.mimeType === "image/webp") {
        webp = true;
        for (const texture of json.textures ?? []) {
          if (texture.source !== index) continue;
          texture.extensions = { ...(texture.extensions ?? {}), EXT_texture_webp: { source: index } };
          delete texture.source;
        }
      }
    }
    if (webp) {
      json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), "EXT_texture_webp"])];
      json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), "EXT_texture_webp"])];
    }
    const newBin = relayBufferViews(json, bin, viewBytes);
    const output = writeGlb(json, newBin);

    // The point of doing it this way: the VRM data must come out exactly
    // as it went in. If it somehow doesn't, the original is used.
    const check = readGlb(output).json as Json;
    if (vrmData(check) !== vrmBefore) return keep("Optimizing would have changed this avatar's VRM data, so it's uploaded as is.");

    if (output.byteLength >= originalBytes * MIN_USEFUL_SAVINGS_RATIO) {
      return keep("Optimizing didn't make it meaningfully smaller, so it's uploaded as is.");
    }
    return { blob: new Blob([output], { type: "model/gltf-binary" }), originalBytes, optimizedBytes: output.byteLength, applied: true };
  } catch (err) {
    console.warn("Avatar optimization skipped (using the original file):", err);
    return keep("This file couldn't be optimized, so it's uploaded as is.");
  }
}

/** The VRM extension (0.x or 1.0) and spring bones, as text to compare. */
function vrmData(json: Json): string {
  const ext = json.extensions ?? {};
  return JSON.stringify([ext.VRM, ext.VRMC_vrm, ext.VRMC_springBone, ext.VRMC_node_constraint]);
}

/**
 * Images that hold colour, which may be compressed lossily: base colour,
 * emissive, and the VRM thumbnail, plus MToon's shade, rim, and matcap
 * colours. An image also used for data (normals, shading and outline
 * masks) isn't on the list.
 */
function colorImageIndices(json: Json): Set<number> {
  const color = new Set<number>();
  const data = new Set<number>();
  const imageOf = (textureIndex: unknown) => {
    if (typeof textureIndex !== "number") return undefined;
    const texture = json.textures?.[textureIndex];
    return texture?.source ?? texture?.extensions?.EXT_texture_webp?.source;
  };
  const mark = (set: Set<number>, textureIndex: unknown) => {
    const image = imageOf(textureIndex);
    if (image !== undefined) set.add(image);
  };
  const index = (info: unknown) => (info as { index?: number } | undefined)?.index;

  for (const material of json.materials ?? []) {
    const pbr = material.pbrMetallicRoughness as Record<string, unknown> | undefined;
    mark(color, index(pbr?.baseColorTexture));
    mark(color, index(material.emissiveTexture));
    mark(data, index(pbr?.metallicRoughnessTexture));
    mark(data, index(material.normalTexture));
    mark(data, index(material.occlusionTexture));
    // VRM 1.0's MToon.
    const mtoon = (material.extensions as Record<string, Record<string, unknown>> | undefined)?.VRMC_materials_mtoon;
    if (mtoon) {
      for (const key of ["shadeMultiplyTexture", "rimMultiplyTexture", "matcapTexture"]) mark(color, index(mtoon[key]));
      for (const key of ["shadingShiftTexture", "outlineWidthMultiplyTexture", "uvAnimationMaskTexture"]) mark(data, index(mtoon[key]));
    }
  }
  // VRM 0.x keeps its MToon textures by Unity property name.
  const vrm0 = json.extensions?.VRM as { materialProperties?: { textureProperties?: Record<string, number> }[]; meta?: { texture?: number } } | undefined;
  for (const props of vrm0?.materialProperties ?? []) {
    for (const [name, textureIndex] of Object.entries(props.textureProperties ?? {})) {
      mark(["_MainTex", "_ShadeTexture", "_EmissionMap", "_SphereAdd", "_RimTexture"].includes(name) ? color : data, textureIndex);
    }
  }
  mark(color, vrm0?.meta?.texture);
  const thumbnail = (json.extensions?.VRMC_vrm as { meta?: { thumbnailImage?: number } } | undefined)?.meta?.thumbnailImage;
  if (typeof thumbnail === "number") color.add(thumbnail);
  for (const image of data) color.delete(image);
  return color;
}

/**
 * Re-encodes one image with the browser's own encoder, or returns null to
 * leave it. Colour: WebP at up to TEXTURE_SIZE (JPEG for an opaque one if
 * the browser can't write WebP). Data: resized only, still lossless PNG.
 */
async function reencode(data: Uint8Array, mimeType: string, isColor: boolean): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!/^image\/(png|jpeg|webp)$/.test(mimeType)) return null;
  // No colour management: data textures are numbers, not colours.
  const bitmap = await createImageBitmap(new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType }), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const scale = Math.min(1, TEXTURE_SIZE / Math.max(bitmap.width, bitmap.height));
  if (!isColor && scale === 1) {
    bitmap.close();
    return null; // a data texture already small enough stays exactly as it is
  }
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob: Blob;
  if (!isColor) {
    blob = await canvas.convertToBlob({ type: "image/png" });
  } else {
    blob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
    if (blob.type !== "image/webp") {
      // This browser can't write WebP: JPEG if nothing is see-through.
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let opaque = true;
      for (let i = 3; i < pixels.length && opaque; i += 4) opaque = pixels[i] === 255;
      blob = opaque ? await canvas.convertToBlob({ type: "image/jpeg", quality: WEBP_QUALITY }) : await canvas.convertToBlob({ type: "image/png" });
    }
  }
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type };
}

/** Lays every buffer view back out in order, 4-byte aligned, with the
 *  replaced ones' new bytes, and updates offsets and the buffer length. */
function relayBufferViews(json: Json, bin: Uint8Array, replaced: Map<number, Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [];
  let offset = 0;
  for (const [index, view] of (json.bufferViews ?? []).entries()) {
    const start = view.byteOffset ?? 0;
    const data = replaced.get(index) ?? bin.subarray(start, start + view.byteLength);
    const padding = (4 - (offset % 4)) % 4;
    if (padding) parts.push(new Uint8Array(padding));
    offset += padding;
    view.byteOffset = offset;
    view.byteLength = data.byteLength;
    parts.push(data);
    offset += data.byteLength;
  }
  json.buffers![0].byteLength = offset;
  const out = new Uint8Array(offset);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}
