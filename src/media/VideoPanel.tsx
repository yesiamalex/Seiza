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
    // `playing` tracks whether *this* element has been started, but it
    // is a component-level ref while the element itself is rebuilt
    // whenever the stream changes. Without resetting it, stopping a
    // share and starting another left it stuck at true: the frame loop
    // below only calls play() when it is false, so the second share got
    // a brand-new element that was never started and stayed black — for
    // the presenter as well as everyone else, and for a re-enabled
    // camera just as much as a re-shared screen.
    playing.current = false;
    setAspect(null);

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

  /**
   * Re-attach when the stream gains a track after this element was built.
   *
   * This is the fix for "a shared screen is black for everyone until they
   * reload". `ontrack` fires once per track, but a screen share with
   * audio — and a renegotiated camera — deliver their tracks in separate
   * events against the *same* MediaStream object. The element above is
   * memoised on the stream reference, which by definition does not change
   * when a track is added to it, so a panel first built from an
   * audio-only stream keeps an `srcObject` it has already decided has no
   * video, sits at readyState 0, and paints black. Reloading fixed it
   * only because a fresh join has every track present in the initial
   * offer, so the element is built once, complete.
   *
   * Re-assigning `srcObject` to the same stream is what forces the
   * element to re-evaluate its tracks. A received track also starts
   * `muted` until the first frame arrives, so `unmute` gets the same
   * treatment rather than being left to chance.
   */
  useEffect(() => {
    if (!video || !stream) return;

    const reattach = () => {
      // Assigning the same object is not a no-op for a <video>: it
      // restarts source selection, which is the point.
      video.srcObject = stream;
      if (video.videoWidth > 0) setAspect(video.videoWidth / video.videoHeight);
      if (playing.current) {
        void video.play().catch(() => {
          // Left for the useFrame loop to retry on its next check.
          playing.current = false;
        });
      }
    };

    const watched = new Set<MediaStreamTrack>();
    const watch = (track: MediaStreamTrack) => {
      if (watched.has(track)) return;
      watched.add(track);
      track.addEventListener("unmute", reattach);
    };
    stream.getTracks().forEach(watch);

    const onAddTrack = (event: MediaStreamTrackEvent) => {
      watch(event.track);
      reattach();
    };
    stream.addEventListener("addtrack", onAddTrack);

    return () => {
      stream.removeEventListener("addtrack", onAddTrack);
      watched.forEach((track) => track.removeEventListener("unmute", reattach));
    };
  }, [video, stream]);

  useEffect(() => () => texture?.dispose(), [texture]);

  /**
   * When the last real video frame arrived, for the fallback refresh below.
   *
   * three's VideoTexture only re-uploads when the browser reports a newly
   * presented frame (requestVideoFrameCallback). Your *own* screen share
   * is a local capture, which only produces a frame when what's on screen
   * changes, and the browser may not report frames for this hidden 1px
   * element at all. So a presenter could see their own share stuck on the
   * placeholder (or a stale frame) while everyone else, receiving a steady
   * WebRTC stream, saw it fine. The frame loop below refreshes the texture
   * itself whenever no frame has been reported for a while.
   */
  const lastFrameAt = useRef(0);
  useEffect(() => {
    if (!video || !("requestVideoFrameCallback" in video)) return;
    let handle = 0;
    const onFrame = () => {
      lastFrameAt.current = performance.now();
      handle = video.requestVideoFrameCallback(onFrame);
    };
    handle = video.requestVideoFrameCallback(onFrame);
    return () => video.cancelVideoFrameCallback(handle);
  }, [video]);

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
    // Fallback refresh (see lastFrameAt): at most four uploads a second, and
    // only while visible with no real frames arriving, so live video that
    // is updating normally never pays for it.
    if (
      shouldShow &&
      texture &&
      video.readyState >= video.HAVE_CURRENT_DATA &&
      performance.now() - lastFrameAt.current > 500
    ) {
      texture.needsUpdate = true;
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
