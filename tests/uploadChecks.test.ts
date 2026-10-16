import { describe, expect, it } from "vitest";
import { AVATAR_LIMITS, checkGlb, checkGltfJson, imageSize, MODEL_LIMITS } from "../worker/uploadChecks";
import { writeGlb } from "../src/avatar/import/glbToVrm";

/** Just enough of each format's header for imageSize. */
function png(w: number, h: number) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
function jpeg(w: number, h: number) {
  // SOI, an APP0 segment to skip, then a baseline start-of-frame.
  const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 0, 0, 0]);
  new DataView(b.buffer).setUint16(13, h);
  new DataView(b.buffer).setUint16(15, w);
  return b;
}
function webpLossless(w: number, h: number) {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0, 0, 0, 0, 0x2f]);
  new DataView(b.buffer).setUint32(21, (w - 1) | ((h - 1) << 14), true);
  return b;
}

describe("image sizes from headers", () => {
  it("reads PNG, JPEG, and WebP dimensions without decoding", () => {
    expect(imageSize(png(640, 480))).toEqual([640, 480]);
    expect(imageSize(jpeg(1920, 1080))).toEqual([1920, 1080]);
    expect(imageSize(webpLossless(300, 200))).toEqual([300, 200]);
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe("what's inside an uploaded model", () => {
  const glb = (json: object, bin: Uint8Array | null = null) => writeGlb(json as never, bin).buffer as ArrayBuffer;

  it("refuses textures or buffers loaded from another address", () => {
    const result = checkGlb(glb({ asset: { version: "2.0" }, images: [{ uri: "https://tracker.example/pixel.png" }] }), AVATAR_LIMITS);
    expect(result.ok).toBe(false);
    expect(checkGltfJson({ buffers: [{ uri: "http://192.168.1.1/x.bin" }] }, null, MODEL_LIMITS).ok).toBe(false);
  });

  it("refuses a mesh with too many vertices", () => {
    const json = { asset: { version: "2.0" }, accessors: [{ count: 5_000_000 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
    expect(checkGlb(glb(json), AVATAR_LIMITS).ok).toBe(false);
  });

  it("counts a vertex list shared by many parts once, as VRoid avatars do", () => {
    // 130 parts sharing one 20k-vertex list, like a VRoid sample.
    const json = {
      asset: { version: "2.0" },
      accessors: [{ count: 20_000 }, { count: 600 }],
      meshes: [{ primitives: Array.from({ length: 130 }, () => ({ attributes: { POSITION: 0 }, indices: 1 })) }],
    };
    expect(checkGlb(glb(json), AVATAR_LIMITS)).toEqual({ ok: true });
  });

  it("refuses a model that draws too many triangles or parts", () => {
    const triangles = { asset: { version: "2.0" }, accessors: [{ count: 1000 }, { count: 3_000_000 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }] };
    expect(checkGlb(glb(triangles), AVATAR_LIMITS).ok).toBe(false);
    const parts = { asset: { version: "2.0" }, accessors: [{ count: 3 }], meshes: [{ primitives: Array.from({ length: 600 }, () => ({ attributes: { POSITION: 0 } })) }] };
    expect(checkGlb(glb(parts), AVATAR_LIMITS).ok).toBe(false);
  });

  it("refuses an embedded texture that unpacks to a huge picture", () => {
    const image = png(16_000, 16_000);
    const json = {
      asset: { version: "2.0" },
      buffers: [{ byteLength: image.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: image.byteLength }],
      images: [{ bufferView: 0, mimeType: "image/png" }],
    };
    const bin = new Uint8Array(Math.ceil(image.byteLength / 4) * 4);
    bin.set(image);
    const result = checkGlb(glb(json, bin), AVATAR_LIMITS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/16000×16000/);
  });

  it("accepts an ordinary self-contained model", () => {
    const image = png(1024, 1024);
    const json = {
      asset: { version: "2.0" },
      accessors: [{ count: 30_000 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ byteLength: 36 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: image.byteLength }],
      images: [{ bufferView: 0, mimeType: "image/png" }],
    };
    const bin = new Uint8Array(36);
    bin.set(image);
    expect(checkGlb(glb(json, bin), AVATAR_LIMITS)).toEqual({ ok: true });
  });

  it("refuses something that isn't a binary glTF at all", () => {
    expect(checkGlb(new TextEncoder().encode("<html>hello</html>").buffer as ArrayBuffer, AVATAR_LIMITS).ok).toBe(false);
  });
});
