import type { AvatarPreset } from "../config/worldConfig";
import { pillButtonActiveStyle, pillButtonStyle } from "./styles";

interface AvatarPickerProps {
  presets: AvatarPreset[];
  /** Currently selected avatar URL, or null when none of these is selected. */
  selectedUrl: string | null;
  onSelect: (url: string) => void;
  disabled?: boolean;
}

/**
 * Chooser for a deployment's own .vrm presets (WorldConfig.defaultAvatars),
 * shown in the "Presets" tab of AvatarChooser.
 *
 * Empty out of the box: this repo doesn't ship VRM binaries it hasn't
 * license-verified (THIRD_PARTY_ASSETS.md). The built-in designer presets
 * (businessman, businesswoman, casual…) cover that case without any files.
 */
export function AvatarPicker({ presets, selectedUrl, onSelect, disabled }: AvatarPickerProps) {
  if (presets.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {presets.map((preset) => (
        <button
          key={preset.url}
          type="button"
          disabled={disabled}
          aria-pressed={selectedUrl === preset.url}
          style={selectedUrl === preset.url ? pillButtonActiveStyle : pillButtonStyle}
          onClick={() => onSelect(preset.url)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
