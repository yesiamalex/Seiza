import type { VoiceChatState } from "./useVoiceChat";
import { VOICE_ENABLED } from "./useVoiceChat";
import { panelStyle, pillButtonActiveStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { MicIcon, MicOffIcon } from "../ui/icons";

interface VoiceControlsProps {
  voice: VoiceChatState;
}

export function VoiceControls({ voice }: VoiceControlsProps) {
  if (!VOICE_ENABLED) return null;

  if (!voice.enabled) {
    return (
      <button style={pillButtonStyle} onClick={voice.enable} disabled={voice.connecting}>
        <MicIcon /> {voice.connecting ? "Connecting mic…" : "Enable voice chat"}
      </button>
    );
  }

  const peerCount = Object.keys(voice.speakingLevels).length;
  const anyoneSpeaking = Object.values(voice.speakingLevels).some((level) => level > 0.05);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button style={voice.muted ? pillButtonStyle : pillButtonActiveStyle} onClick={voice.toggleMute}>
        {voice.muted ? <MicOffIcon /> : <MicIcon />} {voice.muted ? "Unmute" : "Mute"}
      </button>
      <div className="seiza-popover" style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            title="Your mic level"
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: voice.muted ? "#555" : voice.localSpeaking ? "#4caf50" : "#888",
            }}
          />
          <button style={pillButtonStyle} onClick={voice.disable}>
            Leave voice
          </button>
          {voice.devices.length > 1 && (
            <select
              value={voice.selectedDeviceId ?? ""}
              onChange={(e) => voice.selectDevice(e.target.value)}
              title="Microphone"
              style={{ background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6 }}
            >
              {voice.devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId} style={{ color: "black" }}>
                  {d.label || "Microphone"}
                </option>
              ))}
            </select>
          )}
        </div>
        <small style={{ opacity: 0.8 }}>
          {peerCount === 0 ? "No one else in voice yet" : `${peerCount} peer${peerCount === 1 ? "" : "s"} connected`}
          {anyoneSpeaking ? " — someone's talking" : ""}
        </small>
      </div>
    </div>
  );
}
