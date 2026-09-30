import { useState } from "react";
import type { PlayerState } from "../multiplayer/types";
import type { ConnectionState } from "../multiplayer/useRoomSocket";
import { panelStyle, pillButtonStyle } from "../ui/styles";
import { CloseIcon, GatherIcon, KickIcon, LocationIcon, MicOffIcon, ShieldIcon, UsersIcon } from "../ui/icons";

interface ParticipantRosterProps {
  worldName: string;
  connectionState: ConnectionState;
  players: Record<string, PlayerState>;
  selfId: string | null;
  isAdmin: boolean;
  onMute: (targetId: string, muted: boolean) => void;
  onKick: (targetId: string) => void;
  onTeleportTo: (targetId: string) => void;
  onGatherAll: () => void;
}

/** A small palette to derive a stable per-person color from, so the same
 *  person's initials bubble looks the same every time without needing to
 *  store a color anywhere. */
const BUBBLE_COLORS = ["#e8c37a", "#8ab4ff", "#7cff9e", "#ff9e7c", "#c792ea", "#7cf0ff", "#ffb3c7"];

function bubbleColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return BUBBLE_COLORS[hash % BUBBLE_COLORS.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The top-left world-name pill, made interactive: click it to see who's
 * in the room. Everyone sees the roster; only a connection that has
 * authenticated as admin (see useRoomSocket's authAdmin) sees the
 * moderation actions on each row, and the server independently
 * re-checks admin status on every one of those regardless of what this
 * component shows — see the doc comments on ClientMessage's adminX
 * variants in multiplayer/types.ts.
 *
 * A real "who is this person" photo would mean fetching and parsing
 * every participant's avatar file just to read a thumbnail out of it —
 * real per-participant network/CPU cost this doesn't spend. Initials
 * avatars are the honest v1 here.
 */
export function ParticipantRoster({
  worldName,
  connectionState,
  players,
  selfId,
  isAdmin,
  onMute,
  onKick,
  onTeleportTo,
  onGatherAll,
}: ParticipantRosterProps) {
  const [open, setOpen] = useState(false);
  const statusColor = connectionState === "connected" ? "#7CFF9E" : connectionState === "connecting" ? "#8ab4ff" : "#ffb347";
  const statusLabel = connectionState === "connected" ? "connected" : connectionState === "connecting" ? "connecting…" : "reconnecting…";
  const roster = Object.values(players).sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    // pointerEvents: "auto" is load-bearing, not decoration. The HUD root is
    // pointerEvents: "none" so the 3D canvas stays interactive through it
    // (see HUD.tsx), which means every interactive child has to opt back in.
    // Without this the world-name pill below cannot be clicked at all and the
    // roster simply never opens — a regression that shipped once already.
    <div style={{ position: "relative", pointerEvents: "auto" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...panelStyle,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 999,
          maxWidth: "60vw",
          overflow: "hidden",
          cursor: "pointer",
          border: open ? "1px solid rgba(232,195,122,0.7)" : (panelStyle.border as string),
        }}
        aria-expanded={open}
        aria-label={`${worldName} — ${roster.length} ${roster.length === 1 ? "person" : "people"} here. Click to see who's in this room.`}
      >
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{worldName}</strong>
        <span style={{ opacity: 0.65, fontSize: 11, whiteSpace: "nowrap" }}>{statusLabel}</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 11,
            opacity: 0.85,
            background: "rgba(255,255,255,0.1)",
            borderRadius: 999,
            padding: "2px 7px",
          }}
        >
          <UsersIcon size={12} /> {roster.length}
        </span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} aria-hidden />
          <div
            // Downward, not the default upward/bottom-docking `.seiza-popover`:
            // this panel's trigger is the world-name pill in the *top-left*
            // corner, and under 640px `.seiza-popover` pins itself to the
            // bottom of the viewport — so tapping the top-left corner made a
            // panel appear at the bottom of the screen, nowhere near it.
            className="seiza-popover-down seiza-popover-down--left"
            style={{
              ...panelStyle,
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              width: "min(320px, calc(100vw - 32px))",
              zIndex: 21,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 13 }}>
                {roster.length} {roster.length === 1 ? "person" : "people"} here
              </strong>
              <button type="button" onClick={() => setOpen(false)} style={{ ...pillButtonStyle, padding: 4 }} aria-label="Close">
                <CloseIcon size={13} />
              </button>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={onGatherAll}
                style={{ ...pillButtonStyle, justifyContent: "center", gap: 6, display: "flex" }}
                title="Teleport everyone else in the room to your current position"
              >
                <GatherIcon size={14} /> Gather everyone here
              </button>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
              {roster.map((player) => {
                const isSelf = player.id === selfId;
                const speaking = Boolean(player.media?.mic);
                return (
                  <div
                    key={player.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 4px",
                      borderRadius: 8,
                      background: isSelf ? "rgba(255,255,255,0.06)" : "transparent",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: bubbleColorFor(player.id),
                        color: "#1a1a1a",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {initialsFor(player.displayName)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                      {player.displayName}
                      {isSelf && <span style={{ opacity: 0.55 }}> (you)</span>}
                    </span>
                    {!speaking && !isSelf && <MicOffIcon size={13} style={{ opacity: 0.4, flexShrink: 0 }} />}

                    {isAdmin && !isSelf && (
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => onMute(player.id, speaking)}
                          style={{ ...pillButtonStyle, padding: "4px 8px", fontSize: 11 }}
                          title={speaking ? "Mute this person's mic" : "Ask this person's client to unmute their mic"}
                        >
                          {speaking ? "Mute" : "Unmute"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onTeleportTo(player.id)}
                          style={{ ...pillButtonStyle, padding: "4px 6px" }}
                          title="Teleport yourself to this person"
                          aria-label="Teleport to this person"
                        >
                          <LocationIcon size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Remove ${player.displayName} from this room?`)) onKick(player.id);
                          }}
                          style={{ ...pillButtonStyle, padding: "4px 6px", borderColor: "rgba(255,138,128,0.5)", color: "#ff8a80" }}
                          title="Remove this person from the room"
                          aria-label="Kick this person"
                        >
                          <KickIcon size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!isAdmin && (
              <small style={{ opacity: 0.55, display: "flex", alignItems: "center", gap: 4 }}>
                <ShieldIcon size={12} /> Moderation actions are only available to a signed-in admin.
              </small>
            )}
          </div>
        </>
      )}
    </div>
  );
}
