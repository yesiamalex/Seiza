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

describe("the headset panel's admin section", () => {
  const admin = (removeArmed = false) => ({
    onGather: vi.fn(),
    people: [{ id: "bea", name: "Bea", mic: true, removeArmed }],
    onMute: vi.fn(),
    onGoTo: vi.fn(),
    onRemove: vi.fn(),
  });

  it("is there only for an admin", () => {
    expect(layoutHud(base).buttons.some((b) => b.id.startsWith("admin:"))).toBe(false);
    expect(layoutHud({ ...base, admin: admin() }).buttons.map((b) => b.id)).toEqual(
      expect.arrayContaining(["admin:gather", "admin:mute:bea", "admin:goto:bea", "admin:remove:bea"])
    );
  });

  it("mutes a live mic, and asks before removing", () => {
    const model = admin();
    const layout = layoutHud({ ...base, admin: model });
    layout.buttons.find((b) => b.id === "admin:mute:bea")!.onPress();
    expect(model.onMute).toHaveBeenCalledWith("bea", true);
    expect(layout.buttons.find((b) => b.id === "admin:remove:bea")!.label).toBe("Remove");
    const armed = layoutHud({ ...base, admin: admin(true) }).buttons.find((b) => b.id === "admin:remove:bea")!;
    expect(armed.label).toBe("Sure?");
    expect(armed.active).toBe(true);
  });
});

describe("the headset panel's room-mode sections", () => {
  it("lays out each section's choices in its columns, the chosen one lit, and presses them", () => {
    const pick = vi.fn();
    const layout = layoutHud({
      ...base,
      sections: [
        {
          id: "fantasy",
          title: "Fantasy: weapon",
          note: "Katana · K 2",
          columns: 4,
          choices: ["none", "sword", "katana", "naginata", "scythe"].map((id) => ({ id, label: id, active: id === "katana", onPress: () => pick(id) })),
        },
      ],
    });
    const buttons = layout.buttons.filter((b) => b.id.startsWith("fantasy:"));
    expect(buttons.map((b) => b.id)).toEqual(["fantasy:none", "fantasy:sword", "fantasy:katana", "fantasy:naginata", "fantasy:scythe"]);
    expect(buttons.filter((b) => b.active).map((b) => b.id)).toEqual(["fantasy:katana"]);
    // Four to a row, the fifth below the first.
    expect(buttons[4].x).toBe(buttons[0].x);
    expect(buttons[4].y).toBeGreaterThan(buttons[0].y);
    buttons[3].onPress();
    expect(pick).toHaveBeenCalledWith("naginata");
  });

  it("shows a section with only a note (no buttons) and keeps the next one below it", () => {
    const layout = layoutHud({
      ...base,
      sections: [
        { id: "modes", title: "Room modes", note: "An editor can turn them on.", choices: [] },
        { id: "band", title: "Band", choices: [{ id: "keys", label: "Keys", active: false, onPress: () => {} }] },
      ],
    });
    expect(layout.buttons.some((b) => b.id.startsWith("modes:"))).toBe(false);
    expect(layout.buttons.find((b) => b.id === "band:keys")).toBeTruthy();
    expect(layout.height).toBeGreaterThan(layoutHud(base).height);
  });

  it("switches the language from the voice row", () => {
    const onLanguage = vi.fn();
    const layout = layoutHud({ ...base, onLanguage });
    layout.buttons.find((b) => b.id === "language")!.onPress();
    expect(onLanguage).toHaveBeenCalled();
  });
});

describe("the headset panel's redraws", () => {
  it("redraws when a room mode's choice changes, so the new one lights up", async () => {
    const { signatureOf } = await import("./XrHud");
    const section = (active: string) => ({
      id: "fantasy",
      title: "Fantasy: weapon",
      choices: ["sword", "katana"].map((id) => ({ id, label: id, active: id === active, onPress: () => {} })),
    });
    expect(signatureOf({ ...base, sections: [section("sword")] })).not.toBe(signatureOf({ ...base, sections: [section("katana")] }));
    expect(signatureOf({ ...base, sections: [section("sword")] })).toBe(signatureOf({ ...base, sections: [section("sword")] }));
  });
});
