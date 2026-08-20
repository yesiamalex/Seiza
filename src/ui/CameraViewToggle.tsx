import type { ViewMode } from "../player/PlayerRig";
import { pillButtonStyle } from "./styles";

interface CameraViewToggleProps {
  viewMode: ViewMode;
  onToggle: () => void;
}

export function CameraViewToggle({ viewMode, onToggle }: CameraViewToggleProps) {
  return (
    <button style={pillButtonStyle} onClick={onToggle} title="Scroll to zoom; in third person, click the floor to walk there">
      {viewMode === "first" ? "👤 First person" : "🧍 Third person"}
    </button>
  );
}
