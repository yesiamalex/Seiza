import { describe, expect, it } from "vitest";
import { sheltered } from "./layout";

describe("where rain falls in Seiza's own world", () => {
  it("stays out of the hall, the corridor, and the classroom", () => {
    expect(sheltered(0, 1.6, 6)).toBe(true);
    expect(sheltered(0, 1.6, -7)).toBe(true);
    expect(sheltered(0, 1.6, -17)).toBe(true);
  });
  it("falls on the garden and the meadow", () => {
    expect(sheltered(0, 1.6, 27)).toBe(false);
    expect(sheltered(-11, 1, 58)).toBe(false);
  });
});
