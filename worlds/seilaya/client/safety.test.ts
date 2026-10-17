import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverWorldMessage } from "../../../src/worlds/WorldExtension";
import { answer, ask, block, cleanPronouns, onPlayersChanged, setApi, startListening, state, stepOut, updateSettings } from "./safety";

const player = (id: string, x: number) => ({ id, displayName: id.toUpperCase(), position: [x, 0, 0] as [number, number, number] });

function setup() {
  const sent: { to: string; data: Record<string, unknown> }[] = [];
  const api = {
    selfId: "me",
    players: { me: player("me", 0), amy: player("amy", 1), ben: player("ben", 8) } as never,
    getSelfPosition: () => [0, 0, 0] as [number, number, number],
    playGesture: vi.fn(),
    warp: vi.fn(),
    faceToward: vi.fn(),
    canEdit: false,
    worldState: {} as Record<string, unknown>,
    setWorldState: vi.fn(),
    sendWorldMessage: (to: string, data: unknown) => sent.push({ to, data: data as Record<string, unknown> }),
    setPlayerFilter: vi.fn(),
  };
  setApi(api);
  startListening();
  return { api, sent };
}

describe("consent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.blocked.clear();
    state.incoming = [];
    state.outgoing = null;
    state.inRefuge = false;
    state.nearby = ["amy"];
    state.settings = { ...state.settings, requests: "everyone" };
  });

  it("only plays a gesture after the other person says yes", () => {
    const { api, sent } = setup();
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "req", id: "r1", g: "hug" });
    expect(state.incoming).toHaveLength(1);
    expect(api.playGesture).not.toHaveBeenCalled();
    answer("r1", true);
    expect(sent[sent.length - 1]).toMatchObject({ to: "amy", data: { t: "ok", id: "r1" } });
    expect(api.playGesture).toHaveBeenCalledWith("hug");
  });

  it("turns requests away without a prompt when they're off, or from someone blocked", () => {
    const { sent } = setup();
    updateSettings({ requests: "nobody" });
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "req", id: "r2", g: "handshake" });
    expect(state.incoming).toHaveLength(0);
    expect(sent[sent.length - 1]).toMatchObject({ to: "amy", data: { t: "busy" } });
    updateSettings({ requests: "everyone" });
    block("amy");
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "req", id: "r3", g: "handshake" });
    expect(state.incoming).toHaveLength(0);
  });

  it("asks only people within reach, and plays on their yes", () => {
    const { api, sent } = setup();
    ask("ben", "highfive"); // 8 m away
    expect(state.outgoing).toBeNull();
    ask("amy", "highfive");
    const id = state.outgoing!.id;
    expect(sent[sent.length - 1]).toMatchObject({ to: "amy", data: { t: "req", g: "highfive" } });
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "ok", id });
    expect(api.playGesture).toHaveBeenCalledWith("highfive");
    expect(state.outgoing).toBeNull();
  });

  it("lets a request lapse: no answer means no", () => {
    setup();
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "req", id: "r4", g: "hug" });
    vi.advanceTimersByTime(21_000);
    expect(state.incoming).toHaveLength(0);
  });

  it("ignores anything that isn't a Seilaya message", () => {
    setup();
    deliverWorldMessage("amy", { t: "req", id: "x", g: "hug" });
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "req", id: "y", g: "kiss" });
    expect(state.incoming).toHaveLength(0);
  });
});

describe("refuge and filter", () => {
  it("blocks everyone while stepped out", () => {
    const { api } = setup();
    onPlayersChanged();
    stepOut();
    expect(api.warp).toHaveBeenCalled();
    const last = api.setPlayerFilter.mock.calls[api.setPlayerFilter.mock.calls.length - 1][0] as { blocked: string[] };
    expect(new Set(last.blocked)).toEqual(new Set(["amy", "ben"]));
  });
});

describe("pronouns", () => {
  it("accepts only the fixed list, never free text", () => {
    expect(cleanPronouns("they/them")).toBe("they/them");
    expect(cleanPronouns(" they/them ")).toBe("");
    expect(cleanPronouns("anything else")).toBe("");
    expect(cleanPronouns(42)).toBe("");
  });

  it("drops a free-text tag that arrives from another visitor", () => {
    setup();
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "pron", p: "something rude" });
    expect(state.pronouns.has("amy")).toBe(false);
  });
});

describe("limits on what arrives", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.incoming = [];
    state.blocked.clear();
    state.inRefuge = false;
    state.settings = { ...state.settings, requests: "everyone" };
  });

  it("turns away a person who asks again right after a no", () => {
    const { sent } = setup();
    deliverWorldMessage("ben", { ns: "seilaya/1", t: "req", id: "q1", g: "hug" });
    answer("q1", false);
    deliverWorldMessage("ben", { ns: "seilaya/1", t: "req", id: "q2", g: "hug" });
    expect(state.incoming).toHaveLength(0);
    expect(sent[sent.length - 1]).toMatchObject({ to: "ben", data: { t: "busy", id: "q2" } });
    vi.advanceTimersByTime(31_000);
    deliverWorldMessage("ben", { ns: "seilaya/1", t: "req", id: "q3", g: "hug" });
    expect(state.incoming).toHaveLength(1);
  });

  it("ignores messages from someone not in the room, and badly formed ids", () => {
    setup();
    deliverWorldMessage("ghost", { ns: "seilaya/1", t: "req", id: "g1", g: "hug" });
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "req", id: "<b>bad</b>", g: "hug" });
    expect(state.incoming).toHaveLength(0);
  });

  it("turns everything away while a facilitator has paused requests", () => {
    const { api } = setup();
    api.worldState["seilaya.paused"] = true;
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "req", id: "p1", g: "hug" });
    expect(state.incoming).toHaveLength(0);
    delete api.worldState["seilaya.paused"];
  });
});
