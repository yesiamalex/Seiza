import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { handQuaternion } from "./rig";
import { acceptHit, fantasy, landedHits, meterForHits, METER_CHAIN, METER_PER_HIT, MIN_HIT_GAP, parseFantasyEvent, resetFantasy } from "./fantasy/combat";
import { bodyPose, bowDraw, COMBO_CYCLE, cutOf, heldPose, timingOf } from "./fantasy/poses";
import { carryHand, key as bodyKey, newBodyPose, sampleBody } from "./body";
import { bandBody } from "./band/moves";
import { cancelSelfPush, pushSelf, takeSelfPush } from "../player/selfPush";
import { WEAPON_SPECS, WEAPONS } from "./fantasy/weapons";
import { parseBandEvent, validNote } from "./band/band";
import { INSTRUMENTS, KEY_LAYOUT, KIT } from "./band/instruments";
import { KIT_PIECES_AT, kitPose, stickPose, type Hands } from "./band/BandLayer";
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
    const blades = WEAPONS.filter((w) => w !== "bow" && w !== "naginata");
    const dps = blades.map((w) => WEAPON_SPECS[w].damage / WEAPON_SPECS[w].cooldown);
    for (const value of dps) expect(Math.abs(value - 25)).toBeLessThan(2.5);
    // ...except the naginata, which trades it for reach and three at once.
    const naginata = WEAPON_SPECS.naginata;
    expect(naginata.targets * (naginata.damage / naginata.cooldown)).toBeGreaterThan(40);
    expect(naginata.reach).toBeGreaterThan(WEAPON_SPECS.sword.reach);
  });

  it("reads only well-formed events", () => {
    expect(parseFantasyEvent({ k: "lo", w: "katana", e: "fire", hp: 80, ko: false })).toEqual({ k: "lo", weapon: "katana", element: "fire", hp: 80, ko: false, guard: false, ready: false });
    expect(parseFantasyEvent({ k: "lo", w: "", e: "ice", hp: 100 })).toEqual({ k: "lo", weapon: null, element: "ice", hp: 100, ko: false, guard: false, ready: false });
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
    for (const weapon of ["sword", "katana", "naginata", "lightsaber"] as const) {
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
    for (const weapon of ["katana", "naginata"] as const) {
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
    expect(parseBandEvent({ k: "n", n: 61.4 })).toEqual({ k: "n", note: 61 });
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
  const hands = (): Hands => {
    const t = () => ({ pos: [0, 0, 0] as [number, number, number], blade: [0, 1, 0] as [number, number, number], fingers: [0, 0, -1] as [number, number, number], curl: 0.35 });
    return { right: t(), left: t(), lastX: { left: -0.1, right: 0.1 }, last: "right", lastPiece: { left: KIT.snare, right: KIT.hat } };
  };

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
