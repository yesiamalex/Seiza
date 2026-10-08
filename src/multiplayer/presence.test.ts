import { describe, expect, it } from "vitest";
import { AWAY_AFTER_MS, HEARTBEAT_MS, HIDDEN_HEARTBEAT_MS, shouldSendState, shouldStepAway, type SentState } from "./presence";

const at = (seconds: number) => seconds * 1000;
const sent: SentState = { position: [1, 0, 2], rotationY: 0.5, headPitch: 0, at: at(100) };

describe("shouldSendState", () => {
  it("always sends the first update", () => {
    expect(shouldSendState(null, sent, at(100), false)).toBe(true);
  });

  it("stays quiet while standing still, until the heartbeat", () => {
    expect(shouldSendState(sent, sent, at(100) + HEARTBEAT_MS - 1, false)).toBe(false);
    expect(shouldSendState(sent, sent, at(100) + HEARTBEAT_MS + 1, false)).toBe(true);
  });

  it("uses the slower heartbeat in a hidden tab", () => {
    expect(shouldSendState(sent, sent, at(100) + HEARTBEAT_MS + 1, true)).toBe(false);
    expect(shouldSendState(sent, sent, at(100) + HIDDEN_HEARTBEAT_MS + 1, true)).toBe(true);
  });

  it("sends as soon as the player moves, turns, or looks up", () => {
    const soon = at(100.2);
    expect(shouldSendState(sent, { ...sent, position: [1.05, 0, 2] }, soon, false)).toBe(true);
    expect(shouldSendState(sent, { ...sent, rotationY: 0.6 }, soon, false)).toBe(true);
    expect(shouldSendState(sent, { ...sent, headPitch: 0.1 }, soon, false)).toBe(true);
  });

  it("ignores jitter too small to see", () => {
    expect(shouldSendState(sent, { ...sent, position: [1.001, 0, 2.001] }, at(100.2), false)).toBe(false);
  });

  it("costs a seated listener 12 messages a minute instead of 300", () => {
    let last: SentState | null = null;
    let messages = 0;
    for (let t = 0; t < 60_000; t += 200) {
      if (shouldSendState(last, sent, t, false)) {
        messages += 1;
        last = { ...sent, at: t };
      }
    }
    expect(messages).toBe(12);
  });
});

describe("shouldStepAway", () => {
  const long = AWAY_AFTER_MS + 1;

  it("steps out a tab hidden and untouched for an hour", () => {
    expect(shouldStepAway({ hiddenSince: 0, lastInputAt: 0, sendingMedia: false, now: long })).toBe(true);
  });

  it("never steps out a visible tab", () => {
    expect(shouldStepAway({ hiddenSince: null, lastInputAt: 0, sendingMedia: false, now: long * 3 })).toBe(false);
  });

  it("keeps someone who is speaking, on camera, or sharing", () => {
    expect(shouldStepAway({ hiddenSince: 0, lastInputAt: 0, sendingMedia: true, now: long })).toBe(false);
  });

  it("waits a full hour after the last input as well", () => {
    expect(shouldStepAway({ hiddenSince: 0, lastInputAt: long - 1000, sendingMedia: false, now: long })).toBe(false);
  });

  it("waits a full hour after the tab was hidden", () => {
    expect(shouldStepAway({ hiddenSince: 1000, lastInputAt: 0, sendingMedia: false, now: AWAY_AFTER_MS })).toBe(false);
  });
});
