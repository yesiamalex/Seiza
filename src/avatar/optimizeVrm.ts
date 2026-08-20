// Optional avatar-file optimization using glTF-Transform (donmccurdy/
// glTF-Transform — https://github.com/donmccurdy/glTF-Transform), run
// entirely client-side before upload.
//
// Scope is deliberately narrow: texture recompression/downscaling only
// (via @gltf-transform/functions' textureCompress), nothing that touches
// the scene graph, nodes, meshes, or accessors. Reasoning: there's no
// dedicated VRM extension package for glTF-Transform (checked — none
// exists as of writing), so VRM-specific data (humanoid bone→node index
// mapping, spring bones, blend shapes) is invisible to it, carried along
// only as opaque unknown-extension JSON. Structural transforms like
// prune/weld/draco reindex or discard nodes/accessors based on *core*
// glTF reachability, which can't see references made only from within
// that unknown VRM JSON — so they carry a real, unverified risk of
// silently corrupting a VRM's humanoid rig or breaking morph-target-based
// facial expressions (Draco compression in particular is documented to
// have morph-target support gaps generally, not VRM-specific). Texture
// recompression only replaces image byte payloads that a material's
// texture slot points to by index — the index itself, and everything
// referencing it (including unknown VRM extension JSON), is untouched.
// This is "don't force it if it doesn't safely apply" taken literally:
// if this throws or doesn't shrink the file, callers should just use the
// original upload.
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
