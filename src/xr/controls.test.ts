import { describe, expect, it } from "vitest";
import { setXrControls, turningOptions, xrControls } from "./controls";
import { sanitizeTrackedPose } from "./body/trackingWire";

describe("a headset player's controls", () => {
  it("turns in snaps by default, smoothly or by 30° when chosen", () => {
    expect(turningOptions("snap45")).toEqual({ type: "snap", degrees: 45 });
    expect(turningOptions("snap30")).toEqual({ type: "snap", degrees: 30 });
    expect(turningOptions("smooth").type).toBe("smooth");
  });

  it("keeps what's changed and leaves the rest", () => {
    const before = xrControls();
    setXrControls({ moving: "teleport" });
    expect(xrControls()).toEqual({ ...before, moving: "teleport" });
    setXrControls(before);
  });
});

describe("hands on the wire", () => {
  const hand = (extra: object) => ({ pose: [0.2, 1, -0.3, 0, 0, 0, 1], curl: [0, 0], ...extra });
  it("says a hand holds a controller, and keeps a fingertip off the wire", () => {
    const pose = sanitizeTrackedPose({ head: [0, 1, 0, 0, 0, 0, 1], left: hand({ tip: [0.1, 0.9, -0.4] }), right: hand({ held: true }), height: 1 });
    expect(pose?.right?.held).toBe(true);
    expect(pose?.left?.held).toBeUndefined();
    expect(pose?.left && "tip" in pose.left).toBe(false);
    // Anything but true is not held.
    expect(sanitizeTrackedPose({ head: [0, 1, 0, 0, 0, 0, 1], left: null, right: hand({ held: "yes" }), height: 1 })?.right?.held).toBeUndefined();
  });
});
