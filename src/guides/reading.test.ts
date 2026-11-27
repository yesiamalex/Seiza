import { describe, expect, it } from "vitest";
import { forJapaneseVoice, katakana, stationReading } from "./reading";

describe("readings for a Japanese voice", () => {
  it("says Seiza's own names as names", () => {
    expect(stationReading("Seinag")).toBe("セイナグ");
    expect(stationReading("Seishore(セイショア)")).toBe("セイショア");
    expect(stationReading("ISCOLab")).toBe("イスコラボ");
    expect(forJapaneseVoice("Seishoreは、Seizaの海辺の町。")).toBe("セイショアは、セイザの海辺の町。");
  });

  it("reads a name it doesn't know as romaji", () => {
    expect(katakana("Seibukid")).toBe("セイブキド");
    expect(katakana("Kanpai")).toBe("カンパイ");
    expect(katakana("Sapporo")).toBe("サッポロ");
    expect(katakana("Shinjuku")).toBe("シンジュク");
  });

  it("leaves Japanese and acronyms alone", () => {
    expect(stationReading("星ショア")).toBe("星ショア");
    expect(stationReading("UP 明治")).toBe("UP 明治");
  });
});
