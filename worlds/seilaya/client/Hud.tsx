// Seilaya's HUD, over the world: the Safety button and its panel, the
// prompt when someone asks for a together gesture, the banner while you've
// stepped out, short notices, the code of conduct on a first visit, and the
// cards the stations open. One component, shown through Seiza's
// showWorldOverlay, re-rendering from the safety store (safety.ts).
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ACCENT_COLOR, panelStyle, pillButtonActiveStyle, pillButtonStyle, primaryButtonStyle } from "../../../src/ui/styles";
import { setAllowRequests, useTogether } from "../../../src/interactions/together";
import { BYSTANDER, CARDS, HELP_CONTACTS, QUIZ } from "./info";
import { REFERENCES } from "./references";
import {
  ask,
  block,
  BUBBLE_CHOICES,
  cannotAsk,
  cleanNotice,
  isFacilitator,
  nameOf,
  openCard,
  others,
  PRONOUNS,
  REACH,
  returnFromRefuge,
  ROOM_KEYS,
  roomSettings,
  setRoom,
  showToEveryone,
  state,
  stepOut,
  TOGETHER,
  unblock,
  updateSettings,
  useSafety,
  type CardKey,
} from "./safety";

const fixed = (style: CSSProperties): CSSProperties => ({ position: "fixed", pointerEvents: "auto", zIndex: 35, ...style });
const section: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" };
const heading: CSSProperties = { margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_COLOR, opacity: 0.9 };
const small: CSSProperties = { fontSize: 12, opacity: 0.75, margin: 0, lineHeight: 1.45 };
const chip = (active: boolean): CSSProperties => ({ ...(active ? pillButtonActiveStyle : pillButtonStyle), padding: "6px 12px", fontSize: 12 });

/**
 * Layout that inline styles can't express. On a phone the panel takes the
 * width of the screen and stops above the control bar; prompts and notices
 * move to the top, clear of the touch joystick and buttons; and every
 * button gets a finger-sized target.
 */
const HUD_CSS = `
  .sl-panel { top: 116px; left: 16px; width: min(340px, calc(100vw - 32px)); max-height: calc(100dvh - 220px); }
  .sl-bottom { bottom: 104px; }
  @media (max-width: 640px) {
    /* Stops above the touch controls (the D-pad and jump button). */
    .sl-panel { top: 112px; left: 8px; right: 8px; width: auto; max-height: calc(100dvh - 330px); }
    .sl-bottom { bottom: auto; top: 112px; }
    .sl-notices { bottom: auto !important; top: 64px; }
    .sl-banner { top: 116px !important; max-width: calc(100vw - 16px) !important; width: calc(100vw - 16px) !important; }
  }
  @media (pointer: coarse) {
    .sl-panel button, .sl-bottom button, .sl-card button { min-height: 40px; }
  }
`;

export function SeilayaHud() {
  const s = useSafety();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (state.card && state.settings.agreed) openCard(null);
      else if (state.panelOpen) {
        state.panelOpen = false;
        openCard(state.card);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <style>{HUD_CSS}</style>
      <SafetyButton />
      {s.panelOpen && <SafetyPanel />}
      {s.inRefuge ? <RefugeBanner /> : <RoomNotice />}
      {/* Requests and their prompts are Seiza's own (TogetherPrompt). */}
      <Notices />
      {!s.settings.agreed ? <CardModal card="conduct" gate /> : s.card && <CardModal card={s.card} />}
    </>
  );
}

// --- the button and the panel ----------------------------------------------------------------

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function SafetyButton() {
  const s = useSafety();
  const t = useTogether();
  const toggle = () => {
    state.panelOpen = !state.panelOpen;
    openCard(state.card);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="sl-safety"
      aria-expanded={s.panelOpen}
      aria-label="Safety tools"
      style={fixed({ top: 72, left: 16, ...(s.panelOpen ? pillButtonActiveStyle : { ...pillButtonStyle, background: "rgba(18,18,22,0.72)" }) })}
    >
      <ShieldIcon /> Safety
      {t.incoming.length > 0 && <span style={{ width: 8, height: 8, borderRadius: 4, background: "#ffb36b" }} aria-label="A request is waiting" />}
    </button>
  );
}

function SafetyPanel() {
  const s = useSafety();
  const people = others();
  const room = roomSettings();
  const t = useTogether();
  return (
    <div
      role="dialog"
      aria-label="Safety tools"
      className="sl-panel"
      style={fixed({
        ...panelStyle,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        lineHeight: 1.4,
      })}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 15 }}>Your safety tools</strong>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={{ ...pillButtonStyle, padding: "5px 10px", fontSize: 12 }} onClick={() => openCard("safety")}>
            How they work
          </button>
          <button
            type="button"
            style={{ ...pillButtonStyle, padding: "5px 10px", fontSize: 12 }}
            onClick={() => {
              state.panelOpen = false;
              openCard(state.card);
            }}
          >
            Done
          </button>
        </div>
      </div>
      <p style={small}>Only you see these choices. Nothing is recorded, and nobody is told.</p>
      {room.notice && (
        <p style={{ ...small, opacity: 1, color: ACCENT_COLOR }}>
          <strong>Facilitator:</strong> {room.notice}
        </p>
      )}

      <div style={section}>
        <h3 style={heading}>Personal space</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {BUBBLE_CHOICES.map((r) => (
            <button
              key={r}
              type="button"
              style={{ ...chip(Math.max(s.settings.bubble, room.minSpace) === r), opacity: r < room.minSpace ? 0.4 : 1 }}
              disabled={r < room.minSpace}
              onClick={() => updateSettings({ bubble: r })}
            >
              {r === 0 ? "Off" : `${r} m`}
            </button>
          ))}
        </div>
        <p style={small}>
          Anyone closer than this fades from your view. Their voice still comes through.
          {room.minSpace > 0 && ` The facilitator has set at least ${room.minSpace} m for everyone.`}
        </p>
      </div>

      <div style={section}>
        <h3 style={heading}>Handshakes, hugs, dances, and more</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={chip(t.allow)} onClick={() => setAllowRequests(true)}>
            Others may ask me
          </button>
          <button type="button" style={chip(!t.allow)} onClick={() => setAllowRequests(false)}>
            No requests
          </button>
        </div>
        {room.paused ? (
          <p style={small}>The facilitator has paused requests for everyone for now.</p>
        ) : s.nearby.length === 0 ? (
          <p style={small}>Stand within {REACH} m of someone to ask them. They're asked first, and it only happens if they say yes.</p>
        ) : (
          s.nearby.map((id) => (
            <div key={id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13 }}>Ask {nameOf(id)} for</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {TOGETHER.map((t) => (
                  <button key={t.name} type="button" style={chip(false)} disabled={!!cannotAsk(id)} title={cannotAsk(id) ?? undefined} onClick={() => ask(id, t.name)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={section}>
        <h3 style={heading}>People here</h3>
        {people.length === 0 ? (
          <p style={small}>Nobody else is here right now.</p>
        ) : (
          people.map((id) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nameOf(id)}
                {s.pronouns.get(id) && <span style={{ opacity: 0.6 }}> ({s.pronouns.get(id)})</span>}
              </span>
              {s.blocked.has(id) ? (
                <button type="button" style={chip(true)} onClick={() => unblock(id)}>
                  Unblock
                </button>
              ) : (
                <button type="button" style={chip(false)} onClick={() => block(id)}>
                  Block
                </button>
              )}
            </div>
          ))
        )}
        <p style={small}>Blocking hides them from you for this visit: avatar, voice, and chat. They aren't told.</p>
      </div>

      <div style={section}>
        <h3 style={heading}>Your pronouns (optional)</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["", ...PRONOUNS].map((p) => (
            <button key={p || "none"} type="button" style={chip(s.settings.pronouns === p)} onClick={() => updateSettings({ pronouns: p })}>
              {p || "None"}
            </button>
          ))}
        </div>
        <p style={small}>Shown under your name to the people here, and only while you're here.</p>
      </div>

      {isFacilitator() && <FacilitatorSection />}

      <div style={section}>
        <h3 style={heading}>Need a moment?</h3>
        {s.inRefuge ? (
          <button type="button" style={primaryButtonStyle} onClick={() => returnFromRefuge(true)}>
            Return to where I was
          </button>
        ) : (
          <button type="button" style={primaryButtonStyle} onClick={stepOut}>
            Step out to Kanlungan
          </button>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={chip(false)} onClick={() => openCard("help")}>
            If something happened
          </button>
          <button type="button" style={chip(false)} onClick={() => openCard("conduct")}>
            Code of conduct
          </button>
        </div>
      </div>
    </div>
  );
}

// --- facilitators ----------------------------------------------------------------------------------

/** Room-wide controls for the room's editors and admins. They go through
 *  Seiza's shared world state, which only editors can change. */
function FacilitatorSection() {
  const room = roomSettings();
  const [draft, setDraft] = useState(room.notice);
  return (
    <div style={section}>
      <h3 style={heading}>Facilitator</h3>
      <p style={small}>You can change these because you're an editor here. They apply to everyone in the room.</p>
      <button type="button" style={chip(room.paused)} onClick={() => setRoom(ROOM_KEYS.paused, !room.paused)}>
        {room.paused ? "Requests paused for everyone: resume" : "Pause handshake, hug, and dance requests"}
      </button>
      <span style={{ fontSize: 12, opacity: 0.85 }}>Minimum personal space for everyone</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {BUBBLE_CHOICES.map((r) => (
          <button key={r} type="button" style={chip(room.minSpace === r)} onClick={() => setRoom(ROOM_KEYS.minSpace, r)}>
            {r === 0 ? "None" : `${r} m`}
          </button>
        ))}
      </div>
      <form
        style={{ display: "flex", gap: 6 }}
        onSubmit={(event) => {
          event.preventDefault();
          setRoom(ROOM_KEYS.notice, cleanNotice(draft));
        }}
      >
        <input
          value={draft}
          maxLength={64}
          placeholder="A short notice for everyone"
          aria-label="Notice for everyone"
          onChange={(event) => setDraft(event.target.value)}
          style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, color: "white", padding: "6px 8px", fontSize: 13 }}
        />
        <button type="submit" style={chip(false)}>
          Post
        </button>
        {room.notice && (
          <button
            type="button"
            style={chip(false)}
            onClick={() => {
              setDraft("");
              setRoom(ROOM_KEYS.notice, "");
            }}
          >
            Clear
          </button>
        )}
      </form>
      <p style={small}>Every card has a "Show this to everyone" button for you. Where the deployment has an admin key, the Admin menu can also mute, remove, or gather people.</p>
    </div>
  );
}

/** The facilitator's notice, shown to everyone until they clear it. */
function RoomNotice() {
  const s = useSafety();
  const t = useTogether();
  const notice = roomSettings().notice;
  const [hidden, setHidden] = useState<string | null>(null);
  // While the panel is open it shows the notice itself (and on a phone
  // this banner would cover the panel's header).
  // A request on screen takes the spot first.
  if (!notice || hidden === notice || s.panelOpen || t.incoming[0] || t.outgoing) return null;
  return (
    <div role="status" className="sl-banner" style={fixed({ ...panelStyle, top: 72, left: "50%", transform: "translateX(-50%)", maxWidth: "min(420px, calc(100vw - 160px))", display: "flex", gap: 10, alignItems: "center", padding: "8px 12px" })}>
      <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: ACCENT_COLOR }}>Facilitator</span>
      <span style={{ flex: 1 }}>{notice}</span>
      <button type="button" aria-label="Hide notice" style={{ ...pillButtonStyle, padding: "4px 9px", fontSize: 12 }} onClick={() => setHidden(notice)}>
        ✕
      </button>
    </div>
  );
}

// --- requests, the refuge banner, and notices ---------------------------------------------------

function RefugeBanner() {
  return (
    <div role="status" className="sl-banner" style={fixed({ ...panelStyle, top: 72, left: "50%", transform: "translateX(-50%)", width: "min(420px, calc(100vw - 32px))", display: "flex", flexDirection: "column", gap: 8, textAlign: "center" })}>
      <strong>You've stepped out to Kanlungan.</strong>
      <span style={small}>You won't see or hear anyone, and nobody can ask you for anything, until you return. Others may still see your avatar here.</span>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" style={{ ...primaryButtonStyle, padding: "8px 14px" }} onClick={() => returnFromRefuge(true)}>
          Return to where I was
        </button>
        <button type="button" style={pillButtonStyle} onClick={() => returnFromRefuge(false)}>
          Stay here, but rejoin
        </button>
      </div>
    </div>
  );
}

function Notices() {
  const s = useSafety();
  const t = useTogether();
  if (s.notices.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="sl-notices" style={fixed({ bottom: t.incoming[0] || t.outgoing || t.notices.length ? 250 : 104, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 6, alignItems: "center", pointerEvents: "none", width: "min(420px, calc(100vw - 32px))" })}>
      {s.notices.map((n) => (
        <div key={n.id} style={{ ...panelStyle, padding: "8px 12px", textAlign: "center" }}>
          {n.text}
        </div>
      ))}
    </div>
  );
}

// --- cards ------------------------------------------------------------------------------------------

function CardModal({ card, gate = false }: { card: CardKey; gate?: boolean }) {
  const close = () => openCard(null);
  const title = card === "quiz" ? "Is this harassment?" : card === "bystander" ? "What would you do?" : CARDS[card].title;
  return (
    <div
      role="dialog"
      aria-label={title}
      onClick={gate ? undefined : close}
      style={fixed({ inset: 0, display: "grid", placeItems: "center", padding: 16, zIndex: 40, background: gate ? "rgba(6,8,14,0.55)" : undefined })}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="sl-card"
        style={{ ...panelStyle, width: "min(460px, 100%)", maxHeight: "min(660px, 90dvh)", overflowY: "auto", padding: 16, fontSize: 14, lineHeight: 1.5 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <strong style={{ fontSize: 16 }}>{gate ? "Before you start" : title}</strong>
          {!gate && (
            <button type="button" style={pillButtonStyle} onClick={close} aria-label="Close">
              Close
            </button>
          )}
        </div>
        {card === "quiz" ? <Quiz /> : card === "bystander" ? <Bystander /> : <CardBody card={card} />}
        {!gate && isFacilitator() && (
          <button type="button" style={{ ...pillButtonStyle, marginTop: 12 }} onClick={() => showToEveryone(card)} title="Opens this card for everyone in the room">
            Show this to everyone
          </button>
        )}
        {gate && (
          <button type="button" style={{ ...primaryButtonStyle, width: "100%", marginTop: 12 }} onClick={() => updateSettings({ agreed: true })}>
            I agree. Let me in
          </button>
        )}
      </div>
    </div>
  );
}

function CardBody({ card }: { card: Exclude<CardKey, "quiz" | "bystander"> }) {
  const s = useSafety();
  const c = CARDS[card];
  const items: ReactNode[] = [];
  let list: [string, string][] = [];
  const flush = () => {
    if (!list.length) return;
    const rows = list;
    items.push(
      <dl key={items.length} style={{ margin: "0 0 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(([term, text]) => (
          <div key={term}>
            <dt style={{ fontWeight: 600 }}>{term}</dt>
            <dd style={{ margin: 0, opacity: 0.85 }}>{text}</dd>
          </div>
        ))}
      </dl>
    );
    list = [];
  };
  for (const part of c.body) {
    if (Array.isArray(part)) list.push(part);
    else {
      flush();
      items.push(
        <p key={items.length} style={{ margin: "0 0 8px" }}>
          {part}
        </p>
      );
    }
  }
  flush();
  return (
    <>
      {items}
      {card === "help" && (
        <ul style={{ margin: "4px 0 8px", paddingLeft: 18 }}>
          {HELP_CONTACTS.map((h) => (
            <li key={h.label}>
              <strong>{h.label}.</strong> <span style={{ opacity: 0.85 }}>{h.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {card === "refuge" &&
        (s.inRefuge ? (
          <button type="button" style={{ ...primaryButtonStyle, width: "100%" }} onClick={() => returnFromRefuge(true)}>
            Return to where I was
          </button>
        ) : (
          <button
            type="button"
            style={{ ...primaryButtonStyle, width: "100%" }}
            onClick={() => {
              openCard(null);
              stepOut();
            }}
          >
            Step out now
          </button>
        ))}
      {c.sources.length > 0 && (
        <p style={{ margin: "10px 0 0", fontSize: 12, opacity: 0.75 }}>
          <strong>Sources:</strong>{" "}
          {c.sources.map((key, i) => {
            const ref = REFERENCES[key];
            return (
              <span key={key}>
                {i > 0 && "; "}
                {ref.url ? (
                  <a href={ref.url} target="_blank" rel="noopener noreferrer" title={ref.full} style={{ color: "inherit" }}>
                    {ref.short}
                  </a>
                ) : (
                  <span title={ref.full}>{ref.short}</span>
                )}
              </span>
            );
          })}
          .
        </p>
      )}
    </>
  );
}

function Quiz() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  if (index >= QUIZ.length) {
    return (
      <>
        <p style={{ marginTop: 0 }}>
          You matched {score} of {QUIZ.length}. The thread through all of them: was it wanted? Did everyone agree?
        </p>
        <p style={small}>These answers follow the Safe Spaces Act (RA 11313). Real cases are decided by your school's Committee on Decorum and Investigation. This isn't legal advice.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" style={pillButtonStyle} onClick={() => { setIndex(0); setScore(0); setPicked(null); }}>
            Try again
          </button>
          <button type="button" style={pillButtonStyle} onClick={() => openCard("safespaces")}>
            Read about the Act
          </button>
        </div>
      </>
    );
  }
  const item = QUIZ[index];
  const choose = (value: boolean) => {
    if (picked !== null) return;
    setPicked(value);
    if (value === item.harassment) setScore((n) => n + 1);
  };
  return (
    <>
      <p style={{ ...small, marginBottom: 6 }}>
        {index + 1} of {QUIZ.length}
      </p>
      <p style={{ marginTop: 0, fontSize: 15 }}>{item.situation}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={{ ...chip(picked === true), flex: 1, justifyContent: "center" }} onClick={() => choose(true)}>
          Harassment
        </button>
        <button type="button" style={{ ...chip(picked === false), flex: 1, justifyContent: "center" }} onClick={() => choose(false)}>
          Not harassment
        </button>
      </div>
      {picked !== null && (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: picked === item.harassment ? "rgba(124,255,158,0.1)" : "rgba(255,179,107,0.12)", border: `1px solid ${picked === item.harassment ? "rgba(124,255,158,0.3)" : "rgba(255,179,107,0.35)"}` }}>
          <strong>{item.harassment ? "Harassment." : "Not harassment."}</strong> {item.why}
          <div style={{ marginTop: 8 }}>
            <button type="button" style={{ ...primaryButtonStyle, padding: "7px 14px" }} onClick={() => { setIndex((i) => i + 1); setPicked(null); }}>
              {index + 1 < QUIZ.length ? "Next" : "See how you did"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Bystander() {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <>
      <p style={{ marginTop: 0, fontSize: 15 }}>{BYSTANDER.scenario}</p>
      <p style={{ ...small, marginBottom: 8 }}>What would you do? Any of these can help. Pick one to see why.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {BYSTANDER.choices.map((choice, i) => (
          <div key={choice.label}>
            <button type="button" style={{ ...chip(picked === i), width: "100%", whiteSpace: "normal", textAlign: "left", justifyContent: "flex-start", borderRadius: 10 }} onClick={() => setPicked(i)}>
              {choice.label}
            </button>
            {picked === i && <p style={{ margin: "6px 4px 2px", fontSize: 13, opacity: 0.9 }}>{choice.feedback}</p>}
          </div>
        ))}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12, opacity: 0.75 }}>
        <strong>Source:</strong>{" "}
        <a href={REFERENCES.rightToBe.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
          {REFERENCES.rightToBe.short}
        </a>
        . Only step in directly when it's safe for you.
      </p>
    </>
  );
}
