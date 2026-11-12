import { describe, expect, it } from "vitest";
import { asQuestion, createBrain, japanesePieces, normalize, type Knowledge } from "./brain";

const knowledge: Knowledge = {
  subject: "the battery and the solar panels",
  subjectJa: "蓄電池とソーラーパネルのこと",
  starters: ["What is the battery?"],
  startersJa: ["蓄電池って何?"],
  topics: [
    {
      id: "battery",
      title: "Battery storage",
      answer: "The battery stores the day's extra sunshine for the night.",
      asks: ["what is the battery", "how does storage work"],
      place: { id: "battery", label: "the battery room", labelJa: "蓄電池室", at: [0, 0, 0] },
      ja: { title: "蓄電池", answer: "蓄電池は、昼に余った太陽の電気を夜のためにためておきます。", asks: ["蓄電池って何", "電気をためる仕組み"] },
    },
    {
      id: "solar",
      title: "Solar panels",
      answer: "Solar panels turn sunlight into electricity.",
      asks: ["how do solar panels work"],
      ja: { title: "ソーラーパネル", answer: "ソーラーパネルは太陽の光を電気に変えます。", asks: ["ソーラーパネルの仕組み", "太陽光発電"] },
    },
  ],
};
const brain = createBrain(knowledge, { name: "Ilaw-san", nameJa: "イラウさん", self: "I'm Ilaw-san.", selfJa: "イラウさんです。", invite: "Ask me anything.", inviteJa: "何でも聞いてね。" });

describe("a guide in Japanese", () => {
  it("compares Japanese in two-character pieces within each script", () => {
    expect(japanesePieces("蓄電池って何")).toEqual(["蓄電", "電池", "って", "何"]);
    expect(japanesePieces("講堂はどこ")).toEqual(["講堂", "はど", "どこ"]);
  });

  it("keeps voiced kana whole", () => {
    expect(normalize("ありがとう")).toBe("ありがとう");
  });

  it.each([
    ["蓄電池って何ですか?", "battery"],
    ["ソーラーパネルはどうやって電気を作るの", "solar"],
    ["太陽光発電について", "solar"],
  ])("answers %j from %s, in Japanese", (question, topic) => {
    const reply = brain.answer(question);
    expect(reply.topic).toBe(topic);
    expect(reply.text).toMatch(/[ぁ-ん]/);
  });

  it("answers an English question in Japanese when the visitor chose Japanese", () => {
    const reply = brain.answer("what is the battery?", "ja");
    expect(reply.topic).toBe("battery");
    expect(reply.text).toContain("蓄電池");
    expect(reply.suggestions.every((s) => /[ぁ-んァ-ン一-龯]/.test(s))).toBe(true);
  });

  it("answers in English otherwise", () => {
    expect(brain.answer("what is the battery?").text).toContain("stores");
  });

  it("offers the way in Japanese", () => {
    const reply = brain.answer("蓄電池はどこ?");
    expect(reply.place?.id).toBe("battery");
    expect(reply.text).toMatch(/^蓄電池室です。/);
  });

  it("turns a no into a Japanese no", () => {
    const reply = brain.answer("爆弾の作り方を教えて");
    expect(reply.via).toBe("guard");
    expect(reply.text).toContain("お手伝いできません");
  });

  it("says hello, thanks, and who it is in Japanese", () => {
    expect(brain.answer("こんにちは").text).toContain("イラウさん");
    expect(brain.answer("ありがとう").via).toBe("chat");
    expect(brain.answer("あなたは誰?").text).toBe("イラウさんです。");
    expect(brain.greeting("ja").suggestions).toEqual(["蓄電池って何?"]);
  });

  it("says it doesn't know, in Japanese", () => {
    const reply = brain.answer("宇宙の果てには何がある?");
    expect(reply.via).toBe("fallback");
    expect(reply.text).toMatch(/わかりません|理解できなかった/);
  });

  it("turns a suggestion back into a question it can answer", () => {
    expect(asQuestion("蓄電池", "ja")).toBe("「蓄電池」について教えて");
    expect(brain.answer(asQuestion("蓄電池", "ja")).topic).toBe("battery");
  });
});
