import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PlayerState } from "../multiplayer/types";
import { ceilingHeightAt, swimmingAt } from "../scene/layout";
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
const shaded = (x: number, z: number) => ceilingHeightAt(x, z) < Infinity || inDeclaredShade(x, z) || swimmingAt(x, z);

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
const DRINK_TIME = 4.6;
const DRINKING_FACE: FaceCue = { blink: 0.85, relaxed: 0.25 };
/** After it: relief, eyes soft, a small smile. */
const RELIEVED_FACE: FaceCue = { relaxed: 0.9, happy: 0.3 };

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

/** The arm comes up (0.7 s), the bottle tips (from 0.6 s), and back
 *  down (from 2.3 s); a sigh after (from 2.9 s). Each 0 to 1. */
function drinkPhases(t: number) {
  return {
    raise: ease(t / 0.7) * (1 - ease((t - 2.6) / 0.6)),
    tip: ease((t - 0.6) / 0.5) * (1 - ease((t - 2.3) / 0.5)),
    sigh: t > 2.9 ? Math.sin(Math.PI * Math.min(1, (t - 2.9) / 1.4)) : 0,
  };
}

const dv = new THREE.Vector3();
const dq = new THREE.Quaternion();
const dBlade = new THREE.Vector3();
const dFingers = new THREE.Vector3();
const dPalm = new THREE.Vector3();

/** A drink's arm and body, `t` seconds in; `feet` and `eye` from feetAndEye. */
export function poseDrink(vrm: VRM, rig: BodyRig, overlay: PoseOverlay, t: number, feet: THREE.Vector3, eye: number) {
  const { raise, tip, sigh } = drinkPhases(t);
  if (raise <= 0.001 && sigh <= 0.001) return;
  // The head back as it tips, a small bob with each gulp; leaning back a
  // little; then, in the sigh, the shoulders fall and it settles.
  const gulp = tip * 0.05 * Math.max(0, Math.sin((t - 1.1) * 7.5));
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
  const cap = 0.115 * m;
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
  detach: () => void;
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
        setFaceCue(vrm, "drink", null);
        putAway(key);
        continue;
      }
      const { raise } = drinkPhases(t);
      setFaceCue(vrm, "drink", t < 0.5 ? null : t < 2.6 ? DRINKING_FACE : t < DRINK_TIME - 0.4 ? RELIEVED_FACE : null);

      let b = bottles.get(key);
      if (b && b.vrm !== vrm) {
        putAway(key);
        b = undefined;
      }
      if (raise > 0.02 && !b) {
        const prop = makeBottle();
        b = { vrm, prop, detach: holdInHand(vrm, "right", prop) };
        bottles.set(key, b);
      }
      if (b) b.prop.scale.setScalar(Math.max(0.001, Math.min(1, t / 0.25, (3.3 - t) / 0.25)));
      if (t > 3.3) putAway(key);

      const source = key === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : key;
      const sample = trackingStore.get(source);
      if (sample !== null && now - sample.receivedAt < TRACKING_STALE_MS) continue;
      const rig = rigFor(vrm);
      if (rig) poseDrink(vrm, rig, sharedOverlay(vrm, frame), t, feet, feetAndEye(rig, feet));
    }
  });

  return null;
}
