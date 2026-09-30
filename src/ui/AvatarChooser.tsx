import { useEffect, useRef, useState } from "react";
import type { WorldConfig } from "../config/worldConfig";
import { optimizeVrmAvatar } from "../avatar/optimizeVrm";
import { validateVrmFile } from "../avatar/validateVrm";
import { AvatarDesignerDialog } from "../avatar/designer/AvatarDesigner";
import { AVATAR_DESIGN_PRESETS, DEFAULT_AVATAR_SPEC, encodeAvatarSpec } from "../avatar/designer/avatarSpec";
import { saveUploadedAvatarFile, uploadAvatarFile, type StoredAvatarChoice } from "../profile/profileStore";
import { AvatarPicker } from "./AvatarPicker";
import { AvatarPreview } from "./AvatarPreview";
import { ACCENT_COLOR, pillButtonActiveStyle, pillButtonStyle, primaryButtonStyle } from "./styles";

// KV's real ceiling is 25 MiB per value, so this is a hard block. Keep in
// sync with MAX_AVATAR_BYTES in worker/index.ts.
const HARD_MAX_AVATAR_BYTES = 24 * 1024 * 1024;
// Above this, optimization can't realistically get under the hard limit,
// so the file is rejected when picked instead of after a long wait.
const PICK_TIME_CEILING_BYTES = 60 * 1024 * 1024;
// Allowed, with a heads-up: everyone in the room downloads your avatar.
const LARGE_FILE_WARNING_BYTES = 8 * 1024 * 1024;

const formatMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

export interface AvatarSelection {
  choice: StoredAvatarChoice;
  /** What other players load. */
  url: string;
  /** What this browser renders for you, when a local copy exists (an
   *  uploaded file kept in IndexedDB). Faster, and works offline. */
  localUrl: string | null;
}

export function avatarUrlForChoice(choice: StoredAvatarChoice): string {
  switch (choice.kind) {
    case "designer":
      return encodeAvatarSpec(choice.spec);
    case "preset":
      return choice.url;
    case "upload":
      return choice.remoteUrl;
    default:
      return encodeAvatarSpec(DEFAULT_AVATAR_SPEC);
  }
}

/** First-visit avatar: the deployer's configured default if there is one,
 *  otherwise the designer's default look. Never an empty placeholder. */
export function initialAvatarChoice(world: WorldConfig): StoredAvatarChoice {
  return world.defaultAvatarUrl ? { kind: "preset", url: world.defaultAvatarUrl } : { kind: "designer", spec: DEFAULT_AVATAR_SPEC };
}

type Tab = "design" | "presets" | "upload";

interface AvatarChooserProps {
  world: WorldConfig;
  value: StoredAvatarChoice;
  onChange: (selection: AvatarSelection) => void;
  /** Keep uploaded files in this browser (the "remember me" setting). */
  rememberLocally: boolean;
  /** Called with a blob: URL while a picked file awaits upload, so the
   *  join screen's big preview can show it. Without this, the chooser
   *  shows its own small preview. */
  onStagedPreview?: (url: string | null) => void;
}

/**
 * The three ways to get an avatar, shared by the join screen and the
 * in-world avatar menu so both behave identically:
 *
 * - Design: the built-in designer and its presets. No files involved.
 * - Presets: the deployment's own .vrm files (world.json defaultAvatars).
 * - Upload VRM: your own file, optimized when that helps, uploaded to this
 *   deployment so others can load it, and kept locally when remembered.
 */
export function AvatarChooser({ world, value, onChange, rememberLocally, onStagedPreview }: AvatarChooserProps) {
  const presets = world.defaultAvatars ?? [];
  const allowUpload = world.allowAvatarUpload !== false;
  const [tab, setTab] = useState<Tab>(() =>
    value.kind === "upload" && allowUpload ? "upload" : value.kind === "preset" && presets.length ? "presets" : "design"
  );
  const [designerOpen, setDesignerOpen] = useState(false);

  const tabs: { id: Tab; label: string }[] = [
    { id: "design", label: "Design" },
    ...(presets.length ? [{ id: "presets" as const, label: "Presets" }] : []),
    ...(allowUpload ? [{ id: "upload" as const, label: "Upload VRM" }] : []),
  ];

  const designerSpec = value.kind === "designer" ? value.spec : DEFAULT_AVATAR_SPEC;
  const selectDesign = (choice: StoredAvatarChoice) => onChange({ choice, url: avatarUrlForChoice(choice), localUrl: null });

  // The join screen renders its own full-height preview of the staged
  // avatar and passes onStagedPreview to drive it; the in-world menu has
  // no such thing, and used to show nothing at all about what you were
  // currently wearing — a filename, and only for uploads. Opening your
  // own avatar panel and not being shown your own avatar is the gap this
  // closes, so the preview appears exactly where that other one doesn't.
  const showCurrent = !onStagedPreview;
  const currentUrl = avatarUrlForChoice(value);
  const currentLabel =
    value.kind === "upload" ? value.fileName : value.kind === "preset" ? "A preset from this deployment" : "Designed in the browser";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      {showCurrent && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {/* Keyed on the URL so switching avatars tears the old VRM down
              rather than swapping a prop under a live scene. */}
          <AvatarPreview key={currentUrl} url={currentUrl} height="clamp(150px, 26svh, 230px)" />
          <small style={{ opacity: 0.7, display: "flex", gap: 5, minWidth: 0 }}>
            <span style={{ opacity: 0.7, flexShrink: 0 }}>Wearing now:</span>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{currentLabel}</strong>
          </small>
        </div>
      )}

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Avatar source" style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: "rgba(255,255,255,0.05)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                border: 0,
                borderRadius: 8,
                padding: "7px 8px",
                fontSize: 12,
                fontFamily: "inherit",
                cursor: "pointer",
                color: "white",
                background: tab === t.id ? "rgba(232,195,122,0.2)" : "transparent",
                boxShadow: tab === t.id ? `inset 0 0 0 1px rgba(232,195,122,0.55)` : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "design" && (
        // `key` on each panel restarts the cross-fade every time the tab
        // changes; React would otherwise reuse the element and skip it.
        <div key="design" className="seiza-tabpanel" role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {AVATAR_DESIGN_PRESETS.map((preset) => {
              const active = value.kind === "designer" && JSON.stringify(value.spec) === JSON.stringify(preset.spec);
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  style={{ ...(active ? pillButtonActiveStyle : pillButtonStyle), padding: "7px 12px", fontSize: 12 }}
                  onClick={() => selectDesign({ kind: "designer", spec: preset.spec })}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <button type="button" style={{ ...primaryButtonStyle, padding: "9px 14px", fontSize: 13 }} onClick={() => setDesignerOpen(true)}>
            {value.kind === "designer" ? "Customize this look" : "Design an avatar"}
          </button>
          <small style={{ opacity: 0.6 }}>Made in your browser. Nothing is uploaded, and it works with every gesture.</small>
          {designerOpen && (
            <AvatarDesignerDialog
              initial={designerSpec}
              onCancel={() => setDesignerOpen(false)}
              onSave={(spec) => {
                setDesignerOpen(false);
                selectDesign({ kind: "designer", spec });
              }}
            />
          )}
        </div>
      )}

      {tab === "presets" && (
        <div key="presets" className="seiza-tabpanel" role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AvatarPicker
            presets={presets}
            selectedUrl={value.kind === "preset" ? value.url : null}
            onSelect={(url) => selectDesign({ kind: "preset", url })}
          />
          <small style={{ opacity: 0.6 }}>Provided by this deployment.</small>
        </div>
      )}

      {tab === "upload" && allowUpload && (
        <UploadPanel
          worldId={world.id}
          current={value.kind === "upload" ? value : null}
          rememberLocally={rememberLocally}
          onStagedPreview={onStagedPreview}
          onUploaded={onChange}
        />
      )}
    </div>
  );
}

function UploadPanel({
  worldId,
  current,
  rememberLocally,
  onStagedPreview,
  onUploaded,
}: {
  worldId: string;
  current: Extract<StoredAvatarChoice, { kind: "upload" }> | null;
  rememberLocally: boolean;
  onStagedPreview?: (url: string | null) => void;
  onUploaded: (selection: AvatarSelection) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  const [optimize, setOptimize] = useState(true);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onStagedPreviewRef = useRef(onStagedPreview);
  onStagedPreviewRef.current = onStagedPreview;

  useEffect(() => {
    if (!file) {
      setStagedUrl(null);
      onStagedPreviewRef.current?.(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setStagedUrl(url);
    onStagedPreviewRef.current?.(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Leaving the tab mid-pick shouldn't leave the join preview stuck on a
  // file that will never be used.
  useEffect(() => () => onStagedPreviewRef.current?.(null), []);

  function pick(picked: File | null) {
    setError(null);
    setWarning(null);
    setStatus(null);
    setRightsConfirmed(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!picked) return setFile(null);
    if (!picked.name.toLowerCase().endsWith(".vrm")) {
      setFile(null);
      return setError("Choose a .vrm file.");
    }
    if (picked.size > PICK_TIME_CEILING_BYTES) {
      setFile(null);
      return setError(`That file is too large (max ${formatMB(PICK_TIME_CEILING_BYTES)}, even before optimization).`);
    }
    if (picked.size > HARD_MAX_AVATAR_BYTES) {
      setWarning(`This is ${formatMB(picked.size)}, over the ${formatMB(HARD_MAX_AVATAR_BYTES)} limit. Optimization has to shrink it first, so keep "Optimize" on.`);
    } else if (picked.size > LARGE_FILE_WARNING_BYTES) {
      setWarning(`${formatMB(picked.size)} is a large avatar. It will take everyone in the room longer to load.`);
    }
    setFile(picked);
  }

  async function upload() {
    if (!file || !rightsConfirmed) return;
    setBusy(true);
    setError(null);
    try {
      let blob: Blob = file;
      if (optimize) {
        setStatus("Optimizing…");
        const result = await optimizeVrmAvatar(file);
        blob = result.blob;
        setStatus(result.applied ? `Optimized ${formatMB(result.originalBytes)} to ${formatMB(result.optimizedBytes)}.` : (result.reason ?? null));
      }
      if (blob.size > HARD_MAX_AVATAR_BYTES) {
        throw new Error(`Still too large after optimization (max ${formatMB(HARD_MAX_AVATAR_BYTES)}, a Cloudflare KV limit).`);
      }

      // Parse it before anyone else has to. A file that fails here would
      // otherwise upload cleanly and then break for every person in the
      // room — see validateVrm.ts.
      setStatus("Checking the model…");
      const validation = await validateVrmFile(blob);
      if (!validation.ok) {
        setWarning(null);
        throw new Error(validation.reason);
      }
      setWarning(validation.warnings.length > 0 ? validation.warnings.join(" ") : null);

      setStatus("Uploading…");
      const url = await uploadAvatarFile(blob);
      if (rememberLocally) await saveUploadedAvatarFile(worldId, blob, file.name);
      onUploaded({
        choice: { kind: "upload", remoteUrl: url, fileName: file.name },
        url,
        localUrl: URL.createObjectURL(blob),
      });
      setStatus(`Using ${file.name}.`);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div key="upload" className="seiza-tabpanel" role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {current && !file && (
        <small style={{ opacity: 0.75 }}>
          Current: <strong>{current.fileName}</strong>
        </small>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        style={{
          border: `1px dashed ${dragActive ? ACCENT_COLOR : "rgba(255,255,255,0.22)"}`,
          borderRadius: 10,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: dragActive ? "rgba(232,195,122,0.06)" : "transparent",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, opacity: 0.85 }}>
          Drop a .vrm here or browse
          <input ref={inputRef} type="file" accept=".vrm" disabled={busy} onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ fontSize: 12, maxWidth: "100%" }} />
        </label>
      </div>

      {file && !onStagedPreview && stagedUrl && <AvatarPreview url={stagedUrl} height="clamp(180px, 30svh, 260px)" />}

      {file && (
        <>
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, opacity: 0.85 }}>
            <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} disabled={busy} />
            <span>Optimize file size first (skipped automatically when it wouldn't help)</span>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, opacity: 0.85 }}>
            <input type="checkbox" checked={rightsConfirmed} onChange={(e) => setRightsConfirmed(e.target.checked)} disabled={busy} />
            <span>I have the rights to use and share this avatar. Everyone in this room will see it, and this deployment does not license-check uploads.</span>
          </label>
          <button type="button" style={{ ...primaryButtonStyle, padding: "9px 14px", fontSize: 13, opacity: rightsConfirmed && !busy ? 1 : 0.55 }} disabled={!rightsConfirmed || busy} onClick={() => void upload()}>
            {busy ? "Working…" : "Upload and use"}
          </button>
        </>
      )}

      {warning && <small style={{ color: "#f2c14e" }}>{warning}</small>}
      {status && <small style={{ opacity: 0.7 }}>{status}</small>}
      {error && <small style={{ color: "#ff8a80" }}>{error}</small>}
      <small style={{ opacity: 0.55 }}>VRM 0.x and 1.0 both work. Gestures retarget onto the VRM humanoid rig automatically.</small>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
        <small style={{ opacity: 0.75 }}>
          Don't have one?{" "}
          <a href="https://vroid.com/en/studio" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT_COLOR }}>
            VRoid Studio
          </a>{" "}
          is a free VRM maker, and{" "}
          <a href="https://hub.vroid.com/en" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT_COLOR }}>
            VRoid Hub
          </a>{" "}
          hosts models from other people.
        </small>
        {/* Deliberately a plain responsibility notice and not a "DMCA
            policy": a real safe harbour has statutory prerequisites (a
            designated agent, a published takedown process, a
            repeat-infringer policy) that a paragraph in a React component
            does not satisfy, and implying otherwise would mislead whoever
            deploys this. Say what is true, and point at real advice. */}
        <small style={{ opacity: 0.55 }}>
          Check each model's licence before using it here — many VRoid Hub models restrict redistribution, modification, or
          commercial use, and uploading one puts a copy on this deployment for everyone in the room to download. You are
          responsible for what you upload; this deployment does not licence-check uploads, and its maintainers accept no
          liability for infringing ones. Not legal advice — if this is going somewhere commercial, get some.
        </small>
      </div>
    </div>
  );
}
