import { useState } from "react";
import { useExclusiveMenu } from "../ui/exclusiveMenu";
import type { RealtimeMediaState } from "./useRealtimeMedia";
import type { PresentSource } from "../multiplayer/types";
import { VOICE_ENABLED } from "./useRealtimeMedia";
import { BAR_LABEL_CLASS, barButtonActiveStyle, barButtonStyle, panelStyle, pillButtonActiveStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { CameraIcon, MicIcon, MicOffIcon, ScreenShareIcon } from "../ui/icons";

interface MediaControlsProps {
  media: RealtimeMediaState;
  /** Whether voice is switched on for this world (world.json voiceEnabled). */
  voiceEnabled: boolean;
  /** Starts a share on the nearest free screen; returns why not, if not. */
  /** Puts one of this player's streams on the nearest free screen.
   *  Returns a reason when it can't, or null on success. */
  onShareScreen: (source?: PresentSource) => string | null;
  onStopScreen: () => void;
}

/**
 * Microphone, camera and screen sharing in one control.
 *
 * The details panel is opened by the caret rather than sitting on screen
 * permanently, and each capture stays off until asked for, so a visitor who
 * only wants to look around never gives up a device or an upload.
 */
export function MediaControls({ media, voiceEnabled, onShareScreen, onStopScreen }: MediaControlsProps) {
  const [open, setOpen] = useState(false);
  useExclusiveMenu("media", open, () => setOpen(false));
  const [shareProblem, setShareProblem] = useState<string | null>(null);
  const voiceAvailable = VOICE_ENABLED && voiceEnabled;

  const peerCount = Object.keys(media.speakingLevels).length;
  const anyoneSpeaking = Object.values(media.speakingLevels).some((level) => level > 0.05);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
      {voiceAvailable && !media.micEnabled && (
        <button
          type="button"
          className="seiza-bar-btn"
          style={barButtonStyle}
          onClick={() => void media.enableMic()}
          disabled={media.connecting}
          aria-label={media.connecting ? "Connecting microphone" : "Enable voice chat"}
          title={media.connecting ? "Connecting microphone…" : "Enable voice chat"}
        >
          <MicIcon />
          <span className={BAR_LABEL_CLASS}>{media.connecting ? "Connecting…" : "Voice"}</span>
        </button>
      )}
      {voiceAvailable && media.micEnabled && (
        <button
          type="button"
          className="seiza-bar-btn"
          style={media.muted ? barButtonStyle : barButtonActiveStyle}
          onClick={media.toggleMute}
          aria-pressed={!media.muted}
          aria-label={media.muted ? "Unmute microphone" : "Mute microphone"}
          title={media.muted ? "Unmute" : "Mute"}
        >
          {media.muted ? <MicOffIcon /> : <MicIcon />}
          <span className={BAR_LABEL_CLASS}>{media.muted ? "Unmute" : "Mute"}</span>
        </button>
      )}
      <button
        type="button"
        aria-label="Camera, screen sharing and audio settings"
        aria-expanded={open}
        className="seiza-bar-btn"
        title="Camera and screen sharing"
        style={media.cameraOn || media.screenOn ? barButtonActiveStyle : barButtonStyle}
        onClick={() => setOpen((value) => !value)}
      >
        <CameraIcon />
        <span className={BAR_LABEL_CLASS}>Video</span>
        {media.micEnabled && (
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: media.muted ? "#8a8a8a" : media.localSpeaking ? "#7CFF9E" : "#c8c8c8",
              transition: "background-color 220ms ease",
            }}
          />
        )}
      </button>
      {open && (
        <div
          className="seiza-popover"
          style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", gap: 8, width: "min(280px, calc(100vw - 32px))" }}
        >
          <strong style={{ fontSize: 13 }}>Share</strong>
          <button
            type="button"
            style={media.cameraOn ? pillButtonActiveStyle : pillButtonStyle}
            onClick={() => (media.cameraOn ? media.stopCamera() : void media.startCamera())}
          >
            <CameraIcon /> {media.cameraOn ? "Turn camera off" : "Turn camera on"}
          </button>
          <small style={{ opacity: 0.6 }}>Your camera shows on a small panel beside your avatar.</small>
          <button
            type="button"
            style={media.screenOn ? pillButtonActiveStyle : pillButtonStyle}
            onClick={() => {
              setShareProblem(null);
              if (media.screenOn) onStopScreen();
              else setShareProblem(onShareScreen());
            }}
          >
            <ScreenShareIcon /> {media.screenOn ? "Stop sharing" : "Share your screen"}
          </button>
          <small style={{ opacity: 0.6 }}>Shares onto the nearest screen. You can also click a screen in the world.</small>
          {/* A screen is just a surface, so it can carry a webcam as
              easily as a desktop — useful for putting a presenter's face
              up at the front of the room rather than on the small panel
              beside their avatar. */}
          <button
            type="button"
            style={pillButtonStyle}
            onClick={() => {
              setShareProblem(null);
              setShareProblem(onShareScreen("camera"));
            }}
          >
            <CameraIcon /> Put my camera on a screen
          </button>
          <small style={{ opacity: 0.6 }}>Turns your camera on if it isn't already.</small>
          {shareProblem && <small style={{ color: "#ffb347" }}>{shareProblem}</small>}
          {media.error && <small style={{ color: "#ff8a80" }}>{media.error}</small>}

          {voiceAvailable && media.micEnabled && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
              <small style={{ opacity: 0.8 }}>
                {peerCount === 0 ? "No one else is connected yet." : `${peerCount} peer${peerCount === 1 ? "" : "s"} connected.`}
                {anyoneSpeaking ? " Someone is talking." : ""}
              </small>
              <small style={{ opacity: 0.6 }}>Voices fade with distance, so walking closer makes someone easier to hear.</small>
              {media.devices.length > 1 && (
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                  Microphone
                  <select
                    value={media.selectedDeviceId ?? ""}
                    onChange={(event) => void media.selectDevice(event.target.value)}
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      color: "white",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 6,
                      padding: "6px 8px",
                    }}
                  >
                    {media.devices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId} style={{ color: "black" }}>
                        {device.label || "Microphone"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" style={pillButtonStyle} onClick={media.disableMic}>
                Leave voice
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
