import { useEffect, useRef, useState } from "react";
import type { WorldConfig } from "../config/worldConfig";
import { optimizeVrmAvatar } from "../avatar/optimizeVrm";
import { AvatarPreview } from "./AvatarPreview";
import { ACCENT_COLOR, inputStyle, primaryButtonStyle } from "./styles";

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

// A hand-placed (not random-generated-at-runtime) star field, two depths
// — cheap, no images, no external font/asset loading (this project is
// meant to run entirely on infrastructure the deployer owns; pulling a
// font from a third-party CDN on the one screen every visitor sees first
// would be a strange thing to do in that context).
const STAR_DOTS_FAR = [
  [6, 12], [18, 4], [33, 22], [47, 8], [61, 18], [74, 6], [88, 24], [95, 14],
  [10, 38], [26, 46], [41, 34], [58, 42], [70, 52], [84, 38], [92, 58],
  [14, 66], [29, 74], [45, 62], [63, 70], [77, 80], [90, 68],
  [8, 88], [22, 92], [37, 84], [52, 94], [68, 88], [82, 96], [96, 84],
]
  .map(([x, y]) => `radial-gradient(1px 1px at ${x}% ${y}%, rgba(255,255,255,0.55), transparent 100%)`)
  .join(",");
const STAR_DOTS_NEAR = [
  [12, 20], [44, 10], [67, 30], [83, 15], [24, 55], [58, 60], [90, 45], [36, 85], [72, 78], [15, 95],
]
  .map(([x, y]) => `radial-gradient(1.6px 1.6px at ${x}% ${y}%, rgba(240,210,154,0.85), transparent 100%)`)
  .join(",");

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
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100vw",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        color: "white",
        background: "radial-gradient(120% 100% at 50% 0%, #1b2030 0%, #0c0e16 55%, #060709 100%)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, backgroundImage: STAR_DOTS_FAR, backgroundSize: "100% 100%", opacity: 0.9 }}
      />
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, backgroundImage: STAR_DOTS_NEAR, backgroundSize: "100% 100%" }}
      />

      <form
        onSubmit={handleSubmit}
        style={{
          position: "relative",
          display: "flex",
          flexWrap: "wrap",
          gap: 28,
          width: "min(760px, 92vw)",
          padding: "28px 32px",
          background: "rgba(16,17,24,0.72)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ flex: "1 1 260px", minWidth: 260, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: ACCENT_COLOR, opacity: 0.85 }}>
              Seiza · 星座
            </div>
            <h1 style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em" }}>{world.displayName}</h1>
            <div style={{ width: 40, height: 2, marginTop: 10, background: `linear-gradient(90deg, ${ACCENT_COLOR}, transparent)` }} />
          </div>
          <AvatarPreview url={previewUrl ?? world.defaultAvatarUrl} />
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 260, display: "flex", flexDirection: "column", gap: 14, alignSelf: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, opacity: 0.85 }}>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={32}
              required
              style={inputStyle}
            />
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
                border: `1px dashed ${dragActive ? ACCENT_COLOR : "rgba(255,255,255,0.2)"}`,
                borderRadius: 10,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: dragActive ? "rgba(232,195,122,0.06)" : "transparent",
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, opacity: 0.85 }}>
                Avatar (.vrm, optional — drag a file here or browse)
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".vrm"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  style={{ fontSize: 12 }}
                />
              </label>
              {file && (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.8 }}>
                  <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} />
                  Optimize file size before uploading (skipped automatically if it wouldn't help)
                </label>
              )}
            </div>
          )}

          {file && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, opacity: 0.85 }}>
              <input type="checkbox" checked={rightsConfirmed} onChange={(e) => setRightsConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                I have the rights to use and share this avatar file. It will be visible to everyone in this room —
                this deployment's maintainer does not curate or license-check uploaded avatars.
              </span>
            </label>
          )}

          {statusMessage && <p style={{ opacity: 0.7, margin: 0, fontSize: 12 }}>{statusMessage}</p>}
          {error && <p style={{ color: "#ff8a80", margin: 0, fontSize: 12 }}>{error}</p>}

          <button type="submit" style={primaryButtonStyle} disabled={!canSubmit}>
            {uploading ? "Joining…" : "Enter world"}
          </button>
        </div>
      </form>
    </div>
  );
}
