import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { sharedOverlay, type PoseOverlay } from "../../xr/body/bodyIk";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "../../xr/body/trackingStore";
import { PooledLight } from "../../scene/LightPool";
import { TRACKING_STALE_MS } from "../../xr/body/trackingWire";
import type { PlayerState } from "../../multiplayer/types";
import { cancelSelfPush, pushSelf } from "../../player/selfPush";
import { getAddonAvatar, LOCAL_AVATAR } from "../avatars";
import { blendBody, carryHand, copyBody, Gait, newBodyPose, poseBody, type BodyPose } from "../body";
import { onAddonEvent, sendAddonEvent } from "../bus";
import { disposeTree, facing, feetAndEye, holdInHand, newTrackedHand, pointHeld, poseHands, rigFor, toTrackedHand, type HandTarget } from "../rig";
import {
  acceptHit,
  announce,
  BLAST_AHEAD,
  controls,
  fantasy,
  fighterOf,
  gainMeter,
  HOLD_SECONDS,
  isInvulnerable,
  landedHits,
  lapseChain,
  local,
  METER_PER_PARRY,
  meterPerSecondFor,
  UNDEAD,
  parseFantasyEvent,
  pressCancel,
  pressEnd,
  pressStart,
  recoil,
  recordHit,
  remoteFighters,
  resetFantasy,
  setGuard,
  sinceLastHit,
  startAction,
  takeDamage,
  knockedOut,
  scoreKnockout,
} from "./combat";
import { BLADE_CONTACT, bodyCapsule, segmentDistance, sweep, type Capsule, type Closest } from "./contact";
import { FantasyEffects, Trail } from "./effects";
import { Pack } from "./undead";
import { bodyPose, bowDraw, heldPose, KNOCKED_OUT, timingOf, type Action, type ActionKind, type HeldPose } from "./poses";
import { playCharged, playClash, playHit, playKnockedOut, playSpecial, playSpecialCharge, playSwing } from "./sounds";
import { buzz } from "../../xr/controls";
import { buildWeapon, ELEMENT_COLORS, elementPulse, isBladed, MAX_HP, SABER_HALO, setBowString, weaponGlow, WEAPON_SPECS, type Element, type Weapon } from "./weapons";
import { floorHeightAt, getGround } from "../../scene/layout";

/** The ground's height under (x, z), in a built-in world or a model one. */
const floorAt = (x: number, z: number) => getGround()?.floorAt(x, z) ?? floorHeightAt(x, z);

interface FantasyLayerProps {
  selfId: string | null;
  players: Record<string, PlayerState>;
  getSelfPosition: () => [number, number, number];
  /** No fighting while editing: a click there picks things up. */
  editMode: boolean;
  /** This visitor is seated or in a posture (seiza, lying, a slow dance):
   *  their own avatar is the clip's, not the mode's. Their own posture
   *  never comes back from the room (it's sent to everyone else), so it
   *  comes from here. */
  selfSeated: boolean;
}

/** One avatar's share of the scene: what it holds and how it's posed. */
interface Holder {
  vrm: VRM;
  overlay: PoseOverlay;
  weight: number;
  pose: HeldPose;
  hands: { right: ReturnType<typeof newTrackedHand>; left: ReturnType<typeof newTrackedHand> };
  /** The weapon the pose is for, kept while it blends out. */
  posed: Weapon | null;
  propKey: string;
  prop: THREE.Group | null;
  detach: () => void;
  trail: Trail;
  bar: HealthBar | null;
  /** The blade, grip end to tip, in the world: this frame and the last. */
  base: THREE.Vector3;
  tip: THREE.Vector3;
  prevBase: THREE.Vector3;
  prevTip: THREE.Vector3;
  hasBlade: boolean;
  hadBlade: boolean;
  /** How fast the tip is moving, metres a second. */
  speed: number;
  inHeadset: boolean;
  /** The rest of the body (../body.ts): its pose this frame, how far it's
   *  blended in, whether the avatar is walking, and a number of its own
   *  so no two fighters breathe in step. */
  body: BodyPose;
  bodyWeight: number;
  gait: Gait;
  seed: number;
  /** What's actually drawn: the pose above, eased toward each frame, so a
   *  guard raised, a weapon changed, or a move's end never snaps. Each
   *  hand fades in and out on its own share. */
  settled: { body: BodyPose | null; right: Settled; left: Settled };
  /** When the weapon in hand was drawn, for it to grow into the hand. */
  drawnAt: number;
}

interface Settled {
  target: HandTarget;
  valid: boolean;
  share: number;
  /** The settled target moved with the body this frame (scratch). */
  carried: HandTarget;
}

const approach = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
/** How fast what's drawn follows the pose, a second: tightly through a
 *  move (its timing is what lands a blow), gently between moves. */
const EASE_ACTING = 40;
const EASE_RESTING = 9;
/** Seconds a newly drawn weapon takes to grow into the hand. */
const DRAW_SECONDS = 0.22;

const newTarget = (): HandTarget => ({ pos: [0, 0, 0], blade: [0, 1, 0], fingers: [0, 0, -1] });
const newSettled = (): Settled => ({ target: newTarget(), valid: false, share: 0, carried: newTarget() });
function copyTarget(from: HandTarget, out: HandTarget) {
  for (let k = 0; k < 3; k++) {
    out.pos[k] = from.pos[k];
    out.blade[k] = from.blade[k];
    out.fingers[k] = from.fingers[k];
  }
  out.curl = from.curl;
  return out;
}
/** Eases a hand toward `goal` (or holds it, fading, when there's none). */
function settleHand(hand: Settled, goal: HandTarget | null, k: number, dt: number) {
  hand.share = approach(hand.share, goal ? 1 : 0, 12, dt);
  if (!goal) return;
  if (!hand.valid) {
    copyTarget(goal, hand.target);
    hand.valid = true;
    return;
  }
  for (let i = 0; i < 3; i++) {
    hand.target.pos[i] += (goal.pos[i] - hand.target.pos[i]) * k;
    hand.target.blade[i] += (goal.blade[i] - hand.target.blade[i]) * k;
    hand.target.fingers[i] += (goal.fingers[i] - hand.target.fingers[i]) * k;
  }
  // An open hand for a special's gesture opens and closes with the rest.
  hand.target.curl = (hand.target.curl ?? 1) + ((goal.curl ?? 1) - (hand.target.curl ?? 1)) * k;
}
const seconds = () => performance.now() / 1000;
const ARROW_RANGE = 40;
/** How far each element's special carries you forward: Havoc lunges into
 *  its plunge, Electro and Glacio hold their ground. */
const SPECIAL_STEP: Record<Element, number> = { spectro: 0.2, havoc: 0.6, aero: 0.12, electro: 0, fusion: 0.3, glacio: 0.08 };
/** How long a special gathers before it's released (effects.ts's gather). */
const WIND_UP_SECONDS = 0.42;
/** Trigger (index curl, see xrPose.ts) past this fires; under the second re-arms. */
const TRIGGER_FIRE = 0.85;
const TRIGGER_RELEASE = 0.55;
/** A blade moving faster than this, at the tip, is a swing: in VR, the
 *  only way to attack; anywhere, what draws a trail. */
const SWING_SPEED = 2.4;
/** A primed special goes off on a swing at least this fast. */
const SPECIAL_SWING_SPEED = 3.2;

const v1 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const closest: Closest = { distance: 0, s: 0, point: new THREE.Vector3() };
const capsule: Capsule = { a: new THREE.Vector3(), b: new THREE.Vector3(), radius: 0 };
const round = (v: THREE.Vector3) => v.toArray().map((n) => Math.round(n * 100) / 100);


/**
 * Fantasy mode in the scene: weapons in hands, fighting stances and swings
 * through the arm IK, trails, health bars over other fighters, and this
 * visitor's attacks.
 *
 * A blow lands where the blade really goes. Each frame of a swing, this
 * visitor's blade (grip to tip, swept from the last frame) is tested
 * against everyone else's body and blade: touching a body is a hit;
 * touching a blade, any blade, is a parry, and both bounce off. Guarding
 * only raises the blade into the likely path: a swing that comes round it
 * still lands, and a parried guard is knocked aside for a moment.
 * The same test serves every way of playing:
 * - PC: click to swing (hold, with the meter full, for the special); hold F
 *   to guard.
 * - Phone: the sword button swings (hold for the special); the shield
 *   button guards.
 * - VR: just swing; a fast enough swing that meets someone lands, and your
 *   blade parries wherever you hold it. Draw the hand
 *   back over the shoulder with the meter full, and the next hard swing is
 *   the special. The trigger looses an arrow.
 */
export function FantasyLayer({ selfId, players, getSelfPosition, editMode, selfSeated }: FantasyLayerProps) {
  const selfSeatedRef = useRef(selfSeated);
  selfSeatedRef.current = selfSeated;
  const { camera, gl, scene } = useThree();
  const effects = useMemo(() => new FantasyEffects(), []);
  const holders = useRef(new Map<string, Holder>()).current;
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const meterCarry = useRef(0);
  const trigger = useRef({ held: false });
  /** VR: when this visitor's blade last landed on each person. */
  const lastContact = useRef(new Map<string, number>()).current;
  /** How far through its action this visitor's swing was last frame. */
  const lastPhase = useRef(1);
  /** Everyone's undead, by owner (this visitor's under LOCAL_AVATAR). */
  const packs = useRef(new Map<string, Pack>()).current;
  const ownPack = useRef<Pack | null>(null);
  const undeadSent = useRef(0);

  useEffect(() => {
    scene.add(effects.group);
    return () => {
      for (const pack of packs.values()) pack.dispose();
      packs.clear();
      ownPack.current = null;
      scene.remove(effects.group);
      effects.dispose();
    };
  }, [scene, effects]);

  // --- where everyone is, as this viewer sees them -----------------------------

  /** An avatar's feet, eye height, facing, and middle of the chest. */
  const bodyOf = (avatarId: string) => {
    const vrm = getAddonAvatar(avatarId);
    const rig = vrm && rigFor(vrm);
    if (!rig) return null;
    const feet = new THREE.Vector3();
    const eye = feetAndEye(rig, feet);
    const face = facing(rig, new THREE.Vector3());
    const chest = feet.clone().setY(feet.y + eye * 0.78);
    return { feet, eye, face, chest };
  };

  /** Other fighters who can be hit: holding a weapon and on their feet. */
  const targets = () => {
    const out: { id: string; feet: THREE.Vector3; eye: number; chest: THREE.Vector3 }[] = [];
    for (const [id, fighter] of remoteFighters) {
      if (!fighter.weapon || fighter.ko || !playersRef.current[id]) continue;
      const body = bodyOf(id);
      if (body) out.push({ id, feet: body.feet, eye: body.eye, chest: body.chest });
    }
    return out;
  };

  /** Someone's blade, wherever it is right now. Every blade is solid, all
   *  the time: guarding only puts it where a blow is likely to meet it. */
  const bladeOf = (id: string) => {
    const fighter = remoteFighters.get(id);
    const holder = holders.get(id);
    return isBladed(fighter?.weapon ?? null) && holder?.hasBlade ? holder : null;
  };

  const chestOf = (id: string) => (id === selfIdRef.current ? bodyOf(LOCAL_AVATAR) : bodyOf(id))?.chest ?? null;
  const distanceTo = (at: THREE.Vector3) => camera.getWorldPosition(v3).distanceTo(at);

  // --- this visitor's attacks ----------------------------------------------------

  const hit = (ids: string[], damage: number, special: boolean, weapon: Weapon, at?: THREE.Vector3[]) => {
    if (ids.length === 0) return;
    sendAddonEvent("fantasy", { k: "hit", t: ids, d: damage, ...(special ? { s: 1 } : {}) });
    ids.forEach((id, i) => {
      const point = at?.[i] ?? chestOf(id);
      if (point) effects.sparksAt(point, special ? "#ffffff" : "#ffe3a3");
    });
    playHit(weapon);
    if (!special && landedHits(weapon, ids.length)) playCharged();
  };

  /** This visitor, moved a little along where they face (back, if
   *  negative), in metres: a lunge into a swing, a step back off a blow.
   *  PlayerRig does the moving, through its walls, and never in VR. */
  const step = (distance: number, seconds: number, after = 0) => {
    const me = bodyOf(LOCAL_AVATAR);
    if (me) pushSelf(me.face.x * distance, me.face.z * distance, seconds, after);
  };

  const blocked = (id: string, at: THREE.Vector3, weapon: Weapon) => {
    sendAddonEvent("fantasy", { k: "blk", t: id, p: round(at) });
    effects.sparksAt(at, "#cfe6ff", 22, 4);
    playClash(weapon === "lightsaber");
    // Their blade is knocked aside here too, as it is on their screen.
    const other = remoteFighters.get(id);
    if (other && isBladed(other.weapon)) other.action = { kind: other.guard ? "stagger" : "recoil", n: 0, start: seconds() };
  };

  const blast = (element: Element, at: THREE.Vector3, weapon: Weapon) => {
    effects.special(element, at, seconds());
    playSpecial(element);
    sendAddonEvent("fantasy", { k: "fx", e: element, p: round(at) });
    const { special, specialRadius } = WEAPON_SPECS[weapon];
    const caught = targets().filter((t) => Math.hypot(t.feet.x - at.x, t.feet.z - at.z) <= specialRadius && Math.abs(t.feet.y - at.y) < 2.5);
    hit(caught.map((t) => t.id), special, true, weapon);
  };

  /** A blade's special: a blast just ahead, whoever's in it. */
  const slam = (weapon: Weapon, element: Element) => {
    const me = bodyOf(LOCAL_AVATAR);
    if (me) blast(element, me.feet.clone().addScaledVector(me.face, BLAST_AHEAD), weapon);
  };

  /**
   * This visitor's blade against everyone else, for the frame's stretch of
   * its swing. A blade that's guarding is met first if it's in the way.
   */
  const contact = (mine: Holder, weapon: Weapon, inVr: boolean) => {
    const spec = WEAPON_SPECS[weapon];
    const now = seconds();
    const ids: string[] = [];
    const points: THREE.Vector3[] = [];
    for (const t of targets()) {
      if (inVr ? now - (lastContact.get(t.id) ?? -1e9) < spec.cooldown : local.struck.has(t.id)) continue;
      // A swing on a screen sweeps as many as its weapon can; a real one
      // in VR meets whoever it meets.
      if (!inVr && local.struck.size >= spec.targets) break;
      bodyCapsule(t.feet, t.eye, capsule);
      const guard = bladeOf(t.id);
      const met = { outcome: null as "block" | "hit" | null };
      sweep(mine.prevBase, mine.prevTip, mine.base, mine.tip, (base, tip) => {
        if (guard && segmentDistance(base, tip, guard.base, guard.tip, closest).distance < BLADE_CONTACT) met.outcome = "block";
        else if (segmentDistance(base, tip, capsule.a, capsule.b, closest).distance < capsule.radius) met.outcome = "hit";
        return met.outcome !== null;
      });
      const outcome = met.outcome;
      if (!outcome) continue;
      lastContact.set(t.id, now);
      local.struck.add(t.id);
      if (outcome === "block") {
        blocked(t.id, closest.point.clone(), weapon);
        if (inVr) buzz(gl, "right", 0.9, 90);
        else {
          recoil();
          step(-0.1, 0.14);
        }
        return; // Stopped: nothing past the blade is reached.
      }
      ids.push(t.id);
      points.push(closest.point.clone());
    }
    if (ids.length) {
      hit(ids, spec.damage, false, weapon, points);
      if (inVr) buzz(gl, "right", 0.5, 45);
    }
  };

  /** The first armed body, or guarding blade, between two points of an
   *  arrow's flight; `except` is the archer, and someone else's arrow
   *  stops at this visitor too, if they're armed. */
  const arrowMeets = (from: THREE.Vector3, to: THREE.Vector3, except: string) => {
    let best: { id: string; at: THREE.Vector3; s: number; block: boolean } | null = null;
    const me = except && fantasy.get().weapon && !fantasy.get().ko ? bodyOf(LOCAL_AVATAR) : null;
    for (const t of me ? [...targets(), { id: LOCAL_AVATAR, ...me }] : targets()) {
      if (t.id === except) continue;
      const guard = bladeOf(t.id);
      if (guard && segmentDistance(from, to, guard.base, guard.tip, closest).distance < BLADE_CONTACT + 0.03 && (!best || closest.s < best.s)) {
        best = { id: t.id, at: closest.point.clone(), s: closest.s, block: true };
      }
      bodyCapsule(t.feet, t.eye, capsule);
      if (segmentDistance(from, to, capsule.a, capsule.b, closest).distance < capsule.radius + 0.04 && (!best || closest.s < best.s)) {
        best = { id: t.id, at: closest.point.clone(), s: closest.s, block: false };
      }
    }
    return best;
  };

  /** An arrow: it flies where this visitor looks, a real projectile, and
   *  lands on the first body or guarding blade it actually reaches, so
   *  stepping out of its way works. A few segment tests a frame. */
  const loose = (element: Element, special: boolean) => {
    const me = bodyOf(LOCAL_AVATAR);
    if (!me) return;
    const origin = me.chest.clone().addScaledVector(me.face, 0.35);
    const aim = camera.getWorldDirection(new THREE.Vector3());
    // Third person looks down at the avatar; aim no lower than level-ish.
    if (aim.y < -0.25) aim.setY(-0.25).normalize();
    const far = origin.clone().addScaledVector(aim, ARROW_RANGE);
    sendAddonEvent("fantasy", { k: "ar", o: round(origin), d: round(far), ...(special ? { e: element } : {}) });
    playSwing("bow");
    let landing: ReturnType<typeof arrowMeets> = null;
    effects.arrow(
      origin,
      far,
      special ? element : null,
      seconds(),
      (landed) => {
        if (landing?.block) blocked(landing.id, landed.clone(), "bow");
        else if (special) blast(element, landed.clone(), "bow");
        else if (landing) hit([landing.id], WEAPON_SPECS.bow.damage, false, "bow", [landed.clone()]);
      },
      (a, b) => (landing = arrowMeets(a, b, ""))?.at ?? null
    );
  };

  /**
   * The undead, every frame. This visitor's own go for the nearest armed
   * fighter in sight and strike when they reach them, and the room is told
   * where they are five times a second; everyone else's glide to where
   * their owner last said. All of them sink back after their time, or when
   * their owner puts the rod down or is knocked out.
   */
  const tendUndead = (now: number, dt: number) => {
    const own = ownPack.current;
    if (own && own.sinkingFrom === Infinity) {
      const me = fantasy.get();
      if (me.weapon !== "rod" || me.ko || now - own.born > UNDEAD.seconds) {
        own.sink(now);
        sendAddonEvent("fantasy", { k: "un", e: own.element, p: [] });
      } else if (now - own.born > UNDEAD.rise) {
        const foes = targets();
        for (const r of own.risen) {
          let foe: (typeof foes)[number] | null = null;
          let near: number = UNDEAD.sight;
          for (const t of foes) {
            const d = Math.hypot(t.feet.x - r.x, t.feet.z - r.z);
            if (d < near) {
              near = d;
              foe = t;
            }
          }
          if (!foe) continue;
          Pack.step(r, foe.feet.x, foe.feet.z, dt, UNDEAD.reach * 0.8);
          if (near <= UNDEAD.reach && now - r.lastStrike >= UNDEAD.every) {
            r.lastStrike = r.lunge = now;
            sendAddonEvent("fantasy", { k: "hit", t: [foe.id], d: UNDEAD.damage, m: 1 });
            effects.sparksAt(foe.chest, ELEMENT_COLORS[own.element], 8, 2);
            playHit(null, distanceTo(foe.chest));
          }
        }
        if (now - undeadSent.current > 0.2) {
          undeadSent.current = now;
          sendAddonEvent("fantasy", { k: "un", e: own.element, p: own.risen.flatMap((r) => [Math.round(r.x * 100) / 100, Math.round(r.z * 100) / 100]) });
        }
      }
    }
    for (const [key, pack] of packs) {
      if (key !== LOCAL_AVATAR) {
        // Nothing heard for a while: their owner left, or it's over.
        if (now - pack.heard > 1.5) pack.sink(now);
        for (const r of pack.risen) Pack.step(r, r.tx, r.tz, dt * 1.3);
      }
      pack.draw(now, floorAt);
      if (pack.gone) {
        pack.dispose();
        packs.delete(key);
        if (ownPack.current === pack) ownPack.current = null;
      }
    }
  };

  /** A rod's bolt: slower than an arrow, straight where this visitor looks,
   *  and, like an arrow, landing on whatever armed body or guarding blade
   *  it actually reaches. */
  const cast = (element: Element) => {
    const me = bodyOf(LOCAL_AVATAR);
    if (!me) return;
    const origin = me.chest.clone().addScaledVector(me.face, 0.6).setY(me.chest.y + 0.15);
    const aim = camera.getWorldDirection(new THREE.Vector3());
    if (aim.y < -0.25) aim.setY(-0.25).normalize();
    const far = origin.clone().addScaledVector(aim, WEAPON_SPECS.rod.reach);
    sendAddonEvent("fantasy", { k: "ar", o: round(origin), d: round(far), e: element, b: 1 });
    let landing: ReturnType<typeof arrowMeets> = null;
    effects.bolt(
      origin,
      far,
      element,
      seconds(),
      (landed) => {
        effects.sparksAt(landed, ELEMENT_COLORS[element], 12, 2.5);
        if (landing?.block) blocked(landing.id, landed.clone(), "rod");
        else if (landing) hit([landing.id], WEAPON_SPECS.rod.damage, false, "rod", [landed.clone()]);
      },
      (a, b) => (landing = arrowMeets(a, b, ""))?.at ?? null
    );
  };

  /** A necromancer's special: three undead rise in front of them. */
  const summon = (element: Element) => {
    const me = bodyOf(LOCAL_AVATAR);
    if (!me) return;
    const side = new THREE.Vector3(me.face.z, 0, -me.face.x);
    const at: [number, number][] = [-1, 0, 1].map((s) => {
      const p = me.feet.clone().addScaledVector(me.face, s === 0 ? 1.8 : 1.3).addScaledVector(side, s * 1.2);
      return [p.x, p.z];
    });
    ownPack.current?.sink(seconds());
    const pack = new Pack(element, at, seconds());
    effects.group.add(pack.group);
    ownPack.current = pack;
    packs.set(LOCAL_AVATAR, pack);
    for (const [x, z] of at) effects.sparksAt(new THREE.Vector3(x, floorAt(x, z) + 0.2, z), ELEMENT_COLORS[element], 22, 1.6);
    playSpecial(element);
    sendAddonEvent("fantasy", { k: "un", e: element, p: at.flat().map((n) => Math.round(n * 100) / 100) });
  };

  /** A special gathering at its wielder's feet, with its rising sound,
   *  timed to end as it's released `release` seconds from now. */
  const windUp = (element: Element, who: string, release: number, distance?: number) => {
    const gather = () => {
      const body = bodyOf(who);
      if (body) effects.gather(element, body.feet, seconds());
      playSpecialCharge(element, distance);
    };
    const wait = Math.max(0, release - WIND_UP_SECONDS) * 1000;
    if (wait > 0) setTimeout(gather, wait);
    else gather();
  };

  // Everything that starts an attack (mouse, touch button, VR trigger)
  // ends up here. A blade's swing lands by contact, frame by frame; its
  // special and a bow's arrows go off at the action's moment.
  controls.act = (kind: ActionKind) => {
    const { weapon, element } = fantasy.get();
    if (!weapon) return;
    const action = startAction(kind);
    if (!action) return;
    const timing = timingOf(weapon, action.kind);
    const impact = timing.duration * timing.impact * 1000;
    if (weapon !== "bow") setTimeout(() => playSwing(weapon), impact * (weapon === "rod" ? 0.9 : 0.45));
    // The body goes with the blow: a step in on a cut, a long lunge on a
    // blade's special, a step back off a bow's.
    const at = (share: number) => timing.duration * share;
    if (action.kind === "special") windUp(element, LOCAL_AVATAR, at(timing.impact));
    if (weapon === "bow") {
      if (action.kind === "special") step(-0.18, 0.15, at(timing.impact));
    } else if (weapon === "rod") {
      if (action.kind === "swing") step(0.06, 0.12, at(0.4));
    } else if (action.kind === "special") step(SPECIAL_STEP[element], 0.22, at(0.36));
    else step(action.n === 0 ? 0.16 : 0.1, 0.16, at(0.3));
    if (isBladed(weapon) && action.kind !== "special") return;
    setTimeout(() => {
      const now = fantasy.get();
      if (now.weapon !== weapon || now.ko || local.action !== action) return;
      if (weapon === "bow") loose(element, action.kind === "special");
      else if (weapon === "rod") {
        if (action.kind === "special") summon(element);
        else cast(element);
      } else slam(weapon, element);
    }, impact);
  };

  // --- everyone else's ---------------------------------------------------------------

  useEffect(
    () =>
      onAddonEvent("fantasy", (from, data) => {
        const event = parseFantasyEvent(data);
        if (!event || from === selfIdRef.current) return;
        const fighter = fighterOf(from);
        const body = bodyOf(from);
        const distance = body ? distanceTo(body.chest) : undefined;
        switch (event.k) {
          case "hi":
            // Someone's mode just started: tell them what you hold.
            if (fantasy.get().weapon) announce();
            break;
          case "lo": {
            const wasKo = fighter.ko;
            Object.assign(fighter, { weapon: event.weapon, element: event.element, hp: event.hp, ko: event.ko, guard: event.guard, ready: event.ready });
            if (!event.weapon) fighter.action = null;
            if (event.ko && !wasKo) playKnockedOut(distance);
            break;
          }
          case "gd":
            fighter.guard = event.on;
            break;
          case "act": {
            if (!fighter.weapon) return;
            const action: Action = { kind: event.kind, n: event.n, start: seconds() };
            fighter.action = action;
            if (action.kind === "special") fighter.ready = false;
            const timing = timingOf(fighter.weapon, action.kind);
            if (action.kind === "special") windUp(fighter.element, from, timing.duration * timing.impact, distance);
            const weapon = fighter.weapon;
            if (weapon !== "bow" && action.kind !== "recoil") setTimeout(() => playSwing(weapon, distance), timing.duration * timing.impact * 450);
            break;
          }
          case "blk": {
            // Their swing met a blade: both bounce back, with sparks and a
            // clang. The one that stopped it is knocked aside too, so a
            // guard held up doesn't stay a wall: a quick follow-up gets in.
            const at = new THREE.Vector3(...event.at);
            if (body && at.distanceTo(body.feet) > 6) return;
            fighter.action = { kind: "recoil", n: 0, start: seconds() };
            effects.sparksAt(at, "#cfe6ff", 22, 4);
            playClash(fighter.weapon === "lightsaber", distanceTo(at));
            if (event.target === selfIdRef.current) {
              // Your blade stopped their blow: you're knocked aside (a
              // guard held up further), and it counts toward your special.
              const guarding = fantasy.get().guard;
              recoil();
              step(guarding ? -0.22 : -0.1, 0.18);
              buzz(gl, "right", 0.7, 70);
              if (gainMeter(METER_PER_PARRY)) playCharged();
            } else {
              const other = remoteFighters.get(event.target);
              if (other && isBladed(other.weapon)) other.action = { kind: other.guard ? "stagger" : "recoil", n: 0, start: seconds() };
            }
            break;
          }
          case "hit": {
            for (const id of event.targets) {
              const chest = chestOf(id);
              if (chest) effects.sparksAt(chest, event.special ? "#ffffff" : "#ffe3a3");
              if (id !== selfIdRef.current) fighterOf(id).hurtAt = seconds();
              // Their undead struck: the one nearest lunges.
              if (event.undead && chest) packs.get(from)?.lungeNearest(chest.x, chest.z, seconds());
            }
            playHit(event.undead ? null : fighter.weapon, distance);
            const self = selfIdRef.current;
            if (!self || !event.targets.includes(self)) break;
            const me = fantasy.get();
            const theirs = playersRef.current[from]?.position;
            const mine = getSelfPosition();
            const amount = acceptHit({
              defender: { weapon: me.weapon, ko: me.ko, invulnerable: isInvulnerable() },
              attackerWeapon: fighter.weapon,
              distance: theirs ? Math.hypot(theirs[0] - mine[0], theirs[1] - mine[1], theirs[2] - mine[2]) : Infinity,
              damage: event.damage,
              special: event.special,
              sinceLast: sinceLastHit(from, event.special, event.undead),
              undead: event.undead,
            });
            if (amount > 0) {
              recordHit(from, event.special, event.undead);
              local.hitBy.set(from, seconds());
              takeDamage(amount, () => {
                playKnockedOut();
                knockedOut(from);
              });
              // Knocked back, away from whoever hit you; a special throws further.
              if (theirs) {
                const away = Math.hypot(mine[0] - theirs[0], mine[2] - theirs[2]);
                const distance = event.special ? 0.55 : 0.18;
                if (away > 0.01) pushSelf(((mine[0] - theirs[0]) / away) * distance, ((mine[2] - theirs[2]) / away) * distance, event.special ? 0.3 : 0.16);
              }
              buzz(gl, "left", 0.4, 60);
              buzz(gl, "right", 0.4, 60);
            }
            break;
          }
          case "fx": {
            const at = new THREE.Vector3(...event.at);
            effects.special(event.element, at, seconds());
            playSpecial(event.element, distanceTo(at));
            break;
          }
          case "ko":
            scoreKnockout(event.by, event.assists, selfIdRef.current);
            break;
          case "un": {
            // Someone's undead: risen, moved, or gone.
            let pack = packs.get(from);
            if (event.at.length === 0) {
              pack?.sink(seconds());
              break;
            }
            if (body && Math.hypot(event.at[0][0] - body.feet.x, event.at[0][1] - body.feet.z) > 60) return;
            if (!pack || pack.sinkingFrom !== Infinity || pack.element !== event.element) {
              pack?.sink(seconds());
              pack = new Pack(event.element, event.at, seconds());
              effects.group.add(pack.group);
              packs.set(from, pack);
              for (const [x, z] of event.at) effects.sparksAt(new THREE.Vector3(x, floorAt(x, z) + 0.2, z), ELEMENT_COLORS[event.element], 22, 1.6);
              playSpecial(event.element, distance);
            }
            pack.heard = seconds();
            event.at.forEach(([x, z], i) => {
              const r = pack!.risen[i];
              if (r) Object.assign(r, { tx: x, tz: z });
            });
            break;
          }
          case "ar": {
            const from3 = new THREE.Vector3(...event.from);
            const to3 = new THREE.Vector3(...event.to);
            if (from3.distanceTo(to3) > ARROW_RANGE + 2) return;
            if (event.bolt && event.element) {
              effects.bolt(from3, to3, event.element, seconds(), undefined, (a, b) => arrowMeets(a, b, from)?.at ?? null);
              playSwing("rod", distanceTo(from3));
              break;
            }
            // Seen stopping where it does on the archer's screen: at the first
            // armed body it reaches (yours is the archer's to judge).
            effects.arrow(from3, to3, event.element, seconds(), undefined, (a, b) => arrowMeets(a, b, from)?.at ?? null);
            playSwing("bow", distanceTo(from3));
            break;
          }
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // Ask once on starting, since anything announced before this client
  // was listening (the mode switching on as someone picks) was missed.
  useEffect(() => sendAddonEvent("fantasy", { k: "hi" }), []);

  // Newcomers learn what everyone holds; leavers are forgotten.
  const roster = Object.keys(players).sort().join(",");
  useEffect(() => {
    for (const id of [...remoteFighters.keys()]) if (!playersRef.current[id]) remoteFighters.delete(id);
    const timer = setTimeout(() => fantasy.get().weapon && announce(), 600);
    return () => clearTimeout(timer);
  }, [roster]);

  useEffect(
    () => () => {
      for (const holder of holders.values()) releaseHolder(holder);
      holders.clear();
      resetFantasy();
      cancelSelfPush();
    },
    [holders]
  );

  // --- mouse: click to strike, hold for the special; F to guard --------------------

  useEffect(() => {
    if (editMode) return;
    const el = gl.domElement;
    let press: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || !fantasy.get().weapon) return;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY };
      pressStart();
    };
    const move = (e: PointerEvent) => {
      // A drag is looking around, not attacking.
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
        press = null;
        pressCancel();
      }
    };
    const up = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      press = null;
      pressEnd();
    };
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const key = (e: KeyboardEvent) => {
      if (e.code !== "KeyF" || e.repeat || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      setGuard(e.type === "keydown");
    };
    const lostFocus = () => setGuard(false);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", lostFocus);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", lostFocus);
      pressCancel();
      setGuard(false);
    };
  }, [gl, editMode]);

  // --- every frame ------------------------------------------------------------------------

  useFrame((state, rawDelta) => {
    const frame = state.clock.elapsedTime;
    const dt = Math.min(rawDelta, 0.05);
    const now = seconds();
    const me = fantasy.get();

    // The meter fills slowly on its own while you hold a weapon, by the
    // clock rather than the (capped) frame step, so a slow device fills it
    // as fast as a quick one.
    if (me.weapon && !me.ko && me.meter < 100) {
      meterCarry.current += Math.min(rawDelta, 0.5) * meterPerSecondFor(me.weapon);
      if (meterCarry.current >= 1) {
        const whole = Math.floor(meterCarry.current);
        meterCarry.current -= whole;
        if (gainMeter(whole)) playCharged();
      }
    }
    lapseChain();
    // A held click or button shows its charge once the meter is full.
    if (controls.pressedAt !== null && me.meter >= 100) {
      const charge = Math.min(1, (now - controls.pressedAt) / HOLD_SECONDS);
      if (Math.abs(charge - me.charge) >= 0.05 || (charge === 1 && me.charge !== 1)) fantasy.set((s) => ({ ...s, charge }));
    }

    const sample = trackingStore.get(LOCAL_TRACKING_SOURCE);
    const inVr = sample !== null && performance.now() - sample.receivedAt < TRACKING_STALE_MS;

    const seen = new Set<string>();
    const tend = (key: string, weapon: Weapon | null, element: Element, ko: boolean, action: Action | null, hp: number | null, guard: boolean, charge: number, hurtAt: number) => {
      const vrm = getAddonAvatar(key);
      if (!vrm) return;
      seen.add(key);
      let holder = holders.get(key);
      if (holder && holder.vrm !== vrm) {
        releaseHolder(holder);
        holder = undefined;
      }
      if (!holder) {
        holder = {
          vrm,
          overlay: sharedOverlay(vrm, frame),
          weight: 0,
          pose: { right: null, left: null, trail: false },
          hands: { right: newTrackedHand(), left: newTrackedHand() },
          posed: null,
          propKey: "",
          prop: null,
          detach: () => {},
          trail: new Trail(),
          bar: null,
          base: new THREE.Vector3(),
          tip: new THREE.Vector3(),
          prevBase: new THREE.Vector3(),
          prevTip: new THREE.Vector3(),
          hasBlade: false,
          hadBlade: false,
          speed: 0,
          inHeadset: false,
          body: newBodyPose(),
          bodyWeight: 0,
          gait: new Gait(),
          seed: Math.random() * 6,
          settled: { body: null, right: newSettled(), left: newSettled() },
          drawnAt: -Infinity,
        };
        effects.group.add(holder.trail.mesh);
        holders.set(key, holder);
      }
      // Always first: takes last frame's pose back off the bones, once a
      // frame for everything that poses them (bodyIk.ts).
      holder.overlay = sharedOverlay(vrm, frame);

      const held = ko ? null : weapon;
      // Every weapon is built in its element's colour now: its aura is.
      const propKey = held ? `${held}:${element}` : "";
      if (propKey !== holder.propKey) {
        holder.detach();
        if (holder.prop) disposeTree(holder.prop);
        holder.prop = held ? buildWeapon(held, element) : null;
        holder.detach = holder.prop ? holdInHand(vrm, held === "bow" ? "left" : "right", holder.prop) : () => {};
        holder.propKey = propKey;
        holder.trail.setColor(held === "lightsaber" ? ELEMENT_COLORS[element] : "#dfe8ff");
        holder.hadBlade = false;
        holder.drawnAt = now;
      }
      // A new weapon grows into the hand rather than appearing in it.
      if (holder.prop) holder.prop.scale.setScalar(THREE.MathUtils.smoothstep((now - holder.drawnAt) / DRAW_SECONDS, 0, 1));

      const rig = rigFor(vrm);
      const source = key === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : key;
      const tracked = trackingStore.get(source);
      holder.inHeadset = tracked !== null && performance.now() - tracked.receivedAt < TRACKING_STALE_MS;
      // Holding a controller: the weapon along its handle (rig.ts, pointHeld).
      if (holder.prop && held !== "bow") pointHeld(holder.prop, holder.inHeadset && tracked!.pose.right?.held === true);
      const seated = key === LOCAL_AVATAR ? selfSeatedRef.current : !!playersRef.current[key]?.posture;
      if (held) holder.posed = held;
      holder.weight = approach(holder.weight, held && !holder.inHeadset && !seated ? 1 : 0, 8, dt);
      // The body first, so the hands then reach from wherever the shoulders
      // went. Knocked out, it slumps; walking, the walk keeps the legs; in a
      // headset, the player's own body is the pose.
      holder.bodyWeight = approach(holder.bodyWeight, (held || (ko && weapon)) && !holder.inHeadset && !seated ? 1 : 0, ko ? 3 : 6, dt);
      let legs = 0;
      const timing = action && holder.posed ? timingOf(holder.posed, action.kind) : null;
      const acting = timing !== null && now - action!.start < timing.duration;
      const ease = 1 - Math.exp(-(acting ? EASE_ACTING : EASE_RESTING) * dt);
      const settled = holder.settled;
      if (rig) {
        const moving = holder.gait.update(rig, dt);
        if (holder.bodyWeight > 0.001 && (holder.posed || ko)) {
          if (ko || !holder.posed) copyKnockedOut(holder.body);
          else bodyPose(holder.posed, action, now, guard, holder.body, hurtAt, holder.seed, element);
          if (!settled.body) settled.body = copyBody(holder.body, newBodyPose());
          else blendBody(settled.body, holder.body, ease);
          const upper = holder.bodyWeight * (acting ? 1 : 1 - 0.5 * moving);
          legs = Math.min(upper, holder.bodyWeight * (acting ? 1 : 1 - moving));
          poseBody(rig, holder.overlay, settled.body, upper, legs);
        } else settled.body = null;
      }
      if (rig && holder.posed && holder.weight > 0.001) {
        const pose = heldPose(holder.posed, action, now, holder.pose, guard, element);
        settleHand(settled.right, pose.right, ease, dt);
        settleHand(settled.left, pose.left, ease, dt);
        const drawn = (hand: Settled, side: "left" | "right") => {
          if (!hand.valid || hand.share < 0.01) return null;
          copyTarget(hand.target, hand.carried);
          if (holder.bodyWeight > 0.001 && settled.body) carryHand(hand.carried, settled.body, holder.bodyWeight, legs);
          return toTrackedHand(side, hand.carried, holder.hands[side]);
        };
        poseHands(rig, holder.overlay, drawn(settled.right, "right"), drawn(settled.left, "left"), holder.weight, settled.right.share, settled.left.share);
      } else if (holder.weight <= 0.001) {
        holder.posed = null;
        settled.right.valid = settled.left.valid = false;
        settled.right.share = settled.left.share = 0;
      }

      // The bow's string follows the drawing hand back, with an arrow on it,
      // and snaps forward when the arrow goes.
      if (held === "bow" && holder.prop) {
        const draw = bowDraw(action, now);
        const hand = draw > 0 ? vrm.humanoid.getNormalizedBoneNode("rightHand") : null;
        if (hand) {
          hand.updateWorldMatrix(true, false);
          setBowString(holder.prop, holder.prop.worldToLocal(v3.setFromMatrixPosition(hand.matrixWorld)), draw);
        } else setBowString(holder.prop, null, 0);
      }

      // Where the blade is now, and how fast its tip is going.
      holder.hasBlade = !!holder.prop && isBladed(held);
      if (holder.hasBlade) {
        const { blade: [base, tip], bladeOut = 0 } = WEAPON_SPECS[held!];
        holder.prop!.updateWorldMatrix(true, false);
        holder.prop!.localToWorld(holder.base.set(0, base * 0.5, 0));
        // A scythe cuts out at its blade's tip, off to the side of the haft.
        holder.prop!.localToWorld(holder.tip.set(bladeOut, tip, 0));
        holder.speed = holder.hadBlade && rawDelta > 0 ? holder.tip.distanceTo(holder.prevTip) / Math.max(rawDelta, 1 / 120) : 0;
        if (!holder.hadBlade) {
          holder.prevBase.copy(holder.base);
          holder.prevTip.copy(holder.tip);
        }
        const timing = action ? timingOf(held!, action.kind) : null;
        const phase = timing ? (now - action!.start) / timing.duration : 1;
        const swinging = timing !== null && phase >= timing.trail[0] && phase <= timing.trail[1];
        if (swinging || holder.speed > SWING_SPEED) holder.trail.push(holder.base, holder.tip, now);
      } else holder.speed = 0;
      holder.trail.update(now);

      // The aura: faint as the meter fills, breathing in its element's way
      // once the special is ready (elementPulse), and flaring while it goes off.
      const glow = holder.prop && weaponGlow(holder.prop);
      if (glow) {
        const special = action?.kind === "special" && now - action.start < timingOf(held ?? "sword", "special").duration;
        const pulse = elementPulse(element, now + holder.seed);
        const level = special ? 1 : charge >= 1 ? 0.2 + 0.6 * pulse : (0.05 + 0.25 * charge * charge) * (0.75 + 0.25 * pulse);
        glow.opacity = holder.prop!.userData.saber ? SABER_HALO + (1 - SABER_HALO) * Math.max(0, level - 0.3) : level;
      }

      // Other fighters' health, over their heads.
      if (hp !== null && weapon) {
        if (!holder.bar) holder.bar = new HealthBar();
        const anchor = vrm.scene.parent;
        if (anchor && holder.bar.group.parent !== anchor) anchor.add(holder.bar.group);
        holder.bar.set(hp, ko);
        holder.bar.face(camera);
      } else if (holder.bar) {
        holder.bar.dispose();
        holder.bar = null;
      }
    };

    tend(LOCAL_AVATAR, me.weapon, me.element, me.ko, local.action, null, me.guard, me.meter / 100, local.hurtAt);
    for (const [id, fighter] of remoteFighters) {
      // Others' meters aren't sent, only whether it's full.
      if (fighter.weapon || holders.has(id)) tend(id, fighter.weapon, fighter.element, fighter.ko, fighter.action, fighter.hp, fighter.guard, fighter.ready ? 1 : 0, fighter.hurtAt);
    }
    for (const [key, holder] of holders) {
      if (seen.has(key)) continue;
      releaseHolder(holder);
      holders.delete(key);
    }

    // This visitor's blade meeting anyone, now that everyone is posed.
    const mine = holders.get(LOCAL_AVATAR);
    if (mine?.hasBlade && mine.hadBlade && me.weapon && !me.ko && !editMode) {
      if (inVr) {
        // A drawn-back hand with the meter full primes the special; the
        // next hard swing forward lets it go.
        const hand = sample!.pose.right;
        if (hand && me.meter >= 100 && !me.primed && hand.pose[2] > sample!.pose.head[2] + 0.12 && hand.pose[1] > sample!.pose.head[1] - 0.15) {
          fantasy.set((s) => ({ ...s, primed: true }));
          playCharged();
          buzz(gl, "right", 0.3, 40);
        }
        const body = fantasy.get().primed && mine.speed > SPECIAL_SWING_SPEED ? bodyOf(LOCAL_AVATAR) : null;
        const forward = body && v1.subVectors(mine.tip, mine.prevTip).normalize().dot(body.face) > 0.3;
        if (forward && startAction("special")) slam(me.weapon, me.element);
        else if (mine.speed > SWING_SPEED) contact(mine, me.weapon, true);
      } else {
        const action = local.action;
        const timing = action ? timingOf(me.weapon, action.kind) : null;
        const phase = timing ? (now - action!.start) / timing.duration : 1;
        // Any frame whose step overlaps the cutting part of the swing, so
        // a slow frame that jumps over it still sweeps the blade across.
        const from = Math.min(lastPhase.current, phase);
        if (action && action.kind === "swing" && phase >= timing!.trail[0] - 0.06 && from <= timing!.trail[1]) contact(mine, me.weapon, false);
        lastPhase.current = phase;
      }
    }
    // VR: the trigger looses an arrow, or casts a rod's bolt (primed, the
    // special).
    if (inVr && (me.weapon === "bow" || me.weapon === "rod") && !me.ko && !editMode) {
      const squeeze = sample!.pose.right?.curl[0] ?? 0;
      if (squeeze >= TRIGGER_FIRE && !trigger.current.held) {
        trigger.current.held = true;
        controls.act(fantasy.get().primed ? "special" : "swing");
      } else if (squeeze <= TRIGGER_RELEASE) trigger.current.held = false;
    }
    for (const holder of holders.values()) {
      holder.prevBase.copy(holder.base);
      holder.prevTip.copy(holder.tip);
      holder.hadBlade = holder.hasBlade;
    }

    tendUndead(now, dt);
    effects.update(now, dt, camera);
  }, -0.4);

  return <SpecialLights effects={effects} />;
}

/** How bright a special's light is at its peak, and how far it reaches. */
const SPECIAL_LIGHT = { intensity: 26, distance: 16 };

/**
 * Real light from the specials: a pooled light (src/scene/LightPool.tsx)
 * per burst, at it, in its element's colour, flaring and fading with it.
 * Each takes a light from the pool only while it's bright, so lamps lose
 * theirs only for the moment a special lights the place.
 */
function SpecialLights({ effects }: { effects: FantasyEffects }) {
  const lights = effects.lights;
  const anchors = useRef<(THREE.Group | null)[]>([]);
  const levels = useMemo(() => lights.map(() => ({ current: 0 }) as MutableRefObject<number>), [lights.length]);
  const [colors, setColors] = useState(() => lights.map(() => "#ffffff"));
  const shown = useRef(colors);
  useFrame(() => {
    let changed = false;
    const next = [...shown.current];
    effects.lights.forEach((light, i) => {
      anchors.current[i]?.position.set(light.at.x, light.at.y + 1.2, light.at.z);
      levels[i].current = SPECIAL_LIGHT.intensity * light.level;
      const hex = `#${light.color.getHexString()}`;
      if (light.level > 0 && hex !== next[i]) {
        next[i] = hex;
        changed = true;
      }
    });
    if (changed) {
      shown.current = next;
      setColors(next);
    }
  });
  return (
    <>
      {levels.map((level, i) => (
        <group key={i} ref={(g) => (anchors.current[i] = g)}>
          <PooledLight position={[0, 0, 0]} color={colors[i]} intensityRef={level} distance={SPECIAL_LIGHT.distance} />
        </group>
      ))}
    </>
  );
}

function copyKnockedOut(out: BodyPose) {
  Object.assign(out, KNOCKED_OUT);
  out.left = [...KNOCKED_OUT.left];
  out.right = [...KNOCKED_OUT.right];
  return out;
}

function releaseHolder(holder: Holder) {
  holder.overlay.restore();
  holder.detach();
  if (holder.prop) disposeTree(holder.prop);
  holder.trail.mesh.removeFromParent();
  holder.trail.dispose();
  holder.bar?.dispose();
}

// --- health bars --------------------------------------------------------------------------

const BAR_WIDTH = 0.56;
const parentQ = new THREE.Quaternion();
const low = new THREE.Color("#ff4d4d");
const high = new THREE.Color("#5dff8a");

class HealthBar {
  readonly group = new THREE.Group();
  private fill: THREE.Mesh;
  private back: THREE.Mesh;

  constructor() {
    this.back = new THREE.Mesh(
      new THREE.PlaneGeometry(BAR_WIDTH + 0.04, 0.075),
      new THREE.MeshBasicMaterial({ color: "#0d0f14", transparent: true, opacity: 0.7, depthWrite: false })
    );
    this.fill = new THREE.Mesh(
      new THREE.PlaneGeometry(BAR_WIDTH, 0.045).translate(BAR_WIDTH / 2, 0, 0.001),
      new THREE.MeshBasicMaterial({ color: "#5dff8a", toneMapped: false })
    );
    this.fill.position.x = -BAR_WIDTH / 2;
    this.group.add(this.back, this.fill);
    // Clear of the name tag below it.
    this.group.position.y = 2.17;
    this.group.renderOrder = 5;
    this.group.traverse((o) => (o.userData.navIgnore = true));
  }

  set(hp: number, ko: boolean) {
    const share = Math.max(0, Math.min(1, hp / MAX_HP));
    this.fill.visible = !ko && share > 0;
    this.fill.scale.x = Math.max(0.001, share);
    (this.fill.material as THREE.MeshBasicMaterial).color.copy(low).lerp(high, share);
    (this.back.material as THREE.MeshBasicMaterial).color.set(ko ? "#5a1f24" : "#0d0f14");
  }

  /** Turns to the camera, whatever the avatar's group is turned to. */
  face(camera: THREE.Camera) {
    const parent = this.group.parent;
    if (!parent) return;
    parent.getWorldQuaternion(parentQ).invert();
    camera.getWorldQuaternion(this.group.quaternion);
    this.group.quaternion.premultiply(parentQ);
  }

  dispose() {
    this.group.removeFromParent();
    disposeTree(this.group);
  }
}
