import { describe, expect, it } from "vitest";
import { avatarDetail, avatarUpdateEvery, CROWD_SIZE, FAR_DISTANCE, FAR_EVERY, OFFSCREEN_EVERY } from "./avatarDetail";

describe("avatarUpdateEvery", () => {
  it("updates every frame when in view in a small room, however far", () => {
    expect(avatarUpdateEvery({ inView: true, distance: 40, remoteCount: CROWD_SIZE })).toBe(1);
  });

  it("slows an avatar that is out of view", () => {
    expect(avatarUpdateEvery({ inView: false, distance: 1, remoteCount: 2 })).toBe(OFFSCREEN_EVERY);
  });

  it("slows a distant avatar only in a busy room, and only to every other frame", () => {
    expect(avatarUpdateEvery({ inView: true, distance: FAR_DISTANCE + 1, remoteCount: CROWD_SIZE + 1 })).toBe(FAR_EVERY);
    expect(avatarUpdateEvery({ inView: true, distance: FAR_DISTANCE - 1, remoteCount: CROWD_SIZE + 1 })).toBe(1);
    expect(avatarUpdateEvery({ inView: true, distance: 500, remoteCount: 60 })).toBe(2);
  });
});

describe("avatarDetail", () => {
  it("leaves anyone near and in view in full, in any room", () => {
    for (const crowd of [2, 40]) expect(avatarDetail({ inView: true, distance: 5, crowd })).toEqual({ every: 1, springs: true, outlines: true });
  });

  it("drops only what can't be seen at a distance in a crowd: the outline, then the hair physics", () => {
    const at = (distance: number) => avatarDetail({ inView: true, distance, crowd: CROWD_SIZE + 10 });
    expect(at(15)).toEqual({ every: 1, springs: true, outlines: false });
    expect(at(25)).toEqual({ every: 2, springs: false, outlines: false });
  });
});
