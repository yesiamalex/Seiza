import { describe, expect, it } from "vitest";
import { avatarDetail, avatarUpdateEvery, CROWD_SIZE, DRAWN_NEAR, FAR_DISTANCE, FAR_EVERY, OFFSCREEN_EVERY } from "./avatarDetail";

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

describe("avatarDetail", () => {
  it("leaves anyone near and in view in full, in any room", () => {
    for (const crowd of [2, 40]) expect(avatarDetail({ inView: true, distance: 5, crowd })).toEqual({ drawn: true, every: 1, springs: true, outlines: true });
  });

  it("doesn't draw an avatar out of view unless it's close (a mirror may show it)", () => {
    expect(avatarDetail({ inView: false, distance: DRAWN_NEAR + 1, crowd: 2 }).drawn).toBe(false);
    expect(avatarDetail({ inView: false, distance: DRAWN_NEAR - 1, crowd: 2 }).drawn).toBe(true);
  });

  it("drops outlines, then hair physics, with distance in a crowd, and updates less often", () => {
    const crowd = CROWD_SIZE + 10;
    const at = (distance: number) => avatarDetail({ inView: true, distance, crowd });
    expect(at(15)).toEqual({ drawn: true, every: 2, springs: true, outlines: false });
    expect(at(25)).toEqual({ drawn: true, every: 3, springs: false, outlines: false });
    expect(at(50)).toEqual({ drawn: true, every: 4, springs: false, outlines: false });
  });
});
