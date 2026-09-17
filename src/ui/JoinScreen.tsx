import { useEffect, useState } from "react";
import type { WorldConfig } from "../config/worldConfig";
import {
  ensureUploadedAvatarAvailable,
  forgetProfile,
  loadProfile,
  loadUploadedAvatarFile,
  saveProfile,
  type StoredAvatarChoice,
} from "../profile/profileStore";
import { AvatarPreview } from "./AvatarPreview";
import { AvatarChooser, avatarUrlForChoice, initialAvatarChoice, type AvatarSelection } from "./AvatarChooser";
import { ACCENT_COLOR, inputStyle, primaryButtonStyle } from "./styles";

export interface JoinedIdentity extends AvatarSelection {
  displayName: string;
  /** Whether this visitor asked to be remembered in this browser. */
  remember: boolean;
}

interface JoinScreenProps {
  world: WorldConfig;
  onJoin: (identity: JoinedIdentity) => void;
}

// IndexedDB normally answers in a few milliseconds. If it's blocked or
// hangs (some privacy modes), show the form with defaults instead of a
// blank screen.
const PROFILE_LOAD_TIMEOUT_MS = 1500;

// A hand-placed star field, two depths. No images and no third-party
// fonts: this app runs entirely on infrastructure the deployer owns.
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
 * Pre-join gate: display name, avatar (design / preset / upload), and a
 * "remember me" choice. Returning visitors get their name and avatar back
 * from this browser's IndexedDB (src/profile/profileStore.ts), including an
 * uploaded file, which renders instantly from disk and is silently
 * re-uploaded if the deployment's copy has expired.
 */
export function JoinScreen({ world, onJoin }: JoinScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [returning, setReturning] = useState(false);
  const [displayName, setDisplayName] = useState(() => `guest-${Math.random().toString(36).slice(2, 7)}`);
  const [selection, setSelection] = useState<AvatarSelection>(() => {
    const choice = initialAvatarChoice(world);
    return { choice, url: avatarUrlForChoice(choice), localUrl: null };
  });
  const [remember, setRemember] = useState(true);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), PROFILE_LOAD_TIMEOUT_MS));
    (async () => {
      const profile = await Promise.race([loadProfile(world.id), timeout]);
      if (cancelled) return;
      if (profile) {
        let choice: StoredAvatarChoice = profile.avatar;
        let localUrl: string | null = null;
        if (choice.kind === "upload") {
          const local = await loadUploadedAvatarFile(world.id);
          if (local) localUrl = URL.createObjectURL(local.blob);
        }
        if (choice.kind === "preset" && !(world.defaultAvatars ?? []).some((p) => p.url === (choice as { url: string }).url) && choice.url !== world.defaultAvatarUrl) {
          // The deployer removed that preset since the last visit.
          choice = initialAvatarChoice(world);
        }
        if (choice.kind === "default") choice = initialAvatarChoice(world);
        if (cancelled) return;
        setDisplayName(profile.displayName || displayName);
        setSelection({ choice, url: avatarUrlForChoice(choice), localUrl });
        setReturning(true);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per world; displayName is only a fallback here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  const canSubmit = loaded && displayName.trim().length > 0 && !joining;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setJoining(true);
    try {
      let { choice, url } = selection;
      if (choice.kind === "upload") {
        const available = await ensureUploadedAvatarAvailable(world.id, choice.remoteUrl);
        if (!available) {
          throw new Error("Your saved avatar file is no longer on this deployment and no local copy was found. Upload it again or pick another avatar.");
        }
        choice = { ...choice, remoteUrl: available };
        url = available;
      }
      const name = displayName.trim();
      if (remember) await saveProfile(world.id, { displayName: name, avatar: choice });
      else await forgetProfile(world.id);
      onJoin({ displayName: name, choice, url, localUrl: selection.localUrl, remember });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join.");
      setJoining(false);
    }
  }

  return (
    <div className="seiza-join-screen">
      <style>{`
        .seiza-join-screen {
          position: relative; width: 100%; height: 100vh; height: 100svh; box-sizing: border-box;
          display: grid; place-items: center; overflow-x: hidden; overflow-y: auto;
          padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
          font-family: system-ui, sans-serif; color: white;
          background: radial-gradient(120% 100% at 50% 0%, #1b2030 0%, #0c0e16 55%, #060709 100%);
        }
        .seiza-join-form {
          position: relative; width: min(860px, 100%); box-sizing: border-box;
          display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 28px; padding: 28px 32px;
          background: rgba(16,17,24,0.72); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 24px 60px rgba(0,0,0,0.5);
        }
        .seiza-join-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        @media (max-width: 720px) {
          .seiza-join-screen { place-items: start center; }
          .seiza-join-form { grid-template-columns: 1fr; padding: 18px; gap: 18px; }
          .seiza-join-title { font-size: 21px !important; }
        }
        @media (max-width: 420px) { .seiza-join-form { padding: 14px; } }
      `}</style>

      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: STAR_DOTS_FAR, opacity: 0.9, pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: STAR_DOTS_NEAR, pointerEvents: "none" }} />

      <form onSubmit={handleSubmit} className="seiza-join-form seiza-rise-in">
        <div className="seiza-join-col">
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: ACCENT_COLOR, opacity: 0.85 }}>Seiza · 星座</div>
            <h1 className="seiza-join-title" style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {world.displayName}
            </h1>
            <div style={{ width: 40, height: 2, marginTop: 10, background: `linear-gradient(90deg, ${ACCENT_COLOR}, transparent)` }} />
          </div>
          <AvatarPreview url={stagedPreview ?? selection.localUrl ?? selection.url} height="clamp(240px, 44svh, 440px)" />
        </div>

        <div className="seiza-join-col">
          {returning && <small style={{ color: ACCENT_COLOR }}>Welcome back. Your name and avatar were remembered on this device.</small>}
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, opacity: 0.9 }}>
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} required autoComplete="nickname" style={inputStyle} />
          </label>

          {loaded ? (
            <AvatarChooser
              world={world}
              value={selection.choice}
              rememberLocally={remember}
              onStagedPreview={setStagedPreview}
              onChange={(next) => {
                setSelection((previous) => {
                  if (previous.localUrl && previous.localUrl !== next.localUrl) URL.revokeObjectURL(previous.localUrl);
                  return next;
                });
                setError(null);
              }}
            />
          ) : (
            <small style={{ opacity: 0.6 }}>Loading your saved profile…</small>
          )}

          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, opacity: 0.85 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Remember my name and avatar on this device. Turn off on shared computers.</span>
          </label>

          {error && <p style={{ color: "#ff8a80", margin: 0, fontSize: 12 }}>{error}</p>}

          <button type="submit" style={{ ...primaryButtonStyle, opacity: canSubmit ? 1 : 0.6 }} disabled={!canSubmit}>
            {joining ? "Joining…" : "Enter world"}
          </button>
        </div>
      </form>
    </div>
  );
}
