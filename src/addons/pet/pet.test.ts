import { describe, expect, it } from "vitest";
import { parsePetEvent, PETS, SHAPES } from "./pets";

describe("pets", () => {
  it("reads the room's pet messages, and nothing else", () => {
    expect(parsePetEvent({ k: "pe", v: "capybara" })).toEqual({ k: "pe", kind: "capybara" });
    expect(parsePetEvent({ k: "pe", v: "" })).toEqual({ k: "pe", kind: null });
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
