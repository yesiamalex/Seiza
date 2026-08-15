import { useRealtimeVoice } from "./useRealtimeVoice";

export function VoiceControls() {
  const voice = useRealtimeVoice();
  if (!voice.enabled) return null;

  return (
    <button onClick={voice.toggleMute}>
      {voice.muted ? "Unmute" : "Mute"} (stub — not yet connected to Cloudflare Realtime)
    </button>
  );
}
