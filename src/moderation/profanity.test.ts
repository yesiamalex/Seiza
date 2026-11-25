import { describe, expect, it } from "vitest";
import { filterOn, hasProfanity, maskProfanity } from "./profanity";

describe("the profanity filter", () => {
  it("stars rude words in chat, keeping their first letter", () => {
    expect(maskProfanity("what the fuck is this")).toBe("what the f*** is this");
    expect(maskProfanity("sh1t happens")).toBe("s*** happens");
    expect(maskProfanity("fuuuuck")).toBe("f******");
    expect(maskProfanity("putangina mo")).toBe("p******** mo");
    expect(maskProfanity("yawa ka")).toBe("y*** ka");
  });

  it("leaves ordinary words alone, even ones a rude word hides in", () => {
    for (const fine of ["class assessment", "Scunthorpe", "I assume so", "cocktail hour", "leche flan", "atay", "computation", "We should talk about rape culture"])
      expect(maskProfanity(fine)).toBe(fine);
  });

  it("finds a rude word in a name, run together or not", () => {
    expect(hasProfanity("xXfuckXx")).toBe(true);
    expect(hasProfanity("BigBitch")).toBe(true);
    expect(hasProfanity("Gago_123")).toBe(true);
    expect(hasProfanity("Hana")).toBe(false);
    expect(hasProfanity("Cassandra")).toBe(false);
    expect(hasProfanity("Dickens fan")).toBe(false);
  });

  it("takes a room's switch over the world's default", () => {
    expect(filterOn({}, "filter.names", true)).toBe(true);
    expect(filterOn({ "filter.names": false }, "filter.names", true)).toBe(false);
  });
});
