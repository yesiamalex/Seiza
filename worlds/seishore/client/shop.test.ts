import { describe, expect, it } from "vitest";
import { ATM_YEN, MAX_YEN, pay, SHOPS, withdraw } from "./shop";

describe("Seishore's shops", () => {
  it("takes the price, and won't sell what you can't afford", () => {
    const tea = SHOPS.vending.wares.find((w) => w.id === "tea")!;
    expect(pay({ yen: 1000, drinkBar: false }, tea)).toEqual({ yen: 1000 - tea.price, drinkBar: false });
    expect(pay({ yen: tea.price - 1, drinkBar: false }, tea)).toBeNull();
  });
  it("remembers the drink bar once it's paid for", () => {
    const bar = SHOPS.famiresu.wares.find((w) => w.id === "drinkbar")!;
    expect(pay({ yen: 1000, drinkBar: false }, bar)?.drinkBar).toBe(true);
  });
  it("tops the wallet up at the ATM, to a limit", () => {
    expect(withdraw({ yen: 100, drinkBar: false }).yen).toBe(100 + ATM_YEN);
    expect(withdraw({ yen: MAX_YEN - 10, drinkBar: false }).yen).toBe(MAX_YEN);
  });
  it("prices everything in whole yen, and every shop has something", () => {
    for (const shop of Object.values(SHOPS)) {
      expect(shop.wares.length).toBeGreaterThan(0);
      for (const w of shop.wares) expect(Number.isInteger(w.price) && w.price > 0).toBe(true);
    }
  });
});
