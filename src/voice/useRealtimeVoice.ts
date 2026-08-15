import { useEffect, useState } from "react";

export interface RealtimeVoiceState {
  enabled: boolean;
  connected: boolean;
  muted: boolean;
  toggleMute: () => void;
}

const VOICE_ENABLED = import.meta.env.VITE_SEIZA_VOICE_ENABLED === "true";

/**
 * STUB. Architecturally, voice is meant to run on Cloudflare Realtime
 * SFU/RealtimeKit — same vendor, same deployer-owned account as the rest of
 * the stack (see paper Section 3), not a second infrastructure provider.
 * Not implemented yet: this hook exists so UI and room-state plumbing (mute
 * state, who's talking) can be built against a stable interface now, with
 * a real WebRTC session dropped in later without changing callers.
 *
 * TODO before implementing for real: check current Cloudflare RealtimeKit
 * SDK docs rather than assuming an API shape — this product moved fast
 * through 2025-2026.
 */
export function useRealtimeVoice(): RealtimeVoiceState {
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (VOICE_ENABLED) {
      console.warn("VITE_SEIZA_VOICE_ENABLED is true, but useRealtimeVoice is still a stub — no audio will actually connect.");
    }
  }, []);

  return {
    enabled: VOICE_ENABLED,
    connected: false,
    muted,
    toggleMute: () => setMuted((m) => !m),
  };
}
