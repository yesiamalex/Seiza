import { useEffect } from "react";
import { CameraIcon, CloseIcon, ScreenShareIcon } from "../ui/icons";
import { panelStyle, pillButtonStyle, primaryButtonStyle } from "../ui/styles";
import type { PresentSource } from "../multiplayer/types";
import { L, useLang } from "../i18n/lang";

interface PresentSourceChooserProps {
  /** True when a camera is already running, so the label can say so. */
  cameraOn: boolean;
  onChoose: (source: PresentSource) => void;
  onCancel: () => void;
}

/**
 * Asks what to put on a screen that was just clicked.
 *
 * A screen in the world is a surface, not a role: it can carry a shared
 * desktop or a webcam, and a click on an empty one cannot tell which was
 * meant. Picking one silently would make the other reachable only
 * through the media panel, which is the wrong place to look when you are
 * standing in front of the screen you want to use.
 *
 * Only appears for a *free* screen. Clicking your own screen still stops
 * presenting, and clicking somebody else's still enlarges it — those are
 * unambiguous and shouldn't grow a prompt.
 */
export function PresentSourceChooser({ cameraOn, onChoose, onCancel }: PresentSourceChooserProps) {
  useLang();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={L("Choose what to show on this screen", "このスクリーンに映すものを選ぶ")}
      onClick={onCancel}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 36,
        display: "grid",
        placeItems: "center",
        background: "rgba(6,7,9,0.55)",
        pointerEvents: "auto",
        padding: 16,
      }}
    >
      <div
        // The backdrop dismisses; the panel itself must not.
        onClick={(event) => event.stopPropagation()}
        style={{
          ...panelStyle,
          width: "min(340px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <strong style={{ fontSize: 14 }}>{L("Show on this screen", "このスクリーンに映す")}</strong>
          <button
            type="button"
            onClick={onCancel}
            aria-label={L("Cancel", "キャンセル")}
            style={{ ...pillButtonStyle, padding: 5 }}
          >
            <CloseIcon size={13} />
          </button>
        </div>

        <button
          type="button"
          style={{ ...primaryButtonStyle, justifyContent: "flex-start", gap: 8, padding: "11px 14px", fontSize: 13 }}
          onClick={() => onChoose("screen")}
        >
          <ScreenShareIcon size={16} /> {L("My screen", "自分の画面")}
        </button>
        <button
          type="button"
          style={{ ...pillButtonStyle, justifyContent: "flex-start", gap: 8, padding: "11px 14px" }}
          onClick={() => onChoose("camera")}
        >
          <CameraIcon size={16} /> {L("My camera", "自分のカメラ")}
        </button>
        <small style={{ opacity: 0.6 }}>
          {cameraOn
            ? L("Your camera is already on; it will move onto this screen.", "カメラはすでにオンです。このスクリーンに映ります。")
            : L("Picking a camera turns yours on first.", "カメラを選ぶと、まずカメラがオンになります。")}
        </small>
      </div>
    </div>
  );
}
