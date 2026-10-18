import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTogether, receiveTogether, setAllowRequests, setTogetherConnection } from "../../../src/interactions/together";
import type { ClientMessage } from "../../../src/multiplayer/types";
import { deliverWorldMessage } from "../../../src/worlds/WorldExtension";
import { ask, block, cleanPronouns, onPlayersChanged, setApi, startListening, state, stepOut, stopListening } from "./safety";

const player = (id: string, x: number) => ({ id, displayName: id.toUpperCase(), position: [x, 0, 0] as [number, number, number] });

function setup() {
  const sent: ClientMessage[] = [];
  setTogetherConnection((m) => sent.push(m), (id) => id);
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
    sendWorldMessage: vi.fn(),
    setPlayerFilter: vi.fn(),
  };
  setApi(api);
  stopListening();
  startListening();
  return { api, sent };
}

const askedBy = (from: string, id: string) => receiveTogether({ type: "togetherAsked", id, from, gesture: "hug" });
const lastAnswer = (sent: ClientMessage[]) => sent.filter((m) => m.type === "togetherAnswer").pop();

describe("Seilaya's say over together gestures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.blocked.clear();
    state.inRefuge = false;
    state.nearby = ["amy"];
    setAllowRequests(true);
    getTogether().incoming = [];
    getTogether().outgoing = null;
  });

  it("prompts normally", () => {
    setup();
    askedBy("amy", "a1");
    expect(getTogether().incoming).toHaveLength(1);
  });

  it("turns requests away while stepped out, or while a facilitator has paused them", () => {
    const { api, sent } = setup();
    onPlayersChanged();
    stepOut();
    askedBy("amy", "a2");
    expect(lastAnswer(sent)).toMatchObject({ id: "a2", unavailable: true });
    state.inRefuge = false;
    api.worldState["seilaya.paused"] = true;
    askedBy("amy", "a3");
    expect(lastAnswer(sent)).toMatchObject({ id: "a3", unavailable: true });
    expect(getTogether().incoming).toHaveLength(0);
  });

  it("turns away a waiting request when its asker is blocked", () => {
    const { sent } = setup();
    askedBy("amy", "a4");
    block("amy");
    expect(getTogether().incoming).toHaveLength(0);
    expect(lastAnswer(sent)).toMatchObject({ id: "a4", accept: false, unavailable: true });
  });

  it("asks only people within reach", () => {
    const { sent } = setup();
    ask("ben", "highfive"); // 8 m away
    expect(sent.some((m) => m.type === "togetherAsk")).toBe(false);
    ask("amy", "highfive");
    expect(sent.find((m) => m.type === "togetherAsk")).toMatchObject({ to: "amy", gesture: "highfive" });
  });

  it("keeps the partner visible through personal space while the gesture plays", () => {
    const { api } = setup();
    state.inBubble.add("amy");
    receiveTogether({ type: "togetherStart", id: "x", gesture: "hug", partner: "amy", role: "follow" });
    const filter = api.setPlayerFilter.mock.calls[api.setPlayerFilter.mock.calls.length - 1][0] as { hidden: string[] };
    expect(filter.hidden).not.toContain("amy");
    state.inBubble.clear();
  });
});

describe("refuge", () => {
  it("blocks everyone while stepped out", () => {
    const { api } = setup();
    onPlayersChanged();
    stepOut();
    expect(api.warp).toHaveBeenCalled();
    const last = api.setPlayerFilter.mock.calls[api.setPlayerFilter.mock.calls.length - 1][0] as { blocked: string[] };
    expect(new Set(last.blocked)).toEqual(new Set(["amy", "ben"]));
    state.inRefuge = false;
  });
});

describe("pronouns", () => {
  it("accepts only the fixed list, never free text", () => {
    expect(cleanPronouns("they/them")).toBe("they/them");
    expect(cleanPronouns(" they/them ")).toBe("");
    expect(cleanPronouns("anything else")).toBe("");
    expect(cleanPronouns(42)).toBe("");
  });

  it("drops a free-text tag that arrives from another visitor, and ignores strangers", () => {
    vi.useFakeTimers();
    setup();
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "pron", p: "something rude" });
    deliverWorldMessage("ghost", { ns: "seilaya/1", t: "pron", p: "she/her" });
    expect(state.pronouns.has("amy")).toBe(false);
    expect(state.pronouns.has("ghost")).toBe(false);
    vi.advanceTimersByTime(2_100); // one pronoun update per sender every two seconds
    deliverWorldMessage("amy", { ns: "seilaya/1", t: "pron", p: "she/her" });
    expect(state.pronouns.get("amy")).toBe("she/her");
  });
});
