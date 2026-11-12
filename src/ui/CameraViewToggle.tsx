import type { ViewMode } from "../player/PlayerRig";
import { BAR_LABEL_CLASS, barButtonStyle } from "./styles";
import { EyeIcon, PersonIcon } from "./icons";
import { L, useLang } from "../i18n/lang";

interface CameraViewToggleProps {
  viewMode: ViewMode;
  onToggle: () => void;
}

export function CameraViewToggle({ viewMode, onToggle }: CameraViewToggleProps) {
  useLang();
  const first = viewMode === "first";
  return (
    <button
      type="button"
      className="seiza-bar-btn"
      style={barButtonStyle}
      onClick={onToggle}
      aria-label={first ? L("Switch to third person (V)", "三人称に切り替え(V)") : L("Switch to first person (V)", "一人称に切り替え(V)")}
      title={L("Switch view (V). Scroll to zoom; in third person, click the floor to walk there.", "視点を切り替え(V)。スクロールでズーム、三人称では床をクリックするとそこへ歩きます。")}
    >
      {first ? <EyeIcon /> : <PersonIcon />}
      <span className={BAR_LABEL_CLASS}>{first ? L("First person", "一人称") : L("Third person", "三人称")}</span>
    </button>
  );
}
