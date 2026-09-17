import { useState } from "react";
import type { VoiceChatState } from "./useVoiceChat";
import { VOICE_ENABLED } from "./useVoiceChat";
import { panelStyle, pillButtonActiveStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { MicIcon, MicOffIcon } from "../ui/icons";

interface VoiceControlsProps {
  voice: VoiceChatState;
}

/**
 * Voice chat controls: join, mute, pick a microphone, leave.
 *
 * The details panel is opened by the caret button rather than being always
 * on screen — it used to render permanently once voice was enabled, which
 * left a panel floating over the world with no way to dismiss it.
 */
export function VoiceControls({ voice }: VoiceControlsProps) {
  const [open, setOpen] = useState(false);
  if (!VOICE_ENABLED) return null;

  if (!voice.enabled) {
    return (
      <button type="button" style={pillButtonStyle} onClick={voice.enable} disabled={voice.connecting}>
        <MicIcon /> {voice.connecting ? "Connecting mic…" : "Enable voice chat"}
      </button>
    );
  }

  const peerCount = Object.keys(voice.speakingLevels).length;
  const anyoneSpeaking = Object.values(voice.speakingLevels).some((level) => level > 0.05);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" style={voice.muted ? pillButtonStyle : pillButtonActiveStyle} onClick={voice.toggleMute}>
        {voice.muted ? <MicOffIcon /> : <MicIcon />} {voice.muted ? "Unmute" : "Mute"}
      </button>
      <button
        type="button"
        aria-label="Voice chat settings"
        aria-expanded={open}
        style={{ ...pillButtonStyle, padding: "9px 10px" }}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: voice.muted ? "#8a8a8a" : voice.localSpeaking ? "#7CFF9E" : "#c8c8c8",
            transition: "background-color 220ms ease",
          }}
        />
        <span style={{ fontSize: 11, opacity: 0.85 }}>{peerCount}</span>
      </button>
      {open && (
        <div
          className="seiza-popover"
          style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", gap: 8, width: "min(250px, calc(100vw - 32px))" }}
        >
          <small style={{ opacity: 0.8 }}>
            {peerCount === 0 ? "No one else is in voice yet." : `${peerCount} peer${peerCount === 1 ? "" : "s"} connected.`}
            {anyoneSpeaking ? " Someone is talking." : ""}
          </small>
          <small style={{ opacity: 0.6 }}>Voices fade with distance, so walking closer makes someone easier to hear.</small>
          {voice.devices.length > 1 && (
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              Microphone
              <select
                value={voice.selectedDeviceId ?? ""}
                onChange={(event) => void voice.selectDevice(event.target.value)}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 6,
                  padding: "6px 8px",
                }}
              >
                {voice.devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId} style={{ color: "black" }}>
                    {device.label || "Microphone"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" style={pillButtonStyle} onClick={voice.disable}>
            Leave voice
          </button>
        </div>
      )}
    </div>
  );
}
