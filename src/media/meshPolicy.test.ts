import { describe, expect, it } from "vitest";
import type { PlayerMedia } from "../multiplayer/types";
import { BUSY_BACKOFF_MS, PEER_MIN_LIFETIME_MS, planPeers, rankPeers, tuneOpus, VOICE_MESH_SOFT_CAP, type PeerPlanInput } from "./meshPolicy";

const MIC: PlayerMedia = { mic: "m" };
const MUTED: PlayerMedia = { mic: "m", micMuted: true };

/** A room of `count` people with mics on, standing 1 m apart along x. */
function room(count: number, media: PlayerMedia = MIC) {
  const players: PeerPlanInput["players"] = { me: { position: [0, 0, 0], media: MIC } };
  for (let i = 1; i <= count; i++) players[`p${String(i).padStart(2, "0")}`] = { position: [i, 0, 0], media };
  return players;
}

function plan(overrides: Partial<PeerPlanInput>) {
  return planPeers({
    selfId: "me",
    players: room(4),
    localActive: true,
    here: [0, 0, 0],
    existing: new Map(),
    busyUntil: new Map(),
    now: 100_000,
    ...overrides,
  });
}

describe("rankPeers", () => {
  it("puts the nearest first", () => {
    expect(rankPeers([{ id: "far", distance: 9, sending: false }, { id: "near", distance: 1, sending: false }])).toEqual(["near", "far"]);
  });

  it("ranks someone who can be heard ahead of a nearer listener", () => {
    const ranked = rankPeers([{ id: "listener", distance: 2, sending: false }, { id: "speaker", distance: 5, sending: true }]);
    expect(ranked).toEqual(["speaker", "listener"]);
  });
});

describe("planPeers within the budget", () => {
  it("connects to everyone, as before the budget had a policy", () => {
    const result = plan({ players: room(VOICE_MESH_SOFT_CAP) });
    expect(result.create).toHaveLength(VOICE_MESH_SOFT_CAP);
    expect(result.acceptable).toBeNull();
  });

  it("connects to no one while nobody has media on", () => {
    const players = room(3, {});
    players.me.media = {};
    expect(plan({ players, localActive: false }).create).toEqual([]);
  });

  it("closes connections to people who left", () => {
    const existing = new Map([["gone", { createdAt: 0 }]]);
    expect(plan({ existing }).close).toEqual(["gone"]);
  });

  it("keeps connecting to a muted mic, so unmuting needs no reconnect", () => {
    expect(plan({ players: room(3, MUTED) }).create).toHaveLength(3);
  });
});

describe("planPeers over the budget", () => {
  const crowd = room(20);

  it("connects to the nearest, not whoever came first in the roster", () => {
    const result = plan({ players: crowd });
    expect(result.create).toHaveLength(VOICE_MESH_SOFT_CAP);
    expect(result.create).toEqual(Array.from({ length: VOICE_MESH_SOFT_CAP }, (_, i) => `p${String(i + 1).padStart(2, "0")}`));
  });

  it("prefers a speaker a little further away over a nearer muted listener", () => {
    const players = room(20, MUTED);
    players.p14.media = MIC; // 14 m away, but unmuted
    expect(plan({ players }).create).toContain("p14");
  });

  it("keeps an existing peer ranked just outside the budget (hysteresis)", () => {
    const existing = new Map([["p13", { createdAt: 0 }]]);
    const result = plan({ players: crowd, existing });
    expect(result.closeBusy).not.toContain("p13");
  });

  it("drops a peer ranked well outside, and says so", () => {
    const existing = new Map([["p20", { createdAt: 0 }]]);
    const result = plan({ players: crowd, existing });
    expect(result.closeBusy).toEqual(["p20"]);
  });

  it("never drops a connection younger than the minimum lifetime", () => {
    const existing = new Map([["p20", { createdAt: 100_000 - PEER_MIN_LIFETIME_MS + 1 }]]);
    expect(plan({ players: crowd, existing }).closeBusy).toEqual([]);
  });

  it("leaves a peer that answered busy alone until the backoff ends", () => {
    const busyUntil = new Map([["p01", 100_000 + BUSY_BACKOFF_MS]]);
    expect(plan({ players: crowd, busyUntil }).create).not.toContain("p01");
    expect(plan({ players: crowd, busyUntil, now: 100_000 + BUSY_BACKOFF_MS }).create).toContain("p01");
  });

  it("accepts offers only from peers it would choose itself", () => {
    const result = plan({ players: crowd });
    expect(result.acceptable?.has("p01")).toBe(true);
    expect(result.acceptable?.has("p20")).toBe(false);
  });

  it("never plans more than the budget", () => {
    const existing = new Map(Array.from({ length: 10 }, (_, i) => [`p${String(i + 1).padStart(2, "0")}`, { createdAt: 0 }] as const));
    const result = plan({ players: crowd, existing });
    expect(existing.size - result.closeBusy.length + result.create.length).toBeLessThanOrEqual(VOICE_MESH_SOFT_CAP);
  });
});

describe("tuneOpus", () => {
  const sdp = [
    "v=0",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "",
  ].join("\r\n");

  it("asks for discontinuous transmission and 24 kbps in every audio section", () => {
    const tuned = tuneOpus(sdp);
    expect(tuned.match(/a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=24000/g)).toHaveLength(2);
  });

  it("is idempotent", () => {
    expect(tuneOpus(tuneOpus(sdp))).toBe(tuneOpus(sdp));
  });

  it("adds an fmtp line when there is none", () => {
    expect(tuneOpus("m=audio 9 X 111\r\na=rtpmap:111 opus/48000/2\r\n")).toContain("a=rtpmap:111 opus/48000/2\r\na=fmtp:111 usedtx=1;maxaveragebitrate=24000");
  });

  it("leaves a description without Opus untouched", () => {
    const video = "m=video 9 X 96\r\na=rtpmap:96 VP8/90000\r\n";
    expect(tuneOpus(video)).toBe(video);
  });
});
