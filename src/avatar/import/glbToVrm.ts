// Turns a plain rigged .glb avatar (an Avaturn export, or anything with
// Mixamo-style bone names) into an optimized VRM 1.0 file, in the browser,
// before upload. Everything after that (validation, upload, animation,
// first person) is Seiza's ordinary VRM path, unchanged.
//
// The order matters. glTF-Transform drops extensions it has no class for,
// and VRM's is one of them (see optimizeVrm.ts), so the optimizing happens
// first, on the plain glTF, and the VRM description is written into the
// finished file's JSON afterwards, without going back through it.
import type { Document, Node } from "@gltf-transform/core";
import { REQUIRED_VRM_BONES, vrmBoneFor } from "./humanoidBones";

export class AvatarImportError extends Error {
  // Kept by name, so the UI can tell these apart after a dynamic import.
  override name = "AvatarImportError";
}

export interface GlbToVrmResult {
  blob: Blob;
  originalBytes: number;
  vrmBytes: number;
  /** How many VRM humanoid bones were mapped. */
  bones: number;
  /** Things that work but are worth telling the uploader. */
  notes: string[];
}

export interface GlbToVrmOptions {
  /** The avatar's name in its VRM metadata. */
  name: string;
  /** Shrink and re-encode the textures. Needs a browser (canvas); tests
   *  run without it. Default true. */
  compressTextures?: boolean;
}

/** Colour textures keep up to this size; they're what people see. */
const COLOR_TEXTURE_SIZE = 1024;
/** Bump, roughness, and shading maps on an avatar seen across a room. */
const DETAIL_TEXTURE_SIZE = 512;

export async function convertGlbToVrm(file: Blob, options: GlbToVrmOptions): Promise<GlbToVrmResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const { json } = readGlb(input);
  if (json.extensions?.VRMC_vrm || json.extensions?.VRM) {
    throw new AvatarImportError("This file is already a VRM. Rename it to .vrm and upload it as is.");
  }

  const [{ WebIO }, { prune, dedup }] = await Promise.all([import("@gltf-transform/core"), import("@gltf-transform/functions")]);
  const io = new WebIO();
  const document = await io.readBinary(input);
  const notes: string[] = [];

  const bones = mapSkeleton(document);
  const missing = REQUIRED_VRM_BONES.filter((bone) => !bones.has(bone));
  if (missing.length > 0) {
    throw new AvatarImportError(
      `This .glb has no humanoid skeleton Seiza recognizes (missing: ${missing.join(", ")}). It needs Mixamo-style bone names, as Avaturn and Mixamo exports have.`
    );
  }
  standUp(document, bones, notes);

  // Seiza brings its own motions, so a clip baked into the file is only weight.
  for (const animation of document.getRoot().listAnimations()) animation.dispose();
  simplifySkinWeights(document);
  await document.transform(prune(), dedup());
  if (options.compressTextures !== false) await shrinkTextures(document);

  const optimized = await io.writeBinary(document);
  const output = addVrmExtension(optimized, bones, options.name);
  return {
    blob: new Blob([output], { type: "model/gltf-binary" }),
    originalBytes: input.byteLength,
    vrmBytes: output.byteLength,
    bones: bones.size,
    notes,
  };
}

// --- the skeleton --------------------------------------------------------------------------

/** VRM bone name → the node's name, from the largest skin in the file. */
function mapSkeleton(document: Document): Map<string, Node> {
  const skins = document.getRoot().listSkins();
  const skin = skins.reduce((best, s) => (!best || s.listJoints().length > best.listJoints().length ? s : best), skins[0]);
  const bones = new Map<string, Node>();
  for (const joint of skin?.listJoints() ?? []) {
    const bone = vrmBoneFor(joint.getName());
    if (bone && !bones.has(bone)) bones.set(bone, joint);
  }
  return bones;
}

/**
 * VRM 1.0 avatars face +Z, stand in metres, and rest in a T-pose. Avaturn's
 * already do. Others are turned and scaled under a new root node (which
 * leaves the skin's own data alone), and an A-pose is reported, since
 * animations made for a T-pose hold its arms lower than meant.
 */
function standUp(document: Document, bones: Map<string, Node>, notes: string[]) {
  const at = (bone: string) => bones.get(bone)!.getWorldTranslation();
  const [lx] = at("leftHand"), [rx] = at("rightHand");
  const headY = at("head")[1] - Math.min(at("leftFoot")[1], at("rightFoot")[1]);
  const backwards = lx < rx;
  const scale = headY > 20 ? 0.01 : 1; // centimetres
  if (backwards || scale !== 1) {
    const scene = document.getRoot().listScenes()[0];
    const root = document.createNode("VRMRoot");
    if (backwards) root.setRotation([0, 1, 0, 0]);
    if (scale !== 1) root.setScale([scale, scale, scale]);
    for (const child of scene.listChildren()) {
      scene.removeChild(child);
      root.addChild(child);
    }
    scene.addChild(root);
  }
  const shoulder = at("leftUpperArm"), hand = at("leftHand");
  const reach = Math.hypot(hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]);
  if (reach > 0 && Math.abs(hand[1] - shoulder[1]) > reach * 0.35) {
    notes.push("This avatar rests with its arms down rather than out to the sides, so some gestures may hold its arms a little low.");
  }
}

/**
 * three.js skins with four bones per vertex, so a second set of weights is
 * downloaded and never used. This keeps each vertex's four strongest of
 * all its weights, renormalizes them, and stores them as bytes instead of
 * floats (plain glTF, no extension needed).
 */
function simplifySkinWeights(document: Document) {
  const buffer = document.getRoot().listBuffers()[0];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const joints0 = prim.getAttribute("JOINTS_0"), weights0 = prim.getAttribute("WEIGHTS_0");
      if (!joints0 || !weights0) continue;
      const joints1 = prim.getAttribute("JOINTS_1"), weights1 = prim.getAttribute("WEIGHTS_1");
      const count = joints0.getCount();
      let maxJoint = 0;
      const outJoints: number[] = new Array(count * 4);
      const outWeights = new Uint8Array(count * 4);
      const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
      for (let i = 0; i < count; i++) {
        const influences: [number, number][] = [];
        joints0.getElement(i, j);
        weights0.getElement(i, w);
        for (let k = 0; k < 4; k++) influences.push([j[k], w[k]]);
        if (joints1 && weights1) {
          joints1.getElement(i, j);
          weights1.getElement(i, w);
          for (let k = 0; k < 4; k++) influences.push([j[k], w[k]]);
        }
        influences.sort((a, b) => b[1] - a[1]);
        const top = influences.slice(0, 4);
        const total = top.reduce((sum, [, weight]) => sum + weight, 0) || 1;
        // Round to bytes that still add up to exactly 255.
        let remaining = 255;
        top.forEach(([joint, weight], k) => {
          const byte = k === 3 ? remaining : Math.min(remaining, Math.round((weight / total) * 255));
          remaining -= byte;
          outJoints[i * 4 + k] = byte > 0 ? joint : 0;
          outWeights[i * 4 + k] = byte;
          maxJoint = Math.max(maxJoint, joint);
        });
      }
      const jointArray = maxJoint > 255 ? Uint16Array.from(outJoints) : Uint8Array.from(outJoints);
      prim.setAttribute("JOINTS_0", document.createAccessor().setType("VEC4").setArray(jointArray).setBuffer(buffer));
      prim.setAttribute("WEIGHTS_0", document.createAccessor().setType("VEC4").setArray(outWeights).setNormalized(true).setBuffer(buffer));
      if (joints1) prim.setAttribute("JOINTS_1", null);
      if (weights1) prim.setAttribute("WEIGHTS_1", null);
    }
  }
}

// --- textures --------------------------------------------------------------------------------

/**
 * Re-encodes each texture with the browser's own image encoder, smaller:
 * colour textures to at most COLOR_TEXTURE_SIZE, the rest to
 * DETAIL_TEXTURE_SIZE. Opaque ones become JPEG, which every browser writes
 * and every loader reads; ones with transparency (hair) become WebP where
 * the browser can write it, and otherwise stay PNG. A texture is only
 * replaced when the result is actually smaller.
 *
 * Not glTF-Transform's textureCompress: without its native encoder (Node
 * only), its browser fallback wrote files larger than Avaturn's JPEGs.
 */
async function shrinkTextures(document: Document) {
  const [{ listTextureSlots }, { EXTTextureWebP }] = await Promise.all([import("@gltf-transform/functions"), import("@gltf-transform/extensions")]);
  let webpUsed = false;
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    const mime = texture.getMimeType();
    if (!image || !/^image\/(png|jpeg|webp)$/.test(mime)) continue;
    const color = listTextureSlots(texture).some((slot) => /baseColor|emissive/.test(slot));
    const max = color ? COLOR_TEXTURE_SIZE : DETAIL_TEXTURE_SIZE;
    // No colour management: normal and roughness maps are data, not colour.
    const bitmap = await createImageBitmap(new Blob([image as Uint8Array<ArrayBuffer>], { type: mime }), {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
    });
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const transparent = mime !== "image/jpeg" && hasTransparency(ctx.getImageData(0, 0, width, height).data);
    let blob: Blob;
    if (!transparent) {
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    } else {
      blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
      // A browser that can't write WebP hands back a PNG instead.
      if (blob.type !== "image/webp") blob = await canvas.convertToBlob({ type: "image/png" });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength >= image.byteLength) continue;
    if (blob.type === "image/webp") webpUsed = true;
    texture.setImage(bytes).setMimeType(blob.type);
  }
  if (webpUsed) document.createExtension(EXTTextureWebP).setRequired(true);
}

function hasTransparency(pixels: Uint8ClampedArray): boolean {
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) return true;
  return false;
}

// --- the VRM description -------------------------------------------------------------------

interface GltfJson {
  nodes?: { name?: string; mesh?: number }[];
  skins?: { joints: number[] }[];
  extensionsUsed?: string[];
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Writes VRMC_vrm into a finished GLB's JSON: who it is, which node is
 *  which bone, and how first person should treat its meshes. */
export function addVrmExtension(glb: Uint8Array, bones: Map<string, Node>, name: string): Uint8Array<ArrayBuffer> {
  const { json, bin } = readGlb(glb);
  const nodes = json.nodes ?? [];
  // Node indices change in optimizing, so they're found again by name,
  // among the skin's own joints first in case a name repeats elsewhere.
  const jointIndices = new Set((json.skins ?? []).flatMap((s) => s.joints));
  const indexOf = (nodeName: string) => {
    let fallback = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].name !== nodeName) continue;
      if (jointIndices.has(i)) return i;
      if (fallback < 0) fallback = i;
    }
    return fallback;
  };
  const humanBones: Record<string, { node: number }> = {};
  for (const [bone, node] of bones) {
    const index = indexOf(node.getName());
    if (index >= 0) humanBones[bone] = { node: index };
  }
  json.extensions = {
    ...(json.extensions ?? {}),
    VRMC_vrm: {
      specVersion: "1.0",
      meta: {
        name,
        version: "1",
        authors: ["Uploaded to Seiza"],
        licenseUrl: "https://vrm.dev/licenses/1.0/",
        // The most careful settings: this is someone's own likeness.
        avatarPermission: "onlyAuthor",
        allowExcessivelyViolentUsage: false,
        allowExcessivelySexualUsage: false,
        commercialUsage: "personalNonProfit",
        allowPoliticalOrReligiousUsage: false,
        allowAntisocialOrHateUsage: false,
        creditNotation: "required",
        allowRedistribution: false,
        modification: "prohibited",
      },
      humanoid: { humanBones },
      firstPerson: {
        meshAnnotations: nodes.flatMap((node, i) => (node.mesh !== undefined ? [{ node: i, type: "auto" }] : [])),
      },
    },
  };
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), "VRMC_vrm"])];
  return writeGlb(json, bin);
}

// --- GLB containers ------------------------------------------------------------------------

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
