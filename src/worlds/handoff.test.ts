import { describe, expect, it } from "vitest";
import { boardingUrl, takeTraveller } from "./handoff";
import { encodeAvatarSpec } from "../avatar/designer/avatarSpec";
import { DEFAULT_AVATAR_SPEC } from "../avatar/designer/avatarSpec";

const arrive = (url: string) => {
  const u = new URL(url);
  let replaced = "";
  const t = takeTraveller({ hash: u.hash, pathname: u.pathname, search: u.search }, (r) => (replaced = r));
  return { t, replaced };
};

describe("boarding from one world to another", () => {
  it("takes a designer avatar and a name along, and clears them from the address", () => {
    const avatar = encodeAvatarSpec(DEFAULT_AVATAR_SPEC);
    const { t, replaced } = arrive(boardingUrl("https://seishore.seiza.cc/?x=1", { name: "  Hana  ", avatar }));
    expect(t).toEqual({ name: "Hana", avatar });
    expect(replaced).toBe("/?x=1");
  });
  it("takes only the name for an avatar that can't travel (a file on the old world)", () => {
    const { t } = arrive(boardingUrl("https://seinag.seiza.cc/", { name: "Ken", avatar: "https://seiza.cc/api/assets/abc.vrm" }));
    expect(t).toEqual({ name: "Ken" });
  });
  it("ignores a broken or missing ticket", () => {
    expect(arrive("https://seiza.cc/#board=!!!").t).toBeNull();
    expect(arrive("https://seiza.cc/#board=" + btoa("not json")).t).toBeNull();
    expect(arrive("https://seiza.cc/").t).toBeNull();
  });
});
