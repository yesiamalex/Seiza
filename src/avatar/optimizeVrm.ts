// Optional avatar-file optimization using glTF-Transform (donmccurdy/
// glTF-Transform — https://github.com/donmccurdy/glTF-Transform), run
// entirely client-side before upload.
//
// CONFIRMED BUG (found via a real upload, not theorized): glTF-Transform's
// WebIO drops *any* extension it doesn't have a registered `Extension`
// class for — logging "Some extensions were not registered for I/O, and
// will not be written" — and there's no dedicated VRM extension package
// for it (checked). That includes the VRM extension itself, so a naive
// read→textureCompress→write round trip silently strips all VRM data
// (humanoid rig, blend shapes, everything) from the output, even though
// the transform itself only touches textures. Confirmed by reproducing
// it: an uploaded avatar came back "loaded but contained no VRM data."
//
// The one community package claiming to preserve unknown extensions
// (glTF-Transform-Generic-Ext) is a single-commit, ~2-star, unmaintained
// repo — not something to trust for silently mutating someone's avatar
// before upload. So instead of trusting glTF-Transform's round trip (or
// disabling this outright and losing the safety net if the library
// situation ever changes), this independently re-parses `extensionsUsed`
// from the raw GLB bytes on both sides of the transform — without going
// through glTF-Transform's own bookkeeping — and only accepts the
// optimized result if nothing was actually dropped. Today, for any real
// VRM file, that check will correctly reject the optimized output and
// fall back to the original (matching "don't force it if it doesn't
// safely apply"); if glTF-Transform ever adds VRM extension support, or
// this project registers a verified one, the check just starts passing.
//
// Dynamically imported (see JoinScreen.tsx) so the ~1-2MB of optimizer
// code + WASM/codec deps isn't part of the app's initial bundle — most
// sessions (joining, not uploading a fresh avatar) never need it.

export interface OptimizeResult {
  blob: Blob;
  originalBytes: number;
  optimizedBytes: number;
  applied: boolean;
  reason?: string;
}

const MAX_TEXTURE_DIMENSION = 1024;
const MIN_USEFUL_SAVINGS_RATIO = 0.9; // only "apply" if it actually shrank meaningfully

export async function optimizeVrmAvatar(file: File): Promise<OptimizeResult> {
  const originalBytes = file.size;

  try {
    const [{ WebIO }, { textureCompress }] = await Promise.all([
      import("@gltf-transform/core"),
      import("@gltf-transform/functions"),
    ]);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const inputExtensions = readExtensionsUsed(bytes);

    const io = new WebIO();
    const document = await io.readBinary(bytes);

    await document.transform(
      textureCompress({
        resize: [MAX_TEXTURE_DIMENSION, MAX_TEXTURE_DIMENSION],
        targetFormat: "webp",
      })
    );

    const optimized = await io.writeBinary(document);
    const optimizedBytes = optimized.byteLength;
    const outputExtensions = readExtensionsUsed(optimized);

    const dropped = inputExtensions.filter((ext) => !outputExtensions.includes(ext));
    if (dropped.length > 0) {
      return {
        blob: file,
        originalBytes,
        optimizedBytes: originalBytes,
        applied: false,
        reason: `Optimization would drop data this avatar needs (${dropped.join(", ")}) — using the original file.`,
      };
    }

    if (optimizedBytes >= originalBytes * MIN_USEFUL_SAVINGS_RATIO) {
      return {
        blob: file,
        originalBytes,
        optimizedBytes: originalBytes,
        applied: false,
        reason: "Optimization didn't meaningfully reduce file size — using the original file.",
      };
    }

    return {
      blob: new Blob([optimized], { type: "model/gltf-binary" }),
      originalBytes,
      optimizedBytes,
      applied: true,
    };
  } catch (err) {
    console.warn("Avatar optimization skipped (falling back to the original file):", err);
    return {
      blob: file,
      originalBytes,
      optimizedBytes: originalBytes,
      applied: false,
      reason: "Optimization isn't available for this file — using the original file.",
    };
  }
}

/**
 * Reads `extensionsUsed` straight out of the raw glTF JSON — deliberately
 * not via glTF-Transform's own Document/JSONDocument, so this check is
 * independent of (and can catch bugs in) glTF-Transform's own claims
 * about what it preserved.
 */
function readExtensionsUsed(bytes: Uint8Array): string[] {
  try {
    const isGlb = bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46; // ASCII "glTF"
    let jsonText: string;
    if (isGlb) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const chunkLength = view.getUint32(12, true);
      jsonText = new TextDecoder("utf-8").decode(bytes.subarray(20, 20 + chunkLength));
    } else {
      jsonText = new TextDecoder("utf-8").decode(bytes);
    }
    const json = JSON.parse(jsonText) as { extensionsUsed?: unknown };
    return Array.isArray(json.extensionsUsed) ? json.extensionsUsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    // If we can't even parse it to check, that's not a safety guarantee —
    // treat it the same as "can't verify" by returning nothing, which
    // just means the "was anything dropped" comparison finds no losses
    // to report. The outer try/catch in optimizeVrmAvatar covers actual
    // parse failures of the file itself.
    return [];
  }
}
