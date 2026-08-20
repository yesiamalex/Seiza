import { useState } from "react";
import type { WorldObject } from "../multiplayer/types";
import { panelStyle, pillButtonActiveStyle, pillButtonStyle } from "../ui/styles";

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
    <div style={{ display: "flex", flexDirection: "column-reverse", gap: 8, alignItems: "center" }}>
      <button style={editMode ? pillButtonActiveStyle : pillButtonStyle} onClick={onToggleEditMode}>
        🛠 {editMode ? "Exit edit mode" : "Edit world"}
      </button>
      {editMode && (
        <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 8, width: 280 }}>
          <small style={{ opacity: 0.8 }}>Click an object to select it, drag the gizmo to move it.</small>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={pillButtonStyle} onClick={() => onSpawn("box")}>
              + Box
            </button>
            <button style={pillButtonStyle} onClick={() => onSpawn("sphere")}>
              + Sphere
            </button>
            <button style={pillButtonStyle} onClick={() => onSpawn("cylinder")}>
              + Cylinder
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              placeholder="https://…/model.glb"
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              style={{ flex: 1, minWidth: 0, borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "white", padding: "6px 8px" }}
            />
            <button
              style={pillButtonStyle}
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
              <button style={pillButtonStyle} onClick={onDeleteSelected}>
                Delete
              </button>
              <button style={pillButtonStyle} onClick={onDeselect}>
                Deselect
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
