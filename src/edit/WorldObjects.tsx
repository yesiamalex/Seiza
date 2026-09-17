import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { TransformControls, useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldObject } from "../multiplayer/types";
import { VideoPanel } from "../media/VideoPanel";
import { createScreenPlaceholder, createTextTexture } from "./textTexture";

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
}: PlacedObjectProps) {
  const groupRef = useRef<THREE.Group>(null);
  const hovering = useRef(false);

  // Boards and screens are used, not just arranged, so they answer clicks
  // outside edit mode too. The server still decides whether a write is
  // allowed (worker/room.ts).
  const interactive = !editMode && ((object.kind === "text" && !!onEditText) || (object.kind === "screen" && !!onPresentToggle));

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
    if (object.kind === "text" && onEditText) {
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
      {editMode && selected && groupRef.current && (
        <TransformControls object={groupRef.current} mode={transformMode} onMouseUp={handleChangeEnd} />
      )}
    </>
  );
}

function ObjectGeometry({ object, screenStream }: { object: WorldObject; screenStream: MediaStream | null }) {
  if (object.kind === "model" && object.modelUrl) {
    return <ModelGeometry url={object.modelUrl} />;
  }
  switch (object.kind) {
    case "text":
      return <TextSurfaceObject object={object} />;
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
      {!flat && (
        <mesh position={[0, 0, -0.035]} castShadow receiveShadow>
          <boxGeometry args={[width + 0.1, height + 0.1, 0.07]} />
          <meshStandardMaterial color="#9d6a41" roughness={0.65} />
        </mesh>
      )}
      {flat && (
        <mesh position={[0, 0, -0.004]} receiveShadow>
          <boxGeometry args={[width + 0.01, height + 0.01, 0.006]} />
          <meshStandardMaterial color="#ffffff" roughness={0.95} />
        </mesh>
      )}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={drawn.texture} roughness={0.85} />
      </mesh>
    </group>
  );
}

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
