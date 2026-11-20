import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { handQuaternion } from "./rig";
import { acceptHit, MIN_HIT_GAP, parseFantasyEvent } from "./fantasy/combat";
import { heldPose, timingOf } from "./fantasy/poses";
import { WEAPON_SPECS, WEAPONS } from "./fantasy/weapons";
import { parseBandEvent, validNote } from "./band/band";
import { BLADE_CONTACT, bodyCapsule, segmentDistance, sweep } from "./fantasy/contact";

describe("blade contact", () => {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  it("measures how close two segments pass", () => {
    // Crossing at right angles, one 0.3 above the other.
    expect(segmentDistance(v(-1, 0, 0), v(1, 0, 0), v(0, 0.3, -1), v(0, 0.3, 1)).distance).toBeCloseTo(0.3, 6);
    // Parallel, side by side.
    expect(segmentDistance(v(0, 0, 0), v(0, 1, 0), v(0.2, 0, 0), v(0.2, 1, 0)).distance).toBeCloseTo(0.2, 6);
    // Past each other's ends: end to end.
    expect(segmentDistance(v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(3, 0, 0)).distance).toBeCloseTo(1, 6);
  });

  it("hits a body a blade passes through, and misses one out of reach", () => {
    const body = bodyCapsule(v(1.2, 0, 0), 1.45);
    const through = segmentDistance(v(0.4, 1.1, 0.05), v(1.2, 1.1, -0.05), body.a, body.b);
    expect(through.distance).toBeLessThan(body.radius);
    const short = segmentDistance(v(0.2, 1.1, 0), v(0.8, 1.1, 0), body.a, body.b);
    expect(short.distance).toBeGreaterThan(body.radius);
  });

  it("catches a fast swing between frames, and a blade in its way", () => {
    // Last frame the blade was to one side of the body, now the other.
    const body = bodyCapsule(v(0, 0, -1), 1.45);
    const met = sweep(v(-0.3, 1, -0.4), v(-1, 1, -1), v(0.3, 1, -0.4), v(1, 1, -1), (b, t) => segmentDistance(b, t, body.a, body.b).distance < body.radius);
    expect(met).toBe(true);
    const guard = { base: v(-0.4, 1, -0.75), tip: v(0.4, 1, -0.75) };
    expect(segmentDistance(v(0, 1.3, -0.4), v(0, 0.7, -1.1), guard.base, guard.tip).distance).toBeLessThan(BLADE_CONTACT);
  });
});

describe("hand orientation", () => {
  it("points the fingers along -z, the palm along -y, and the thumb along the blade", () => {
    for (const side of ["left", "right"] as const) {
      const blade: [number, number, number] = [0, 0.6, -0.8];
      const fingers: [number, number, number] = [0, -0.8, -0.6];
      const q = handQuaternion(side, blade, fingers);
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const p = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
      expect(f.distanceTo(new THREE.Vector3(...fingers))).toBeLessThan(1e-6);
      // Thumb: fingers × palm on a right hand, palm × fingers on a left.
      const thumb = side === "right" ? f.clone().cross(p) : p.clone().cross(f);
      expect(thumb.distanceTo(new THREE.Vector3(...blade))).toBeLessThan(1e-6);
    }
  });

  it("copes with fingers given along the blade", () => {
    const q = handQuaternion("right", [0, 1, 0], [0, 1, 0]);
    expect(Number.isFinite(q.w) && Math.abs(q.length() - 1) < 1e-6).toBe(true);
  });
});

describe("fantasy rules", () => {
  const fighter = { weapon: "sword" as const, ko: false, invulnerable: false };
  const base = { defender: fighter, attackerWeapon: "katana" as const, distance: 1.5, damage: 12, special: false, sinceLast: 1 };

  it("takes a fair hit", () => {
    expect(acceptHit(base)).toBe(12);
  });

  it("caps damage at what the weapon does", () => {
    expect(acceptHit({ ...base, damage: 99 })).toBe(WEAPON_SPECS.katana.damage);
    expect(acceptHit({ ...base, special: true, damage: 99, sinceLast: 10 })).toBe(WEAPON_SPECS.katana.special);
  });

  it("refuses hits on someone not fighting, down, or just back up", () => {
    expect(acceptHit({ ...base, defender: { ...fighter, weapon: null } })).toBe(0);
    expect(acceptHit({ ...base, defender: { ...fighter, ko: true } })).toBe(0);
    expect(acceptHit({ ...base, defender: { ...fighter, invulnerable: true } })).toBe(0);
    expect(acceptHit({ ...base, attackerWeapon: null })).toBe(0);
  });

  it("refuses hits from too far, or too often", () => {
    expect(acceptHit({ ...base, distance: 20 })).toBe(0);
    expect(acceptHit({ ...base, distance: Infinity })).toBe(0);
    expect(acceptHit({ ...base, sinceLast: MIN_HIT_GAP.normal / 2 })).toBe(0);
    expect(acceptHit({ ...base, special: true, sinceLast: 2 })).toBe(0);
    // A bow reaches.
    expect(acceptHit({ ...base, attackerWeapon: "bow", distance: 30, damage: 9 })).toBe(9);
    // A naginata's wide special reaches further than a katana's tight one.
    const far = { ...base, special: true, damage: 99, sinceLast: 10, distance: 8.5 };
    expect(acceptHit({ ...far, attackerWeapon: "naginata" })).toBe(WEAPON_SPECS.naginata.special);
    expect(acceptHit({ ...far, attackerWeapon: "katana" })).toBe(0);
  });

  it("balances the blades: about the same damage a second, each buying something else", () => {
    const blades = WEAPONS.filter((w) => w !== "bow" && w !== "naginata");
    const dps = blades.map((w) => WEAPON_SPECS[w].damage / WEAPON_SPECS[w].cooldown);
    for (const value of dps) expect(Math.abs(value - 25)).toBeLessThan(2.5);
    // ...except the naginata, which trades it for reach and three at once.
    const naginata = WEAPON_SPECS.naginata;
    expect(naginata.targets * (naginata.damage / naginata.cooldown)).toBeGreaterThan(40);
    expect(naginata.reach).toBeGreaterThan(WEAPON_SPECS.sword.reach);
  });

  it("reads only well-formed events", () => {
    expect(parseFantasyEvent({ k: "lo", w: "katana", e: "fire", hp: 80, ko: false })).toEqual({ k: "lo", weapon: "katana", element: "fire", hp: 80, ko: false, guard: false });
    expect(parseFantasyEvent({ k: "lo", w: "", e: "ice", hp: 100 })).toEqual({ k: "lo", weapon: null, element: "ice", hp: 100, ko: false, guard: false });
    expect(parseFantasyEvent({ k: "lo", w: "bazooka", e: "ice", hp: 100 })).toBeNull();
    expect(parseFantasyEvent({ k: "hit", t: "everyone", d: 10 })).toBeNull();
    expect(parseFantasyEvent({ k: "hit", t: ["a", 4], d: 500 })).toEqual({ k: "hit", targets: ["a"], damage: 100, special: false });
    expect(parseFantasyEvent({ k: "ar", o: [0, 1, 0], d: [0, 1, "far"] })).toBeNull();
    expect(parseFantasyEvent({ k: "nope" })).toBeNull();
    expect(parseFantasyEvent({ k: "gd", on: 1 })).toEqual({ k: "gd", on: true });
    expect(parseFantasyEvent({ k: "blk", t: "b", p: [1, 1, 1] })).toEqual({ k: "blk", target: "b", at: [1, 1, 1] });
    expect(parseFantasyEvent({ k: "blk", t: "b" })).toBeNull();
  });
});

describe("fighting poses", () => {
  it("ends every swing back on guard", () => {
    const guard = heldPose("sword", null, 0);
    const right = { ...guard.right!, pos: [...guard.right!.pos] };
    for (const kind of ["swing", "special"] as const) {
      const end = heldPose("sword", { kind, n: 1, start: 0 }, timingOf("sword", kind).duration * 0.999);
      for (let k = 0; k < 3; k++) expect(end.right!.pos[k]).toBeCloseTo(right.pos[k], 2);
    }
  });

  it("puts the other hand down the grip for two-handed weapons only", () => {
    expect(heldPose("sword", null, 0).left).toBeNull();
    const katana = heldPose("katana", null, 0);
    const gap = Math.hypot(...katana.right!.pos.map((v, k) => v - katana.left!.pos[k]));
    expect(gap).toBeCloseTo(WEAPON_SPECS.katana.otherHand!, 5);
    // A bow is in the left hand, and the right only draws while shooting.
    expect(heldPose("bow", null, 0).right).toBeNull();
    expect(heldPose("bow", { kind: "shoot", n: 0, start: 0 }, 0.2).right).not.toBeNull();
  });

  it("leaves a trail only mid-swing", () => {
    const t = timingOf("katana", "swing");
    expect(heldPose("katana", { kind: "swing", n: 0, start: 0 }, t.duration * 0.05).trail).toBe(false);
    expect(heldPose("katana", { kind: "swing", n: 0, start: 0 }, t.duration * 0.5).trail).toBe(true);
  });
});

describe("band events", () => {
  it("checks notes against the instrument", () => {
    expect(validNote("drums", 7)).toBe(true);
    expect(validNote("drums", 8)).toBe(false);
    expect(validNote("keys", 60)).toBe(true);
    expect(validNote("keys", 20)).toBe(false);
    expect(validNote("guitar", 5)).toBe(true);
    expect(validNote("lightstick", 0)).toBe(false);
  });

  it("reads only well-formed events", () => {
    expect(parseBandEvent({ k: "lo", i: "guitar", c: 2, wv: 0 })).toEqual({ k: "lo", instrument: "guitar", color: 2, waving: false });
    expect(parseBandEvent({ k: "lo", i: "theremin", c: 2 })).toBeNull();
    expect(parseBandEvent({ k: "n", n: "C" })).toBeNull();
    expect(parseBandEvent({ k: "n", n: 61.4 })).toEqual({ k: "n", note: 61 });
  });
});
