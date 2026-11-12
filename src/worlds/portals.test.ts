import { describe, expect, it } from "vitest";
import { portalUrl } from "./Portals";

const config = { urlPattern: "https://{id}.figueroaziedell.workers.dev", at: { x: 0, z: 0 }, facing: 0, worlds: [] };

describe("portal addresses", () => {
  it("fills the pattern with the world's id", () => {
    expect(portalUrl(config, { id: "seizora", label: "Seizora" })).toBe("https://seizora.figueroaziedell.workers.dev");
  });
  it("lets a world give its own address", () => {
    expect(portalUrl(config, { id: "seiou", label: "SeiOU", url: "https://seiou-up.figueroaziedell.workers.dev" })).toBe("https://seiou-up.figueroaziedell.workers.dev");
  });
  it("works on one domain, by path", () => {
    expect(portalUrl({ ...config, urlPattern: "https://seiza.org/{id}/" }, { id: "seinag", label: "Seinag" })).toBe("https://seiza.org/seinag/");
  });
  it("refuses an unset or unsafe address", () => {
    expect(portalUrl({ ...config, urlPattern: "https://{id}.REPLACE.workers.dev" }, { id: "x", label: "X" })).toBeNull();
    expect(portalUrl(config, { id: "x", label: "X", url: "javascript:alert(1)" })).toBeNull();
    expect(portalUrl(config, { id: "x", label: "X", url: "http://plain.example" })).toBeNull();
  });
});
