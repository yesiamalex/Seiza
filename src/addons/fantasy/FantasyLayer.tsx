import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { PoseOverlay } from "../../xr/body/bodyIk";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "../../xr/body/trackingStore";
import { TRACKING_STALE_MS } from "../../xr/body/trackingWire";
import type { PlayerState } from "../../multiplayer/types";
import { cancelSelfPush, pushSelf } from "../../player/selfPush";
import { getAddonAvatar, LOCAL_AVATAR } from "../avatars";
import { carryHand, Gait, newBodyPose, poseBody, type BodyPose } from "../body";
import { onAddonEvent, sendAddonEvent } from "../bus";
import { disposeTree, facing, feetAndEye, holdInHand, newTrackedHand, poseHands, rigFor, toTrackedHand } from "../rig";
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
  meterPerSecond,
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
} from "./combat";
import { BLADE_CONTACT, bodyCapsule, segmentDistance, sweep, type Capsule, type Closest } from "./contact";
import { FantasyEffects, Trail } from "./effects";
import { bodyPose, heldPose, KNOCKED_OUT, timingOf, type Action, type ActionKind, type HeldPose } from "./poses";
import { playCharged, playClash, playHit, playKnockedOut, playSpecial, playSwing } from "./sounds";
import { buildWeapon, ELEMENT_COLORS, MAX_HP, SABER_HALO, weaponGlow, WEAPON_SPECS, type Element, type Weapon } from "./weapons";

interface FantasyLayerProps {
  selfId: string | null;
  players: Record<string, PlayerState>;
  getSelfPosition: () => [number, number, number];
  /** No fighting while editing: a click there picks things up. */
  editMode: boolean;
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
}

const approach = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
const seconds = () => performance.now() / 1000;
const ARROW_RANGE = 40;
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

/** A short buzz in a VR controller, where the headset supports it. */
function buzz(gl: THREE.WebGLRenderer, hand: "left" | "right", intensity: number, ms: number) {
  const session = gl.xr.getSession();
  if (!session) return;
  for (const source of session.inputSources) {
    if (source.handedness !== hand) continue;
    const actuator = (source.gamepad as (Gamepad & { hapticActuators?: { pulse?: (v: number, ms: number) => Promise<boolean> }[] }) | undefined)?.hapticActuators?.[0];
    void actuator?.pulse?.(intensity, ms)?.catch(() => {});
  }
}

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
export function FantasyLayer({ selfId, players, getSelfPosition, editMode }: FantasyLayerProps) {
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

  useEffect(() => {
    scene.add(effects.group);
    return () => {
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
    return fighter?.weapon && fighter.weapon !== "bow" && holder?.hasBlade ? holder : null;
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
    if (other?.weapon && other.weapon !== "bow") other.action = { kind: other.guard ? "stagger" : "recoil", n: 0, start: seconds() };
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

  /** An arrow: it flies where this visitor looks, and stops at the first
   *  body or guarding blade on its way. */
  const loose = (element: Element, special: boolean) => {
    const me = bodyOf(LOCAL_AVATAR);
    if (!me) return;
    const origin = me.chest.clone().addScaledVector(me.face, 0.35);
    const aim = camera.getWorldDirection(new THREE.Vector3());
    // Third person looks down at the avatar; aim no lower than level-ish.
    if (aim.y < -0.25) aim.setY(-0.25).normalize();
    const far = origin.clone().addScaledVector(aim, ARROW_RANGE);
    let best: { id: string; at: THREE.Vector3; s: number; block: boolean } | null = null;
    for (const t of targets()) {
      const guard = bladeOf(t.id);
      if (guard && segmentDistance(origin, far, guard.base, guard.tip, closest).distance < BLADE_CONTACT + 0.03 && (!best || closest.s < best.s)) {
        best = { id: t.id, at: closest.point.clone(), s: closest.s, block: true };
      }
      bodyCapsule(t.feet, t.eye, capsule);
      if (segmentDistance(origin, far, capsule.a, capsule.b, closest).distance < capsule.radius + 0.04 && (!best || closest.s < best.s)) {
        best = { id: t.id, at: closest.point.clone(), s: closest.s, block: false };
      }
    }
    const end = best ? best.at : far;
    sendAddonEvent("fantasy", { k: "ar", o: round(origin), d: round(end), ...(special ? { e: element } : {}) });
    playSwing("bow");
    const landing = best;
    effects.arrow(origin, end, special ? element : null, seconds(), (landed) => {
      if (landing?.block) blocked(landing.id, landed.clone(), "bow");
      else if (special) blast(element, landed.clone(), "bow");
      else if (landing) hit([landing.id], WEAPON_SPECS.bow.damage, false, "bow", [landed.clone()]);
    });
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
    if (weapon !== "bow") setTimeout(() => playSwing(weapon), impact * 0.45);
    // The body goes with the blow: a step in on a cut, a long lunge on a
    // blade's special, a step back off a bow's.
    const at = (share: number) => timing.duration * share;
    if (weapon === "bow") {
      if (action.kind === "special") step(-0.18, 0.15, at(timing.impact));
    } else if (action.kind === "special") step(0.6, 0.22, at(0.36));
    else step(action.n === 0 ? 0.16 : 0.1, 0.16, at(0.3));
    if (weapon !== "bow" && action.kind !== "special") return;
    setTimeout(() => {
      const now = fantasy.get();
      if (now.weapon !== weapon || now.ko || local.action !== action) return;
      if (weapon === "bow") loose(element, action.kind === "special");
      else slam(weapon, element);
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
              if (other?.weapon && other.weapon !== "bow") other.action = { kind: other.guard ? "stagger" : "recoil", n: 0, start: seconds() };
            }
            break;
          }
          case "hit": {
            for (const id of event.targets) {
              const chest = chestOf(id);
              if (chest) effects.sparksAt(chest, event.special ? "#ffffff" : "#ffe3a3");
              if (id !== selfIdRef.current) fighterOf(id).hurtAt = seconds();
            }
            playHit(fighter.weapon, distance);
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
              sinceLast: sinceLastHit(from, event.special),
            });
            if (amount > 0) {
              recordHit(from, event.special);
              takeDamage(amount, () => playKnockedOut());
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
          case "ar": {
            const from3 = new THREE.Vector3(...event.from);
            const to3 = new THREE.Vector3(...event.to);
            if (from3.distanceTo(to3) > ARROW_RANGE + 2) return;
            effects.arrow(from3, to3, event.element, seconds());
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

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const now = seconds();
    const me = fantasy.get();

    // The meter fills slowly on its own while you hold a weapon, by the
    // clock rather than the (capped) frame step, so a slow device fills it
    // as fast as a quick one.
    if (me.weapon && !me.ko && me.meter < 100) {
      meterCarry.current += Math.min(rawDelta, 0.5) * meterPerSecond;
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
          overlay: new PoseOverlay(),
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
        };
        effects.group.add(holder.trail.mesh);
        holders.set(key, holder);
      }
      // Always first: takes last frame's pose back off the bones.
      holder.overlay.restore();

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
      }

      const rig = rigFor(vrm);
      const source = key === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : key;
      const tracked = trackingStore.get(source);
      holder.inHeadset = tracked !== null && performance.now() - tracked.receivedAt < TRACKING_STALE_MS;
      const seated = !!playersRef.current[key === LOCAL_AVATAR ? (selfIdRef.current ?? "") : key]?.posture;
      if (held) holder.posed = held;
      holder.weight = approach(holder.weight, held && !holder.inHeadset && !seated ? 1 : 0, 8, dt);
      // The body first, so the hands then reach from wherever the shoulders
      // went. Knocked out, it slumps; walking, the walk keeps the legs; in a
      // headset, the player's own body is the pose.
      holder.bodyWeight = approach(holder.bodyWeight, (held || (ko && weapon)) && !holder.inHeadset && !seated ? 1 : 0, ko ? 3 : 6, dt);
      let legs = 0;
      if (rig) {
        const moving = holder.gait.update(rig, dt);
        if (holder.bodyWeight > 0.001 && (holder.posed || ko)) {
          const timing = action && holder.posed ? timingOf(holder.posed, action.kind) : null;
          const acting = timing !== null && now - action!.start < timing.duration;
          if (ko || !holder.posed) copyKnockedOut(holder.body);
          else bodyPose(holder.posed, action, now, guard, holder.body, hurtAt, holder.seed);
          const upper = holder.bodyWeight * (acting ? 1 : 1 - 0.5 * moving);
          legs = Math.min(upper, holder.bodyWeight * (acting ? 1 : 1 - moving));
          poseBody(rig, holder.overlay, holder.body, upper, legs);
        }
      }
      if (rig && holder.posed && holder.weight > 0.001) {
        const pose = heldPose(holder.posed, action, now, holder.pose, guard);
        if (holder.bodyWeight > 0.001) {
          if (pose.right) carryHand(pose.right, holder.body, holder.bodyWeight, legs);
          if (pose.left) carryHand(pose.left, holder.body, holder.bodyWeight, legs);
        }
        poseHands(
          rig,
          holder.overlay,
          pose.right ? toTrackedHand("right", pose.right, holder.hands.right) : null,
          pose.left ? toTrackedHand("left", pose.left, holder.hands.left) : null,
          holder.weight
        );
      } else if (holder.weight <= 0.001) holder.posed = null;

      // Where the blade is now, and how fast its tip is going.
      holder.hasBlade = !!holder.prop && !!held && held !== "bow";
      if (holder.hasBlade) {
        const [base, tip] = WEAPON_SPECS[held!].blade;
        holder.prop!.updateWorldMatrix(true, false);
        holder.prop!.localToWorld(holder.base.set(0, base * 0.5, 0));
        holder.prop!.localToWorld(holder.tip.set(0, tip, 0));
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

      // The aura: faint as the meter fills, pulsing once the special is
      // ready, and flaring while it goes off.
      const glow = holder.prop && weaponGlow(holder.prop);
      if (glow) {
        const special = action?.kind === "special" && now - action.start < timingOf(held ?? "sword", "special").duration;
        const level = special ? 1 : charge >= 1 ? 0.55 + 0.25 * Math.sin(now * 7) : 0.05 + 0.25 * charge * charge;
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
    // VR: the trigger looses an arrow (a primed one is the special).
    if (inVr && me.weapon === "bow" && !me.ko && !editMode) {
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

    effects.update(now, dt, camera);
  }, -0.4);

  return null;
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
