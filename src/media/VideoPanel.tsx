import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface VideoPanelProps {
  stream: MediaStream | null;
  /** Panel size in metres; the picture is fitted inside it, never stretched. */
  width: number;
  height: number;
  /** Stop decoding past this distance from the camera. */
  maxDistance?: number;
  /** Extra gate from the parent, e.g. "only the nearest few cameras". */
  active?: boolean;
  /** Self-view mirrors, the way a webcam preview normally does. */
  mirrored?: boolean;
}

// Visibility is rechecked a few times a second rather than every frame;
// walking toward a screen doesn't need 60Hz precision.
const CHECK_INTERVAL = 0.25;

/**
 * Shows a live MediaStream on a flat panel in the world.
 *
 * The expensive parts of remote video are decoding each frame and uploading
 * it to the GPU, and both are avoided whenever nobody is actually looking:
 * past `maxDistance`, or when the parent says this panel isn't one of the
 * ones worth showing, the element is paused and the mesh hidden, which stops
 * the texture upload too (three only uploads a video texture while something
 * using it is rendered). Walking closer resumes it.
 *
 * The element is muted on purpose. Audio that comes with a stream is played
 * spatially through the Web Audio graph in useRealtimeMedia, so letting the
 * element play it as well would give you the same sound twice, once without
 * distance falloff.
 */
export function VideoPanel({ stream, width, height, maxDistance = 30, active = true, mirrored = false }: VideoPanelProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const elapsed = useRef(0);
  const playing = useRef(false);

  const video = useMemo(() => {
    if (!stream || typeof document === "undefined") return null;
    const element = document.createElement("video");
    element.srcObject = stream;
    element.muted = true;
    element.playsInline = true;
    element.autoplay = false;
    // Kept in the document, one pixel wide and transparent. A <video> that
    // is never attached — or is attached with display:none — is treated as
    // not visible, and browsers are free to skip decoding it entirely,
    // which is exactly how a shared screen ends up as a black rectangle for
    // everyone except the person sharing it.
    element.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1";
    document.body.appendChild(element);
    return element;
  }, [stream]);

  const texture = useMemo(() => {
    if (!video) return null;
    const created = new THREE.VideoTexture(video);
    created.colorSpace = THREE.SRGBColorSpace;
    created.minFilter = THREE.LinearFilter;
    created.magFilter = THREE.LinearFilter;
    created.generateMipmaps = false;
    return created;
  }, [video]);

  useEffect(() => {
    if (!video) return;
    const onMetadata = () => {
      if (video.videoWidth > 0) setAspect(video.videoWidth / video.videoHeight);
    };
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("resize", onMetadata);
    onMetadata();
    return () => {
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("resize", onMetadata);
      video.pause();
      video.srcObject = null;
      video.remove();
    };
  }, [video]);

  useEffect(() => () => texture?.dispose(), [texture]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !video) return;
    elapsed.current += delta;
    if (elapsed.current < CHECK_INTERVAL) return;
    elapsed.current = 0;

    const distance = state.camera.position.distanceTo(mesh.getWorldPosition(new THREE.Vector3()));
    const shouldShow = active && distance <= maxDistance;
    mesh.visible = shouldShow;
    if (shouldShow && !playing.current) {
      playing.current = true;
      void video.play().catch(() => {
        playing.current = false;
      });
    } else if (!shouldShow && playing.current) {
      playing.current = false;
      video.pause();
    }
  });

  if (!texture) return null;

  // Fit inside the panel rather than filling it, so a 4:3 webcam in a 16:9
  // frame is letterboxed instead of squashed.
  const videoAspect = aspect ?? width / height;
  const fitted = width / height > videoAspect ? [height * videoAspect, height] : [width, width / videoAspect];

  return (
    <mesh ref={meshRef} scale={[mirrored ? -1 : 1, 1, 1]} visible={false}>
      <planeGeometry args={[fitted[0], fitted[1]]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
