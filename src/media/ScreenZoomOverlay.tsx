import { useEffect, useRef } from "react";
import { CloseIcon } from "../ui/icons";
import { L, useLang } from "../i18n/lang";

interface ScreenZoomOverlayProps {
  stream: MediaStream;
  /** Shown in the corner so it's clear whose screen this is. */
  label: string;
  onClose: () => void;
}

/**
 * A presenting screen, blown up to fill the viewer's own screen.
 *
 * Walking up to a wall panel to read someone's slides works in a room
 * you can move around, and not at all on a phone or when six people are
 * standing in front of it. This is the flat-screen escape hatch: one 2D
 * overlay playing the same MediaStream the in-world panel is already
 * receiving.
 *
 * Deliberately *not* a second subscription. It reuses the stream that
 * peer connection is already delivering, so opening it costs no
 * renegotiation, no extra bandwidth, and nothing on the presenter's
 * side — they are not told, because there is nothing they would need to
 * do differently.
 */
export function ScreenZoomOverlay({ stream, label, onClose }: ScreenZoomOverlayProps) {
  useLang();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Same re-attach dance as VideoPanel: a screen share's tracks can
    // arrive in separate `ontrack` events against one MediaStream, and
    // an element bound before the video track landed will sit at
    // readyState 0 showing black. See VideoPanel.tsx for the full note.
    const attach = () => {
      video.srcObject = stream;
      void video.play().catch(() => {
        // Autoplay can refuse until the user gestures; the click that
        // opened this overlay usually satisfies that, and the controls
        // below are the fallback if it doesn't.
      });
    };
    attach();

    const watched = new Set<MediaStreamTrack>();
    const watch = (track: MediaStreamTrack) => {
      if (watched.has(track)) return;
      watched.add(track);
      track.addEventListener("unmute", attach);
    };
    stream.getTracks().forEach(watch);
    const onAddTrack = (event: MediaStreamTrackEvent) => {
      watch(event.track);
      attach();
    };
    stream.addEventListener("addtrack", onAddTrack);

    return () => {
      stream.removeEventListener("addtrack", onAddTrack);
      watched.forEach((track) => track.removeEventListener("unmute", attach));
      video.pause();
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={L(`${label} — shared screen`, `${label} — 共有画面`)}
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "rgba(6,7,9,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "clamp(8px, 2vw, 28px)",
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        pointerEvents: "auto",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, maxWidth: 1400 }}>
        <strong
          style={{
            color: "white",
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </strong>
        <button
          type="button"
          // Without this the click bubbles to the backdrop, which also
          // closes — harmless today, but it would double-fire if the
          // backdrop ever does anything else.
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label={L("Close the enlarged screen", "拡大した画面を閉じる")}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "white",
            borderRadius: 999,
            padding: "7px 13px",
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            cursor: "pointer",
          }}
        >
          <CloseIcon size={13} /> Close
        </button>
      </div>
      <video
        ref={videoRef}
        muted
        playsInline
        // Clicking the picture itself shouldn't dismiss it — only the
        // backdrop around it and the button above.
        onClick={(event) => event.stopPropagation()}
        style={{
          flex: 1,
          minHeight: 0,
          maxWidth: "100%",
          maxHeight: "100%",
          width: "auto",
          objectFit: "contain",
          borderRadius: 10,
          background: "#000",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      />
      <small style={{ color: "white", opacity: 0.5, fontFamily: "system-ui, sans-serif" }}>
        {L(
          "Audio still comes from the room, so it stays positioned where the presenter is standing.",
          "音声は部屋から聞こえるので、発表者が立っている場所から聞こえ続けます。"
        )}
      </small>
    </div>
  );
}
