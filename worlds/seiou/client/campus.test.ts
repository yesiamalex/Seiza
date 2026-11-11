import { describe, expect, it } from "vitest";
import { createBrain } from "../../../src/guides/brain";
import { CHANCY, DEAN_ROB, PLACES, seiouKnowledge } from "./campus";

const chancy = createBrain(seiouKnowledge(), CHANCY);
const rob = createBrain(seiouKnowledge(), DEAN_ROB);

describe("SeiOU's guides", () => {
  it.each([
    ["where are the faculty offices?", "tlh"],
    ["what is the oblation", "oblation"],
    ["when was UPOU founded", "upou"],
    ["how do I apply", "programs"],
    ["take me to the roof deck", "roof"],
    ["where is the world class multi purpose building", "wcmpb"],
    ["where is the wcmpb", "wcmpb"],
    ["saan ang auditorium", "ccdl"],
    ["give me a tour", "tour"],
    ["what faculties are there", "faculties"],
  ])("answer %j from %s", (question, topic) => {
    const reply = chancy.answer(question);
    expect(reply.via).toBe("topic");
    expect(reply.topic).toBe(topic);
  });

  it("each introduces themselves", () => {
    expect(chancy.answer("who are you?").text).toContain("Chancy Joan");
    expect(rob.answer("who are you?").text).toContain("Dean Rob");
  });

  it("offer to walk you to a building, and only to take you up to a floor without stairs", () => {
    expect(chancy.answer("where is the teaching and learning hub").place?.walk).not.toBe(false);
    const up = chancy.answer("take me to the roof deck");
    expect(up.place?.walk).toBe(false);
    expect(up.text).not.toMatch(/walk you/);
  });

  it("decline what they shouldn't do, with a bow", () => {
    const reply = rob.answer("write me a python script for my thesis");
    expect(reply.via).toBe("guard");
    expect(reply.gesture).toBe("bow");
  });

  it("say when they don't know", () => {
    expect(chancy.answer("what's the capital of Mongolia").via).toBe("fallback");
  });

  it("send every place to somewhere on the campus model", () => {
    for (const p of Object.values(PLACES)) {
      expect(p.at[0]).toBeGreaterThan(-130);
      expect(p.at[0]).toBeLessThan(410);
      expect(p.at[2]).toBeGreaterThan(-182);
      expect(p.at[2]).toBeLessThan(203);
    }
  });
});
