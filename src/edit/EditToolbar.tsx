import { useEffect, useState } from "react";
import type { WorldObject } from "../multiplayer/types";
import { optimizeVrmAvatar } from "../avatar/optimizeVrm";
import { compressImage } from "./compressImage";
import { editAuthHeaders } from "./editAuth";
import { BAR_LABEL_CLASS, barButtonActiveStyle, barButtonStyle, inputStyle, panelStyle, pillButtonActiveStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { ChairIcon, CloseIcon, EditIcon, MinimizeIcon, ScreenShareIcon, SignIcon, TextBoardIcon } from "../ui/icons";

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
  /** `pitch` tilts what's placed; a note is a board laid flat. */
  onSpawn: (kind: WorldObject["kind"], modelUrl?: string, pitch?: number) => void;
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
  /** Lets App.tsx relabel this same gate as "admin key" when this
   *  deployment has SEIZA_ADMIN_KEY configured (which then supersedes
   *  the plain editor password for this gate — see App.tsx's
   *  canEditWorld). The gate's behavior doesn't change, only its copy:
   *  it's still one shared secret unlocking this connection's edit
   *  privileges for its session, whichever secret it turns out to be. */
  authLabel?: string;
  /** Room-level environment override, or null when the deployment's own
   *  world.json sceneUrl (or the procedural base room) is in use. */
  environmentUrl: string | null;
  onSetEnvironment: (url: string | null) => void;
  skyboxUrl: string | null;
  onSetSkybox: (url: string | null) => void;
  /** False while the panel is minimised: still in edit mode, with the
   *  world uncovered. */
  panelOpen: boolean;
  onMinimize: () => void;
  /** Leaves edit mode. */
  onExit: () => void;
}

/**
 * Editing is open to everyone by default (no permission system) unless
 * the deployer sets a shared editor password — see worker/room.ts. Fine
 * either way for the trusted-classroom-room scale this targets; a
 * documented limitation when unset, not an oversight — see DOCS.md's
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
  authLabel = "editor password",
  environmentUrl,
  onSetEnvironment,
  skyboxUrl,
  onSetSkybox,
  panelOpen,
  onMinimize,
  onExit,
}: EditToolbarProps) {
  const [modelUrl, setModelUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [assets, setAssets] = useState<Array<{ id: string; url: string; name: string; kind?: "model" | "image" | null }>>([]);
  const [assetUploading, setAssetUploading] = useState(false);
  const [assetMessage, setAssetMessage] = useState<string | null>(null);
  const [optimizeAsset, setOptimizeAsset] = useState(true);
  const needsAuth = editorPasswordRequired && !isEditor;

  useEffect(() => {
    if (!enabled || !editMode || needsAuth || !connected) return;
    let cancelled = false;
    fetch("/api/assets", { headers: editAuthHeaders() })
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as {
          assets?: Array<{ id: string; url: string; name: string; kind?: "model" | "image" | null }>;
          error?: string;
        };
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

  /** Shared by "place a model" and "replace the environment" — both are
   *  the same upload, they just differ in what happens to the URL after. */
  async function postAsset(file: File): Promise<{ id: string; url: string; name: string }> {
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "glb" && extension !== "gltf") {
      throw new Error("Choose a .glb or .gltf model.");
    }
    if (file.size > 60 * 1024 * 1024) {
      throw new Error("That model is over 60MB. Choose a smaller export.");
    }
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
        ...editAuthHeaders(),
      },
    });
    const result = (await response.json().catch(() => ({}))) as { id?: string; url?: string; name?: string; error?: string };
    if (!response.ok || !result.id || !result.url) throw new Error(result.error ?? `Upload failed (${response.status}).`);
    return { id: result.id, url: result.url, name: result.name ?? file.name };
  }

  async function uploadAsset(file: File) {
    setAssetMessage(null);
    setAssetUploading(true);
    try {
      const asset = await postAsset(file);
      setAssets((previous) => [...previous, asset]);
      onSpawn("model", asset.url);
      setAssetMessage(`${asset.name} uploaded and placed.`);
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : "Model upload failed.");
    } finally {
      setAssetUploading(false);
    }
  }

  /**
   * Pictures go through the browser's encoder first — see compressImage.ts
   * for why a deployment's KV budget makes that worth doing.
   */
  async function uploadImage(file: File) {
    setAssetMessage(null);
    setAssetUploading(true);
    try {
      const compressed = await compressImage(file);
      const response = await fetch("/api/assets", {
        method: "POST",
        body: compressed.blob,
        headers: {
          "x-seiza-asset-name": compressed.name,
          "x-seiza-asset-kind": "image",
          ...editAuthHeaders(),
        },
      });
      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
        url?: string;
        name?: string;
        error?: string;
      };
      if (!response.ok || !result.id || !result.url) throw new Error(result.error ?? `Upload failed (${response.status}).`);
      const asset = { id: result.id, url: result.url, name: result.name ?? compressed.name, kind: "image" as const };
      setAssets((previous) => [...previous, asset]);
      onSpawn("image", asset.url);
      const kb = Math.max(1, Math.round(compressed.blob.size / 1024));
      setAssetMessage(`${asset.name} uploaded and placed (${kb}KB after compression).`);
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setAssetUploading(false);
    }
  }

  async function uploadEnvironment(file: File) {
    setAssetMessage(null);
    setAssetUploading(true);
    try {
      const asset = await postAsset(file);
      setAssets((previous) => [...previous, asset]);
      onSetEnvironment(asset.url);
      setAssetMessage(`${asset.name} is now this room's environment for everyone.`);
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : "Environment upload failed.");
    } finally {
      setAssetUploading(false);
    }
  }

  async function uploadSkybox(file: File) {
    setAssetMessage(null);
    setAssetUploading(true);
    try {
      const compressed = await compressImage(file);
      const response = await fetch("/api/assets", {
        method: "POST",
        body: compressed.blob,
        headers: {
          "x-seiza-asset-name": compressed.name,
          "x-seiza-asset-kind": "image",
          ...editAuthHeaders(),
        },
      });
      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
        url?: string;
        name?: string;
        error?: string;
      };
      if (!response.ok || !result.id || !result.url) throw new Error(result.error ?? `Upload failed (${response.status}).`);
      const asset = { id: result.id, url: result.url, name: result.name ?? compressed.name, kind: "image" as const };
      setAssets((previous) => [...previous, asset]);
      onSetSkybox(asset.url);
      setAssetMessage(`${asset.name} is now the room skybox for everyone.`);
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : "Skybox upload failed.");
    } finally {
      setAssetUploading(false);
    }
  }

  async function deleteAsset(asset: { id: string }) {
    const response = await fetch(`/api/assets/${asset.id}`, {
      method: "DELETE",
      headers: editAuthHeaders(),
    });
    if (!response.ok) {
      setAssetMessage("The asset could not be deleted.");
      return;
    }
    setAssets((previous) => previous.filter((item) => item.id !== asset.id));
  }

  const minimised = editMode && !panelOpen;
  const buttonLabel = minimised ? "Show edit tools (still editing)" : editMode ? "Exit edit mode" : "Edit world";
  /** Title, minimise and close, at the top of whichever panel is showing. */
  const panelHeader = (
    <div style={{ display: "flex", alignItems: "center", gap: 4, margin: "-2px -4px 2px 0" }}>
      <strong style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
        <EditIcon size={15} /> Edit world
      </strong>
      <button type="button" className="seiza-icon-btn" style={headerIconButton} onClick={onMinimize} aria-label="Minimise, keep editing" title="Minimise, keep editing">
        <MinimizeIcon size={16} />
      </button>
      <button type="button" className="seiza-icon-btn" style={headerIconButton} onClick={onExit} aria-label="Close edit mode" title="Close edit mode">
        <CloseIcon size={15} />
      </button>
    </div>
  );

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        className="seiza-bar-btn"
        style={editMode ? barButtonActiveStyle : barButtonStyle}
        onClick={onToggleEditMode}
        aria-pressed={editMode}
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <EditIcon />
        <span className={BAR_LABEL_CLASS}>{minimised ? "Editing" : editMode ? "Done" : "Edit"}</span>
      </button>
      {editMode && panelOpen && needsAuth && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordDraft) onAuthEditor(passwordDraft);
          }}
          className="seiza-popover"
          style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", gap: 8, width: 240 }}
        >
          {panelHeader}
          <small style={{ opacity: 0.8 }}>This world requires {authLabel === "editor password" ? "an" : "the"} {authLabel}.</small>
          <input
            type="password"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder={authLabel[0].toUpperCase() + authLabel.slice(1)}
            style={inputStyle}
            autoFocus
          />
          {editorAuthFailed && <small style={{ color: "#ff8a80" }}>{authLabel === "editor password" ? "Wrong password." : "Wrong key."}</small>}
          <button type="submit" style={pillButtonStyle} disabled={editorAuthPending || !passwordDraft}>
            {editorAuthPending ? "Checking…" : "Unlock editing"}
          </button>
        </form>
      )}
      {editMode && panelOpen && !needsAuth && (
        <div className="seiza-popover" style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", gap: 8, width: "min(360px, calc(100vw - 32px))", maxHeight: "min(620px, calc(100svh - 120px))", overflowY: "auto", boxSizing: "border-box" }}>
          {panelHeader}
          {!connected && (
            <small style={{ color: "#ffb347" }}>
              Not connected to the room server — placing/moving objects won't do anything until you reconnect.
            </small>
          )}
          <small style={{ opacity: 0.8 }}>Click an object to select it, then use Move or Rotate.</small>
          <small style={{ opacity: 0.7 }}>Only upload models you have permission to use. Seiza does not review or take responsibility for user-provided assets.</small>
          {/* Everything that acts on the selected object, in one place.
              Move and Rotate used to sit here while Snap, Delete and
              Deselect sat below the whole spawn list and asset library,
              so adjusting one object meant scrolling down to delete and
              back up to rotate. */}
          {selectedId && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 8,
                borderRadius: 10,
                background: "rgba(232,195,122,0.1)",
                border: "1px solid rgba(232,195,122,0.35)",
              }}
            >
              <strong style={{ fontSize: 12 }}>Selected object</strong>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  style={transformMode === "translate" ? pillButtonActiveStyle : pillButtonStyle}
                  onClick={() => onTransformModeChange("translate")}
                >
                  Move
                </button>
                <button
                  style={transformMode === "rotate" ? pillButtonActiveStyle : pillButtonStyle}
                  onClick={() => onTransformModeChange("rotate")}
                >
                  Rotate
                </button>
                <button style={pillButtonStyle} onClick={onSnapToFloor}>
                  Snap to floor
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button style={pillButtonStyle} onClick={onDeselect}>
                  Deselect
                </button>
                <button
                  style={{ ...pillButtonStyle, borderColor: "rgba(255,138,128,0.5)", color: "#ff8a80" }}
                  disabled={!connected}
                  onClick={onDeleteSelected}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("text")} title="A board to write on">
              <TextBoardIcon /> Board
            </button>
            <button
              style={pillButtonStyle}
              disabled={!connected}
              onClick={() => onSpawn("sign")}
              title="A sign on a post. Raise it onto a wall and the post drops away."
            >
              <SignIcon /> Sign
            </button>
            <button
              style={pillButtonStyle}
              disabled={!connected}
              // Laid flat, which is what makes it a sheet of paper rather
              // than a board (see WorldObjects.tsx).
              onClick={() => onSpawn("text", undefined, -Math.PI / 2)}
              title="A sheet of paper for a desk"
            >
              <TextBoardIcon /> Note
            </button>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("screen")} title="A display to present on">
              <ScreenShareIcon /> Screen
            </button>
            <button
              style={pillButtonStyle}
              disabled={!connected}
              onClick={() => onSpawn("chair")}
              title="A chair anyone can sit on"
            >
              <ChairIcon /> Chair
            </button>
          </div>
          <small style={{ opacity: 0.7 }}>
            Leave edit mode to use them: click a board or note to write on it, a screen to present on it, a chair to
            sit on it.
          </small>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
            <strong>Pictures and video</strong>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              Hang a picture (PNG, JPEG, WebP or GIF)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!connected || assetUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadImage(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <small style={{ opacity: 0.7 }}>
              Resized and re-encoded in your browser before upload, so a photo costs this deployment a few hundred
              kilobytes rather than several megabytes.
            </small>

            <div style={{ display: "flex", gap: 6 }}>
              <input
                placeholder="https://…/clip.mp4"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "6px 8px", fontSize: 13 }}
              />
              <button
                style={pillButtonStyle}
                disabled={!connected || !/^https?:\/\//i.test(videoUrl.trim())}
                onClick={() => {
                  onSpawn("video", videoUrl.trim());
                  setVideoUrl("");
                }}
                title="Place a looping video panel"
              >
                + Video
              </button>
            </div>
            <small style={{ opacity: 0.7 }}>
              Video is placed by link, not uploaded: a clip would take a large share of this deployment's storage, and
              Workers KV serves whole files with no seeking. Use any https URL that serves an MP4 or WebM with CORS
              allowed. Plays muted and looping, and only while someone is nearby.
            </small>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
            <strong>Environment</strong>
            <small style={{ opacity: 0.7 }}>
              {environmentUrl
                ? "A custom environment is active for everyone in this room."
                : "Using this deployment's default environment."}
            </small>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              Replace with a .glb / .gltf world
              <input
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                disabled={!connected || assetUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadEnvironment(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {assets.filter((asset) => asset.kind !== "image").map((asset) => (
                <button
                  key={`env-${asset.id}`}
                  style={{ ...pillButtonStyle, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}
                  disabled={!connected}
                  onClick={() => onSetEnvironment(asset.url)}
                  title={`Use ${asset.name} as the environment`}
                >
                  Use {asset.name}
                </button>
              ))}
              {environmentUrl && (
                <button style={pillButtonStyle} disabled={!connected} onClick={() => onSetEnvironment(null)}>
                  Reset to default
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
            <strong>Skybox</strong>
            <small style={{ opacity: 0.7 }}>
              {skyboxUrl ? "A custom panorama is visible outside the room for everyone." : "Using the built-in sunset sky."}
              {" "}Use a wide 2:1 equirectangular image for the cleanest wrap.
            </small>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              Upload panorama image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={!connected || assetUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadSkybox(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {assets.filter((asset) => asset.kind === "image").map((asset) => (
                <button
                  key={`sky-${asset.id}`}
                  style={{ ...pillButtonStyle, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}
                  disabled={!connected}
                  onClick={() => onSetSkybox(asset.url)}
                  title={`Use ${asset.name} as the skybox`}
                >
                  Use {asset.name}
                </button>
              ))}
              {skyboxUrl && (
                <button style={pillButtonStyle} disabled={!connected} onClick={() => onSetSkybox(null)}>
                  Use sunset
                </button>
              )}
            </div>
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
              {assets.map((asset) => {
                // Older deployments stored models before there was a kind to
                // record, so an absent kind means model.
                const isImage = asset.kind === "image";
                return (
                  <div key={asset.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      style={{ ...pillButtonStyle, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
                      disabled={!connected}
                      onClick={() => onSpawn(isImage ? "image" : "model", asset.url)}
                      title={isImage ? `Hang ${asset.name}` : `Place ${asset.name}`}
                    >
                      {isImage ? "🖼 " : ""}
                      {asset.name}
                    </button>
                    <button style={pillButtonStyle} onClick={() => void deleteAsset(asset)}>Delete</button>
                  </div>
                );
              })}
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
        </div>
      )}
    </div>
  );
}

const headerIconButton: React.CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,0.75)",
  cursor: "pointer",
  flexShrink: 0,
};
