import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { worldModuleSettled } from "../worlds/WorldExtension";

/** However things are going, the world is shown after this long. */
const MAX_WAIT_MS = 15_000;
/** Nothing loading for this long counts as done (one load often starts another). */
const QUIET_MS = 400;

/**
 * Inside the Canvas: says when the world is ready to be seen. Ready means
 * nothing is loading any more (models, the avatar, textures: drei's
 * progress, which every GLTFLoader reports to), the world's own code has
 * arrived, your avatar is built, and then every material in the scene has
 * had its shaders compiled (compileAsync, off the main thread where the
 * browser can), so the first frames after the crevice don't stall on it.
 */
export function WarmUp({ worldId, avatarReady, onReady }: { worldId: string; avatarReady: boolean; onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const avatarRef = useRef(avatarReady);
  avatarRef.current = avatarReady;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    const began = performance.now();
    let quietSince = 0;
    const timer = window.setInterval(() => {
      if (finished) return;
      const now = performance.now();
      const late = now - began > MAX_WAIT_MS;
      const busy = useProgress.getState().active || !worldModuleSettled(worldId) || !avatarRef.current;
      if (busy && !late) {
        quietSince = 0;
        return;
      }
      if (!quietSince) quietSince = now;
      if (now - quietSince < QUIET_MS && !late) return;
      finished = true;
      window.clearInterval(timer);
      const show = () => requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && readyRef.current()));
      gl.compileAsync(scene, camera).then(show, show);
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gl, scene, camera, worldId]);
  return null;
}
