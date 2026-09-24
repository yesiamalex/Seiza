import type { ViewMode } from "../player/PlayerRig";
import { BAR_LABEL_CLASS, barButtonStyle } from "./styles";
import { EyeIcon, PersonIcon } from "./icons";

interface CameraViewToggleProps {
  viewMode: ViewMode;
  onToggle: () => void;
}

export function CameraViewToggle({ viewMode, onToggle }: CameraViewToggleProps) {
  const first = viewMode === "first";
  return (
    <button
      type="button"
      className="seiza-bar-btn"
      style={barButtonStyle}
      onClick={onToggle}
      aria-label={first ? "Switch to third person (V)" : "Switch to first person (V)"}
      title="Switch view (V). Scroll to zoom; in third person, click the floor to walk there."
    >
      {first ? <EyeIcon /> : <PersonIcon />}
      <span className={BAR_LABEL_CLASS}>{first ? "First person" : "Third person"}</span>
    </button>
  );
}
