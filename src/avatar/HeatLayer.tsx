import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PlayerState } from "../multiplayer/types";
import { ceilingHeightAt, swimmingAt } from "../scene/layout";
import { realAltitude } from "../scene/mountainShape";
import { drive } from "../player/drive";
import { getAddonAvatar, LOCAL_AVATAR } from "../addons/avatars";
import { remoteRiders, ride } from "../addons/exer/ride";
import { currentHeatIndex, forgetHeat, heatLoad, heatReactionsOn, heatSpeed, heatStage, inDeclaredShade, LOCAL_HEAT, setHeat, stepHeat } from "./heat";

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
      setHeat(key, t.load);
      sweatFor(key, avatarKey, heatStage(t.load) >= 1);
    };
    const me = ride.get().vehicle;
    update(LOCAL_HEAT, LOCAL_AVATAR, selfRef.current(), heatReactionsOn(), effortOf(me));
    drive.heat = heatReactionsOn() ? heatSpeed(tracks.get(LOCAL_HEAT)!.load) : 1;
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
