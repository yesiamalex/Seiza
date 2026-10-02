import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TransformControls, useGLTF } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { isTextObjectKind, type WorldObject } from "../multiplayer/types";
import { placedChairSeat, type Seat } from "../scene/layout";
import { Chair } from "../scene/Chair";
import { SeatPad } from "../scene/SeatPad";
import { VideoPanel } from "../media/VideoPanel";
import { createScreenPlaceholder, createTextTexture } from "./textTexture";
import { setGizmoDragging } from "./gizmoState";

interface WorldObjectsProps {
  objects: Record<string, WorldObject>;
  editMode: boolean;
  selectedId: string | null;
  transformMode: "translate" | "rotate";
  onSelect: (id: string) => void;
  onMove: (id: string, position: [number, number, number], rotationY: number) => void;
  /** Click a board or a note to write on it. */
  onEditText?: (object: WorldObject) => void;
  /** Click a screen to start presenting on it, or to stop. */
  onPresentToggle?: (object: WorldObject) => void;
  /** The live picture for a screen, when somebody is presenting on it. */
  resolveScreenStream?: (object: WorldObject) => MediaStream | null;
  /** Sit on a placed chair. Omitted in edit mode, where a click selects the
   *  chair to move instead — the same rule the built-in seats follow. */
  onSit?: (seat: Seat) => void;
  /** Id of the seat this player currently occupies, built-in or placed. */
  occupiedSeatId?: string | null;
}

/** Renders every synced world object; in edit mode, the selected one gets
 *  a drag/rotate gizmo (see src/edit/EditToolbar.tsx for spawn/delete UI). */
export function WorldObjects({
  objects,
  editMode,
  selectedId,
  transformMode,
  onSelect,
  onMove,
  onEditText,
  onPresentToggle,
  resolveScreenStream,
  onSit,
  occupiedSeatId,
}: WorldObjectsProps) {
  return (
    <>
      {Object.values(objects).map((obj) => (
        <PlacedObject
          key={obj.id}
          object={obj}
          editMode={editMode}
          selected={obj.id === selectedId}
          onSelect={onSelect}
          onMove={onMove}
          transformMode={transformMode}
          onEditText={onEditText}
          onPresentToggle={onPresentToggle}
          screenStream={obj.kind === "screen" ? (resolveScreenStream?.(obj) ?? null) : null}
          onSit={onSit}
          occupiedSeatId={occupiedSeatId}
        />
      ))}
    </>
  );
}

interface PlacedObjectProps {
  object: WorldObject;
  editMode: boolean;
  selected: boolean;
  transformMode: "translate" | "rotate";
  onSelect: (id: string) => void;
  onMove: (id: string, position: [number, number, number], rotationY: number) => void;
  onEditText?: (object: WorldObject) => void;
  onPresentToggle?: (object: WorldObject) => void;
  screenStream: MediaStream | null;
  onSit?: (seat: Seat) => void;
  occupiedSeatId?: string | null;
}

function PlacedObject({
  object,
  editMode,
  selected,
  onSelect,
  onMove,
  transformMode,
  onEditText,
  onPresentToggle,
  screenStream,
  onSit,
  occupiedSeatId,
}: PlacedObjectProps) {
  const groupRef = useRef<THREE.Group>(null);
  const hovering = useRef(false);

  // Boards and screens are used, not just arranged, so they answer clicks
  // outside edit mode too. The server still decides whether a write is
  // allowed (worker/room.ts).
  const interactive = !editMode && ((isTextObjectKind(object.kind) && !!onEditText) || (object.kind === "screen" && !!onPresentToggle));

  useEffect(
    () => () => {
      if (hovering.current) document.body.style.cursor = "";
    },
    []
  );

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (editMode) {
      event.stopPropagation();
      onSelect(object.id);
      return;
    }
    if (isTextObjectKind(object.kind) && onEditText) {
      event.stopPropagation();
      onEditText(object);
    } else if (object.kind === "screen" && onPresentToggle) {
      event.stopPropagation();
      onPresentToggle(object);
    }
  };

  const handleChangeEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    onMove(object.id, [group.position.x, group.position.y, group.position.z], group.rotation.y);
  };

  // Yaw first, then tilt, which is how placing something flat on a desk and
  // then turning it reads to a person.
  const rotation = useMemo(
    () => new THREE.Euler(object.pitch ?? 0, object.rotationY, 0, "YXZ"),
    [object.pitch, object.rotationY]
  );

  return (
    <>
      <group
        ref={groupRef}
        position={object.position}
        rotation={rotation}
        scale={object.scale}
        onClick={handleClick}
        onPointerOver={
          interactive
            ? (event) => {
                event.stopPropagation();
                hovering.current = true;
                document.body.style.cursor = "pointer";
              }
            : undefined
        }
        onPointerOut={
          interactive
            ? () => {
                hovering.current = false;
                document.body.style.cursor = "";
              }
            : undefined
        }
      >
        <ObjectGeometry object={object} screenStream={screenStream} />
      </group>
      {/* The chair's click pad is a sibling of the chair, not a child: the
          seat is already in world coordinates, so putting it inside a group
          that carries the object's own rotation and scale would apply both
          of them twice. */}
      {object.kind === "chair" && onSit && (
        <SeatPad
          seat={placedChairSeat(object.id, object.position, object.rotationY, object.scale)}
          onSit={onSit}
          occupied={occupiedSeatId === object.id}
        />
      )}
      {editMode && selected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode={transformMode}
          // Reported so PlayerRig can tell a gizmo drag from a
          // look-around drag — see gizmoState.ts.
          onMouseDown={() => setGizmoDragging(true)}
          onMouseUp={() => {
            setGizmoDragging(false);
            handleChangeEnd();
          }}
        />
      )}
    </>
  );
}

function ObjectGeometry({ object, screenStream }: { object: WorldObject; screenStream: MediaStream | null }) {
  if (object.kind === "model" && object.modelUrl) {
    return <ModelGeometry url={object.modelUrl} />;
  }
  // Chairs use the room's own furniture materials rather than the object's
  // colour: a chair is furniture, and one that matches the classroom's
  // chairs is what makes a placed one look placed rather than pasted in.
  if (object.kind === "chair") return <Chair />;
  if (object.kind === "image" && object.src) return <ImageObject object={object} />;
  if (object.kind === "video" && object.src) return <VideoObject object={object} />;
  switch (object.kind) {
    case "text":
      return <TextSurfaceObject object={object} />;
    case "sign":
      return <SignObject object={object} />;
    case "screen":
      return <ScreenObject object={object} stream={screenStream} />;
    case "sphere":
      return (
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.5, 24, 16]} />
          <meshStandardMaterial color={object.color} roughness={0.7} />
        </mesh>
      );
    case "cylinder":
      return (
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.5, 0.5, 1, 20]} />
          <meshStandardMaterial color={object.color} roughness={0.7} />
        </mesh>
      );
    case "box":
    default:
      return (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={object.color} roughness={0.7} />
        </mesh>
      );
  }
}

/**
 * A board or a note. Which one it is comes from how it's tilted: anything
 * lying flat is a sheet of paper, anything upright is a framed board. That
 * avoids carrying a second field over the wire for what is really the same
 * object used two ways.
 */
/**
 * A signboard: a dark panel with large centred lettering, on a post when
 * it is standing on the ground and bare when it is mounted up a wall.
 *
 * The post is decided by height rather than by a separate field or a
 * second object kind. A sign near the floor is a garden or corridor sign
 * and needs legs; one at head height or above is a plaque and would look
 * absurd with a post running down through the wall behind it. Deriving
 * it means the same object does both jobs and there is nothing extra to
 * get wrong when placing one.
 */
const SIGN_POST_MAX_Y = 1.5;

function SignObject({ object }: { object: WorldObject }) {
  const drawn = useMemo(() => createTextTexture(object.text ?? "", "sign", object.color), [object.text, object.color]);
  useEffect(() => () => drawn?.texture.dispose(), [drawn]);
  if (!drawn) return null;

  const height = 0.62;
  const width = height * drawn.aspect;
  // Object transforms are applied by the parent group, so the sign's own
  // height above the floor is what the post has to span.
  const standing = object.position[1] <= SIGN_POST_MAX_Y;
  const postHeight = Math.max(0, object.position[1] - height / 2);

  return (
    <group>
      {/* Panel, with its frame set back so the two don't fight for the
          same pixels — the same lesson as the notice board below. */}
      <mesh position={[0, 0, -0.035]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.06, height + 0.06, 0.06]} />
        <meshStandardMaterial color="#6f4a2e" roughness={0.7} />
      </mesh>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={drawn.texture} toneMapped={false} />
      </mesh>
      {/* Readable from behind too, rather than vanishing. */}
      <mesh position={[0, 0, -0.071]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={drawn.texture} toneMapped={false} />
      </mesh>

      {standing && postHeight > 0.05 && (
        <group position={[0, -height / 2 - postHeight / 2, -0.035]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.035, 0.042, postHeight, 10]} />
            <meshStandardMaterial color="#6f4a2e" roughness={0.8} />
          </mesh>
          {/* A small base, so it reads as planted rather than floating. */}
          <mesh position={[0, -postHeight / 2 + 0.02, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.13, 0.15, 0.04, 12]} />
            <meshStandardMaterial color="#5d4028" roughness={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function TextSurfaceObject({ object }: { object: WorldObject }) {
  const flat = Math.abs(object.pitch ?? 0) > 0.6;
  const drawn = useMemo(
    () => createTextTexture(object.text ?? "", flat ? "note" : "board", object.color),
    [object.text, flat, object.color]
  );
  useEffect(() => () => drawn?.texture.dispose(), [drawn]);
  if (!drawn) return null;

  const height = flat ? 0.6 : 1;
  const width = height * drawn.aspect;

  return (
    <group>
      {/* The frame sits behind the writing surface and is deliberately a
          little smaller in front: its front face used to land at exactly
          z=0, the same plane as the text, so the two fought for pixels and
          the brown showed through the white. */}
      {!flat && (
        <mesh position={[0, 0, -0.045]} castShadow receiveShadow>
          <boxGeometry args={[width + 0.1, height + 0.1, 0.07]} />
          <meshStandardMaterial color="#9d6a41" roughness={0.65} />
        </mesh>
      )}
      {flat && (
        <mesh position={[0, 0, -0.008]} receiveShadow>
          <boxGeometry args={[width + 0.01, height + 0.01, 0.006]} />
          <meshStandardMaterial color="#ffffff" roughness={0.95} />
        </mesh>
      )}
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={drawn.texture} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** A picture or a clip is one unit tall at scale 1, and as wide as its own
 *  aspect ratio makes it — so placing one never distorts it. */
const PICTURE_HEIGHT = 1;
/** Stop decoding a world video past this far from the camera. */
const VIDEO_DISTANCE = 26;

/**
 * A picture hung in the world.
 *
 * The texture is loaded directly rather than through drei's useTexture
 * because a failed load must not take the room down with it: these URLs
 * come from whoever placed the object, and a 404 or a deleted asset is an
 * ordinary thing that should leave a blank frame on the wall, not a
 * suspended tree that never resolves.
 */
function ImageObject({ object }: { object: WorldObject }) {
  const [state, setState] = useState<{ texture: THREE.Texture; aspect: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const src = object.src ?? "";

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setState(null);
    setFailed(false);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      src,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        const { width, height } = texture.image as { width: number; height: number };
        setState({ texture, aspect: height > 0 ? width / height : 1 });
      },
      undefined,
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => () => state?.texture.dispose(), [state]);

  const aspect = state?.aspect ?? 1.5;
  const width = PICTURE_HEIGHT * aspect;

  return (
    <group>
      {/* Frame. Also what you see while the picture is still loading, and
          all you see if it never arrives. */}
      <mesh position={[0, 0, -0.03]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.08, PICTURE_HEIGHT + 0.08, 0.05]} />
        <meshStandardMaterial color={failed ? "#5a4038" : object.color} roughness={0.6} />
      </mesh>
      {state && (
        <mesh position={[0, 0, 0.004]}>
          <planeGeometry args={[width, PICTURE_HEIGHT]} />
          <meshBasicMaterial map={state.texture} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * A video playing on a panel in the world, from a URL.
 *
 * Muted and looping: it's set dressing, not a presentation — a shared screen
 * (ScreenObject) is the thing with sound and a presenter. Muted is also what
 * lets it start without a user gesture, which matters because nobody clicks
 * on wall decoration.
 *
 * Decoding is gated on distance for the same reason VideoPanel gates remote
 * cameras: a room with several of these would otherwise decode all of them
 * every frame whether or not anyone can see them.
 */
function VideoObject({ object }: { object: WorldObject }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [failed, setFailed] = useState(false);
  const elapsed = useRef(0);
  const playing = useRef(false);
  const src = object.src ?? "";

  const video = useMemo(() => {
    if (!src || typeof document === "undefined") return null;
    const element = document.createElement("video");
    element.src = src;
    element.crossOrigin = "anonymous";
    element.muted = true;
    element.loop = true;
    element.playsInline = true;
    element.preload = "metadata";
    element.autoplay = false;
    return element;
  }, [src]);

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
    const onError = () => setFailed(true);
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("error", onError);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [video]);

  useEffect(() => () => texture?.dispose(), [texture]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !video) return;
    elapsed.current += delta;
    if (elapsed.current < 0.25) return;
    elapsed.current = 0;
    const near = state.camera.position.distanceTo(mesh.getWorldPosition(scratchPosition)) <= VIDEO_DISTANCE;
    mesh.visible = near && !failed;
    if (near && !playing.current) {
      playing.current = true;
      void video.play().catch(() => {
        playing.current = false;
      });
    } else if (!near && playing.current) {
      playing.current = false;
      video.pause();
    }
  });

  const width = PICTURE_HEIGHT * aspect;

  return (
    <group>
      <mesh position={[0, 0, -0.04]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.1, PICTURE_HEIGHT + 0.1, 0.06]} />
        <meshStandardMaterial color={failed ? "#5a3838" : "#1d212b"} roughness={0.6} />
      </mesh>
      {texture && (
        <mesh ref={meshRef} position={[0, 0, 0.005]} visible={false}>
          <planeGeometry args={[width, PICTURE_HEIGHT]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Reused rather than allocated per frame, per video. */
const scratchPosition = new THREE.Vector3();

const SCREEN_WIDTH = 3.2;
const SCREEN_HEIGHT = 1.8;

/** A display someone can present a shared screen on. */
function ScreenObject({ object, stream }: { object: WorldObject; stream: MediaStream | null }) {
  const placeholder = useMemo(() => createScreenPlaceholder("Click to present here"), []);
  useEffect(() => () => placeholder?.dispose(), [placeholder]);
  const presenting = !!object.presenterId;

  return (
    <group>
      <mesh position={[0, 0, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[SCREEN_WIDTH + 0.16, SCREEN_HEIGHT + 0.16, 0.12]} />
        <meshStandardMaterial color={presenting ? object.color : "#252a35"} roughness={0.6} />
      </mesh>
      {/* The idle face stays behind the video rather than being swapped out,
          so there's something to look at while a stream is connecting. */}
      {placeholder && (
        <mesh position={[0, 0, 0.005]}>
          <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
          <meshBasicMaterial map={placeholder} toneMapped={false} />
        </mesh>
      )}
      <group position={[0, 0, 0.012]}>
        <VideoPanel stream={stream} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} maxDistance={40} />
      </group>
    </group>
  );
}

/**
 * Anyone can paste an arbitrary model URL via EditToolbar, so a 404/bad
 * file is expected, not exceptional — this boundary keeps one broken
 * paste from crashing the whole scene (see Scene.tsx's SceneLoadBoundary
 * for the same pattern applied to the deployer-supplied scene.glb).
 */
class ModelLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Pasted model URL failed to load:", error);
  }
  render() {
    if (this.state.failed) {
      return (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#993333" wireframe />
        </mesh>
      );
    }
    return this.props.children;
  }
}

function ModelGeometry({ url }: { url: string }) {
  return (
    <ModelLoadBoundary>
      <Suspense fallback={null}>
        <LoadedModel url={url} />
      </Suspense>
    </ModelLoadBoundary>
  );
}

function LoadedModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}
