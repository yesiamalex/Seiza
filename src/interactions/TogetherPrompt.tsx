import { ACCENT_COLOR, panelStyle, pillButtonStyle, primaryButtonStyle } from "../ui/styles";
import { answerTogether, cancelTogether, TOGETHER_LABELS, useTogether } from "./together";
import { TOGETHER } from "../multiplayer/types";

/**
 * The request someone has made of you ("Bea would like a hug"), your own
 * request while it waits, and short notices about how it went. Above the
 * control bar; at the top on a phone, clear of the touch controls.
 */
export function TogetherPrompt({ nameOf }: { nameOf: (id: string) => string }) {
  const t = useTogether();
  const request = t.incoming[0];
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
      ) : (
        t.notices.length > 0 && (
          <div role="status" aria-live="polite" className="seiza-together" style={{ ...panelStyle, padding: "8px 12px", maxWidth: "calc(100vw - 32px)", pointerEvents: "none" }}>
            {t.notices[t.notices.length - 1].text}
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
