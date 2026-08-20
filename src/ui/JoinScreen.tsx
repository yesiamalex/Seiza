import { useEffect, useRef, useState } from "react";
import type { WorldConfig } from "../config/worldConfig";
import { optimizeVrmAvatar } from "../avatar/optimizeVrm";
import { AvatarPreview } from "./AvatarPreview";
import { pillButtonStyle } from "./styles";

interface JoinScreenProps {
  world: WorldConfig;
  onJoin: (displayName: string, avatarUrl: string) => void;
}

// Keep in sync with worker/index.ts's MAX_AVATAR_BYTES (KV's per-value
// limit is 25 MiB — staying under it with headroom, not at the edge).
const MAX_AVATAR_BYTES = 20 * 1024 * 1024;
// Files up to this size are still accepted at pick-time even though
// they're over MAX_AVATAR_BYTES, on the chance optimization shrinks them
// under the real limit — re-checked for real right before upload.
const PICK_TIME_CEILING_BYTES = 60 * 1024 * 1024;

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Pre-join gate: pick a display name, preview and optionally optimize an
 * open-source/self-authored .vrm, and (if the deployment allows it —
 * world.allowAvatarUpload) upload it to use for this session instead of
 * the deployment's default avatar. The upload goes to worker/index.ts's
 * KV-backed /api/avatars endpoint — other players need a URL they can
 * actually fetch, so this can't be a client-only blob: URL for anyone
 * but you; the local preview below *does* use a blob: URL since it never
 * leaves your browser.
 */
export function JoinScreen({ world, onJoin }: JoinScreenProps) {
  const [displayName, setDisplayName] = useState(() => `guest-${Math.random().toString(36).slice(2, 7)}`);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [optimize, setOptimize] = useState(true);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const allowUpload = world.allowAvatarUpload !== false;
  const canSubmit = displayName.trim().length > 0 && (!file || rightsConfirmed) && !uploading;

  // The preview needs an object URL for the picked file (or, with no
  // file picked, the deployment's own default avatar) — created/revoked
  // here rather than inline in JSX so it's cleaned up on every change,
  // not just unmount.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    if (!file) {
      onJoin(displayName.trim(), world.defaultAvatarUrl);
      return;
    }

    setUploading(true);
    try {
      let uploadFile: Blob = file;
      if (optimize) {
        setStatusMessage("Optimizing avatar…");
        const result = await optimizeVrmAvatar(file);
        uploadFile = result.blob;
        setStatusMessage(
          result.applied
            ? `Optimized: ${formatMB(result.originalBytes)} → ${formatMB(result.optimizedBytes)}`
            : (result.reason ?? null)
        );
      }

      if (uploadFile.size > MAX_AVATAR_BYTES) {
        throw new Error(`File is too large even after optimization (max ${formatMB(MAX_AVATAR_BYTES)}).`);
      }

      setStatusMessage((prev) => prev ?? "Uploading…");
      const res = await fetch("/api/avatars", { method: "POST", body: uploadFile });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      onJoin(displayName.trim(), url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatusMessage(null);
    } finally {
      setUploading(false);
    }
  }

  function pickFile(picked: File | null) {
    setError(null);
    setStatusMessage(null);
    if (picked && picked.size > PICK_TIME_CEILING_BYTES) {
      setError(`That file is too large (max ${formatMB(PICK_TIME_CEILING_BYTES)}).`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(picked);
    setRightsConfirmed(false);
  }

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        width: "100vw",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        background: "#111",
        color: "white",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: 380,
          padding: 24,
          background: "#1c1c1c",
          borderRadius: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>{world.displayName}</h1>

        <AvatarPreview url={previewUrl ?? world.defaultAvatarUrl} />

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} required />
        </label>

        {allowUpload && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            style={{
              border: `1px dashed ${dragActive ? "#7CFF9E" : "rgba(255,255,255,0.3)"}`,
              borderRadius: 8,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Avatar (.vrm, optional — uses the default if skipped, or drag a file here)
              <input
                ref={fileInputRef}
                type="file"
                accept=".vrm"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} />
                Optimize file size before uploading (shrinks large textures; skipped automatically if it wouldn't help)
              </label>
            )}
          </div>
        )}

        {file && (
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input type="checkbox" checked={rightsConfirmed} onChange={(e) => setRightsConfirmed(e.target.checked)} />
            <span>
              I have the rights to use and share this avatar file. It will be visible to everyone in this room —
              this deployment's maintainer does not curate or license-check uploaded avatars.
            </span>
          </label>
        )}

        {statusMessage && <p style={{ opacity: 0.75, margin: 0, fontSize: 13 }}>{statusMessage}</p>}
        {error && <p style={{ color: "#ff6b6b", margin: 0 }}>{error}</p>}

        <button type="submit" style={pillButtonStyle} disabled={!canSubmit}>
          {uploading ? "Joining…" : "Enter world"}
        </button>
      </form>
    </div>
  );
}
