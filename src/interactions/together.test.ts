import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPlayerFilter } from "../multiplayer/playerFilter";
import type { ClientMessage } from "../multiplayer/types";
import { answerTogether, askTogether, getTogether, onTogetherStart, receiveTogether, setAllowRequests, setTogetherConnection, setTogetherPolicy } from "./together";

function wire() {
  const sent: ClientMessage[] = [];
  setTogetherConnection((m) => sent.push(m), (id) => id.toUpperCase());
  return sent;
}

describe("together gestures, this visitor's side", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPlayerFilter(null);
    setAllowRequests(true);
    setTogetherPolicy(null);
    const t = getTogether();
    t.incoming = [];
    t.outgoing = null;
  });

  it("prompts, and answers only when this visitor chooses", () => {
    const sent = wire();
    receiveTogether({ type: "togetherAsked", id: "r1", from: "amy", gesture: "hug" });
    expect(getTogether().incoming).toHaveLength(1);
    expect(sent).toHaveLength(0);
    answerTogether("r1", true);
    expect(sent).toEqual([{ type: "togetherAnswer", id: "r1", accept: true }]);
  });

  it("turns requests away without a prompt: blocked, requests off, or a world's rule", () => {
    const sent = wire();
    setPlayerFilter({ blocked: ["amy"] });
    receiveTogether({ type: "togetherAsked", id: "r2", from: "amy", gesture: "hug" });
    setPlayerFilter(null);
    setAllowRequests(false);
    receiveTogether({ type: "togetherAsked", id: "r3", from: "amy", gesture: "hug" });
    setAllowRequests(true);
    setTogetherPolicy(() => "unavailable");
    receiveTogether({ type: "togetherAsked", id: "r4", from: "amy", gesture: "hug" });
    expect(getTogether().incoming).toHaveLength(0);
    expect(sent.map((m) => m.type === "togetherAnswer" && m.unavailable)).toEqual([true, true, true]);
  });

  it("lets a prompt lapse: no answer means no", () => {
    wire();
    receiveTogether({ type: "togetherAsked", id: "r5", from: "amy", gesture: "handshake" });
    vi.advanceTimersByTime(21_000);
    expect(getTogether().incoming).toHaveLength(0);
  });

  it("starts the gesture only on the server's word", () => {
    const sent = wire();
    const started = vi.fn();
    const off = onTogetherStart(started);
    askTogether("ben", "highfive");
    expect(sent[0]).toEqual({ type: "togetherAsk", to: "ben", gesture: "highfive" });
    receiveTogether({ type: "togetherSent", id: "s1", to: "ben", gesture: "highfive" });
    expect(started).not.toHaveBeenCalled();
    receiveTogether({ type: "togetherStart", id: "s1", gesture: "highfive", partner: "ben", role: "lead" });
    expect(started).toHaveBeenCalledWith({ gesture: "highfive", partner: "ben", role: "lead" });
    expect(getTogether().outgoing).toBeNull();
    off();
  });

  it("ignores gestures that aren't together gestures", () => {
    wire();
    receiveTogether({ type: "togetherAsked", id: "r6", from: "amy", gesture: "kiss" as never });
    expect(getTogether().incoming).toHaveLength(0);
  });
});
