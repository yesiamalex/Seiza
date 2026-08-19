import { useRef, useState } from "react";
import type { WorldConfig } from "../config/worldConfig";

interface JoinScreenProps {
  world: WorldConfig;
  onJoin: (displayName: string, avatarUrl: string) => void;
}

// Keep in sync with worker/index.ts's MAX_AVATAR_BYTES (KV's per-value
// limit is 25 MiB — staying under it with headroom, not at the edge).
const MAX_AVATAR_BYTES = 20 * 1024 * 1024;

/**
 * Pre-join gate: pick a display name and, if the deployment allows it
 * (world.allowAvatarUpload), upload an open-source/self-authored .vrm to
 * use for this session instead of the deployment's default avatar. The
 * upload goes to worker/index.ts's KV-backed /api/avatars endpoint —
 * other players need a URL they can actually fetch, so this can't be a
 * client-only blob: URL.
 */
export function JoinScreen({ world, onJoin }: JoinScreenProps) {
  const [displayName, setDisplayName] = useState(() => `guest-${Math.random().toString(36).slice(2, 7)}`);
  const [file, setFile] = useState<File | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowUpload = world.allowAvatarUpload !== false;
  const canSubmit = displayName.trim().length > 0 && (!file || rightsConfirmed) && !uploading;

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
      const res = await fetch("/api/avatars", { method: "POST", body: file });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      onJoin(displayName.trim(), url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setError(null);
    if (picked && picked.size > MAX_AVATAR_BYTES) {
      setError(`That file is too large (max ${MAX_AVATAR_BYTES / (1024 * 1024)}MB).`);
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
        style={{ display: "flex", flexDirection: "column", gap: 12, width: 360, padding: 24, background: "#1c1c1c", borderRadius: 12 }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>{world.displayName}</h1>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            required
          />
        </label>

        {allowUpload && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Avatar (.vrm, optional — uses the default if skipped)
            <input ref={fileInputRef} type="file" accept=".vrm" onChange={handleFileChange} />
          </label>
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

        {error && <p style={{ color: "#ff6b6b", margin: 0 }}>{error}</p>}

        <button type="submit" disabled={!canSubmit}>
          {uploading ? "Uploading…" : "Enter world"}
        </button>
      </form>
    </div>
  );
}
