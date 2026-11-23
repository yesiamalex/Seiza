import { createStore } from "../store";
import { WEAPONS, type Weapon } from "./weapons";

/**
 * This visitor's record in Fantasy mode, kept on this device the way the
 * seiza best time is: for each weapon, knockouts (K), times knocked out
 * (D), assists (A: a hit on someone, in the 10 s before someone else
 * knocked them out), and the longest combo. A few numbers in one storage
 * key, written only when one changes. Nothing is sent anywhere.
 */
export interface WeaponRecord {
  k: number;
  d: number;
  a: number;
  combo: number;
}

const KEY = "seiza-fantasy-record";
/** How long a hit still counts toward an assist. */
export const ASSIST_SECONDS = 10;

function load(): Partial<Record<Weapon, WeaponRecord>> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const out: Partial<Record<Weapon, WeaponRecord>> = {};
    for (const weapon of WEAPONS) {
      const r = raw[weapon] as Partial<WeaponRecord> | undefined;
      if (!r || typeof r !== "object") continue;
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
      out[weapon] = { k: n(r.k), d: n(r.d), a: n(r.a), combo: n(r.combo) };
    }
    return out;
  } catch {
    return {};
  }
}

export const record = createStore(load());

function update(weapon: Weapon, change: (r: WeaponRecord) => WeaponRecord | null) {
  const before = record.get()[weapon] ?? { k: 0, d: 0, a: 0, combo: 0 };
  const after = change(before);
  if (!after) return;
  const next = { ...record.get(), [weapon]: after };
  record.set(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not remembered in a private window; it still counts for now.
  }
}

/** A knockout, a time knocked out, or an assist, with `weapon` in hand. */
export function tally(weapon: Weapon, what: "k" | "d" | "a") {
  update(weapon, (r) => ({ ...r, [what]: r[what] + 1 }));
}

/** A combo of `chain` hits: the weapon's best, if it's longer. */
export function comboReached(weapon: Weapon, chain: number) {
  update(weapon, (r) => (chain > r.combo ? { ...r, combo: chain } : null));
}

/** The weapons used so far, in the picker's order. */
export const usedWeapons = (r: Partial<Record<Weapon, WeaponRecord>>) => WEAPONS.filter((w) => r[w]);
