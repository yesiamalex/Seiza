import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import type { VRM } from "@pixiv/three-vrm";

interface GestureControllerProps {
  vrm: VRM | null;
  activeGestureUrl: string | null;
}

/**
 * Plays a single VRMA clip on the given VRM whenever activeGestureUrl
 * changes. One AnimationMixer per avatar instance, created lazily and
 * reused across gesture changes. This is the piece that makes seiza/bow
 * portable across any user-supplied VRM avatar rather than tied to one
 * specific character rig.
 */
export function GestureController({ vrm, activeGestureUrl }: GestureControllerProps) {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    if (!vrm) return;
    mixerRef.current = new THREE.AnimationMixer(vrm.scene);
    return () => {
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
    };
  }, [vrm]);

  useEffect(() => {
    if (!vrm || !activeGestureUrl || !mixerRef.current) return;

    let cancelled = false;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    loader.load(activeGestureUrl, (gltf) => {
      if (cancelled) return;
      const vrmAnimations = gltf.userData.vrmAnimations as unknown[] | undefined;
      const animation = vrmAnimations?.[0];
      if (!animation || !mixerRef.current) {
        console.error(`${activeGestureUrl} loaded but contained no VRMA animation`);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clip = createVRMAnimationClip(animation as any, vrm);
      currentActionRef.current?.fadeOut(0.2);
      const action = mixerRef.current.clipAction(clip);
      action.reset().fadeIn(0.2).play();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      currentActionRef.current = action;
    });

    return () => {
      cancelled = true;
    };
  }, [vrm, activeGestureUrl]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });

  return null;
}
