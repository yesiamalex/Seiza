import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createBrain } from "../../../src/guides/brain";
import { findPath, TALA } from "./guide";
import { seisugboKnowledge } from "./knowledge";

const brain = createBrain(seisugboKnowledge(), TALA);

describe("Seisugbo's guide", () => {
  it.each([
    ["what is seisugbo", "world"],
    ["what was the urbanity walk?", "walk"],
    ["how many stops were on the walk", "walk"],
    ["what is tuslob buwa", "puso"],
    ["tell me about magellan's cross", "cross"],
    ["who led the metaverse workshop?", "metaverse"],
    ["what is design science research", "dsr"],
    ["why was seisugbo made", "artifact"],
    ["how many students took part", "participants"],
    ["what is sdg 11", "climate"],
    ["what happened on day one", "day1"],
    ["show me the collage", "collage"],
    ["take me to the portals", "portals"],
    ["where is the art", "court"],
    ["アーバニティ・ウォークって何?", "walk"],
    ["デザイン・サイエンス・リサーチって何", "dsr"],
  ])("answers %j from %s", (question, topic) => {
    expect(brain.answer(question).topic).toBe(topic);
  });

  it("offers to walk you to the court", () => {
    expect(brain.answer("take me to the covered court").place?.id).toBe("court");
  });

  it("walks round the houses, not through them", () => {
    const path = findPath(new THREE.Vector3(-8.2, 0, 60.4), new THREE.Vector3(13, 0, 52))!;
    // Down the lane's middle, then into the court from the lane side.
    expect(path.some((p) => Math.abs(p.z - 60) < 0.01 && p.x > 0)).toBe(true);
    for (const p of path) expect(p.z < 54.2 && p.x < 6, `${p.x}, ${p.z}`).toBe(false);
  });
});
