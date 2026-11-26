import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PlayerState } from "../multiplayer/types";
import { roofedAt, swimmingAt } from "../scene/layout";
import { realAltitude } from "../scene/mountainShape";
import { drive } from "../player/drive";
import { getAddonAvatar, LOCAL_AVATAR } from "../addons/avatars";
import { remoteRiders, ride } from "../addons/exer/ride";
import type { VRM } from "@pixiv/three-vrm";
import { sharedOverlay, type BodyRig, type PoseOverlay } from "../xr/body/bodyIk";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "../xr/body/trackingStore";
import { TRACKING_STALE_MS } from "../xr/body/trackingWire";
import { newBodyPose, poseBody } from "../addons/body";
import { disposeTree, feetAndEye, holdInHand, newTrackedHand, poseHands, rigFor, toTrackedHand, type HandTarget } from "../addons/rig";
import { setFaceCue, type FaceCue } from "./useFacialExpressions";
import { noiseHit, toneHit, voice } from "../addons/sound";
import { CONSUME_SECONDS, consuming, isFood, type Consumable } from "./heat";
import { currentHeatIndex, drinkers, faintPhase, forgetHeat, heatLoad, heatReactionsOn, heatSpeed, heatStage, inDeclaredShade, LOCAL_HEAT, setFaint, setHeat, stepHeat, takeCool } from "./heat";

/**
 * Heat reactions in the scene (heat.ts): every avatar's heat load from how
 * it moves, four times a second, and the sweat on the brows of those it
 * has reached. Yours also slows your walk (drive.heat), unless you've
 * switched heat reactions off, which everyone else then sees too.
 */
const TICK = 0.25;
const DROPS = 4;

interface Track {
  last: [number, number, number] | null;
  speed: number;
  load: number;
}

interface Sweat {
  group: THREE.Group;
  detach: () => void;
}

let dropTexture: THREE.Texture | null = null;
function dropMap() {
  if (dropTexture || typeof document === "undefined") return dropTexture;
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 48;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(210,235,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.quadraticCurveTo(30, 28, 16, 46);
  ctx.quadraticCurveTo(2, 28, 16, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(12, 30, 4, 0, Math.PI * 2);
  ctx.fill();
  dropTexture = new THREE.CanvasTexture(c);
  return dropTexture;
}

/** Effort: walking 1, pedalling or pushing a board harder, a moped none. */
const effortOf = (vehicle: string | null | undefined) => (vehicle === "moped" ? 0 : vehicle ? 1.2 : 1);
// In the sea, swimming, cools you as shade does.
const shaded = (x: number, z: number) => roofedAt(x, z) || inDeclaredShade(x, z) || swimmingAt(x, z);

export function HeatLayer({ selfId, players, getSelfPosition }: { selfId: string | null; players: Record<string, PlayerState>; getSelfPosition: () => [number, number, number] }) {
  const tracks = useRef(new Map<string, Track>()).current;
  const sweats = useRef(new Map<string, Sweat>()).current;
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfRef = useRef(getSelfPosition);
  selfRef.current = getSelfPosition;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const clock = useRef({ acc: 0, t: 0 });
  const material = useMemo(() => new THREE.SpriteMaterial({ map: dropMap(), transparent: true, depthWrite: false }), []);

  useEffect(
    () => () => {
      for (const s of sweats.values()) s.detach();
      sweats.clear();
      for (const id of tracks.keys()) forgetHeat(id);
      tracks.clear();
      drive.heat = 1;
      material.dispose();
    },
    [sweats, tracks, material]
  );

  const sweatFor = (key: string, avatarKey: string, show: boolean) => {
    let s = sweats.get(key);
    const vrm = getAddonAvatar(avatarKey);
    const head = vrm?.humanoid.getNormalizedBoneNode("head");
    if (!show || !head) {
      if (s) {
        s.detach();
        sweats.delete(key);
      }
      return;
    }
    if (s && s.group.parent === head) return;
    s?.detach();
    const group = new THREE.Group();
    for (let i = 0; i < DROPS; i++) {
      const drop = new THREE.Sprite(material);
      drop.scale.set(0.022, 0.033, 1);
      drop.userData.offset = i / DROPS;
      drop.userData.side = i % 2 ? 1 : -1;
      group.add(drop);
    }
    head.add(group);
    s = { group, detach: () => head.remove(group) };
    sweats.set(key, s);
  };

  useFrame((_, rawDelta) => {
    const c = clock.current;
    c.t += rawDelta;
    // The drops run down the temples and fade, every frame (a few sprites).
    for (const s of sweats.values())
      for (const drop of s.group.children as THREE.Sprite[]) {
        const p = (c.t / 1.4 + drop.userData.offset) % 1;
        drop.position.set(drop.userData.side * (0.078 + 0.004 * p), 0.07 - 0.11 * p, 0.03);
        drop.material.opacity = 1 - p * p;
      }
    c.acc += rawDelta;
    if (c.acc < TICK) return;
    const dt = Math.min(c.acc, 1);
    c.acc = 0;
    const hi = currentHeatIndex();
    const update = (key: string, avatarKey: string, at: [number, number, number] | undefined, on: boolean, effort: number) => {
      let t = tracks.get(key);
      if (!t) tracks.set(key, (t = { last: null, speed: 0, load: heatLoad(key) }));
      if (at && t.last) {
        const moved = Math.hypot(at[0] - t.last[0], at[2] - t.last[2]);
        t.speed = moved < 30 ? moved / dt : 0;
      }
      if (at) t.last = [at[0], at[1], at[2]];
      // The air cools about 6.5 °C a kilometre up: the top of the mountain is milder.
      const here = at ? hi - realAltitude(at[0], at[2]) * 0.0065 : hi;
      t.load = on && at ? stepHeat(t.load, { speed: t.speed, shaded: shaded(at[0], at[2]), effort, hi: here }, dt) : 0;
      // A drink of water, or coming to after fainting (heat.ts).
      if (key === LOCAL_HEAT) t.load = Math.max(0, t.load - takeCool());
      setHeat(key, t.load);
      sweatFor(key, avatarKey, heatStage(t.load) >= 1);
    };
    const me = ride.get().vehicle;
    update(LOCAL_HEAT, LOCAL_AVATAR, selfRef.current(), heatReactionsOn(), effortOf(me));
    drive.heat = heatReactionsOn() ? heatSpeed(tracks.get(LOCAL_HEAT)!.load) : 1;
    // All the way full, you faint (HeatChip's FaintOverlay takes it from here).
    if (heatReactionsOn() && tracks.get(LOCAL_HEAT)!.load >= 0.995 && faintPhase() === "none") setFaint("dark");
    const seen = new Set([LOCAL_HEAT]);
    for (const p of Object.values(playersRef.current)) {
      if (p.id === selfIdRef.current) continue;
      seen.add(p.id);
      update(p.id, p.id, p.position, !p.heatCalm, effortOf(remoteRiders.get(p.id)?.vehicle));
    }
    for (const key of [...tracks.keys()])
      if (!seen.has(key)) {
        tracks.delete(key);
        forgetHeat(key);
        sweats.get(key)?.detach();
        sweats.delete(key);
      }
  });

  return null;
}

// --- a drink of water, seen -----------------------------------------------------------

/** How long a drink takes, from reaching for the bottle to the last of the sigh. */
const DRINK_TIME = CONSUME_SECONDS;
const DRINKING_FACE: FaceCue = { blink: 0.85, relaxed: 0.25 };
/** After it: relief, eyes soft, a small smile. */
const RELIEVED_FACE: FaceCue = { relaxed: 0.9, happy: 0.3 };
/** Eating: a happy chew, eyes half shut; after, a pleased smile. */
const EATING_FACE: FaceCue = { happy: 0.55, blink: 0.3 };
const PLEASED_FACE: FaceCue = { happy: 0.7, relaxed: 0.3 };

const ease = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** A water bottle: its origin in the middle of the grip, the cap toward
 *  +y (the thumb's side, as holdInHand holds things). Clear plastic,
 *  water in it, a blue label, a white cap. */
export function makeBottle(): THREE.Group {
  const group = new THREE.Group();
  group.name = "seiza-water-bottle";
  const clear = new THREE.MeshStandardMaterial({ color: "#cfeaff", roughness: 0.1, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false });
  const water = new THREE.MeshStandardMaterial({ color: "#5fb4ff", roughness: 0.2, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
  const label = new THREE.MeshStandardMaterial({ color: "#2d7fd6", roughness: 0.6, metalness: 0 });
  const cap = new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.5, metalness: 0 });
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.renderOrder = 2;
    group.add(mesh);
  };
  part(new THREE.CylinderGeometry(0.031, 0.031, 0.16, 14), clear, -0.015);
  part(new THREE.CylinderGeometry(0.027, 0.028, 0.11, 12), water, -0.035);
  part(new THREE.CylinderGeometry(0.0318, 0.0318, 0.05, 14), label, -0.02);
  part(new THREE.CylinderGeometry(0.013, 0.031, 0.035, 14), clear, 0.082);
  part(new THREE.CylinderGeometry(0.0135, 0.0135, 0.02, 12), cap, 0.108);
  return group;
}

/** One prop: its parts as [geometry, colour, y, see-through], drinking end up. */
function propOf(name: string, parts: [THREE.BufferGeometry, string, number, number?][]): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  for (const [geometry, colour, y, opacity] of parts) {
    const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55, metalness: 0, ...(opacity !== undefined ? { transparent: true, opacity, depthWrite: false } : {}) });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    if (opacity !== undefined) mesh.renderOrder = 2;
    group.add(mesh);
  }
  return group;
}

/** A triangle of rice (or bread), its point up: a 3-sided cylinder on its side. */
const triangle = (r: number, thick: number) => new THREE.CylinderGeometry(r, r, thick, 3).rotateX(-Math.PI / 2);

/**
 * What's in the hand for each thing you can have, and how far its drinking
 * (or biting) end is from the middle of the grip.
 */
export function makeProp(item: Consumable): { prop: THREE.Group; reach: number } {
  switch (item) {
    case "tea":
      return {
        reach: 0.115,
        prop: propOf("seiza-tea-bottle", [
          [new THREE.CylinderGeometry(0.031, 0.031, 0.16, 14), "#e9f3e2", -0.015, 0.45],
          [new THREE.CylinderGeometry(0.027, 0.028, 0.12, 12), "#b9a54a", -0.03, 0.7],
          [new THREE.CylinderGeometry(0.0318, 0.0318, 0.06, 14), "#2f7d4a", -0.02],
          [new THREE.CylinderGeometry(0.013, 0.031, 0.035, 14), "#e9f3e2", 0.082, 0.45],
          [new THREE.CylinderGeometry(0.0135, 0.0135, 0.02, 12), "#2f7d4a", 0.108],
        ]),
      };
    case "coffeeCan":
      return {
        reach: 0.058,
        prop: propOf("seiza-coffee-can", [
          [new THREE.CylinderGeometry(0.026, 0.026, 0.105, 16), "#5a3a24", 0],
          [new THREE.CylinderGeometry(0.0262, 0.0262, 0.02, 16), "#d9b45a", 0.02],
          [new THREE.CylinderGeometry(0.022, 0.026, 0.008, 16), "#c9ccd0", 0.056],
        ]),
      };
    case "cup":
      return {
        reach: 0.052,
        prop: propOf("seiza-coffee-cup", [
          [new THREE.CylinderGeometry(0.041, 0.031, 0.1, 16), "#f4f2ec", 0],
          [new THREE.CylinderGeometry(0.039, 0.035, 0.035, 16), "#9a6a42", -0.005],
          [new THREE.CylinderGeometry(0.043, 0.043, 0.012, 16), "#ffffff", 0.054],
        ]),
      };
    case "onigiri":
      return {
        reach: 0.045,
        prop: propOf("seiza-onigiri", [
          [triangle(0.05, 0.03), "#f6f4ee", 0],
          [new THREE.BoxGeometry(0.05, 0.035, 0.032), "#1f2a22", -0.022],
        ]),
      };
    case "sandwich":
      return {
        reach: 0.045,
        prop: propOf("seiza-sandwich", [
          [triangle(0.055, 0.03), "#f2dcb0", 0],
          [triangle(0.05, 0.034), "#f7e27a", -0.004],
          [triangle(0.049, 0.036), "#7cc46a", -0.008],
        ]),
      };
    case "meal":
      return {
        reach: 0.075,
        prop: propOf("seiza-fork", [
          [new THREE.BoxGeometry(0.008, 0.13, 0.004), "#c9ccd0", -0.01],
          [new THREE.BoxGeometry(0.022, 0.03, 0.004), "#c9ccd0", 0.065],
          [new THREE.SphereGeometry(0.016, 10, 8), "#7a4a2a", 0.082],
        ]),
      };
    default:
      return { reach: 0.115, prop: makeBottle() };
  }
}

/** The arm comes up (0.7 s), the bottle tips (from 0.6 s), and back
 *  down (from 2.3 s); a sigh after (from 2.9 s). Each 0 to 1. */
function drinkPhases(t: number) {
  return {
    raise: ease(t / 0.7) * (1 - ease((t - 2.6) / 0.6)),
    tip: ease((t - 0.6) / 0.5) * (1 - ease((t - 2.3) / 0.5)),
    sigh: t > 2.9 ? Math.sin(Math.PI * Math.min(1, (t - 2.9) / 1.4)) : 0,
  };
}

const earAt = new THREE.Vector3();
const mouthAt = new THREE.Vector3();
const dv = new THREE.Vector3();
const dq = new THREE.Quaternion();
const dBlade = new THREE.Vector3();
const dFingers = new THREE.Vector3();
const dPalm = new THREE.Vector3();

/** A drink's arm and body, `t` seconds in; `feet` and `eye` from feetAndEye. */
export function poseDrink(vrm: VRM, rig: BodyRig, overlay: PoseOverlay, t: number, feet: THREE.Vector3, eye: number, reach = 0.115, food = false) {
  const phases = drinkPhases(t);
  const { raise, sigh } = phases;
  // Eating: the hand comes to the mouth and the head hardly tips back.
  const tip = food ? phases.tip * 0.22 : phases.tip;
  if (raise <= 0.001 && sigh <= 0.001) return;
  // The head back as it tips, a small bob with each gulp; leaning back a
  // little; then, in the sigh, the shoulders fall and it settles.
  const gulp = food ? phases.tip * 0.025 * Math.max(0, Math.sin((t - 1.1) * 11)) : tip * 0.05 * Math.max(0, Math.sin((t - 1.1) * 7.5));
  const body = newBodyPose();
  body.nod = -0.24 * tip - gulp + 0.12 * sigh;
  body.lean = -0.06 * tip + 0.07 * sigh;
  body.drop = 0.02 * sigh;
  const bodyWeight = Math.max(raise, sigh);
  poseBody(rig, overlay, body, bodyWeight, bodyWeight);
  if (raise <= 0.001) return;
  // Where the lips are, in the body frame (eye heights: x right, y up, z
  // back): from the head bone, where the head meets the neck, a little up
  // and out in front; higher and further back as the head tips.
  const head = vrm.humanoid.getNormalizedBoneNode("head");
  if (!head) return;
  const scale = rig.root.getWorldScale(dv).y;
  const yawInverse = (rig.scene.parent ?? rig.scene).getWorldQuaternion(dq).invert();
  head.getWorldPosition(dv).sub(feet).applyQuaternion(yawInverse).divideScalar(eye);
  const m = scale / eye;
  const mouth = [dv.x, dv.y + (0.03 + 0.02 * tip) * m, dv.z + (-0.1 + 0.02 * tip) * m];
  // The bottle upright at first, then tipped up with its bottom high, its
  // cap (this far from the middle of the grip) at the lips.
  const blade = dBlade.set(0, 0.75 - 0.95 * tip, 0.66 + 0.3 * tip).normalize();
  // The forearm comes up from in front and to the right, so the hand points
  // back toward the face: in to the left, and up.
  const fingers = dFingers.set(-0.3, 0.85, 0.45);
  fingers.addScaledVector(blade, -fingers.dot(blade)).normalize();
  const palm = dPalm.crossVectors(blade, fingers);
  // The grip is out along the hand from the wrist, toward the palm (as
  // holdInHand puts it), so the wrist goes that far back from it.
  const knuckle = vrm.humanoid.getNormalizedBoneNode("rightMiddleProximal");
  const hand = (knuckle ? knuckle.position.length() : 0.08) * m;
  const cap = reach * m;
  const target: HandTarget = {
    pos: [0, 1, 2].map((a) => mouth[a] - blade.getComponent(a) * cap - fingers.getComponent(a) * hand * 0.55 - palm.getComponent(a) * hand * 0.32) as [number, number, number],
    blade: [blade.x, blade.y, blade.z],
    fingers: [fingers.x, fingers.y, fingers.z],
    curl: 0.85,
  };
  poseHands(rig, overlay, toTrackedHand("right", target, newTrackedHand()), null, raise);
}

interface Bottle {
  vrm: VRM;
  prop: THREE.Group;
  item: Consumable;
  reach: number;
  detach: () => void;
}

/** A bite: a soft crunch and the chew. */
function biteSound(distance: number) {
  const v = voice(0.5, distance, 8, 0.5);
  if (!v) return;
  noiseHit(v, { frequency: 2200 + Math.random() * 600, sweepTo: 1200, duration: 0.07, gain: 0.07, q: 1.4 });
  noiseHit(v, { frequency: 700, duration: 0.09, gain: 0.05, q: 2, delay: 0.12 });
}

/** "Mm!": a short hum, up at its end. */
function mmSound(distance: number) {
  const v = voice(0.5, distance, 10, 0.8);
  if (!v) return;
  toneHit(v, { frequency: 230, sweepTo: 300, duration: 0.35, gain: 0.04, type: "triangle", attack: 0.05 });
}

/** How many gulps a drink has had (its sounds, once each), by drinker. */
const gulped = new Map<string, number>();

/** A gulp: the throat's low knock and a little glug of water behind it. */
function gulpSound(distance: number) {
  const v = voice(0.55, distance, 10, 0.6);
  if (!v) return;
  toneHit(v, { frequency: 170 + Math.random() * 30, sweepTo: 95, duration: 0.11, gain: 0.32, type: "sine" });
  noiseHit(v, { frequency: 520 + Math.random() * 120, sweepTo: 260, duration: 0.09, gain: 0.08, q: 4, delay: 0.03 });
  toneHit(v, { frequency: 300, sweepTo: 520, duration: 0.05, gain: 0.05, type: "sine", delay: 0.07 });
}

/** The "ahh" after: a breath out, softly voiced, falling. */
function ahhSound(distance: number) {
  const v = voice(0.5, distance, 10, 1.2);
  if (!v) return;
  noiseHit(v, { frequency: 900, sweepTo: 500, duration: 0.7, gain: 0.07, q: 1.2, attack: 0.06 });
  toneHit(v, { frequency: 210, sweepTo: 160, duration: 0.6, gain: 0.035, type: "triangle", attack: 0.08 });
}

/**
 * Anyone drinking water (heat.ts's drinkers: you, from the heat chip's
 * button, or anyone in the room): a bottle in the right hand, raised to
 * the lips, tipped up with the head back for a few gulps, eyes shut, then
 * lowered, and a sigh of relief with a soft face. Eased in from whatever
 * the avatar was doing (standing, panting, walking) and back out to it.
 * In a headset, your hands are your own: the bottle's in your hand and the
 * face is the same, the arm isn't moved.
 */
export function DrinkLayer() {
  const bottles = useRef(new Map<string, Bottle>()).current;
  const feet = useMemo(() => new THREE.Vector3(), []);
  const yawQ = useMemo(() => new THREE.Quaternion(), []);

  const putAway = (key: string) => {
    const b = bottles.get(key);
    if (!b) return;
    b.detach();
    disposeTree(b.prop);
    bottles.delete(key);
  };
  useEffect(
    () => () => {
      for (const [key, b] of bottles) {
        setFaceCue(b.vrm, "drink", null);
        putAway(key);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((state) => {
    const now = performance.now();
    const frame = state.clock.elapsedTime;
    for (const key of [...bottles.keys()]) if (!drinkers.has(key)) putAway(key);
    for (const [key, since] of drinkers) {
      const t = (now - since) / 1000;
      const vrm = getAddonAvatar(key);
      if (t > DRINK_TIME || !vrm) {
        drinkers.delete(key);
        consuming.delete(key);
        gulped.delete(key);
        setFaceCue(vrm, "drink", null);
        putAway(key);
        continue;
      }
      const { raise } = drinkPhases(t);
      const item = consuming.get(key) ?? "water";
      const food = isFood(item);
      setFaceCue(vrm, "drink", t < 0.5 ? null : t < 2.6 ? (food ? EATING_FACE : DRINKING_FACE) : t < DRINK_TIME - 0.4 ? (food ? PLEASED_FACE : RELIEVED_FACE) : null);
      // A gulp with each swallow while it's tipped up, and the "ahh".
      const swallows = t > 1.15 && t < 2.35 ? Math.floor((t - 1.15) / 0.38) + 1 : t >= 2.35 ? 99 : 0;
      const heard = gulped.get(key) ?? 0;
      if (swallows > heard) {
        const at = state.camera.getWorldPosition(earAt).distanceTo(vrm.scene.getWorldPosition(mouthAt));
        if (swallows < 99) (food ? biteSound : gulpSound)(at);
        else if (t > 2.95) (food ? mmSound : ahhSound)(at);
        if (swallows < 99 || t > 2.95) gulped.set(key, swallows);
      }

      let b = bottles.get(key);
      if (b && (b.vrm !== vrm || b.item !== item)) {
        putAway(key);
        b = undefined;
      }
      if (raise > 0.02 && !b) {
        const { prop, reach } = makeProp(item);
        b = { vrm, prop, item, reach, detach: holdInHand(vrm, "right", prop) };
        bottles.set(key, b);
      }
      if (b) b.prop.scale.setScalar(Math.max(0.001, Math.min(1, t / 0.25, (3.3 - t) / 0.25)));
      if (t > 3.3) putAway(key);

      const source = key === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : key;
      const sample = trackingStore.get(source);
      if (sample !== null && now - sample.receivedAt < TRACKING_STALE_MS) continue;
      const rig = rigFor(vrm);
      if (rig) poseDrink(vrm, rig, sharedOverlay(vrm, frame), t, feet, feetAndEye(rig, feet), b?.reach ?? 0.115, food);
    }
  });

  return null;
}
