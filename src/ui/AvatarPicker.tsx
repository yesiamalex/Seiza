import type { AvatarPreset } from "../config/worldConfig";
import { pillButtonActiveStyle, pillButtonStyle } from "./styles";

interface AvatarPickerProps {
  presets: AvatarPreset[];
  /** Currently selected avatar URL — "" means the built-in placeholder. */
  selectedUrl: string;
  onSelect: (url: string) => void;
  disabled?: boolean;
}

/**
 * Preset avatar chooser, shared by the join screen and the in-world
 * avatar menu so both offer exactly the same set (see
 * WorldConfig.defaultAvatars).
 *
 * Renders nothing when a deployment hasn't configured any presets —
 * which is the out-of-the-box state, since this repo doesn't ship VRM
 * binaries it hasn't license-verified. Upload and the built-in
 * placeholder still work in that case.
 */
export function AvatarPicker({ presets, selectedUrl, onSelect, disabled }: AvatarPickerProps) {
  if (presets.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <small style={{ opacity: 0.8 }}>Pick an avatar</small>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          type="button"
          disabled={disabled}
          style={selectedUrl === "" ? pillButtonActiveStyle : pillButtonStyle}
          onClick={() => onSelect("")}
        >
          Default
        </button>
        {presets.map((preset) => (
          <button
            key={preset.url}
            type="button"
            disabled={disabled}
            style={selectedUrl === preset.url ? pillButtonActiveStyle : pillButtonStyle}
            onClick={() => onSelect(preset.url)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
