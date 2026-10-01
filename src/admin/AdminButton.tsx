import { useState } from "react";
import { useExclusiveMenu } from "../ui/exclusiveMenu";
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
  const [draft, setDraft] = useState("");
  const [roomPasswordDraft, setRoomPasswordDraft] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    onSubmit(draft);
  };

  const applyRoomPassword = (event: React.FormEvent) => {
    event.preventDefault();
    onSetRoomPassword(roomPasswordDraft.length > 0 ? roomPasswordDraft : null);
    setRoomPasswordDraft("");
  };

  return (
    <div style={{ position: "relative", pointerEvents: "auto" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...(isAdmin ? pillButtonActiveStyle : pillButtonStyle), padding: "8px 10px" }}
        aria-expanded={open}
        aria-label={isAdmin ? "Signed in as admin" : "Sign in as admin"}
        title={isAdmin ? "Signed in as admin" : "Sign in as admin"}
      >
        <ShieldIcon size={16} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} aria-hidden />
          <div
            className="seiza-popover"
            style={{
              ...panelStyle,
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 260,
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
                  style={inputStyle}
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
                  <small style={{ opacity: 0.7 }}>
                    {roomPasswordSet
                      ? "This room currently requires a password to join. Set a new one below to change it, or clear the field and apply to remove it."
                      : "Anyone with the link can join this room right now. Set a password below to require one."}
                  </small>
                  <form onSubmit={applyRoomPassword} style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={roomPasswordDraft}
                      onChange={(event) => setRoomPasswordDraft(event.target.value)}
                      placeholder={roomPasswordSet ? "New password (blank to remove)" : "Set a room password"}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button type="submit" style={{ ...pillButtonStyle, whiteSpace: "nowrap" }}>
                      {roomPasswordDraft.length > 0 ? "Set" : "Remove"}
                    </button>
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
