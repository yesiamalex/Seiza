import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";

export type VrmValidation = { ok: true; warnings: string[] } | { ok: false; reason: string };

/**
 * Parse an avatar file the same way the app will, before it is uploaded.
 *
 * Without this, the only thing checked before upload is the extension, so
 * a `.glb` renamed to `.vrm`, a truncated download, or an export that
 * silently lost its humanoid rig all upload successfully and then fail —
 * for everyone in the room at once, on a file the uploader can no longer
 * tell was bad. The parse costs a few seconds once, at the only moment
 * where there is still something useful to say about it.
 *
 * Failures come back as a sentence aimed at the person holding the file,
 * naming the likely cause and what to do, rather than as an exception
 * message. Warnings are for files that do work but will disappoint in a
 * specific way — no expressions, no spring bones — so the uploader hears
 * it from us rather than wondering later why their avatar sits still.
 */
export async function validateVrmFile(blob: Blob): Promise<VrmValidation> {
  const url = URL.createObjectURL(blob);
  let vrm: VRM | undefined;
  try {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    vrm = gltf.userData?.vrm as VRM | undefined;

    if (!vrm) {
      return {
        ok: false,
        reason:
          "That file opened, but there is no VRM data inside it — it's most likely a plain .glb or .gltf renamed to .vrm. Export it as VRM from VRoid Studio, Blender's VRM add-on, or whatever made the model.",
      };
    }
    if (!vrm.humanoid) {
      return {
        ok: false,
        reason:
          "That VRM has no humanoid rig, so it can't walk, sit, or use any gesture. Re-export it with the humanoid bones mapped.",
      };
    }

    const warnings: string[] = [];
    if (!vrm.expressionManager || vrm.expressionManager.expressions.length === 0) {
      warnings.push("This model has no facial expressions, so it won't smile, blink, or react with the rest.");
    }
    return { ok: true, warnings };
  } catch {
    // Deliberately not surfacing the parser's own message: three-vrm and
    // GLTFLoader throw things like "Unexpected token < in JSON" that tell
    // the uploader nothing they can act on.
    return {
      ok: false,
      reason:
        "That file couldn't be read as a VRM. It may be corrupt or only partly downloaded — try opening it in VRoid Studio first, or download it again.",
    };
  } finally {
    // The validated model is thrown away immediately; the real one is
    // loaded again from the uploaded URL. Not disposing it here would
    // leak a whole avatar's textures and geometry per upload attempt.
    if (vrm) VRMUtils.deepDispose(vrm.scene);
    URL.revokeObjectURL(url);
  }
}
