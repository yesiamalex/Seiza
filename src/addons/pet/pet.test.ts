import { describe, expect, it } from "vitest";
import { parsePetEvent, PETS, SHAPES } from "./pets";

describe("pets", () => {
  it("reads the room's pet messages, and nothing else", () => {
    expect(parsePetEvent({ k: "pe", v: "capybara" })).toEqual({ k: "pe", look: { kind: "capybara", coat: SHAPES.capybara.coat, size: 1, name: "", model: null } });
    expect(parsePetEvent({ k: "pe", v: "" })).toEqual({ k: "pe", look: null });
    // A look from the room is checked field by field: no outside model, a
    // size within bounds, a real colour, a short name.
    const odd = parsePetEvent({ k: "pe", v: "dog", c: "red", s: 9, n: "Mochi the very good boy", u: "https://evil.example/x.glb" });
    expect(odd).toEqual({ k: "pe", look: { kind: "dog", coat: SHAPES.dog.coat, size: 1.4, name: "Mochi the very g", model: null } });
    const own = parsePetEvent({ k: "pe", v: "cat", c: "#2b2724", s: 0.8, n: "Kuro", u: "/api/avatars/0a1b2c3d-0000-4000-8000-123456789abc.vrm" });
    expect(own?.k === "pe" && own.look?.model).toBe("/api/avatars/0a1b2c3d-0000-4000-8000-123456789abc.vrm");
    expect(parsePetEvent({ k: "pe", v: "dragon" })).toBeNull();
    expect(parsePetEvent({ k: "pat", v: "abc" })).toEqual({ k: "pat", owner: "abc" });
    expect(parsePetEvent({ k: "pat", v: 3 })).toBeNull();
    expect(parsePetEvent({ k: "pat", v: "x".repeat(65) })).toBeNull();
  });

  it("stands each kind on its feet, a capybara the biggest and slowest", () => {
    for (const p of PETS) expect(SHAPES[p].legs).toBeGreaterThan(0);
    expect(SHAPES.capybara.length).toBeGreaterThan(SHAPES.dog.length);
    expect(SHAPES.capybara.speed).toBeLessThan(SHAPES.dog.speed);
  });
});
