import { useEffect, useState } from "react";
import { ACCENT_COLOR, panelStyle, pillButtonStyle, primaryButtonStyle } from "../ui/styles";
import { answerTogether, askTogether, cancelTogether, onTogetherStart, TOGETHER_LABELS, useTogether } from "./together";
import type { TogetherGesture } from "../multiplayer/types";
import { TOGETHER } from "../multiplayer/types";

/**
 * The request someone has made of you ("Bea would like a hug"), your own
 * request while it waits, and short notices about how it went. Above the
 * control bar; at the top on a phone, clear of the touch controls.
 *
 * Otherwise, with someone within reach (`near`, the closest), a small
 * "Bea is close" chip that opens into the together gestures to ask them
 * for, so asking doesn't mean finding the Gestures menu. Dismissed, or
 * once you've done something together, it stays away until they've left
 * and come back. Hidden while you're `busy` (mid-gesture, holding a pose,
 * seated), without forgetting any of that.
 */
export function TogetherPrompt({
  nameOf,
  near = null,
  gestures = [],
  busy = false,
}: {
  nameOf: (id: string) => string;
  busy?: boolean;
  near?: { id: string; name: string } | null;
  gestures?: { name: TogetherGesture; label: string }[];
}) {
  const t = useTogether();
  const request = t.incoming[0];
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    // A different person, or nobody: start collapsed, and forget a
    // dismissal once its person has gone.
    setOpen(false);
    if (near?.id !== dismissed) setDismissed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near?.id]);
  // Having done something together counts as having seen the offer.
  useEffect(() => onTogetherStart(({ partner }) => setDismissed(partner)), []);
  const offer = near && !busy && gestures.length > 0 && dismissed !== near.id ? near : null;
  return (
    <>
      <style>{CSS}</style>
      {request ? (
        <div role="alertdialog" aria-label="A request" className="seiza-together" style={{ ...panelStyle, flexDirection: "column", gap: 8, width: "min(360px, calc(100vw - 32px))" }}>
          <span style={{ fontSize: 14 }}>
            <strong>{nameOf(request.peer)}</strong> would like {TOGETHER_LABELS[request.gesture].ask}.
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={{ ...primaryButtonStyle, flex: 1, padding: "8px 12px" }} onClick={() => answerTogether(request.id, true)}>
              Yes
            </button>
            <button type="button" style={{ ...pillButtonStyle, flex: 1, justifyContent: "center" }} onClick={() => answerTogether(request.id, false)}>
              No thanks
            </button>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
            <div key={request.id} style={{ height: "100%", background: ACCENT_COLOR, animation: `seiza-together-drain ${TOGETHER.requestSeconds}s linear forwards` }} />
          </div>
          <span style={{ fontSize: 11, opacity: 0.7 }}>No answer means no. You can turn off requests in the Gestures menu.</span>
        </div>
      ) : t.outgoing ? (
        <div className="seiza-together" style={{ ...panelStyle, gap: 10, alignItems: "center", padding: "8px 12px", maxWidth: "calc(100vw - 32px)" }}>
          <span>
            Asking {nameOf(t.outgoing.peer)} for {TOGETHER_LABELS[t.outgoing.gesture].ask}…
          </span>
          <button type="button" style={{ ...pillButtonStyle, padding: "5px 10px", fontSize: 12 }} onClick={cancelTogether}>
            Cancel
          </button>
        </div>
      ) : t.notices.length > 0 ? (
        <div role="status" aria-live="polite" className="seiza-together" style={{ ...panelStyle, padding: "8px 12px", maxWidth: "calc(100vw - 32px)", pointerEvents: "none" }}>
          {t.notices[t.notices.length - 1].text}
        </div>
      ) : (
        offer && (
          <div className="seiza-together" style={{ ...panelStyle, flexDirection: "column", gap: 8, padding: "8px 12px", width: open ? "min(380px, calc(100vw - 32px))" : undefined, maxWidth: "calc(100vw - 32px)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, flex: 1, whiteSpace: open ? undefined : "nowrap" }}>
                {open ? (
                  <>
                    Ask <strong>{offer.name}</strong> for
                  </>
                ) : (
                  <>
                    <strong>{offer.name}</strong> is close
                  </>
                )}
              </span>
              {!open && (
                <button type="button" style={{ ...pillButtonStyle, padding: "5px 10px", fontSize: 12 }} onClick={() => setOpen(true)}>
                  Together…
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                style={{ ...pillButtonStyle, padding: "5px 9px", fontSize: 12 }}
                onClick={() => setDismissed(offer.id)}
              >
                ×
              </button>
            </div>
            {open && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {gestures.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    style={{ ...pillButtonStyle, padding: "7px 12px", fontSize: 12 }}
                    onClick={() => askTogether(offer.id, g.name)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </>
  );
}

const CSS = `
  .seiza-together { position: fixed; left: 50%; transform: translateX(-50%); bottom: 104px; z-index: 36; display: flex; pointer-events: auto; }
  @media (max-width: 640px) { .seiza-together { bottom: auto; top: 112px; } }
  @media (pointer: coarse) { .seiza-together button { min-height: 40px; } }
  @keyframes seiza-together-drain { from { width: 100%; } to { width: 0%; } }
`;
