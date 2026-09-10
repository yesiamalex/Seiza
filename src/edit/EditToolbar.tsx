import { useEffect, useState } from "react";
import type { WorldObject } from "../multiplayer/types";
import { optimizeVrmAvatar } from "../avatar/optimizeVrm";
import { inputStyle, panelStyle, pillButtonActiveStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { EditIcon } from "../ui/icons";

interface EditToolbarProps {
  enabled: boolean;
  /** Placing/moving/deleting objects only takes visible effect once the
   *  room server echoes it back (see worker/room.ts and
   *  src/edit/WorldObjects.tsx) — without a connection, spawning an
   *  object would silently do nothing, which looked like "edit mode is
   *  broken" rather than "not connected yet." Disabling the actions and
   *  saying so directly is clearer than a silent no-op. */
  connected: boolean;
  editMode: boolean;
  onToggleEditMode: () => void;
  onSpawn: (kind: WorldObject["kind"], modelUrl?: string) => void;
  selectedId: string | null;
  transformMode: "translate" | "rotate";
  onTransformModeChange: (mode: "translate" | "rotate") => void;
  onSnapToFloor: () => void;
  onDeselect: () => void;
  onDeleteSelected: () => void;
  /** Whether this deployment has a shared editor password configured at
   *  all (worker/room.ts's SEIZA_EDITOR_PASSWORD) — if not, editing is
   *  open and none of the auth props below matter. */
  editorPasswordRequired: boolean;
  isEditor: boolean;
  editorAuthPending: boolean;
  editorAuthFailed: boolean;
  onAuthEditor: (password: string) => void;
}

/**
 * Editing is open to everyone by default (no permission system) unless
 * the deployer sets a shared editor password — see worker/room.ts. Fine
 * either way for the trusted-classroom-room scale this targets; a
 * documented limitation when unset, not an oversight — see README's
 * Status section.
 */
export function EditToolbar({
  enabled,
  connected,
  editMode,
  onToggleEditMode,
  onSpawn,
  selectedId,
  transformMode,
  onTransformModeChange,
  onSnapToFloor,
  onDeselect,
  onDeleteSelected,
  editorPasswordRequired,
  isEditor,
  editorAuthPending,
  editorAuthFailed,
  onAuthEditor,
}: EditToolbarProps) {
  const [modelUrl, setModelUrl] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [assets, setAssets] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const [assetUploading, setAssetUploading] = useState(false);
  const [assetMessage, setAssetMessage] = useState<string | null>(null);
  const [optimizeAsset, setOptimizeAsset] = useState(true);
  const needsAuth = editorPasswordRequired && !isEditor;

  useEffect(() => {
    if (!enabled || !editMode || needsAuth || !connected) return;
    let cancelled = false;
    fetch("/api/assets", { headers: passwordDraft ? { "x-seiza-editor-password": passwordDraft } : undefined })
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as { assets?: Array<{ id: string; url: string; name: string }>; error?: string };
        if (!response.ok) throw new Error(result.error ?? `Asset library failed to load (${response.status}).`);
        if (!cancelled) setAssets(result.assets ?? []);
      })
      .catch((error) => {
        if (!cancelled) setAssetMessage(error instanceof Error ? error.message : "Asset library failed to load.");
      });
    return () => {
      cancelled = true;
    };
  }, [connected, editMode, enabled, needsAuth]);

  if (!enabled) return null;

  async function uploadAsset(file: File) {
    setAssetMessage(null);
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "glb" && extension !== "gltf") {
      setAssetMessage("Choose a .glb or .gltf model.");
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      setAssetMessage("That model is over 60MB. Choose a smaller export.");
      return;
    }
    setAssetUploading(true);
    try {
      let body: Blob = file;
      if (optimizeAsset && extension === "glb" && file.size > 8 * 1024 * 1024) {
        const result = await optimizeVrmAvatar(file);
        body = result.blob;
        if (!result.applied) setAssetMessage(result.reason ?? "Optimization was skipped; uploading the original.");
      }
      if (body.size > 24 * 1024 * 1024) {
        throw new Error("This model is over the 24MB deployment limit, even after optimization.");
      }
      const response = await fetch("/api/assets", {
        method: "POST",
        body,
        headers: {
          "x-seiza-asset-name": file.name,
          ...(passwordDraft ? { "x-seiza-editor-password": passwordDraft } : {}),
        },
      });
      const result = (await response.json().catch(() => ({}))) as { id?: string; url?: string; name?: string; error?: string };
      if (!response.ok || !result.id || !result.url) throw new Error(result.error ?? `Upload failed (${response.status}).`);
      const asset = { id: result.id, url: result.url, name: result.name ?? file.name };
      setAssets((previous) => [...previous, asset]);
      onSpawn("model", asset.url);
      setAssetMessage(`${asset.name} uploaded and placed.`);
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : "Model upload failed.");
    } finally {
      setAssetUploading(false);
    }
  }

  async function deleteAsset(asset: { id: string }) {
    const response = await fetch(`/api/assets/${asset.id}`, {
      method: "DELETE",
      headers: passwordDraft ? { "x-seiza-editor-password": passwordDraft } : undefined,
    });
    if (!response.ok) {
      setAssetMessage("The asset could not be deleted.");
      return;
    }
    setAssets((previous) => previous.filter((item) => item.id !== asset.id));
  }

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button style={editMode ? pillButtonActiveStyle : pillButtonStyle} onClick={onToggleEditMode}>
        <EditIcon /> {editMode ? "Exit edit mode" : "Edit world"}
      </button>
      {editMode && needsAuth && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordDraft) onAuthEditor(passwordDraft);
          }}
          className="seiza-popover"
          style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", gap: 8, width: 240 }}
        >
          <small style={{ opacity: 0.8 }}>This world requires an editor password.</small>
          <input
            type="password"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder="Editor password"
            style={inputStyle}
            autoFocus
          />
          {editorAuthFailed && <small style={{ color: "#ff8a80" }}>Wrong password.</small>}
          <button type="submit" style={pillButtonStyle} disabled={editorAuthPending || !passwordDraft}>
            {editorAuthPending ? "Checking…" : "Unlock editing"}
          </button>
        </form>
      )}
      {editMode && !needsAuth && (
        <div className="seiza-popover" style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", gap: 8, width: 280 }}>
          {!connected && (
            <small style={{ color: "#ffb347" }}>
              Not connected to the room server — placing/moving objects won't do anything until you reconnect.
            </small>
          )}
          <small style={{ opacity: 0.8 }}>Click an object to select it, then use Move or Rotate.</small>
          <small style={{ opacity: 0.7 }}>Only upload models you have permission to use. Seiza does not review or take responsibility for user-provided assets.</small>
          {selectedId && (
            <div style={{ display: "flex", gap: 6 }}>
              <button style={transformMode === "translate" ? pillButtonActiveStyle : pillButtonStyle} onClick={() => onTransformModeChange("translate")}>Move</button>
              <button style={transformMode === "rotate" ? pillButtonActiveStyle : pillButtonStyle} onClick={() => onTransformModeChange("rotate")}>Rotate</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("box")}>
              + Box
            </button>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("sphere")}>
              + Sphere
            </button>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("cylinder")}>
              + Cylinder
            </button>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            Upload model (.glb or .gltf, max 24MB)
            <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" disabled={!connected || assetUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); event.currentTarget.value = ""; }} />
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.8 }}>
            <input type="checkbox" checked={optimizeAsset} onChange={(event) => setOptimizeAsset(event.target.checked)} />
            Optimize large binary models before upload
          </label>
          {assetMessage && <small style={{ color: assetMessage.includes("uploaded") ? "#7CFF9E" : "#ffb347" }}>{assetMessage}</small>}
          {assets.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
              <strong>Deployment asset library</strong>
              {assets.map((asset) => (
                <div key={asset.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button style={{ ...pillButtonStyle, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }} onClick={() => onSpawn("model", asset.url)}>{asset.name}</button>
                  <button style={pillButtonStyle} onClick={() => void deleteAsset(asset)}>Delete</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              placeholder="https://…/model.glb"
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              style={{ flex: 1, minWidth: 0, borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "white", padding: "6px 8px" }}
            />
            <button
              style={pillButtonStyle}
              disabled={!connected || !modelUrl}
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
              <button style={pillButtonStyle} onClick={onSnapToFloor}>Snap to floor</button>
              <button style={pillButtonStyle} disabled={!connected} onClick={onDeleteSelected}>
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
