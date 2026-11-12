import { useEffect, useState } from "react";
import type { WorldObject } from "../multiplayer/types";
import { optimizeVrmAvatar } from "../avatar/optimizeVrm";
import { compressImage } from "./compressImage";
import { editAuthHeaders } from "./editAuth";
import { SkyControls } from "./SkyControls";
import { L, useLang } from "../i18n/lang";
import type { RoomSky } from "../multiplayer/types";
import type { SkyConfig } from "../sky/skyState";
import { BAR_LABEL_CLASS, barButtonActiveStyle, barButtonStyle, inputStyle, panelStyle, pillButtonActiveStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { BedIcon, ChairIcon, CloseIcon, EditIcon, MinimizeIcon, ScreenShareIcon, SignIcon, TextBoardIcon } from "../ui/icons";

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
  /** The selected object, when it's a picture: its link can be set here. */
  selectedImage?: WorldObject | null;
  onSetLink?: (id: string, link: string) => void;
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
  /** world.json's sky, which a cleared room sky goes back to. */
  worldSky?: SkyConfig;
  roomSky: RoomSky | null;
  onSetRoomSky: (sky: RoomSky | null) => void;
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
  selectedImage,
  onSetLink,
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
  worldSky,
  roomSky,
  onSetRoomSky,
  panelOpen,
  onMinimize,
  onExit,
}: EditToolbarProps) {
  useLang();
  const authName = authLabel === "admin key" ? L("admin key", "管理キー") : L("editor password", "編集パスワード");
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
        if (!response.ok) throw new Error(result.error ?? `${L("Asset library failed to load", "アセットライブラリを読み込めませんでした")} (${response.status}).`);
        if (!cancelled) setAssets(result.assets ?? []);
      })
      .catch((error) => {
        if (!cancelled) setAssetMessage(error instanceof Error ? error.message : L("Asset library failed to load.", "アセットライブラリを読み込めませんでした。"));
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
      throw new Error(L("Choose a .glb or .gltf model.", ".glb か .gltf のモデルを選んでください。"));
    }
    if (file.size > 60 * 1024 * 1024) {
      throw new Error(L("That model is over 60MB. Choose a smaller export.", "モデルが60MBを超えています。もっと小さく書き出してください。"));
    }
    let body: Blob = file;
    if (optimizeAsset && extension === "glb" && file.size > 8 * 1024 * 1024) {
      const result = await optimizeVrmAvatar(file);
      body = result.blob;
      if (!result.applied) setAssetMessage(result.reason ?? L("Optimization was skipped; uploading the original.", "最適化をスキップし、元のファイルをアップロードします。"));
    }
    if (body.size > 24 * 1024 * 1024) {
      throw new Error(L("This model is over the 24MB deployment limit, even after optimization.", "最適化してもモデルが24MBの上限を超えています。"));
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
    if (!response.ok || !result.id || !result.url) throw new Error(result.error ?? `${L("Upload failed", "アップロードに失敗しました")} (${response.status}).`);
    return { id: result.id, url: result.url, name: result.name ?? file.name };
  }

  async function uploadAsset(file: File) {
    setAssetMessage(null);
    setAssetUploading(true);
    try {
      const asset = await postAsset(file);
      setAssets((previous) => [...previous, asset]);
      onSpawn("model", asset.url);
      setAssetMessage(L(`${asset.name} uploaded and placed.`, `${asset.name} をアップロードして配置しました。`));
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : L("Model upload failed.", "モデルのアップロードに失敗しました。"));
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
      if (!response.ok || !result.id || !result.url) throw new Error(result.error ?? `${L("Upload failed", "アップロードに失敗しました")} (${response.status}).`);
      const asset = { id: result.id, url: result.url, name: result.name ?? compressed.name, kind: "image" as const };
      setAssets((previous) => [...previous, asset]);
      onSpawn("image", asset.url);
      const kb = Math.max(1, Math.round(compressed.blob.size / 1024));
      setAssetMessage(L(`${asset.name} uploaded and placed (${kb}KB after compression).`, `${asset.name} をアップロードして配置しました(圧縮後 ${kb}KB)。`));
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : L("Image upload failed.", "画像のアップロードに失敗しました。"));
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
      setAssetMessage(L(`${asset.name} is now this room's environment for everyone.`, `${asset.name} がこの部屋の全員の環境になりました。`));
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : L("Environment upload failed.", "環境のアップロードに失敗しました。"));
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
      if (!response.ok || !result.id || !result.url) throw new Error(result.error ?? `${L("Upload failed", "アップロードに失敗しました")} (${response.status}).`);
      const asset = { id: result.id, url: result.url, name: result.name ?? compressed.name, kind: "image" as const };
      setAssets((previous) => [...previous, asset]);
      onSetSkybox(asset.url);
      setAssetMessage(L(`${asset.name} is now the room skybox for everyone.`, `${asset.name} がこの部屋の全員のスカイボックスになりました。`));
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : L("Skybox upload failed.", "スカイボックスのアップロードに失敗しました。"));
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
      setAssetMessage(L("The asset could not be deleted.", "アセットを削除できませんでした。"));
      return;
    }
    setAssets((previous) => previous.filter((item) => item.id !== asset.id));
  }

  const minimised = editMode && !panelOpen;
  const buttonLabel = minimised ? L("Show edit tools (still editing)", "編集ツールを表示(編集中)") : editMode ? L("Exit edit mode", "編集モードを終了") : L("Edit world", "ワールドを編集");
  /** Title, minimise and close, at the top of whichever panel is showing. */
  const panelHeader = (
    <div style={{ display: "flex", alignItems: "center", gap: 4, margin: "-2px -4px 2px 0" }}>
      <strong style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
        <EditIcon size={15} /> {L("Edit world", "ワールドを編集")}
      </strong>
      <button type="button" className="seiza-icon-btn" style={headerIconButton} onClick={onMinimize} aria-label={L("Minimise, keep editing", "最小化(編集は続ける)")} title={L("Minimise, keep editing", "最小化(編集は続ける)")}>
        <MinimizeIcon size={16} />
      </button>
      <button type="button" className="seiza-icon-btn" style={headerIconButton} onClick={onExit} aria-label={L("Close edit mode", "編集モードを閉じる")} title={L("Close edit mode", "編集モードを閉じる")}>
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
        <span className={BAR_LABEL_CLASS}>{minimised ? L("Editing", "編集中") : editMode ? L("Done", "完了") : L("Edit", "編集")}</span>
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
          <small style={{ opacity: 0.8 }}>{L(`This world requires ${authLabel === "editor password" ? "an" : "the"} ${authName}.`, `このワールドの編集には${authName}が必要です。`)}</small>
          <input
            type="password"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder={authName[0].toUpperCase() + authName.slice(1)}
            style={inputStyle}
            autoFocus
          />
          {editorAuthFailed && <small style={{ color: "#ff8a80" }}>{authLabel === "editor password" ? L("Wrong password.", "パスワードが違います。") : L("Wrong key.", "キーが違います。")}</small>}
          <button type="submit" style={pillButtonStyle} disabled={editorAuthPending || !passwordDraft}>
            {editorAuthPending ? L("Checking…", "確認中…") : L("Unlock editing", "編集を解除")}
          </button>
        </form>
      )}
      {editMode && panelOpen && !needsAuth && (
        <div className="seiza-popover" style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", gap: 8, width: "min(360px, calc(100vw - 32px))", maxHeight: "min(620px, calc(100svh - 120px))", overflowY: "auto", boxSizing: "border-box" }}>
          {panelHeader}
          {!connected && (
            <small style={{ color: "#ffb347" }}>
              {L("Not connected to the room server — placing/moving objects won't do anything until you reconnect.", "ルームサーバーに接続していません。再接続するまで、オブジェクトの配置や移動は反映されません。")}
            </small>
          )}
          <small style={{ opacity: 0.8 }}>{L("Click an object to select it, then use Move or Rotate.", "オブジェクトをクリックして選び、「移動」か「回転」を使います。")}</small>
          <small style={{ opacity: 0.7 }}>{L("Only upload models you have permission to use. Seiza does not review or take responsibility for user-provided assets.", "使用許可のあるモデルだけをアップロードしてください。Seizaはユーザーが提供したアセットを審査せず、責任も負いません。")}</small>
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
              <strong style={{ fontSize: 12 }}>{L("Selected object", "選択中のオブジェクト")}</strong>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  style={transformMode === "translate" ? pillButtonActiveStyle : pillButtonStyle}
                  onClick={() => onTransformModeChange("translate")}
                >
                  {L("Move", "移動")}
                </button>
                <button
                  style={transformMode === "rotate" ? pillButtonActiveStyle : pillButtonStyle}
                  onClick={() => onTransformModeChange("rotate")}
                >
                  {L("Rotate", "回転")}
                </button>
                <button style={pillButtonStyle} onClick={onSnapToFloor}>
                  {L("Snap to floor", "床に合わせる")}
                </button>
              </div>
              {selectedImage && onSetLink && <ImageLinkField key={selectedImage.id} image={selectedImage} connected={connected} onSetLink={onSetLink} />}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button style={pillButtonStyle} onClick={onDeselect}>
                  {L("Deselect", "選択解除")}
                </button>
                <button
                  style={{ ...pillButtonStyle, borderColor: "rgba(255,138,128,0.5)", color: "#ff8a80" }}
                  disabled={!connected}
                  onClick={onDeleteSelected}
                >
                  {L("Delete", "削除")}
                </button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("box")}>
              {L("+ Box", "+ 箱")}
            </button>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("sphere")}>
              {L("+ Sphere", "+ 球")}
            </button>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("cylinder")}>
              {L("+ Cylinder", "+ 円柱")}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("text")} title={L("A board to write on", "書き込めるボード")}>
              <TextBoardIcon /> {L("Board", "ボード")}
            </button>
            <button
              style={pillButtonStyle}
              disabled={!connected}
              onClick={() => onSpawn("sign")}
              title={L("A sign on a post. Raise it onto a wall and the post drops away.", "支柱つきの看板。壁まで上げると支柱が消えます。")}
            >
              <SignIcon /> {L("Sign", "看板")}
            </button>
            <button
              style={pillButtonStyle}
              disabled={!connected}
              // Laid flat, which is what makes it a sheet of paper rather
              // than a board (see WorldObjects.tsx).
              onClick={() => onSpawn("text", undefined, -Math.PI / 2)}
              title={L("A sheet of paper for a desk", "机に置く紙")}
            >
              <TextBoardIcon /> {L("Note", "メモ")}
            </button>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("screen")} title={L("A display to present on", "発表用のディスプレイ")}>
              <ScreenShareIcon /> {L("Screen", "スクリーン")}
            </button>
            <button
              style={pillButtonStyle}
              disabled={!connected}
              onClick={() => onSpawn("chair")}
              title={L("A chair anyone can sit on", "誰でも座れる椅子")}
            >
              <ChairIcon /> {L("Chair", "椅子")}
            </button>
            <button style={pillButtonStyle} disabled={!connected} onClick={() => onSpawn("bed")} title={L("A bed anyone can lie down on", "誰でも横になれるベッド")}>
              <BedIcon /> {L("Bed", "ベッド")}
            </button>
          </div>
          <small style={{ opacity: 0.7 }}>
            {L(
              "Leave edit mode to use them: click a board or note to write on it, a screen to present on it, a chair to sit on it, a bed to lie down on it.",
              "使うときは編集モードを終えます。ボードやメモをクリックすると書き込み、スクリーンで発表、椅子に座り、ベッドで横になれます。"
            )}
          </small>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
            <strong>{L("Pictures and video", "写真と動画")}</strong>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {L("Hang a picture (PNG, JPEG, WebP or GIF)", "写真を飾る(PNG、JPEG、WebP、GIF)")}
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
              {L(
                "Resized and re-encoded in your browser before upload, so a photo costs this deployment a few hundred kilobytes rather than several megabytes.",
                "アップロード前にブラウザで縮小・再エンコードするので、写真1枚は数MBではなく数百KBで済みます。"
              )}
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
                title={L("Place a looping video panel", "ループ再生する動画パネルを置く")}
              >
                {L("+ Video", "+ 動画")}
              </button>
            </div>
            <small style={{ opacity: 0.7 }}>
              {L(
                "Video is placed by link, not uploaded: a clip would take a large share of this deployment's storage, and Workers KV serves whole files with no seeking. Use any https URL that serves an MP4 or WebM with CORS allowed. Plays muted and looping, and only while someone is nearby.",
                "動画はアップロードせずリンクで置きます。動画はストレージを大きく使い、Workers KVはシークなしでファイル全体を送るためです。CORSが許可されたMP4かWebMのhttps URLを使ってください。消音・ループで、近くに人がいるときだけ再生されます。"
              )}
            </small>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
            <strong>{L("Environment", "環境")}</strong>
            <small style={{ opacity: 0.7 }}>
              {environmentUrl
                ? L("A custom environment is active for everyone in this room.", "この部屋の全員にカスタム環境が適用されています。")
                : L("Using this deployment's default environment.", "このデプロイの標準の環境を使っています。")}
            </small>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {L("Replace with a .glb / .gltf world", ".glb / .gltf のワールドに置き換える")}
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
                  title={L(`Use ${asset.name} as the environment`, `${asset.name} を環境にする`)}
                >
                  {L(`Use ${asset.name}`, `${asset.name} を使う`)}
                </button>
              ))}
              {environmentUrl && (
                <button style={pillButtonStyle} disabled={!connected} onClick={() => onSetEnvironment(null)}>
                  {L("Reset to default", "標準に戻す")}
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
            <strong>{L("Skybox", "スカイボックス")}</strong>
            <small style={{ opacity: 0.7 }}>
              {skyboxUrl
                ? L("A custom panorama is visible outside the room for everyone.", "部屋の外に、全員にカスタムのパノラマが見えています。")
                : L("Using the built-in sunset sky.", "標準の夕焼け空を使っています。")}
              {L(" Use a wide 2:1 equirectangular image for the cleanest wrap.", "きれいに包むには、横長2:1の正距円筒図法の画像を使ってください。")}
            </small>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {L("Upload panorama image", "パノラマ画像をアップロード")}
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
                  title={L(`Use ${asset.name} as the skybox`, `${asset.name} をスカイボックスにする`)}
                >
                  {L(`Use ${asset.name}`, `${asset.name} を使う`)}
                </button>
              ))}
              {skyboxUrl && (
                <button style={pillButtonStyle} disabled={!connected} onClick={() => onSetSkybox(null)}>
                  {L("Use sunset", "夕焼けに戻す")}
                </button>
              )}
            </div>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {L("Upload model (.glb or .gltf, max 24MB)", "モデルをアップロード(.glb か .gltf、最大24MB)")}
            <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" disabled={!connected || assetUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); event.currentTarget.value = ""; }} />
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.8 }}>
            <input type="checkbox" checked={optimizeAsset} onChange={(event) => setOptimizeAsset(event.target.checked)} />
            {L("Optimize large binary models before upload", "大きなバイナリモデルはアップロード前に最適化する")}
          </label>
          {assetMessage && <small style={{ color: /uploaded|アップロードして/.test(assetMessage) ? "#7CFF9E" : "#ffb347" }}>{assetMessage}</small>}
          {assets.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
              <strong>{L("Deployment asset library", "デプロイのアセットライブラリ")}</strong>
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
                      title={isImage ? L(`Hang ${asset.name}`, `${asset.name} を飾る`) : L(`Place ${asset.name}`, `${asset.name} を置く`)}
                    >
                      {isImage ? "🖼 " : ""}
                      {asset.name}
                    </button>
                    <button style={pillButtonStyle} onClick={() => void deleteAsset(asset)}>{L("Delete", "削除")}</button>
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
              {L("+ Model", "+ モデル")}
            </button>
          </div>
          <SkyControls
            worldSky={worldSky}
            roomSky={roomSky}
            onSetRoomSky={onSetRoomSky}
            connected={connected}
            skyboxInUse={skyboxUrl !== null}
          />
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

/**
 * A picture's link: anyone who opens the picture can follow it. https
 * only; the room server refuses anything else (worker/room.ts,
 * sanitizeLink), so a refused link simply doesn't appear.
 */
function ImageLinkField({ image, connected, onSetLink }: { image: WorldObject; connected: boolean; onSetLink: (id: string, link: string) => void }) {
  const [value, setValue] = useState(image.link ?? "");
  const valid = value.trim() === "" || /^https:\/\/[^\s]+$/.test(value.trim());
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSetLink(image.id, value.trim());
      }}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <label style={{ fontSize: 12, opacity: 0.85 }} htmlFor="seiza-image-link">
        {L("Link (optional): opens from the picture", "リンク(任意):写真から開けます")}
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          id="seiza-image-link"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://…"
          maxLength={2000}
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
        <button type="submit" style={pillButtonStyle} disabled={!connected || !valid || value.trim() === (image.link ?? "")}>
          {value.trim() ? L("Save", "保存") : L("Remove", "削除")}
        </button>
      </div>
      {!valid && <small style={{ color: "#ff8a80" }}>{L("Use a full https:// address.", "https:// から始まる完全なアドレスを入力してください。")}</small>}
    </form>
  );
}
