import { useRef, useState } from "react";
import { useExclusiveMenu } from "../ui/exclusiveMenu";
import { useDismissOnOutside } from "../ui/useDismissOnOutside";
import { panelStyle, pillButtonActiveStyle, pillButtonStyle, primaryButtonStyle, inputStyle } from "../ui/styles";
import { ShieldIcon, CloseIcon, LockIcon } from "../ui/icons";

interface AdminButtonProps {
  isAdmin: boolean;
  authPending: boolean;
  authFailed: boolean;
  onSubmit: (key: string) => void;
  roomPasswordSet: boolean;
  onSetRoomPassword: (password: string | null) => void;
}

/**
 * A second way into the same admin gate EditToolbar.tsx uses when you try
 * to enable Edit Mode (see App.tsx's canEditWorld / authLabel wiring) —
 * placed next to the Avatar button so admin status doesn't have to be
 * discovered by first attempting to edit the world. Only rendered by
 * App.tsx at all when this deployment has SEIZA_ADMIN_KEY configured;
 * with no key configured there is no admin concept to show a button for.
 *
 * Once signed in, this is also where the room entry password lives — see
 * ADMIN.md for why that's a third, separate, runtime-settable secret
 * rather than reusing the admin key or the editor password.
 */
export function AdminButton({ isAdmin, authPending, authFailed, onSubmit, roomPasswordSet, onSetRoomPassword }: AdminButtonProps) {
  const [open, setOpen] = useState(false);
  useExclusiveMenu("admin", open, () => setOpen(false));
  // Dismiss on an outside press without a backdrop in front of the
  // page — see useDismissOnOutside for the bug that caused.
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(rootRef, open, () => setOpen(false));
  const [draft, setDraft] = useState("");
  const [roomPasswordDraft, setRoomPasswordDraft] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    onSubmit(draft);
  };

  const applyRoomPassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomPasswordDraft) return;
    onSetRoomPassword(roomPasswordDraft);
    setRoomPasswordDraft("");
  };
  const removeRoomPassword = () => {
    onSetRoomPassword(null);
    setRoomPasswordDraft("");
  };

  return (
    <div ref={rootRef} className="seiza-admin-anchor" style={{ pointerEvents: "auto" }}>
      <style>{ADMIN_CSS}</style>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...(isAdmin ? pillButtonActiveStyle : pillButtonStyle), width: 36, height: 36, padding: 0, justifyContent: "center", flexShrink: 0 }}
        aria-expanded={open}
        aria-label={isAdmin ? "Signed in as admin" : "Sign in as admin"}
        title={isAdmin ? "Signed in as admin" : "Sign in as admin"}
      >
        <ShieldIcon size={16} />
      </button>

      {open && (
        <>
          <div
            className="seiza-popover-down seiza-admin-panel"
            style={{
              ...panelStyle,
              position: "absolute",
              top: "calc(100% + 8px)",
              // Fits a phone: never wider than the screen less its gutters,
              // and scrolls rather than running off the bottom.
              width: "min(300px, calc(100vw - 32px))",
              maxHeight: "calc(100svh - 96px)",
              overflowY: "auto",
              boxSizing: "border-box",
              zIndex: 21,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldIcon size={14} /> Admin
              </strong>
              <button type="button" onClick={() => setOpen(false)} style={{ ...pillButtonStyle, padding: 4 }} aria-label="Close">
                <CloseIcon size={13} />
              </button>
            </div>

            {!isAdmin ? (
              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <small style={{ opacity: 0.8 }}>Enter the admin key to unlock world editing and moderation for this session.</small>
                <input
                  type="password"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Admin key"
                  autoComplete="current-password"
                  style={fieldStyle}
                  autoFocus
                />
                {authFailed && <small style={{ color: "#ff8a80" }}>Wrong key.</small>}
                <button type="submit" style={primaryButtonStyle} disabled={authPending || !draft}>
                  {authPending ? "Checking…" : "Unlock"}
                </button>
              </form>
            ) : (
              <>
                <small style={{ opacity: 0.8 }}>
                  You're signed in as admin for this session. This isn't remembered after you reload the page — see ADMIN.md
                  if that surprises you.
                </small>

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <strong style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <LockIcon size={13} /> Room entry password
                  </strong>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "7px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                      background: roomPasswordSet ? "rgba(124,255,158,0.1)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${roomPasswordSet ? "rgba(124,255,158,0.35)" : "rgba(255,255,255,0.1)"}`,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: roomPasswordSet ? "#7CFF9E" : "rgba(255,255,255,0.4)" }}
                    />
                    <span style={{ minWidth: 0 }}>
                      {roomPasswordSet ? "On: people need the password to join." : "Off: anyone with the link can join."}
                    </span>
                  </div>
                  {/* Field above, buttons below, rather than side by side: an
                      input has an intrinsic minimum width, and next to a button
                      in a narrow panel it pushed the button out of the panel. */}
                  <form onSubmit={applyRoomPassword} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      type="text"
                      value={roomPasswordDraft}
                      onChange={(event) => setRoomPasswordDraft(event.target.value)}
                      placeholder={roomPasswordSet ? "New password" : "Choose a password"}
                      aria-label={roomPasswordSet ? "New room password" : "Room password"}
                      autoComplete="off"
                      spellCheck={false}
                      style={fieldStyle}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button
                        type="submit"
                        disabled={!roomPasswordDraft}
                        style={{ ...primaryButtonStyle, flex: "1 1 auto", padding: "8px 12px", fontSize: 13, opacity: roomPasswordDraft ? 1 : 0.5 }}
                      >
                        {roomPasswordSet ? "Change password" : "Require password"}
                      </button>
                      {/* Removing is its own button rather than "submit an
                          empty field", which nobody would guess. */}
                      {roomPasswordSet && (
                        <button type="button" onClick={removeRoomPassword} style={{ ...pillButtonStyle, ...dangerStyle, flex: "1 1 auto", justifyContent: "center", padding: "8px 12px", fontSize: 13 }}>
                          Remove password
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const fieldStyle: React.CSSProperties = { ...inputStyle, width: "100%", minWidth: 0, boxSizing: "border-box" };
const dangerStyle: React.CSSProperties = { color: "#ffb3ab", border: "1px solid rgba(255,138,128,0.4)", background: "rgba(255,138,128,0.08)" };

/**
 * Wide screens: the button sits at the exact top centre of the screen
 * (the HUD's top row is its positioning context), with its panel centred
 * under it. As a plain flex child between the room pill and the Avatar
 * button it only ever landed roughly mid-way, wherever space-between put
 * it.
 *
 * Phones: the centre is where the room pill runs, so the button joins the
 * Avatar button on the right instead, and the panel docks full-width
 * under the top bar like the other top menus (.seiza-popover-down in
 * HUD.tsx). The transform is dropped there too, since a transformed
 * ancestor would trap that fixed-position panel inside the button.
 */
const ADMIN_CSS = `
  .seiza-admin-anchor { position: absolute; top: 0; left: 50%; transform: translateX(-50%); }
  .seiza-admin-panel { left: 50%; margin-left: calc(min(300px, 100vw - 32px) / -2); transform-origin: top center; }
  @media (max-width: 640px) {
    .seiza-admin-anchor { position: relative; left: auto; transform: none; margin-left: auto; flex-shrink: 0; }
    .seiza-admin-panel { margin-left: 0; }
  }
`;
