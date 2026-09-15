import { useEffect, useMemo, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { buildDesignerVrm } from "./designer/buildDesignerVrm";
import { decodeAvatarSpec, isDesignerAvatarUrl } from "./designer/avatarSpec";

export interface VrmLoadState {
  vrm: VRM | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Resolves an avatar URL to a VRM instance. Two kinds of URL:
 *
 * - `seiza-avatar:v1:…` — a designer spec. Built synchronously in code
 *   (buildDesignerVrm.ts); no network request.
 * - anything else — a .vrm file, fetched and parsed with three-vrm.
 *
 * Either way the VRM is disposed (geometry, materials, textures) when the
 * URL changes or the component unmounts. Before this, switching avatars
 * leaked every previous model's GPU memory.
 */
export function useVrmLoader(url: string | null): VrmLoadState {
  const designerVrm = useMemo(() => {
    if (!url || !isDesignerAvatarUrl(url)) return null;
    const spec = decodeAvatarSpec(url);
    return spec ? buildDesignerVrm(spec) : null;
  }, [url]);

  useEffect(() => {
    if (!designerVrm) return;
    return () => VRMUtils.deepDispose(designerVrm.scene);
  }, [designerVrm]);

  const [fileState, setFileState] = useState<VrmLoadState>({ vrm: null, loading: false, error: null });

  useEffect(() => {
    if (!url || isDesignerAvatarUrl(url)) {
      setFileState({ vrm: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    let loaded: VRM | null = null;
    setFileState({ vrm: null, loading: true, error: null });

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (cancelled) {
          if (vrm) VRMUtils.deepDispose(vrm.scene);
          return;
        }
        if (!vrm) {
          setFileState({ vrm: null, loading: false, error: new Error(`${url} loaded but contained no VRM data`) });
          return;
        }
        // three-vrm's recommended post-load cleanup: drops vertices no
        // bone influences and merges duplicate skeletons, which cuts both
        // memory and per-frame skinning cost on typical VRoid exports.
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        // Skinned meshes keep their rest-pose bounding box, so an animated
        // limb can be culled while still on screen. Avatars are few; never cull.
        vrm.scene.traverse((object) => {
          object.frustumCulled = false;
        });
        loaded = vrm;
        setFileState({ vrm, loading: false, error: null });
      },
      undefined,
      (err) => {
        if (cancelled) return;
        setFileState({ vrm: null, loading: false, error: err instanceof Error ? err : new Error(String(err)) });
      }
    );

    return () => {
      cancelled = true;
      if (loaded) VRMUtils.deepDispose(loaded.scene);
    };
  }, [url]);

  if (designerVrm) return { vrm: designerVrm, loading: false, error: null };
  if (url && isDesignerAvatarUrl(url)) return { vrm: null, loading: false, error: new Error("Invalid designer avatar") };
  return fileState;
}
