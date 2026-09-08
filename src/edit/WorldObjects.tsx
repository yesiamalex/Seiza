import { Component, Suspense, useRef, type ReactNode } from "react";
import { TransformControls, useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Group } from "three";
import type { WorldObject } from "../multiplayer/types";

interface WorldObjectsProps {
  objects: Record<string, WorldObject>;
  editMode: boolean;
  selectedId: string | null;
  transformMode: "translate" | "rotate";
  onSelect: (id: string) => void;
  onMove: (id: string, position: [number, number, number], rotationY: number) => void;
}

/** Renders every synced world object; in edit mode, the selected one gets
 *  a drag/rotate gizmo (see src/edit/EditToolbar.tsx for spawn/delete UI). */
export function WorldObjects({ objects, editMode, selectedId, transformMode, onSelect, onMove }: WorldObjectsProps) {
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
}

function PlacedObject({ object, editMode, selected, onSelect, onMove, transformMode }: PlacedObjectProps) {
  const groupRef = useRef<Group>(null);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!editMode) return;
    e.stopPropagation();
    onSelect(object.id);
  };

  const handleChangeEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    onMove(object.id, [group.position.x, group.position.y, group.position.z], group.rotation.y);
  };

  return (
    <>
      <group
        ref={groupRef}
        position={object.position}
        rotation={[0, object.rotationY, 0]}
        scale={object.scale}
        onClick={handleClick}
      >
        <ObjectGeometry object={object} />
      </group>
      {editMode && selected && groupRef.current && (
        <TransformControls object={groupRef.current} mode={transformMode} onMouseUp={handleChangeEnd} />
      )}
    </>
  );
}

function ObjectGeometry({ object }: { object: WorldObject }) {
  if (object.kind === "model" && object.modelUrl) {
    return <ModelGeometry url={object.modelUrl} />;
  }
  switch (object.kind) {
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
