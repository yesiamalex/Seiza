import { useEffect, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, type VRM } from "@pixiv/three-vrm";

export interface VrmLoadState {
  vrm: VRM | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Loads a .vrm file and returns the parsed VRM instance. Kept separate from
 * rendering (VrmAvatar.tsx) so other code (gesture logic, inspection UI)
 * can depend on the loaded VRM without re-fetching it.
 */
export function useVrmLoader(url: string | null): VrmLoadState {
  const [state, setState] = useState<VrmLoadState>({
    vrm: null,
    loading: !!url,
    error: null,
  });

  useEffect(() => {
    if (!url) {
      setState({ vrm: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ vrm: null, loading: true, error: null });

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          setState({
            vrm: null,
            loading: false,
            error: new Error(`${url} loaded but contained no VRM data`),
          });
          return;
        }
        setState({ vrm, loading: false, error: null });
      },
      undefined,
      (err) => {
        if (cancelled) return;
        setState({ vrm: null, loading: false, error: err as Error });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
