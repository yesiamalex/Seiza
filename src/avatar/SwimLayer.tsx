import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { PlayerState } from "../multiplayer/types";
import { swimmingAt } from "../scene/layout";
import { drive, SWIM_SPEED } from "../player/drive";
import { getAddonAvatar, LOCAL_AVATAR } from "../addons/avatars";
import { newBodyPose, poseBody } from "../addons/body";
import { newTrackedHand, poseHands, rigFor, toTrackedHand, type HandTarget } from "../addons/rig";
import { sharedOverlay, type PoseOverlay } from "../xr/body/bodyIk";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "../xr/body/trackingStore";
import { TRACKING_STALE_MS } from "../xr/body/trackingWire";
import { noiseHit, voice } from "../addons/sound";
import { ride, setVehicle } from "../addons/exer/ride";

/**
 * Swimming at the beach: out past the shallows, where the sea is deeper
 * than the chest (layout.ts's swimmingAt), you float with your head above
 * the water (the floor there is the swimmer's, not the seabed), go at
 * SWIM_SPEED, and your avatar leans into a breaststroke. Everyone else's
 * avatar does too, from where it is: nothing is sent, and nothing new is
 * drawn (the sea already is). In a headset your own arms are yours.
 */
const CYCLE_MOVING = 1.3;
const CYCLE_TREADING = 2.6;

interface Swimmer {
  vrm: VRM;
  overlay: PoseOverlay;
  weight: number;
  phase: number;
  last: THREE.Vector3 | null;
  speed: number;
}

const body = newBodyPose();
const right: HandTarget = { pos: [0, 0, 0], blade: [-1, 0, 0], fingers: [0, 0, -1], curl: 0.1 };
const left: HandTarget = { pos: [0, 0, 0], blade: [1, 0, 0], fingers: [0, 0, -1], curl: 0.1 };
const trackedRight = newTrackedHand();
const trackedLeft = newTrackedHand();
const at = new THREE.Vector3();

/** A breaststroke, by its phase (0 to 1): hands together reach forward,
 *  then part, sweep out and round, and come back in to the chest. In eye
 *  heights, the avatar's own frame (forward is -z). */
function stroke(phase: number, side: 1 | -1, out: HandTarget) {
  const a = phase * Math.PI * 2;
  const reach = (1 - Math.cos(a)) / 2;
  const sweep = Math.max(0, -Math.sin(a));
  out.pos[0] = side * (0.06 + 0.26 * sweep);
  out.pos[1] = 0.74 + 0.03 * Math.sin(a);
  out.pos[2] = -0.12 - 0.36 * reach;
  out.blade[0] = -side;
  out.fingers[0] = side * 0.4 * sweep;
  out.fingers[2] = -1;
}

function splash(distance?: number) {
  const v = voice(0.6, distance, 20, 1.5);
  if (v) noiseHit(v, { frequency: 900, duration: 0.45, gain: 0.25, type: "lowpass", sweepTo: 300 });
}

export function SwimLayer({ selfId, players }: { selfId: string | null; players: Record<string, PlayerState> }) {
  const swimmers = useRef(new Map<string, Swimmer>()).current;
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const wasSwimming = useRef(false);

  useEffect(
    () => () => {
      for (const s of swimmers.values()) s.overlay.restore();
      swimmers.clear();
      drive.swim = 1;
    },
    [swimmers]
  );

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const frame = state.clock.elapsedTime;
    const seen = new Set<string>();
    const tend = (key: string) => {
      const vrm = getAddonAvatar(key);
      if (!vrm) return false;
      const p = vrm.scene.getWorldPosition(at);
      const swimming = swimmingAt(p.x, p.z);
      let s = swimmers.get(key);
      if (!s && !swimming) return swimming;
      if (s && s.vrm !== vrm) {
        s.overlay.restore();
        s = undefined;
      }
      if (!s) {
        s = { vrm, overlay: sharedOverlay(vrm, frame), weight: 0, phase: 0, last: null, speed: 0 };
        swimmers.set(key, s);
      }
      seen.add(key);
      s.overlay = sharedOverlay(vrm, frame);
      const step = s.last ? Math.hypot(p.x - s.last.x, p.z - s.last.z) : 0;
      s.last = (s.last ?? new THREE.Vector3()).copy(p);
      if (step < 2) s.speed += (step / Math.max(dt, 1e-3) - s.speed) * (1 - Math.exp(-5 * dt));
      s.phase = (s.phase + dt / (s.speed > 0.3 ? CYCLE_MOVING : CYCLE_TREADING)) % 1;
      const source = key === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : key;
      const sample = trackingStore.get(source);
      const inHeadset = sample !== null && performance.now() - sample.receivedAt < TRACKING_STALE_MS;
      s.weight += ((swimming && !inHeadset ? 1 : 0) - s.weight) * (1 - Math.exp(-5 * dt));
      const rig = rigFor(vrm);
      if (rig && s.weight > 0.01) {
        body.lean = 0.35;
        poseBody(rig, s.overlay, body, s.weight, s.weight);
        stroke(s.phase, 1, right);
        stroke(s.phase, -1, left);
        poseHands(rig, s.overlay, toTrackedHand("right", right, trackedRight), toTrackedHand("left", left, trackedLeft), s.weight);
      } else if (!swimming) {
        s.overlay.restore();
        swimmers.delete(key);
      }
      return swimming;
    };

    const me = tend(LOCAL_AVATAR);
    drive.swim = me ? SWIM_SPEED : 1;
    if (me && !wasSwimming.current) {
      splash();
      // No riding out to sea.
      if (ride.get().vehicle) setVehicle(null);
    }
    wasSwimming.current = me;
    for (const p of Object.values(playersRef.current)) if (p.id !== selfIdRef.current) tend(p.id);
    for (const [key, s] of swimmers)
      if (!seen.has(key)) {
        s.overlay.restore();
        swimmers.delete(key);
      }
  }, -0.3);

  return null;
}
