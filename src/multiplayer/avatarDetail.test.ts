import { describe, expect, it } from "vitest";
import { avatarUpdateEvery, CROWD_SIZE, FAR_DISTANCE, FAR_EVERY, OFFSCREEN_EVERY } from "./avatarDetail";

describe("avatarUpdateEvery", () => {
  it("updates every frame when in view in a small room, however far", () => {
    expect(avatarUpdateEvery({ inView: true, distance: 40, remoteCount: CROWD_SIZE })).toBe(1);
  });

  it("slows an avatar that is out of view", () => {
    expect(avatarUpdateEvery({ inView: false, distance: 1, remoteCount: 2 })).toBe(OFFSCREEN_EVERY);
  });

  it("slows a distant avatar only in a busy room", () => {
    expect(avatarUpdateEvery({ inView: true, distance: FAR_DISTANCE + 1, remoteCount: CROWD_SIZE + 1 })).toBe(FAR_EVERY);
    expect(avatarUpdateEvery({ inView: true, distance: FAR_DISTANCE - 1, remoteCount: CROWD_SIZE + 1 })).toBe(1);
  });
});
