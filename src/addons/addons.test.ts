import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { handQuaternion } from "./rig";
import { acceptHit, fantasy, landedHits, meterForHits, meterPerSecondFor, METER_CHAIN, METER_PER_HIT, MIN_HIT_GAP, parseFantasyEvent, resetFantasy, UNDEAD } from "./fantasy/combat";
import { bodyPose, bowDraw, COMBO_CYCLE, cutOf, heldPose, timingOf } from "./fantasy/poses";
import { carryHand, key as bodyKey, newBodyPose, sampleBody } from "./body";
import { bandBody } from "./band/moves";
import { cancelSelfPush, pushSelf, takeSelfPush } from "../player/selfPush";
import { elementPulse, ELEMENTS, isBladed, WEAPON_SPECS, WEAPONS } from "./fantasy/weapons";
import { comboReached, record, tally } from "./fantasy/record";
import { NoteGate, parseBandEvent, validNote } from "./band/band";
import { GONGS, INSTRUMENTS, isStand, KEY_LAYOUT, KIT, pickedMidi, pickNote, TAIKO, unpick } from "./band/instruments";
import { deskPose, GONGS_AT, KIT_PIECES_AT, kitPose, malletPose, newHands, shakerPose, stickPose, TAIKO_AT, type Hands } from "./band/BandLayer";
import { FantasyEffects } from "./fantasy/effects";
import { PoseOverlay, sharedOverlay } from "../xr/body/bodyIk";
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
    const blades = WEAPONS.filter((w) => isBladed(w) && w !== "naginata");
    const dps = blades.map((w) => WEAPON_SPECS[w].damage / WEAPON_SPECS[w].cooldown);
    for (const value of dps) expect(Math.abs(value - 25)).toBeLessThan(2.5);
    // ...except the naginata, which trades it for reach and three at once.
    const naginata = WEAPON_SPECS.naginata;
    expect(naginata.targets * (naginata.damage / naginata.cooldown)).toBeGreaterThan(40);
    expect(naginata.reach).toBeGreaterThan(WEAPON_SPECS.sword.reach);
  });

  it("reads only well-formed events", () => {
    expect(parseFantasyEvent({ k: "lo", w: "katana", e: "fusion", hp: 80, ko: false })).toEqual({ k: "lo", weapon: "katana", element: "fusion", hp: 80, ko: false, guard: false, ready: false });
    expect(parseFantasyEvent({ k: "lo", w: "", e: "glacio", hp: 100 })).toEqual({ k: "lo", weapon: null, element: "glacio", hp: 100, ko: false, guard: false, ready: false });
    expect(parseFantasyEvent({ k: "lo", w: "bazooka", e: "glacio", hp: 100 })).toBeNull();
    // The old elements are gone.
    expect(parseFantasyEvent({ k: "lo", w: "katana", e: "lightning", hp: 100 })).toBeNull();
    expect(parseFantasyEvent({ k: "hit", t: "everyone", d: 10 })).toBeNull();
    expect(parseFantasyEvent({ k: "hit", t: ["a", 4], d: 500 })).toEqual({ k: "hit", targets: ["a"], damage: 100, special: false, undead: false });
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

  it("puts the other hand down the grip for two-handed weapons only, and only to guard or cut", () => {
    expect(heldPose("sword", null, 0, undefined, true).left).toBeNull();
    // At rest a two-handed weapon is carried in one hand: reaching the other
    // across to the grip at the hip put the arm through the belly.
    expect(heldPose("katana", null, 0).left).toBeNull();
    const katana = heldPose("katana", null, 0, undefined, true);
    const gap = Math.hypot(...katana.right!.pos.map((v, k) => v - katana.left!.pos[k]));
    expect(gap).toBeCloseTo(WEAPON_SPECS.katana.otherHand!, 5);
    expect(heldPose("katana", { kind: "swing", n: 0, start: 0 }, 0.1).left).not.toBeNull();
    // A bow is in the left hand, and the right only draws while shooting.
    expect(heldPose("bow", null, 0).right).toBeNull();
    expect(heldPose("bow", { kind: "shoot", n: 0, start: 0 }, 0.2).right).not.toBeNull();
  });

  it("leaves a trail only mid-swing", () => {
    const t = timingOf("katana", "swing");
    expect(heldPose("katana", { kind: "swing", n: 0, start: 0 }, t.duration * 0.05).trail).toBe(false);
    expect(heldPose("katana", { kind: "swing", n: 0, start: 0 }, t.duration * 0.5).trail).toBe(true);
  });

  it("strings different cuts together for every bladed weapon", () => {
    for (const weapon of ["sword", "katana", "naginata", "scythe", "lightsaber"] as const) {
      const cuts = new Set(Array.from({ length: COMBO_CYCLE }, (_, n) => cutOf(weapon, n)));
      expect(cuts.size, weapon).toBeGreaterThanOrEqual(3);
      // The first two cuts of a combo take the hand along different paths.
      let apart = 0;
      for (const f of [0.2, 0.3, 0.4, 0.5, 0.6]) {
        const at = timingOf(weapon, "swing").duration * f;
        const a = heldPose(weapon, { kind: "swing", n: 0, start: 0 }, at).right!.pos;
        const b = heldPose(weapon, { kind: "swing", n: 1, start: 0 }, at).right!.pos;
        apart = Math.max(apart, Math.hypot(...a.map((v, k) => v - b[k])));
      }
      expect(apart, weapon).toBeGreaterThan(0.1);
    }
  });

  it("keeps both hands of a two-handed weapon in front of the body", () => {
    for (const weapon of ["katana", "naginata", "scythe"] as const) {
      for (let n = 0; n < 3; n++) {
        for (const f of [0, 0.2, 0.4, 0.6, 0.8]) {
          const pose = heldPose(weapon, { kind: "swing", n, start: 0 }, timingOf(weapon, "swing").duration * f);
          for (const hand of [pose.right!, pose.left!]) {
            const [x, y, z] = hand.pos;
            // Within the torso's width and height, a fist stays ahead of its
            // rounded front.
            if (Math.abs(x) < 0.2 && y > 0.42 && y < 1) {
              const front = -0.12 * Math.sqrt(1 - (x / 0.2) ** 2) - 0.07;
              expect(z, `${weapon} ${n} ${f}`).toBeLessThanOrEqual(front + 1e-6);
            }
          }
        }
      }
    }
  });

  it("rests a naginata upright, its shaft clear of the face", () => {
    // Held like a sword's guard, tip down, the long shaft ran up past the face.
    const rest = heldPose("naginata", null, 0);
    const [x, y, z] = rest.right!.blade;
    expect(y / Math.hypot(x, y, z)).toBeGreaterThan(0.9);
    // On guard, the shaft lies across the chest, blade out to the right.
    expect(heldPose("naginata", null, 0, undefined, true).right!.blade[0]).toBeGreaterThan(0.8);
    // Swings start from and come back to its own rest, not the sword's.
    const end = heldPose("naginata", { kind: "swing", n: 0, start: 0 }, timingOf("naginata", "swing").duration * 0.999);
    for (let k = 0; k < 3; k++) expect(end.right!.pos[k]).toBeCloseTo(rest.right!.pos[k], 2);
  });

  it("draws the bowstring back until the arrow flies", () => {
    const shot = { kind: "shoot" as const, n: 0, start: 0 };
    const t = timingOf("bow", "shoot");
    expect(bowDraw(null, 0)).toBe(0);
    expect(bowDraw(shot, t.duration * t.impact * 0.3)).toBeGreaterThan(0);
    expect(bowDraw(shot, t.duration * t.impact * 0.9)).toBe(1);
    expect(bowDraw(shot, t.duration * t.impact * 1.01)).toBe(0);
  });
});

describe("band events", () => {
  it("checks notes against the instrument", () => {
    expect(validNote("drums", 7)).toBe(true);
    expect(validNote("drums", 8)).toBe(false);
    expect(validNote("keys", 60)).toBe(true);
    expect(validNote("keys", 20)).toBe(false);
    expect(validNote("guitar", 11)).toBe(true);
    expect(validNote("guitar", 12)).toBe(false);
    expect(validNote("kit", KIT.cowbell)).toBe(true);
    expect(validNote("kit", KIT.cowbell + 1)).toBe(false);
    expect(validNote("electric", 11)).toBe(true);
    expect(validNote("bass", 12)).toBe(false);
    expect(validNote("lightstick", 0)).toBe(false);
  });

  it("reads only well-formed events", () => {
    expect(parseBandEvent({ k: "lo", i: "guitar", c: 2, wv: 0 })).toEqual({ k: "lo", instrument: "guitar", color: 2, waving: false, pair: false });
    expect(parseBandEvent({ k: "lo", i: "lightstick", c: 1, wv: 1, p2: 1 })).toEqual({ k: "lo", instrument: "lightstick", color: 1, waving: true, pair: true });
    expect(parseBandEvent({ k: "lo", i: "theremin", c: 2 })).toBeNull();
    expect(parseBandEvent({ k: "n", n: "C" })).toBeNull();
    expect(parseBandEvent({ k: "n", n: 61.4 })).toEqual({ k: "n", note: 61, hold: false });
    // A key held down, and let go.
    expect(parseBandEvent({ k: "n", n: 64, h: 1 })).toEqual({ k: "n", note: 64, hold: true });
    expect(parseBandEvent({ k: "f", n: 64 })).toEqual({ k: "f", note: 64 });
    expect(parseBandEvent({ k: "f", n: "E" })).toBeNull();
  });
});

describe("the special's meter", () => {
  it("pays more per hit for slower weapons, so a few clean hits fill it with any", () => {
    for (const weapon of WEAPONS) {
      // Hits in a row, each a step further into the combo.
      let meter = 0;
      let hits = 0;
      while (meter < 100) meter += meterForHits(weapon, 1, hits++);
      expect(hits, weapon).toBeGreaterThanOrEqual(3);
      expect(hits, weapon).toBeLessThanOrEqual(5);
    }
    expect(meterForHits("katana", 1, 0)).toBeGreaterThan(meterForHits("lightsaber", 1, 0));
  });

  it("grows with a combo, up to a cap, and pays half for each extra target", () => {
    const first = meterForHits("sword", 1, 0);
    expect(meterForHits("sword", 1, 2)).toBeGreaterThan(first);
    expect(meterForHits("sword", 1, METER_CHAIN.max + 5)).toBe(meterForHits("sword", 1, METER_CHAIN.max));
    expect(meterForHits("naginata", 3, 0)).toBe(Math.round(METER_PER_HIT.naginata * 2));
    expect(meterForHits("sword", 0, 0)).toBe(0);
  });

  it("counts a combo while hits keep coming, and resets it after a pause", () => {
    resetFantasy();
    landedHits("sword", 1);
    landedHits("sword", 1);
    expect(fantasy.get().chain).toBe(2);
    expect(fantasy.get().meter).toBe(meterForHits("sword", 1, 0) + meterForHits("sword", 1, 1));
    resetFantasy();
    expect(fantasy.get().chain).toBe(0);
  });
});

describe("pushing this visitor", () => {
  it("spreads a push over the frames after it, and only once", () => {
    let ms = 1000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => ms);
    try {
      cancelSelfPush();
      pushSelf(0.5, 0, 0.2, 0.1);
      const out = { x: 0, z: 0 };
      // Before it starts: nothing.
      ms += 100;
      expect(takeSelfPush(0.1, out).x).toBe(0);
      // Half of it in one frame, the rest in the next.
      ms += 100;
      expect(takeSelfPush(0.1, out).x).toBeCloseTo(0.25, 6);
      ms += 100;
      expect(takeSelfPush(0.1, out).x).toBeCloseTo(0.25, 6);
      ms += 100;
      expect(takeSelfPush(0.1, out).x).toBe(0);
      // One that nobody collected in time lapses.
      pushSelf(1, 0, 0.1);
      ms += 5000;
      expect(takeSelfPush(0.016, out).x).toBe(0);
    } finally {
      clock.mockRestore();
    }
  });

  it("ignores nonsense", () => {
    cancelSelfPush();
    pushSelf(Number.NaN, 0, 0.2);
    pushSelf(1, 1, 0);
    expect(takeSelfPush(10, { x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
  });
});

describe("body poses", () => {
  const finite = (pose: ReturnType<typeof newBodyPose>) =>
    [pose.twist, pose.lean, pose.tilt, pose.drop, pose.shiftX, pose.shiftZ, pose.carry, pose.head, pose.nod, ...pose.left, ...pose.right].every(Number.isFinite);

  it("has one for every weapon, action, and moment, within sensible bounds", () => {
    const out = newBodyPose();
    for (const weapon of WEAPONS) {
      for (const kind of ["swing", "special", "shoot", "recoil", "stagger"] as const) {
        for (let t = 0; t <= 1.2; t += 0.05) {
          bodyPose(weapon, { kind, n: 1, start: 0 }, t * timingOf(weapon, kind).duration, false, out, 0.1, 2);
          expect(finite(out), `${weapon} ${kind} ${t}`).toBe(true);
          expect(Math.abs(out.twist)).toBeLessThan(1);
          expect(out.drop).toBeLessThan(0.35);
          expect(Math.hypot(out.left[0], out.left[1])).toBeLessThan(0.3);
          expect(Math.hypot(out.right[0], out.right[1])).toBeLessThan(0.3);
        }
      }
    }
  });

  it("comes back to its stance when an action ends", () => {
    const after = bodyPose("sword", { kind: "swing", n: 0, start: 0 }, 5, false, newBodyPose());
    const idle = bodyPose("sword", null, 5, false, newBodyPose());
    expect(after).toEqual(idle);
  });

  it("lifts a foot on its way between two places", () => {
    const keys = [bodyKey(0, { left: [0, 0, 0] }), bodyKey(1, { left: [0, -0.2, 0] })];
    expect(sampleBody(keys, 0.5, newBodyPose()).left[2]).toBeGreaterThan(0.01);
    expect(sampleBody(keys, 1, newBodyPose()).left[2]).toBeCloseTo(0, 6);
  });

  it("carries a hand round with the chest, but not a bow's", () => {
    const hand = { pos: [0, 0.8, -0.3] as [number, number, number], blade: [0, 1, 0] as [number, number, number], fingers: [0, 0, -1] as [number, number, number] };
    const turned = { ...newBodyPose(), twist: 0.5, carry: 1 };
    carryHand(hand, turned, 1, 1);
    // Turned to the right, a hand in front swings to the right.
    expect(hand.pos[0]).toBeGreaterThan(0.1);
    const still = { pos: [0, 0.8, -0.3] as [number, number, number], blade: [0, 1, 0] as [number, number, number], fingers: [0, 0, -1] as [number, number, number] };
    carryHand(still, { ...turned, carry: 0 }, 1, 1);
    expect(still.pos[0]).toBeCloseTo(0, 6);
  });

  it("grooves for every instrument, more when playing", () => {
    for (const instrument of INSTRUMENTS) {
      const calm = bandBody(instrument, null, 0.2, 0, 0.25, 1, newBodyPose());
      const into = bandBody(instrument, { at: 1 }, 1, 0, 0.25, 1, newBodyPose());
      expect(finite(calm) && finite(into)).toBe(true);
      expect(into.drop, instrument).toBeGreaterThan(calm.drop);
    }
  });
});

describe("the band's instruments", () => {
  const hands = (): Hands => newHands();

  it("brings both hands down for two notes at once, a hand each", () => {
    // The crash and the snare are both the left hand's: struck together,
    // the right takes the crash.
    const h = hands();
    kitPose(h, { n: KIT.crash, at: 1.01 }, 1.05, { n: KIT.snare, at: 1 });
    expect(h.lastPiece.left).toBe(KIT.snare);
    expect(h.lastPiece.right).toBe(KIT.crash);
    expect(h.hitAt.left).toBe(1);
    expect(h.hitAt.right).toBe(1.01);
    // A kick and a snare: the foot's, and the left hand's; the right stays.
    const k = hands();
    kitPose(k, { n: KIT.snare, at: 1.01 }, 1.05, { n: KIT.kick, at: 1 });
    expect(k.hitAt.right).toBe(-Infinity);
    expect(k.hitAt.left).toBe(1.01);
    // Two pads on the same side of the drum pad, the same.
    const d = hands();
    deskPose(d, "drums", { n: 5, at: 1.01 }, 1.05, 0, { n: 4, at: 1 });
    expect(d.hitAt.left).toBe(1);
    expect(d.hitAt.right).toBe(1.01);
    // One after another, not together: the same hand plays both.
    const s = hands();
    deskPose(s, "drums", { n: 4, at: 1 }, 1.05, 0);
    deskPose(s, "drums", { n: 5, at: 1.5 }, 1.55, 0, { n: 4, at: 1 });
    expect(s.hitAt.right).toBe(-Infinity);
    expect(s.hitAt.left).toBe(1.5);
  });

  it("picks single strings from the chord held, and the bass its root, fifth, and octaves", () => {
    // C, low to high, then the octave up past its top string.
    expect([0, 1, 2, 3, 4, 5].map((s) => pickedMidi("guitar", 0, s))).toEqual([48, 52, 55, 60, 64, 60]);
    expect([0, 1, 2, 3].map((s) => pickedMidi("bass", 0, s))).toEqual([36, 43, 48, 55]);
    expect(pickedMidi("bass", 0, 4)).toBeNull();
    // The lead picks from its power chords, not its lead notes.
    expect(pickedMidi("electric", 0, 3)).toBe(52);
    expect(pickedMidi("electric", 6, 0)).toBeNull();
    expect(unpick(pickNote(11, 5))).toEqual({ chord: 11, string: 5 });
    expect(validNote("guitar", pickNote(11, 5))).toBe(true);
    expect(validNote("bass", pickNote(3, 4))).toBe(false);
    expect(validNote("electric", pickNote(6, 0))).toBe(false);
    expect(validNote("drums", pickNote(0, 0))).toBe(false);
    expect(parseBandEvent({ k: "n", n: pickNote(11, 5) })).toEqual({ k: "n", note: pickNote(11, 5), hold: false });
  });

  it("sounds two notes at once, three on the kit, eight on the keys, and no more", () => {
    const g = new NoteGate();
    expect([0, 0.01, 0.02].map((t) => g.allow("drums", t))).toEqual([true, true, false]);
    // A moment later, it's free again: a fast roll still plays.
    expect(g.allow("drums", 0.1)).toBe(true);
    const kit = new NoteGate();
    expect([0, 0, 0, 0].map((t) => kit.allow("kit", t))).toEqual([true, true, true, false]);
    const keys = new NoteGate();
    expect(Array.from({ length: 9 }, () => keys.allow("keys", 0)).filter(Boolean).length).toBe(8);
  });

  it("brings each stick's tip down onto the piece it strikes, the hands low", () => {
    const REACH = 0.21;
    for (const [index, piece] of Object.entries(KIT_PIECES_AT)) {
      if (piece.hand === "foot") continue;
      const h = hands();
      // Just after the hit, the stick is down on it.
      kitPose(h, { n: Number(index), at: 0 }, 0.05);
      const hand = h[piece.hand];
      const length = Math.hypot(...hand.blade);
      const tip = hand.pos.map((v, k) => v + (hand.blade[k] / length) * REACH);
      const top = piece.depth > 0 ? piece.at[1] + piece.depth / 2 : piece.at[1];
      expect(Math.hypot(tip[0] - piece.at[0], tip[2] - piece.at[2]), "piece " + index).toBeLessThan(piece.r + 0.02);
      expect(Math.abs(tip[1] - top), "piece " + index).toBeLessThan(0.03);
      // Seated, a drum's hands stay below the shoulders and ahead of the belly.
      if (piece.depth > 0) {
        expect(hand.pos[1], "piece " + index).toBeLessThan(0.62);
        expect(hand.pos[2], "piece " + index).toBeLessThan(-0.08);
      }
    }
  });

  it("brings a mallet down on each kulintang gong and a bachi on the taiko, standing", () => {
    const REACH = 0.21;
    for (const [name, pieces] of [["gong", GONGS_AT], ["taiko", TAIKO_AT]] as const) {
      for (const [index, piece] of Object.entries(pieces)) {
        const h = newHands();
        malletPose(h, pieces, { n: Number(index), at: 0 }, 0.05);
        const hand = h[piece.hand as "left" | "right"];
        const length = Math.hypot(...hand.blade);
        const tip = hand.pos.map((v, k) => v + (hand.blade[k] / length) * REACH);
        expect(Math.hypot(tip[0] - piece.at[0], tip[2] - piece.at[2]), `${name} ${index}`).toBeLessThan(piece.r + 0.02);
        expect(Math.abs(tip[1] - (piece.at[1] + piece.depth / 2)), `${name} ${index}`).toBeLessThan(0.03);
        // Standing: the hands at the waist, below the shoulders, in front.
        expect(hand.pos[1], `${name} ${index}`).toBeLessThan(0.8);
        expect(hand.pos[2], `${name} ${index}`).toBeLessThan(-0.05);
      }
    }
    // Low gongs to the left hand, high to the right; both dons at once, a hand each.
    expect(GONGS_AT[0].hand).toBe("left");
    expect(GONGS_AT[GONGS.length - 1].hand).toBe("right");
    const h = newHands();
    malletPose(h, TAIKO_AT, { n: TAIKO.donRight, at: 1.01 }, 1.05, { n: TAIKO.donLeft, at: 1 });
    expect([h.hitAt.left, h.hitAt.right]).toEqual([1, 1.01]);
  });

  it("plays the new instruments' notes, and only theirs; stands keep you at them", () => {
    expect(validNote("kulintang", 7)).toBe(true);
    expect(validNote("kulintang", 8)).toBe(false);
    expect(validNote("taiko", TAIKO.kaRight)).toBe(true);
    expect(validNote("taiko", 4)).toBe(false);
    expect(validNote("shaker", 1)).toBe(true);
    expect(validNote("shaker", 2)).toBe(false);
    expect(["drums", "kit", "keys", "kulintang", "taiko"].every((i) => isStand(i as never))).toBe(true);
    expect(["guitar", "bass", "shaker", "lightstick", null].some((i) => isStand(i as never))).toBe(false);
    // A shake snaps the hand forward, one hand only.
    const h = newHands();
    expect(shakerPose(h, { n: 0, at: 0 }, 0.06)).toBe(false);
    const snapped = h.right.pos[2];
    shakerPose(h, { n: 0, at: 0 }, 1);
    expect(snapped).toBeLessThan(h.right.pos[2]);
  });

  it("holds one light stick or one in each hand", () => {
    const h = hands();
    expect(stickPose(h, true, false, 0)).toBe(false);
    expect(stickPose(h, true, true, 0)).toBe(true);
    // A pair is held either side, both overhead.
    expect(h.right.pos[0]).toBeGreaterThan(h.left.pos[0]);
    expect(Math.min(h.right.pos[1], h.left.pos[1])).toBeGreaterThan(1);
  });

  it("plays an octave and a half on the keys, each on its own key", () => {
    expect(KEY_LAYOUT.length).toBe(18);
    expect(new Set(KEY_LAYOUT.map((k) => k.key)).size).toBe(18);
    expect(KEY_LAYOUT.filter((k) => !k.black).length).toBe(11);
    // None of the keys the octave buttons use.
    expect(KEY_LAYOUT.some((k) => k.key === "Z" || k.key === "X")).toBe(false);
  });
});

describe("posing an avatar from two places", () => {
  it("takes every pose back off, however many wrote it", () => {
    // Band and Fantasy both on, both posing the same hand: each with its
    // own overlay, the second recorded the first's pose as where the bone
    // was, and put it back every frame, so the hand stayed posed.
    const avatar = {};
    const bone = new THREE.Object3D();
    const a = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
    const b = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
    for (let frame = 0; frame < 3; frame++) {
      sharedOverlay(avatar, frame).setQuaternion(bone, a, 1);
      sharedOverlay(avatar, frame).setQuaternion(bone, b, 1);
    }
    sharedOverlay(avatar, 3);
    expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);

    // What two overlays of their own did, for the record.
    const bone2 = new THREE.Object3D();
    const first = new PoseOverlay();
    const second = new PoseOverlay();
    for (let frame = 0; frame < 3; frame++) {
      first.restore();
      first.setQuaternion(bone2, a, 1);
      second.restore();
      second.setQuaternion(bone2, b, 1);
    }
    first.restore();
    second.restore();
    expect(bone2.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.1);
  });
});

describe("arrows", () => {
  it("land on what they reach in flight, not where the target stood when loosed", () => {
    const effects = new FantasyEffects();
    const from = new THREE.Vector3(0, 1, 0);
    const to = new THREE.Vector3(0, 1, -30);
    let wall = -10;
    let landed: THREE.Vector3 | null = null;
    // Something standing 10 m out, that steps closer before the arrow gets there.
    const meets = (a: THREE.Vector3, b: THREE.Vector3) => (a.z > wall && b.z <= wall ? new THREE.Vector3(0, 1, wall) : null);
    effects.arrow(from, to, null, 0, (at) => (landed = at), meets);
    const camera = new THREE.PerspectiveCamera();
    for (let t = 0; t <= 1.2 && !landed; t += 1 / 60) {
      if (t > 0.1) wall = -6;
      effects.update(t, 1 / 60, camera);
    }
    expect(landed).not.toBeNull();
    expect(landed!.z).toBeCloseTo(-6, 5);
    effects.dispose();
  });
});

describe("the elements' specials", () => {
  const special = { kind: "special" as const, n: 0, start: 0 };
  const at = (weapon: "sword" | "katana" | "scythe", f: number) => timingOf(weapon, "special").duration * f;
  const gap = (p: ReturnType<typeof heldPose>) => Math.hypot(...p.right!.pos.map((v, k) => v - p.left!.pos[k]));

  it("moves each element its own way, and ends back on guard", () => {
    const bodies = ELEMENTS.map((element) => bodyPose("sword", special, at("sword", 0.56), false, newBodyPose(), -Infinity, 0, element));
    // No two elements strike the same pose at the moment of release.
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const hands = [heldPose("sword", special, at("sword", 0.56), undefined, false, ELEMENTS[i]), heldPose("sword", special, at("sword", 0.56), undefined, false, ELEMENTS[j])];
        const apart = Math.abs(a.twist - b.twist) + Math.abs(a.lean - b.lean) + Math.abs(a.drop - b.drop) + Math.hypot(...hands[0].left!.pos.map((v, k) => v - hands[1].left!.pos[k]));
        expect(apart, ELEMENTS[i] + " " + ELEMENTS[j]).toBeGreaterThan(0.1);
      }
    for (const element of ELEMENTS)
      for (const weapon of ["sword", "scythe"] as const) {
        const end = heldPose(weapon, special, at(weapon, 0.999), undefined, false, element);
        const rest = heldPose(weapon, null, 0);
        for (let k = 0; k < 3; k++) expect(end.right!.pos[k], element + " " + weapon).toBeCloseTo(rest.right!.pos[k], 2);
      }
  });

  it("lets go of a two-handed grip for a gesture, and keeps both hands on it otherwise", () => {
    // Spectro's palm, Fusion's thrust, Glacio's hand to the ground: the
    // other hand leaves the katana, open.
    for (const element of ["spectro", "fusion", "glacio"] as const) {
      const p = heldPose("katana", special, at("katana", 0.56), undefined, false, element);
      expect(gap(p), element).toBeGreaterThan(0.2);
      expect(p.left!.curl!, element).toBeLessThan(0.5);
    }
    // Havoc's plunge is in both hands, on a katana and on a sword alike.
    expect(gap(heldPose("katana", special, at("katana", 0.56), undefined, false, "havoc"))).toBeCloseTo(WEAPON_SPECS.katana.otherHand!, 5);
    expect(gap(heldPose("sword", special, at("sword", 0.56), undefined, false, "havoc"))).toBeLessThan(0.1);
  });

  it("keeps a raised pole's haft out of the face", () => {
    for (const element of ELEMENTS)
      for (const f of [0.3, 0.44, 0.56, 0.75]) {
        const p = heldPose("scythe", special, at("scythe", f), undefined, false, element);
        if (!p.left || gap(p) > 0.35) continue;
        // Where the haft between the hands passes face height, it's out to the side or well ahead.
        for (let s = 0; s <= 1; s += 0.1) {
          const point = p.right!.pos.map((v, k) => v + (p.left!.pos[k] - v) * s);
          if (point[1] > 0.88 && point[1] < 1.08) expect(Math.abs(point[0]) > 0.12 || point[2] < -0.3, element + " " + f).toBe(true);
        }
      }
  });

  it("breathes each element's glow its own way, within bounds", () => {
    for (const element of ELEMENTS) {
      const samples = Array.from({ length: 200 }, (_, i) => elementPulse(element, i * 0.037));
      expect(Math.min(...samples), element).toBeGreaterThanOrEqual(0);
      expect(Math.max(...samples), element).toBeLessThanOrEqual(1);
      expect(Math.max(...samples) - Math.min(...samples), element).toBeGreaterThan(0.1);
    }
  });

  it("bursts every element, lights the place, and is done", () => {
    const effects = new FantasyEffects();
    const camera = new THREE.PerspectiveCamera();
    for (const element of ELEMENTS) {
      effects.special(element, new THREE.Vector3(), 0);
      effects.update(0.1, 0.1, camera);
      expect(Math.max(...effects.lights.map((l) => l.level)), element).toBeGreaterThan(0.2);
      for (let t = 0.1; t < 2; t += 0.1) effects.update(t, 0.1, camera);
      expect(Math.max(...effects.lights.map((l) => l.level)), element).toBe(0);
    }
    effects.dispose();
  });
});

describe("the necromancer", () => {
  const defender = { weapon: "sword" as const, ko: false, invulnerable: false };
  const undeadHit = { defender, attackerWeapon: "rod" as const, damage: 50, special: false, sinceLast: 10, undead: true };

  it("lets its undead strike for a little, from a necromancer only, no faster than three can", () => {
    expect(acceptHit({ ...undeadHit, distance: 12 })).toBe(UNDEAD.damage);
    expect(acceptHit({ ...undeadHit, attackerWeapon: "sword", distance: 2 })).toBe(0);
    expect(acceptHit({ ...undeadHit, distance: 12, sinceLast: MIN_HIT_GAP.undead / 2 })).toBe(0);
    expect(acceptHit({ ...undeadHit, distance: 200 })).toBe(0);
  });

  it("isn't too strong: slow bolts, and a special that charges slowest and adds up to about a blade's", () => {
    const rod = WEAPON_SPECS.rod;
    expect(rod.damage / rod.cooldown).toBeLessThan(WEAPON_SPECS.bow.damage / WEAPON_SPECS.bow.cooldown);
    expect(isBladed("rod")).toBe(false);
    expect(METER_PER_HIT.rod).toBe(Math.min(...Object.values(METER_PER_HIT)));
    expect(meterPerSecondFor("rod")).toBeLessThan(meterPerSecondFor("sword"));
    // Every undead striking all its time, the most it could do: still in
    // a special's range, not several of them.
    const most = UNDEAD.count * UNDEAD.damage * Math.floor((UNDEAD.seconds - UNDEAD.rise) / UNDEAD.every);
    expect(most).toBeLessThanOrEqual(Math.max(...WEAPONS.map((w) => WEAPON_SPECS[w].special)) * 1.5);
  });

  it("reads where someone's undead are, and when they're gone", () => {
    expect(parseFantasyEvent({ k: "un", e: "havoc", p: [1, 2, 3, 4, 5, 6] })).toEqual({ k: "un", element: "havoc", at: [[1, 2], [3, 4], [5, 6]] });
    expect(parseFantasyEvent({ k: "un", e: "havoc", p: [] })).toEqual({ k: "un", element: "havoc", at: [] });
    expect(parseFantasyEvent({ k: "un", e: "havoc", p: [1, 2, 3] })).toBeNull();
    expect(parseFantasyEvent({ k: "un", e: "havoc", p: [1, 2, 3, 4, 5, 6, 7, 8] })).toBeNull();
    expect(parseFantasyEvent({ k: "hit", t: ["a"], d: 3, m: 1 })).toMatchObject({ undead: true });
    expect(parseFantasyEvent({ k: "ar", o: [0, 1, 0], d: [0, 1, -10], e: "aero", b: 1 })).toMatchObject({ bolt: true });
  });
});

describe("the record", () => {
  it("reads who knocked someone out, and who helped", () => {
    expect(parseFantasyEvent({ k: "ko", by: "a", as: ["b", "c"] })).toEqual({ k: "ko", by: "a", assists: ["b", "c"] });
    expect(parseFantasyEvent({ k: "ko", by: "a" })).toBeNull();
  });

  it("counts knockouts, times down, and assists for each weapon, and keeps the longest combo", () => {
    tally("katana", "k");
    tally("katana", "k");
    tally("katana", "d");
    tally("rod", "a");
    comboReached("katana", 5);
    comboReached("katana", 3);
    expect(record.get().katana).toEqual({ k: 2, d: 1, a: 0, combo: 5 });
    expect(record.get().rod).toEqual({ k: 0, d: 0, a: 1, combo: 0 });
  });
});
