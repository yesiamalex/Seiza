/**
 * The voice mesh's rules, kept free of WebRTC and React so they can be
 * tested on their own (see meshPolicy.test.ts): whom to connect to when a
 * room has more people than the budget allows, and the Opus settings each
 * side asks the other to use. useRealtimeMedia.ts applies them.
 */
import type { PlayerMedia } from "../multiplayer/types";

/** At most this many voice connections are kept: the point beyond which
 *  a mesh stops being practical on ordinary connections. */
export const VOICE_MESH_SOFT_CAP = 12;
/** Peers ranked just outside the budget are kept rather than dropped,
 *  so someone standing at the edge doesn't flicker in and out. */
export const VOICE_PEER_HYSTERESIS = 2;
/** A connection is never closed for ranking reasons sooner than this. */
export const PEER_MIN_LIFETIME_MS = 5_000;
/** Someone who can be heard ranks as if this much closer than a listener. */
export const SPEAKER_PRIORITY_METRES = 4;
/** After a peer answers "busy", it isn't asked again for this long. */
export const BUSY_BACKOFF_MS = 15_000;
/** Voice is speech, not music: mono Opus at this rate stays clear. A muted
 *  mic sends nothing at all (its sender has no track). */
export const VOICE_MAX_BITRATE = 24_000;

/** Whether someone has any media on at all, muted mic included. */
export const hasAnyMedia = (media: PlayerMedia | undefined) => !!(media && (media.mic || media.camera || media.screen));

/** Whether someone is sending anything a peer would hear or see. */
export const isSending = (media: PlayerMedia | undefined) =>
  !!(media && ((media.mic && !media.micMuted) || media.camera || media.screen));

/**
 * Which peers come first when there are more than the budget allows: the
 * nearest, with anyone who can actually be heard (an unmuted mic, a
 * camera, a screen) ranked as if a few metres closer than someone only
 * listening. Voice fades to nothing at a distance, so the people left out
 * are the ones who couldn't be heard anyway.
 */
export function rankPeers(candidates: { id: string; distance: number; sending: boolean }[]): string[] {
  return candidates
    .map((candidate) => ({ id: candidate.id, score: candidate.distance - (candidate.sending ? SPEAKER_PRIORITY_METRES : 0) }))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    .map((candidate) => candidate.id);
}

export interface PeerPlanInput {
  selfId: string;
  players: Record<string, { position: [number, number, number]; media?: PlayerMedia }>;
  /** Whether this client has any media on (a muted mic counts). */
  localActive: boolean;
  /** Where this client is, or null before the first position tick. */
  here: [number, number, number] | null;
  /** Current connections, by peer id, with when each was opened. */
  existing: ReadonlyMap<string, { createdAt: number }>;
  /** Peers that answered "busy", and until when to leave them be. */
  busyUntil: ReadonlyMap<string, number>;
  now: number;
}

export interface PeerPlan {
  /** Gone, or nothing to exchange any more: close quietly. */
  close: string[];
  /** Ranked out: tell them "busy", so they back off, then close. */
  closeBusy: string[];
  create: string[];
  /** Over budget, the peers we'd accept an incoming offer from; null
   *  while everyone fits. */
  acceptable: Set<string> | null;
}

/**
 * Plans the connections for this moment. While everyone fits in the
 * budget it connects to all of them, exactly as before the budget had a
 * policy. Past it, the ranking above decides, with hysteresis: a peer
 * already connected is kept while it ranks within the budget plus
 * VOICE_PEER_HYSTERESIS, and never closed for ranking within
 * PEER_MIN_LIFETIME_MS of opening.
 */
export function planPeers(input: PeerPlanInput): PeerPlan {
  const { selfId, players, localActive, here, existing, busyUntil, now } = input;
  const plan: PeerPlan = { close: [], closeBusy: [], create: [], acceptable: null };

  const kept = new Set<string>();
  for (const id of existing.keys()) {
    const gone = !players[id];
    const idle = !localActive && !hasAnyMedia(players[id]?.media);
    if (gone || idle) plan.close.push(id);
    else kept.add(id);
  }

  const wanted = Object.keys(players).filter(
    (id) => id !== selfId && (localActive || hasAnyMedia(players[id]?.media)) && (busyUntil.get(id) ?? 0) <= now
  );
  if (wanted.length <= VOICE_MESH_SOFT_CAP) {
    plan.create = wanted.filter((id) => !kept.has(id));
    return plan;
  }

  const ranked = rankPeers(
    wanted.map((id) => {
      const position = players[id].position;
      const distance = here ? Math.hypot(position[0] - here[0], position[1] - here[1], position[2] - here[2]) : 0;
      return { id, distance, sending: isSending(players[id]?.media) };
    })
  );
  const chosen = new Set(ranked.slice(0, VOICE_MESH_SOFT_CAP));
  const tolerated = new Set(ranked.slice(0, VOICE_MESH_SOFT_CAP + VOICE_PEER_HYSTERESIS));
  plan.acceptable = tolerated;

  for (const id of Array.from(kept)) {
    const openedAt = existing.get(id)?.createdAt ?? now;
    if (tolerated.has(id) || now - openedAt < PEER_MIN_LIFETIME_MS) continue;
    plan.closeBusy.push(id);
    kept.delete(id);
  }
  let slots = VOICE_MESH_SOFT_CAP - kept.size;
  for (const id of ranked) {
    if (slots <= 0) break;
    if (!chosen.has(id) || kept.has(id)) continue;
    plan.create.push(id);
    slots -= 1;
  }
  return plan;
}

/**
 * Asks the other side to send voice with a bitrate ceiling, forward error
 * correction, and no discontinuous transmission. These are receiver
 * preferences in Opus's SDP parameters, so each side writes them into its
 * own offer or answer and the other side's encoder honours them. Browsers
 * that don't support one ignore it.
 *
 * Discontinuous transmission (usedtx) is turned off on purpose. It stops
 * sending while the encoder judges the input to be silence, and that
 * judgement clips the start of words, drops quiet speech, and pumps
 * comfort noise in and out: a voice that pops in and out. It is also the
 * one setting here that overrides what the browser offered.
 */
export function tuneOpus(sdp: string): string {
  const rtpmap = /a=rtpmap:(\d+) opus\/48000[^\r\n]*/i.exec(sdp);
  if (!rtpmap) return sdp;
  const payload = rtpmap[1];
  /** Set when missing, left alone when the browser chose a value. */
  const defaults: Record<string, string> = { useinbandfec: "1", maxaveragebitrate: String(VOICE_MAX_BITRATE) };
  /** Always set, replacing whatever the browser offered. */
  const forced: Record<string, string> = { usedtx: "0" };
  if (!new RegExp(`a=fmtp:${payload} `).test(sdp)) {
    const params = Object.entries({ ...defaults, ...forced }).map(([key, value]) => `${key}=${value}`);
    const line = `a=fmtp:${payload} ${params.join(";")}`;
    return sdp.replace(new RegExp(`(a=rtpmap:${payload} opus\\/48000[^\\r\\n]*)`, "g"), `$1\r\n${line}`);
  }
  return sdp.replace(new RegExp(`a=fmtp:${payload} ([^\\r\\n]*)`, "g"), (_line, params: string) => {
    const parts = params.split(";").map((part) => part.trim()).filter(Boolean);
    for (const [key, value] of Object.entries(forced)) {
      const at = parts.findIndex((part) => part.startsWith(`${key}=`));
      if (at >= 0) parts[at] = `${key}=${value}`;
      else parts.push(`${key}=${value}`);
    }
    for (const [key, value] of Object.entries(defaults)) {
      if (!parts.some((part) => part.startsWith(`${key}=`))) parts.push(`${key}=${value}`);
    }
    return `a=fmtp:${payload} ${parts.join(";")}`;
  });
}

/** Within this distance a voice plays at full volume: talking range. */
export const VOICE_FULL_DISTANCE = 3;
/** Beyond this distance a voice is silent. */
export const VOICE_SILENT_DISTANCE = 16;

/**
 * How loud someone sounds at a distance, 0 to 1: full within talking
 * range, then an S-curve down to silence, so a voice fades gently as you
 * walk off rather than starting to drop the moment you step away. Measured
 * on the floor plan: standing on a step or the tatami doesn't quieten
 * anyone.
 */
export function voiceVolume(dx: number, dz: number): number {
  const d = Math.hypot(dx, dz);
  const t = Math.min(1, Math.max(0, (d - VOICE_FULL_DISTANCE) / (VOICE_SILENT_DISTANCE - VOICE_FULL_DISTANCE)));
  return 1 - t * t * (3 - 2 * t);
}
