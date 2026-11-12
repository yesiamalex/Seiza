import { describe, expect, it } from "vitest";
import { createBrain } from "../../../src/guides/brain";
import { CHANCY } from "../../seiou/client/campus";
import { seinagKnowledge } from "./knowledge";

const brain = createBrain(seinagKnowledge(), CHANCY);

describe("Seinag's guides", () => {
  it.each([
    ["what is seinag", "seinag"],
    ["where are the solar panels?", "rooftops"],
    ["is solar worth it for a campus?", "worth"],
    ["how much electricity does the campus use", "load"],
    ["where is the oblation", "oblation"],
    ["太陽光パネルはどこ?", "rooftops"],
    ["Seinagって何?", "seinag"],
  ])("answers %j from %s", (question, topic) => {
    expect(brain.answer(question).topic).toBe(topic);
  });

  it("offers to take you up to the panels", () => {
    expect(brain.answer("take me to the solar panels").place?.id).toBe("mainRoof");
  });
});
