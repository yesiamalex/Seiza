import { createStore } from "../store";
import { oneOf, readNumber, readString, readVector, sendAddonEvent, type AddonEvent } from "../bus";
import { COMBO_CYCLE, type Action, type ActionKind } from "./poses";
import { ELEMENTS, isBladed, MAX_HP, WEAPONS, WEAPON_SPECS, type Element, type Weapon } from "./weapons";
import { ASSIST_SECONDS, comboReached, tally } from "./record";

/**
 * Fantasy mode's rules and this visitor's side of them.
 *
 * Everyone is the authority on their own health: an attacker's browser
 * decides what it hit and says so, and each target's browser checks the
 * claim (close enough, not too often, no more damage than that weapon
 * does) before taking it. That is cheap, needs nothing new on the server,
 * and is honest enough for a game played in a classroom. Only someone
 * holding a weapon can be hit: putting it away is stepping out.
 */
export interface LocalFighter {
  weapon: Weapon | null;
  element: Element;
  hp: number;
  /** 0 to 100: a special needs it full. */
  meter: number;
  ko: boolean;
  /** How far a held click (or button) is toward a special, 0 to 1. */
  charge: number;
  /** VR: the hand was drawn back with the meter full, so the next attack
   *  is the special. */
  primed: boolean;
  /** Bumped on every hit taken, for the screen's flash. */
  hurt: number;
  /** Holding guard (F, or the phone's shield button): the blade raised
   *  across the body, where a blow is likely to meet it. Not a wall: blades
   *  parry only where they really touch. */
  guard: boolean;
  /** Hits landed one soon after another (see METER_CHAIN), for the
   *  combo count on screen; 0 when the chain has lapsed. */
  chain: number;
}

export const fantasy = createStore<LocalFighter>({
  weapon: null,
  element: "spectro",
  hp: MAX_HP,
  meter: 0,
  ko: false,
  charge: 0,
  primed: false,
  hurt: 0,
  guard: false,
  chain: 0,
});

/** Someone else's fighter, as their events describe it. */
export interface RemoteFighter {
  weapon: Weapon | null;
  element: Element;
  hp: number;
  ko: boolean;
  action: Action | null;
  guard: boolean;
  /** Their special is ready (the meter full): their weapon glows. */
  ready: boolean;
  /** When they were last seen hit, for the flinch (seconds). */
  hurtAt: number;
}
export const remoteFighters = new Map<string, RemoteFighter>();
/** This visitor's own action in progress, for the pose and the trail. */
export const local = {
  action: null as Action | null,
  combo: 0,
  lastAttack: 0,
  invulnerableUntil: 0,
  /** Who this swing has already landed on (or been stopped by). */
  struck: new Set<string>(),
  /** When this visitor last landed a hit, for the chain. */
  lastLanded: -Infinity,
  /** When this visitor was last hit, for the flinch. */
  hurtAt: -Infinity,
  /** Who has hit this visitor lately, and when: the assists, if they go down. */
  hitBy: new Map<string, number>(),
};

export const HOLD_SECONDS = 0.45;
/** A pause this long between attacks starts a weapon's combo over. */
const COMBO_RESET_SECONDS = 1.4;
/** How far ahead of a blade's wielder its special bursts, in metres. */
export const BLAST_AHEAD = 1.6;
export const KO_SECONDS = 5;
const METER_PER_SECOND = 2.5;
/**
 * What a landed hit puts in the meter, by weapon. A slower weapon lands
 * fewer hits, so each earns more: about four clean hits in a row fill it
 * with any of them (five with the light saber, which lands nearly four a
 * second; three with the katana or the bow, which are slow and, for the
 * bow, hard to land). Waiting for the meter to fill by itself takes forty
 * seconds, so it's fighting well that brings the special.
 */
export const METER_PER_HIT: Record<Weapon, number> = { sword: 22, katana: 30, naginata: 24, scythe: 28, lightsaber: 16, bow: 32, rod: 14 };
/** The necromancer's meter fills slowest, by itself and by hits: three
 *  undead fighting for nine seconds is a lot to have often. */
const METER_PER_SECOND_ROD = 1.1;
export const meterPerSecondFor = (weapon: Weapon) => (weapon === "rod" ? METER_PER_SECOND_ROD : METER_PER_SECOND);

/**
 * The necromancer's special: three undead rise round them and go for the
 * nearest fighter within sight, each striking for a little (not a blast's
 * worth: about a special's in all, if they all reach someone and stay on
 * them), until they crumble.
 */
export const UNDEAD = { count: 3, damage: 3, every: 1.6, seconds: 9, speed: 2.3, sight: 14, reach: 1.1, rise: 0.8 } as const;
/** Each hit within this many seconds of the last adds a share more, up to
 *  `max` shares: a combo fills the meter faster than the same hits spread out. */
export const METER_CHAIN = { seconds: 2.2, share: 0.25, max: 4 } as const;
/** A naginata's sweep catching several: each after the first earns half. */
const METER_EXTRA_TARGET = 0.5;
/** Stopping someone's blow with your blade earns a little too. */
export const METER_PER_PARRY = 12;
const METER_PER_HURT = 8;
const INVULNERABLE_SECONDS = 2;
const now = () => performance.now() / 1000;

// --- rules ---------------------------------------------------------------------

/** How long after one hit from the same attacker another counts, at the
 *  least; a weapon's own cooldown, a little shortened, when that's longer. */
export const MIN_HIT_GAP = { normal: 0.2, special: 5, undead: (UNDEAD.every / UNDEAD.count) * 0.8 } as const;

/**
 * Whether a hit someone says they landed on this visitor counts, and for
 * how much. `distance` is between the two as the room server last had
 * them, which can trail by a fraction of a second, hence the slack.
 */
export function acceptHit(input: {
  defender: { weapon: Weapon | null; ko: boolean; invulnerable: boolean };
  attackerWeapon: Weapon | null;
  distance: number;
  damage: number;
  special: boolean;
  /** Seconds since this attacker's last counted hit of the same kind. */
  sinceLast: number;
  /** Struck by the attacker's undead, not by them. */
  undead?: boolean;
}): number {
  const { defender, attackerWeapon, distance, damage, special, sinceLast, undead } = input;
  if (!defender.weapon || defender.ko || defender.invulnerable || !attackerWeapon) return 0;
  if (undead) {
    // Only a necromancer's, near enough for their undead to have walked
    // there, and no faster than three can strike.
    if (attackerWeapon !== "rod" || !(distance <= UNDEAD.sight + UNDEAD.speed * UNDEAD.seconds) || sinceLast < MIN_HIT_GAP.undead) return 0;
    return Math.max(0, Math.min(UNDEAD.damage, Math.round(damage)));
  }
  const spec = WEAPON_SPECS[attackerWeapon];
  if (sinceLast < (special ? MIN_HIT_GAP.special : Math.max(MIN_HIT_GAP.normal, spec.cooldown * 0.8))) return 0;
  // A special's blast is centred ahead of the attacker (or where the arrow
  // lands), so it reaches as far as that plus its radius.
  const reach = special ? (attackerWeapon === "bow" ? spec.reach : BLAST_AHEAD) + spec.specialRadius + 2.5 : spec.reach + 2.5;
  if (!(distance <= reach)) return 0;
  const most = special ? spec.special : spec.damage;
  return Math.max(0, Math.min(most, Math.round(damage)));
}

// --- this visitor ----------------------------------------------------------------

export function announce() {
  const { weapon, element, hp, ko, guard, meter } = fantasy.get();
  sendAddonEvent("fantasy", { k: "lo", w: weapon ?? "", e: element, hp, ko, ...(guard ? { g: 1 } : {}), ...(meter >= 100 ? { rd: 1 } : {}) });
}

export function setWeapon(weapon: Weapon | null) {
  fantasy.set((s) => ({ ...s, weapon, charge: 0, primed: false }));
  local.action = null;
  announce();
}

export function setGuard(guard: boolean) {
  const s = fantasy.get();
  if (s.guard === guard || (guard && (!isBladed(s.weapon) || s.ko))) return;
  fantasy.set({ ...s, guard });
  sendAddonEvent("fantasy", { k: "gd", on: guard ? 1 : 0 });
}

export function setElement(element: Element) {
  fantasy.set((s) => ({ ...s, element }));
  announce();
}

/** Back to nothing: the mode was switched off, or this visitor left. */
export function resetFantasy() {
  fantasy.set({ weapon: null, element: fantasy.get().element, hp: MAX_HP, meter: 0, ko: false, charge: 0, primed: false, hurt: 0, guard: false, chain: 0 });
  remoteFighters.clear();
  local.action = null;
  local.lastLanded = -Infinity;
}

export function canAct() {
  const s = fantasy.get();
  return s.weapon !== null && !s.ko && !s.guard && now() - local.lastAttack >= WEAPON_SPECS[s.weapon].cooldown;
}

/** Starts an action here and tells the room. Returns it, or null. */
export function startAction(kind: ActionKind): Action | null {
  const s = fantasy.get();
  if (!canAct()) return null;
  if (kind === "special") {
    if (s.meter < 100) return null;
    fantasy.set((v) => ({ ...v, meter: 0, primed: false, charge: 0 }));
  }
  if (s.weapon === "bow" && kind === "swing") kind = "shoot";
  // Each attack is the next move of the weapon's combo (poses.ts); after a
  // pause, the combo starts again from its first.
  local.combo = now() - local.lastAttack > COMBO_RESET_SECONDS ? 0 : (local.combo + 1) % COMBO_CYCLE;
  local.lastAttack = now();
  local.action = { kind, n: local.combo, start: now() };
  local.struck.clear();
  sendAddonEvent("fantasy", { k: "act", a: kind, n: local.combo });
  return local.action;
}

/** This visitor's blade met another: it bounces back, for longer when it
 *  was a raised guard that took the blow. */
export function recoil() {
  local.action = { kind: fantasy.get().guard ? "stagger" : "recoil", n: 0, start: now() };
}

/**
 * Every way of attacking (mouse, the touch button, the VR trigger) goes
 * through here. `act` is filled in by FantasyLayer, which knows where
 * everyone is; a press shorter than HOLD_SECONDS strikes, a longer one
 * with the meter full lets the special go.
 */
export const controls = { act: (_kind: ActionKind) => {}, pressedAt: null as number | null };

export function pressStart() {
  if (fantasy.get().weapon) controls.pressedAt = now();
}

export function pressCancel() {
  controls.pressedAt = null;
  if (fantasy.get().charge) fantasy.set((s) => ({ ...s, charge: 0 }));
}

export function pressEnd() {
  const at = controls.pressedAt;
  pressCancel();
  if (at === null) return;
  const held = now() - at;
  controls.act(held >= HOLD_SECONDS && fantasy.get().meter >= 100 ? "special" : "swing");
}

export function gainMeter(amount: number) {
  const before = fantasy.get().meter;
  const meter = Math.min(100, before + amount);
  if (meter !== before) fantasy.set((s) => ({ ...s, meter }));
  const full = before < 100 && meter >= 100;
  // Everyone sees a weapon light up when its special is ready.
  if (full) announce();
  return full;
}

export const meterPerSecond = METER_PER_SECOND;

/**
 * What landing `targets` hits at once with `weapon` earns, `chain` hits
 * into a combo (0 for the first).
 */
export function meterForHits(weapon: Weapon, targets: number, chain: number) {
  if (targets <= 0) return 0;
  const base = METER_PER_HIT[weapon] * (1 + METER_EXTRA_TARGET * (targets - 1));
  return Math.round(base * (1 + METER_CHAIN.share * Math.min(chain, METER_CHAIN.max)));
}

/** This visitor landed `targets` hits (not a special's): the meter and the
 *  combo. Returns whether that filled the meter. */
export function landedHits(weapon: Weapon, targets: number) {
  const t = now();
  const chain = t - local.lastLanded <= METER_CHAIN.seconds ? fantasy.get().chain : 0;
  local.lastLanded = t;
  fantasy.set((s) => ({ ...s, chain: chain + 1 }));
  comboReached(weapon, chain + 1);
  return gainMeter(meterForHits(weapon, targets, chain));
}

/** The combo count lapses once no hit has landed for a while. */
export function lapseChain() {
  if (fantasy.get().chain > 0 && now() - local.lastLanded > METER_CHAIN.seconds) fantasy.set((s) => ({ ...s, chain: 0 }));
}

/** A blow on this visitor that passed acceptHit. */
export function takeDamage(amount: number, onKnockedOut: () => void) {
  const s = fantasy.get();
  const hp = Math.max(0, s.hp - amount);
  const ko = hp === 0;
  local.hurtAt = now();
  fantasy.set({ ...s, hp, ko, hurt: s.hurt + 1, meter: Math.min(100, s.meter + METER_PER_HURT), primed: false, charge: 0, guard: ko ? false : s.guard });
  announce();
  if (!ko) return;
  local.action = null;
  onKnockedOut();
  setTimeout(() => {
    // Still in the fight (the mode is on, a weapon still in hand)?
    if (!fantasy.get().ko) return;
    local.invulnerableUntil = now() + INVULNERABLE_SECONDS;
    fantasy.set((v) => ({ ...v, hp: MAX_HP, ko: false }));
    announce();
  }, KO_SECONDS * 1000);
}

/**
 * This visitor was knocked out by `by`: a time down on the record, and the
 * room told who did it and who helped (hit them in the last few seconds),
 * so each of those can count it. Everyone's own browser decides their own
 * knockout, as with their health.
 */
export function knockedOut(by: string) {
  const weapon = fantasy.get().weapon;
  if (weapon) tally(weapon, "d");
  const t = now();
  const assists = [...local.hitBy].filter(([id, at]) => id !== by && t - at <= ASSIST_SECONDS).map(([id]) => id).slice(0, 7);
  local.hitBy.clear();
  sendAddonEvent("fantasy", { k: "ko", by, as: assists });
}

/** Someone else's knockout: this visitor's, or an assist, if they're named. */
export function scoreKnockout(by: string, assists: string[], self: string | null) {
  const weapon = fantasy.get().weapon;
  if (!weapon || !self) return;
  if (by === self) tally(weapon, "k");
  else if (assists.includes(self)) tally(weapon, "a");
}

export function isInvulnerable() {
  return now() < local.invulnerableUntil;
}

// --- everyone else -------------------------------------------------------------------

export type FantasyEvent =
  | { k: "hi" }
  | { k: "gd"; on: boolean }
  | { k: "blk"; target: string; at: [number, number, number] }
  | { k: "lo"; weapon: Weapon | null; element: Element; hp: number; ko: boolean; guard: boolean; ready: boolean }
  | { k: "act"; kind: ActionKind; n: number }
  | { k: "hit"; targets: string[]; damage: number; special: boolean; undead: boolean }
  | { k: "un"; at: [number, number][]; element: Element }
  | { k: "fx"; element: Element; at: [number, number, number] }
  | { k: "ar"; from: [number, number, number]; to: [number, number, number]; element: Element | null; bolt: boolean }
  | { k: "ko"; by: string; assists: string[] };

/** Reads an event from another browser, or null if it isn't one. */
export function parseFantasyEvent(data: AddonEvent): FantasyEvent | null {
  switch (data.k) {
    case "hi":
      return { k: "hi" };
    case "gd":
      return { k: "gd", on: data.on === 1 };
    case "blk": {
      const target = readString(data.t, 64);
      const at = readVector(data.p);
      return target && at ? { k: "blk", target, at } : null;
    }
    case "lo": {
      const weapon = data.w === "" ? null : oneOf(data.w, WEAPONS);
      const element = oneOf(data.e, ELEMENTS);
      const hp = readNumber(data.hp, 0, MAX_HP);
      if ((weapon === null && data.w !== "") || !element || hp === null) return null;
      return { k: "lo", weapon, element, hp, ko: data.ko === true, guard: data.g === 1, ready: data.rd === 1 };
    }
    case "act": {
      const kind = oneOf(data.a, ["swing", "special", "shoot", "recoil"] as const);
      const n = readNumber(data.n, 0, COMBO_CYCLE - 1);
      return kind && n !== null ? { k: "act", kind, n: Math.round(n) } : null;
    }
    case "hit": {
      if (!Array.isArray(data.t) || data.t.length > 8) return null;
      const targets = data.t.map((id) => readString(id, 64)).filter((id): id is string => id !== null);
      const damage = readNumber(data.d, 0, 100);
      return damage === null ? null : { k: "hit", targets, damage, special: data.s === 1, undead: data.m === 1 };
    }
    case "un": {
      // Where someone's undead are: x, z pairs, none once they've crumbled.
      const element = oneOf(data.e, ELEMENTS);
      if (!element || !Array.isArray(data.p) || data.p.length > UNDEAD.count * 2 || data.p.length % 2) return null;
      const at: [number, number][] = [];
      for (let i = 0; i < data.p.length; i += 2) {
        const x = readNumber(data.p[i], -1e4, 1e4);
        const z = readNumber(data.p[i + 1], -1e4, 1e4);
        if (x === null || z === null) return null;
        at.push([x, z]);
      }
      return { k: "un", at, element };
    }
    case "fx": {
      const element = oneOf(data.e, ELEMENTS);
      const at = readVector(data.p);
      return element && at ? { k: "fx", element, at } : null;
    }
    case "ko": {
      const by = readString(data.by, 64);
      if (!by || !Array.isArray(data.as) || data.as.length > 8) return null;
      return { k: "ko", by, assists: data.as.map((id) => readString(id, 64)).filter((id): id is string => id !== null) };
    }
    case "ar": {
      const from = readVector(data.o);
      const to = readVector(data.d);
      const element = data.e === undefined ? null : oneOf(data.e, ELEMENTS);
      return from && to ? { k: "ar", from, to, element, bolt: data.b === 1 } : null;
    }
  }
  return null;
}

export function fighterOf(id: string): RemoteFighter {
  let fighter = remoteFighters.get(id);
  if (!fighter) remoteFighters.set(id, (fighter = { weapon: null, element: "spectro", hp: MAX_HP, ko: false, action: null, guard: false, ready: false, hurtAt: -Infinity }));
  return fighter;
}

/** When each attacker last landed a counted hit of each kind. */
const lastHitFrom = new Map<string, number>();
const hitKind = (special: boolean, undead = false) => (undead ? "u" : special ? 1 : 0);
export function sinceLastHit(from: string, special: boolean, undead = false) {
  return now() - (lastHitFrom.get(`${from}:${hitKind(special, undead)}`) ?? -Infinity);
}
export function recordHit(from: string, special: boolean, undead = false) {
  lastHitFrom.set(`${from}:${hitKind(special, undead)}`, now());
}
