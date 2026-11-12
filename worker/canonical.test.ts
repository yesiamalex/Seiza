import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "./canonical";

const env = { SEIZA_CANONICAL_ORIGIN: "https://seizora.seiza.org" };
const at = (href: string, method = "GET") => canonicalRedirect(new Request(href, { method }), new URL(href), env);

describe("moving to a custom domain", () => {
  it("sends a page at the old address to the new one, path and all", () => {
    const r = at("https://seizora.figueroaziedell.workers.dev/?skyHour=18");
    expect(r?.status).toBe(301);
    expect(r?.headers.get("location")).toBe("https://seizora.seiza.org/?skyHour=18");
  });
  it("leaves rooms, uploads, and the new address alone", () => {
    expect(at("https://seizora.figueroaziedell.workers.dev/rooms/main")).toBeNull();
    expect(at("https://seizora.figueroaziedell.workers.dev/api/assets", "POST")).toBeNull();
    expect(at("https://seizora.seiza.org/")).toBeNull();
  });
  it("does nothing until it's set", () => {
    expect(canonicalRedirect(new Request("https://x.workers.dev/"), new URL("https://x.workers.dev/"), {})).toBeNull();
  });
});
