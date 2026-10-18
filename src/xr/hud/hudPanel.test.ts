import { describe, expect, it, vi } from "vitest";
import { layoutHud, type XrHudModel } from "./hudPanel";

const base: XrHudModel = {
  title: "Seiza",
  people: 2,
  voice: "unavailable",
  onVoice: () => {},
  gestures: [],
  activeGesture: null,
  onGestureStart: () => {},
  onGestureEnd: () => {},
  seiza: null,
  crouch: null,
  standUp: null,
  chat: [],
  onExit: () => {},
};
const gestures = [
  { name: "handshake", label: "Handshake" },
  { name: "hug", label: "Hug" },
];

describe("the headset panel's together row", () => {
  it("offers each together gesture for whoever is close, and asks for it", () => {
    const onAsk = vi.fn();
    const layout = layoutHud({ ...base, together: { name: "Bea", gestures, onAsk, waiting: null } });
    const hug = layout.buttons.find((b) => b.id === "together:hug")!;
    expect(layout.buttons.filter((b) => b.id.startsWith("together:")).map((b) => b.label)).toEqual(["Handshake", "Hug"]);
    hug.onPress();
    expect(onAsk).toHaveBeenCalledWith("hug");
  });

  it("shows no buttons while your own request waits, or while someone's waits for you", () => {
    const waiting = layoutHud({ ...base, together: { name: "Bea", gestures, onAsk: () => {}, waiting: "Asking Bea for a hug…" } });
    expect(waiting.buttons.some((b) => b.id === "together:hug")).toBe(false);
    const asked = layoutHud({
      ...base,
      request: { text: "Bea would like a hug", accept: () => {}, decline: () => {} },
      together: { name: "Bea", gestures, onAsk: () => {}, waiting: null },
    });
    expect(asked.buttons.map((b) => b.id)).toContain("together:yes");
    expect(asked.buttons.some((b) => b.id === "together:hug")).toBe(false);
  });
});
