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
 * Every preset that declares an author or license gets a credit line under
 * the list. The bundled VRoid samples are CC0, which needs no attribution,
 * but saying where they came from, under what terms, and that this project
 * isn't affiliated with their maker costs nothing and avoids any
 * impression otherwise.
 */
export function AvatarPicker({ presets, selectedUrl, onSelect, disabled }: AvatarPickerProps) {
  if (presets.length === 0) return null;

  // One line per distinct author + license, rather than repeating it for
  // every model from the same source.
  const credits = new Map<string, AvatarPreset>();
  for (const preset of presets) {
    if (!preset.author && !preset.license) continue;
    const key = `${preset.author ?? ""}|${preset.license ?? ""}`;
    if (!credits.has(key)) credits.set(key, preset);
  }
  const labelsFor = (preset: AvatarPreset) =>
    presets
      .filter((p) => p.author === preset.author && p.license === preset.license)
      .map((p) => p.label)
      .join(", ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
      {credits.size > 0 && (
        <small style={{ opacity: 0.62, fontSize: 11, lineHeight: 1.45, display: "flex", flexDirection: "column", gap: 4 }}>
          {[...credits.values()].map((preset) => (
            <span key={`${preset.author}|${preset.license}`}>
              {labelsFor(preset)}: {preset.author ? `by ${preset.author}` : "third-party model"}
              {preset.license && (
                <>
                  , used under{" "}
                  {preset.licenseUrl ? (
                    <a href={preset.licenseUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                      {preset.license}
                    </a>
                  ) : (
                    preset.license
                  )}
                </>
              )}
              . Unmodified apart from texture downscaling. Seiza is not affiliated with or endorsed by the model's
              author; names and trademarks belong to their owners.
            </span>
          ))}
        </small>
      )}
    </div>
  );
}
