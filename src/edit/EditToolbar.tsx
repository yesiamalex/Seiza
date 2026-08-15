import { useState } from "react";
import type { WorldObject } from "../multiplayer/types";

interface EditToolbarProps {
  enabled: boolean;
  editMode: boolean;
  onToggleEditMode: () => void;
  onSpawn: (kind: WorldObject["kind"], modelUrl?: string) => void;
  selectedId: string | null;
  onDeselect: () => void;
  onDeleteSelected: () => void;
}

/**
 * No permission system yet — anyone in the room who toggles edit mode
 * can place, move, or delete any object (see party/room.ts). Fine for
 * the trusted-classroom-room scale this targets; a documented limitation,
 * not an oversight — see README's Status section.
 */
export function EditToolbar({
  enabled,
  editMode,
  onToggleEditMode,
  onSpawn,
  selectedId,
  onDeselect,
  onDeleteSelected,
}: EditToolbarProps) {
  const [modelUrl, setModelUrl] = useState("");
  if (!enabled) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button onClick={onToggleEditMode}>{editMode ? "Exit edit mode" : "Edit world"}</button>
      {editMode && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            background: "rgba(0,0,0,0.45)",
            padding: 8,
            borderRadius: 6,
            maxWidth: 280,
          }}
        >
          <small>Click an object to select it, drag the gizmo to move it.</small>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onSpawn("box")}>+ Box</button>
            <button onClick={() => onSpawn("sphere")}>+ Sphere</button>
            <button onClick={() => onSpawn("cylinder")}>+ Cylinder</button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              placeholder="https://…/model.glb"
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              disabled={!modelUrl}
              onClick={() => {
                onSpawn("model", modelUrl);
                setModelUrl("");
              }}
            >
              + Model
            </button>
          </div>
          {selectedId && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span>1 object selected</span>
              <button onClick={onDeleteSelected}>Delete</button>
              <button onClick={onDeselect}>Deselect</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
