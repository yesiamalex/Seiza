import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLang, translateTo, translatorSupported } from "./translate";

describe("chat translation", () => {
  afterEach(() => {
    delete (globalThis as { Translator?: unknown }).Translator;
  });

  it.each([
    ["こんにちは", "ja"],
    ["日本語で話しましょう", "ja"],
    ["See you at the Oblation", "en"],
    ["OK 👍", "en"],
    ["👍 123", null],
  ])("reads %j as %s", (text, lang) => {
    expect(detectLang(text)).toBe(lang);
  });

  it("is off without the browser's Translator", async () => {
    expect(translatorSupported()).toBe(false);
    await expect(translateTo("hello there", "ja")).rejects.toThrow();
  });

  it("translates into the other language only", async () => {
    const create = vi.fn(async ({ sourceLanguage, targetLanguage }: { sourceLanguage: string; targetLanguage: string }) => ({
      translate: async (text: string) => `[${sourceLanguage}→${targetLanguage}] ${text}`,
    }));
    (globalThis as { Translator?: unknown }).Translator = { create, availability: async () => "available" };
    expect(translatorSupported()).toBe(true);
    expect(await translateTo("good morning", "ja")).toBe("[en→ja] good morning");
    expect(await translateTo("おはよう", "en")).toBe("[ja→en] おはよう");
    expect(await translateTo("good evening", "ja")).toBe("[en→ja] good evening");
    // Already in the language asked for: nothing to do.
    expect(await translateTo("good night", "en")).toBeNull();
    // One translator per direction, made once.
    expect(create).toHaveBeenCalledTimes(2);
  });
});
