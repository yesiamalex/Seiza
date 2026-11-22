import { describe, expect, it } from "vitest";
import { createBrain } from "../../../src/guides/brain";
import { CHANCY } from "../../seiou/client/campus";
import { STATION } from "./Station";
import { bedPositions, BED, futuresObstacles, GARDEN, GARDEN_SPOTS, lampPositions, LAYER_KEY, layerOn, shadeOffset, treeList, walkwayPosts, WALKWAY, WALKWAY_LENGTH } from "./futures";
import { FUTURE_PLACES, FUTURE_TOPICS } from "./futuresKnowledge";
import { seinagKnowledge } from "./knowledge";

const sun = (elevationDeg: number, azimuthFromEast: number) => {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthFromEast * Math.PI) / 180;
  return { x: Math.cos(e) * Math.cos(a), y: Math.sin(e), z: Math.cos(e) * Math.sin(a) };
};

describe("the imagined campus's shade", () => {
  it("is right underneath with the sun overhead, and opposite the sun otherwise", () => {
    const noon = shadeOffset(sun(90, 0), 3);
    expect(Math.hypot(noon.x, noon.z)).toBeLessThan(1e-6);
    expect(noon.strength).toBe(1);
    // An afternoon sun in the west (-x) throws the shade east (+x).
    const afternoon = shadeOffset(sun(45, 180), 3);
    expect(afternoon.x).toBeCloseTo(3, 5);
  });

  it("fades with a low sun, never stretches across the campus, and thins under cloud", () => {
    expect(shadeOffset(sun(5, 0), 3).strength).toBe(0);
    const low = shadeOffset(sun(10, 0), 3);
    expect(Math.hypot(low.x, low.z)).toBeLessThanOrEqual(9 + 1e-9);
    expect(low.strength).toBeGreaterThan(0);
    expect(shadeOffset(sun(60, 0), 3, 1).strength).toBeCloseTo(0.25, 5);
  });
});

describe("where the imagined campus is", () => {
  it("joins the Academic Residences to the WCMPB over the lawn", () => {
    expect(WALKWAY_LENGTH).toBeGreaterThan(200);
    expect(WALKWAY_LENGTH).toBeLessThan(260);
    // Posts both sides, about every 4 m.
    expect(walkwayPosts().length).toBeGreaterThan(100);
  });

  it("keeps trees clear of the solar station, the walkway, and the garden", () => {
    for (const t of treeList()) {
      expect(Math.hypot(t.at[0] - STATION.x, t.at[1] - STATION.z), `tree at ${t.at}`).toBeGreaterThan(8);
      const inGarden = Math.abs(t.at[0] - GARDEN.x) < GARDEN.w / 2 + 3 && Math.abs(t.at[1] - GARDEN.z) < GARDEN.d / 2 + 3;
      expect(inGarden).toBe(false);
      const nearestPost = Math.min(...walkwayPosts().map(([x, z]) => Math.hypot(t.at[0] - x, t.at[1] - z)));
      expect(nearestPost, `tree at ${t.at}`).toBeGreaterThan(4);
    }
  });

  it("lights the walk from beside it, each lamp reaching toward it", () => {
    const lamps = lampPositions();
    expect(lamps.length).toBeGreaterThanOrEqual(10);
    for (const { toward } of lamps) expect(Math.hypot(...toward)).toBeCloseTo(1, 6);
  });

  it("lays out Adopt-A-Plot's 2 m beds with paths a person fits through", () => {
    const beds = bedPositions();
    expect(BED.size).toBe(2);
    for (let i = 0; i < beds.length; i++)
      for (let j = i + 1; j < beds.length; j++) {
        const gap = Math.max(Math.abs(beds[i][0] - beds[j][0]), Math.abs(beds[i][1] - beds[j][1])) - BED.size;
        expect(gap).toBeGreaterThanOrEqual(1);
      }
    for (const [x, z] of Object.values(GARDEN_SPOTS)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(GARDEN.w / 2);
      expect(Math.abs(z)).toBeLessThanOrEqual(GARDEN.d / 2);
    }
  });

  it("sends the guides to spots nothing stands on", () => {
    const blocked = futuresObstacles({});
    for (const place of Object.values(FUTURE_PLACES)) {
      const [x, , z] = place.at;
      const inside = blocked.some((o) => Math.abs(x - o.x) < o.halfX + 0.3 && Math.abs(z - o.z) < o.halfZ + 0.3);
      expect(inside, place.id).toBe(false);
    }
  });

  it("drops a layer's obstacles when it's switched off", () => {
    const all = futuresObstacles({}).length;
    const noTrees = futuresObstacles({ [LAYER_KEY.trees]: false }).length;
    expect(noTrees).toBe(all - treeList().length);
    expect(layerOn({}, "garden")).toBe(true);
    expect(layerOn({ [LAYER_KEY.garden]: false }, "garden")).toBe(false);
  });

  it("starts the walkway at the Academic Residences and ends it at the WCMPB", () => {
    expect(WALKWAY[0][0]).toBeGreaterThan(300);
    expect(WALKWAY[WALKWAY.length - 1][1]).toBeGreaterThan(100);
  });
});

describe("what the guides say about it", () => {
  const brain = createBrain(seinagKnowledge(), CHANCY);

  it.each([
    ["is there shade from the AR to the WCMPB?", "walkway"],
    ["tell me about the catwalk", "walkway"],
    ["it's so hot at noon", "heat"],
    ["what are the solar lampposts?", "lamps"],
    ["why plant more trees?", "trees"],
    ["where is the permaculture garden?", "garden"],
    ["give me a permaculture tour", "permatour"],
    ["how can I adopt a plot?", "adopt"],
    ["what's an herb spiral?", "spiral"],
    ["where does the garden's water come from?", "rainwater"],
    ["what happens to the compost?", "compost"],
    ["what is a food forest?", "foodforest"],
    ["where do the seedlings come from?", "nursery"],
    ["what is permaculture?", "permaculture"],
    ["can I study permaculture at UPOU?", "permacourse"],
    ["what is the imagined campus?", "futures"],
    ["パーマカルチャーの案内をして", "permatour"],
  ])("answers %j from %s", (question, topic) => {
    expect(brain.answer(question).topic).toBe(topic);
  });

  it("walks the tour from stop to stop", () => {
    expect(brain.answer("give me a permaculture tour").place?.id).toBe("gardenGate");
    expect(brain.answer("stop 1").place?.id).toBe("gardenBeds");
    expect(brain.answer("next stop: the herb spiral").place?.id).toBe("gardenSpiral");
  });

  it("answers where the shade is now, live", () => {
    const reply = brain.answer("where is the shade now?");
    expect(reply.topic).toBeUndefined();
    expect(reply.text.length).toBeGreaterThan(20);
  });

  it("says which parts of the garden are imagined", () => {
    const imagined = ["spiral", "rainwater", "foodforest", "nursery"];
    for (const id of imagined) expect(FUTURE_TOPICS.find((t) => t.id === id)!.answer).toMatch(/imagined/);
    expect(FUTURE_TOPICS.find((t) => t.id === "compost")!.answer).toMatch(/imagined/);
    // The beds are real, and say so.
    expect(FUTURE_TOPICS.find((t) => t.id === "adopt")!.answer).toMatch(/are real/);
  });
});
