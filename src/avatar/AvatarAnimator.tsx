import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip, type VRMAnimation } from "@pixiv/three-vrm-animation";
import { VRMHumanBoneList, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { LOCOMOTION_CLIPS } from "./builtinMotions.generated";
import type { GestureDefinition } from "./gestures";

/**
 * Drives every avatar's body animation from VRM Animation clips: an
 * idle / walk / run locomotion blend underneath, and gestures layered on top.
 *
 * This replaces two earlier pieces that fought each other — a procedural
 * sine-wave gait and a separate gesture player. Both wrote the same bones
 * independently, gestures froze on their final frame, and nothing ever
 * posed an idle avatar, so everyone stood in the VRM rest pose, which is a
 * T-pose by spec. One AnimationMixer with managed weights fixes all three.
 *
 * Layering:
 * - Each locomotion clip is split into upper- and lower-body halves.
 * - An upper-body gesture (wave, clap…) takes over the upper half only,
 *   so legs keep walking underneath it.
 * - A full-body gesture (seiza) takes over both halves.
 * Weights always sum to 1 per bone, so nothing ever blends toward T-pose.
 *
 * Walk and run are phase-locked and advanced by actual ground speed, so
 * feet don't skate when speed changes or when the two clips crossfade.
 */

const animationCache = new Map<string, Promise<VRMAnimation>>();

export function loadVrmAnimation(url: string): Promise<VRMAnimation> {
  let pending = animationCache.get(url);
  if (!pending) {
    pending = new Promise<VRMAnimation>((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      loader.load(
        url,
        (gltf) => {
          const animation = (gltf.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
          if (animation) resolve(animation);
          else reject(new Error(`${url} contains no VRM animation`));
        },
        undefined,
        reject
      );
    });
    // A failed load shouldn't be cached forever — let the next request retry.
    pending.catch(() => animationCache.delete(url));
    animationCache.set(url, pending);
  }
  return pending;
}

const LOWER_BODY_BONES = new Set<VRMHumanBoneName>([
  "hips",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
  "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
]);

const WALK_SPEED = 3.2; // m/s the walk clip was authored for
const RUN_SPEED = 6.1;
const WALK_STRIDE = 3.2; // meters travelled per walk cycle
const RUN_STRIDE = 3.9;
const GESTURE_FADE_IN = 0.2;
const GESTURE_FADE_OUT = 0.3;
const MAX_DELTA = 1 / 20;

interface LocomotionState {
  upper: THREE.AnimationAction;
  lower: THREE.AnimationAction;
  duration: number;
  weight: number;
}

interface GestureLayer {
  action: THREE.AnimationAction;
  clip: THREE.AnimationClip;
  duration: number;
  fullBody: boolean;
  weight: number;
  /** Set when a newer gesture replaces this one mid-play. */
  fadingOut: boolean;
}

interface AnimatorState {
  vrm: VRM;
  mixer: THREE.AnimationMixer;
  idle: LocomotionState | null;
  walk: LocomotionState | null;
  run: LocomotionState | null;
  gestures: GestureLayer[];
  phase: number;
  speed: number;
  lastPosition: THREE.Vector3 | null;
}

export interface AvatarAnimatorProps {
  vrm: VRM | null;
  /** The avatar's current world position, read every frame to derive
   *  ground speed. Omit for a stationary avatar (e.g. the preview). */
  getPosition?: () => THREE.Vector3 | readonly [number, number, number];
  gesture?: GestureDefinition | null;
  /** Changes every time a gesture is triggered, so repeating the same
   *  gesture replays it instead of being ignored as "no change". */
  gestureSeq?: number;
  onGestureEnd?: () => void;
  /** Inspection mode for the avatar preview: hold the T-pose. */
  holdTPose?: boolean;
}

function splitClip(clip: THREE.AnimationClip, vrm: VRM) {
  const nodeToBone = new Map<string, VRMHumanBoneName>();
  for (const bone of VRMHumanBoneList) {
    const node = vrm.humanoid.getNormalizedBoneNode(bone);
    if (node) nodeToBone.set(node.name, bone);
  }
  const upper: THREE.KeyframeTrack[] = [];
  const lower: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const bone = nodeToBone.get(track.name.slice(0, track.name.lastIndexOf(".")));
    (bone && !LOWER_BODY_BONES.has(bone) ? upper : lower).push(track);
  }
  return {
    upper: new THREE.AnimationClip(`${clip.name}:upper`, clip.duration, upper),
    lower: new THREE.AnimationClip(`${clip.name}:lower`, clip.duration, lower),
  };
}

const approach = (current: number, target: number, rate: number, delta: number) =>
  current + (target - current) * (1 - Math.exp(-rate * delta));

export function AvatarAnimator({ vrm, getPosition, gesture = null, gestureSeq = 0, onGestureEnd, holdTPose = false }: AvatarAnimatorProps) {
  const stateRef = useRef<AnimatorState | null>(null);
  const getPositionRef = useRef(getPosition);
  getPositionRef.current = getPosition;
  const onGestureEndRef = useRef(onGestureEnd);
  onGestureEndRef.current = onGestureEnd;

  // Per-avatar setup: mixer now, locomotion clips as soon as they load.
  useEffect(() => {
    if (!vrm) return;
    const mixer = new THREE.AnimationMixer(vrm.scene);
    const state: AnimatorState = {
      vrm,
      mixer,
      idle: null,
      walk: null,
      run: null,
      gestures: [],
      phase: 0,
      speed: 0,
      lastPosition: null,
    };
    stateRef.current = state;

    // Hidden until idle is ready, so a freshly loaded avatar never flashes
    // its rest T-pose for a frame or two.
    vrm.scene.visible = false;
    let cancelled = false;

    const build = (animation: VRMAnimation, loop: boolean): LocomotionState => {
      const { upper, lower } = splitClip(createVRMAnimationClip(animation, vrm), vrm);
      const make = (clip: THREE.AnimationClip) => {
        const action = mixer.clipAction(clip);
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.setEffectiveWeight(0);
        action.play();
        return action;
      };
      return { upper: make(upper), lower: make(lower), duration: upper.duration, weight: 0 };
    };

    Promise.allSettled([
      loadVrmAnimation(LOCOMOTION_CLIPS.idle),
      loadVrmAnimation(LOCOMOTION_CLIPS.walk),
      loadVrmAnimation(LOCOMOTION_CLIPS.run),
    ]).then(([idle, walk, run]) => {
      if (cancelled) return;
      if (idle.status === "fulfilled") {
        state.idle = build(idle.value, true);
        state.idle.weight = 1;
      } else {
        console.warn("Idle animation failed to load; avatar will stand in its rest pose.", idle.reason);
      }
      if (walk.status === "fulfilled") state.walk = build(walk.value, true);
      if (run.status === "fulfilled") state.run = build(run.value, true);
      for (const moving of [state.walk, state.run]) {
        // Walk/run are positioned by hand from ground speed, not by clock.
        if (moving) {
          moving.upper.timeScale = 0;
          moving.lower.timeScale = 0;
        }
      }
      vrm.scene.visible = true;
    });

    return () => {
      cancelled = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(vrm.scene);
      vrm.humanoid.resetNormalizedPose();
      vrm.scene.visible = true;
      if (stateRef.current === state) stateRef.current = null;
    };
  }, [vrm]);

  // Start (or restart) a gesture whenever the sequence number changes —
  // and only then. The seq seen at mount counts as already played, so a
  // player who joins mid-gesture, or an avatar that finishes loading (or is
  // swapped) after a gesture started, doesn't replay a stale one.
  const gestureUrl = gesture?.url ?? null;
  const gestureFullBody = gesture?.fullBody ?? false;
  const playedSeqRef = useRef(gestureSeq);
  useEffect(() => {
    if (playedSeqRef.current === gestureSeq) return;
    if (!vrm || !gestureUrl) return;
    let cancelled = false;
    loadVrmAnimation(gestureUrl)
      .then((animation) => {
        const state = stateRef.current;
        if (cancelled || !state || state.vrm !== vrm) return;
        // Marked here, not when the effect starts, so React StrictMode's
        // mount-cleanup-mount in development doesn't swallow the gesture.
        playedSeqRef.current = gestureSeq;
        const clip = createVRMAnimationClip(animation, vrm);
        clip.name = `gesture:${gestureUrl}:${gestureSeq}`;
        const action = state.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.setEffectiveWeight(0);
        action.play();
        for (const layer of state.gestures) layer.fadingOut = true;
        state.gestures.push({ action, clip, duration: clip.duration, fullBody: gestureFullBody, weight: 0, fadingOut: false });
      })
      .catch((error) => {
        console.warn(`Gesture clip failed to load (${gestureUrl}):`, error);
        if (cancelled) return;
        playedSeqRef.current = gestureSeq;
        onGestureEndRef.current?.();
      });
    return () => {
      cancelled = true;
    };
  }, [vrm, gestureUrl, gestureFullBody, gestureSeq]);

  // Negative priority: runs before VrmAvatar's vrm.update(), so the pose
  // written here reaches the rendered skeleton in the same frame.
  useFrame((_, rawDelta) => {
    const state = stateRef.current;
    if (!state) return;
    const delta = Math.min(rawDelta, MAX_DELTA);

    if (holdTPose) {
      state.vrm.humanoid.resetNormalizedPose();
      return;
    }

    // ---- ground speed ------------------------------------------------------
    const raw = getPositionRef.current?.();
    if (raw) {
      const position = raw instanceof THREE.Vector3 ? raw : new THREE.Vector3(raw[0], raw[1], raw[2]);
      if (state.lastPosition && delta > 0) {
        const instant = Math.hypot(position.x - state.lastPosition.x, position.z - state.lastPosition.z) / delta;
        // A jump of more than ~25 m/s is a teleport (spawn, respawn,
        // network correction) — not something to animate a sprint for.
        if (instant < 25) state.speed = approach(state.speed, instant, 10, delta);
      }
      state.lastPosition = (state.lastPosition ?? new THREE.Vector3()).copy(position);
    } else {
      state.speed = approach(state.speed, 0, 10, delta);
    }

    // ---- locomotion blend -------------------------------------------------------
    const moving = THREE.MathUtils.smoothstep(state.speed, 0.15, 0.7);
    const running = THREE.MathUtils.smoothstep(state.speed, WALK_SPEED * 1.05, RUN_SPEED * 0.9);
    const targets = { idle: 1 - moving, walk: moving * (1 - running), run: moving * running };
    // Missing clips hand their share back to idle so weights still sum to 1.
    if (!state.run) {
      targets.walk += targets.run;
      targets.run = 0;
    }
    if (!state.walk) {
      targets.idle += targets.walk;
      targets.walk = 0;
    }
    for (const key of ["idle", "walk", "run"] as const) {
      const loco = state[key];
      if (loco) loco.weight = approach(loco.weight, targets[key], 8, delta);
    }

    if (moving > 0.001) {
      const stride = THREE.MathUtils.lerp(WALK_STRIDE, RUN_STRIDE, running);
      state.phase = (state.phase + (Math.max(state.speed, 0.9) / stride) * delta) % 1;
    }
    for (const loco of [state.walk, state.run]) {
      if (!loco) continue;
      loco.upper.time = state.phase * loco.duration;
      loco.lower.time = state.phase * loco.duration;
    }

    // ---- gesture layers -----------------------------------------------------------
    let upperTakeover = 0;
    let lowerTakeover = 0;
    for (const layer of state.gestures) {
      const remaining = layer.duration - layer.action.time;
      const fadeOutCap = layer.fadingOut ? 0 : THREE.MathUtils.clamp(remaining / GESTURE_FADE_OUT, 0, 1);
      if (layer.fadingOut) {
        layer.weight = Math.max(0, layer.weight - delta / GESTURE_FADE_IN);
      } else {
        layer.weight = Math.min(fadeOutCap, layer.weight + delta / GESTURE_FADE_IN);
      }
      upperTakeover += layer.weight;
      if (layer.fullBody) lowerTakeover += layer.weight;
    }
    upperTakeover = Math.min(1, upperTakeover);
    lowerTakeover = Math.min(1, lowerTakeover);

    const finished = state.gestures.filter(
      (layer) => layer.weight <= 0 && (layer.fadingOut || layer.action.time >= layer.duration - 1e-3)
    );
    if (finished.length) {
      for (const layer of finished) {
        layer.action.stop();
        state.mixer.uncacheAction(layer.clip);
        state.mixer.uncacheClip(layer.clip);
      }
      const endedNaturally = finished.some((layer) => !layer.fadingOut);
      state.gestures = state.gestures.filter((layer) => !finished.includes(layer));
      if (endedNaturally && state.gestures.length === 0) onGestureEndRef.current?.();
    }

    // ---- apply weights --------------------------------------------------------
    for (const loco of [state.idle, state.walk, state.run]) {
      if (!loco) continue;
      loco.upper.setEffectiveWeight(loco.weight * (1 - upperTakeover));
      loco.lower.setEffectiveWeight(loco.weight * (1 - lowerTakeover));
    }
    for (const layer of state.gestures) layer.action.setEffectiveWeight(layer.weight);

    state.mixer.update(delta);
  }, -1);

  return null;
}
