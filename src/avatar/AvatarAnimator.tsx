import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip,
  type VRMAnimation,
} from "@pixiv/three-vrm-animation";
import { VRMHumanBoneList, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { LOCOMOTION_CLIPS } from "./builtinMotions.generated";
import type { GestureDefinition, GroundContact } from "./gestures";
import { SEAT_HEIGHT } from "../scene/layout";

/**
 * Drives every avatar's body animation from VRM Animation clips, in three
 * layers that never fight each other:
 *
 * 1. Locomotion — idle / walk / run, blended by actual ground speed.
 * 2. Posture — a held full-body pose, currently sitting. It stays until
 *    released, so a seated player who waves doesn't stand up.
 * 3. Gestures — layered on top. An upper-body gesture (wave, clap…) leaves
 *    the legs to whatever is underneath, so you can wave while walking or
 *    while sitting. A full-body gesture (seiza) takes over both halves.
 *
 * Each clip is split into upper- and lower-body halves so a layer can win
 * one half and yield the other. Weights per bone always add up to 1: the
 * VRM rest pose is a T-pose by specification, so any gap in the blend
 * shows up as the arms snapping outward.
 *
 * A gesture marked `hold` clamps on its final frame instead of finishing —
 * holding the key keeps the pose, and the key can't be spammed into a
 * restart loop. Releasing it (the `gesture` prop going null) fades it out.
 *
 * Walk and run are phase-locked and advanced by ground speed, so feet don't
 * skate when speed changes or when the two clips crossfade.
 *
 * Finally, poses that rest on something (see GroundContact) are settled onto
 * it per avatar, because no baked clip can be right for every body — that's
 * the second useFrame pass at the bottom of this file.
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
const POSTURE_FADE_RATE = 7; // sitting down and standing up ease in/out
const MAX_DELTA = 1 / 20;

/** Bones that can be the lowest point of a pose resting on the floor. */
const FLOOR_CONTACT_BONES: VRMHumanBoneName[] = [
  "leftToes", "rightToes",
  "leftFoot", "rightFoot",
  "leftLowerLeg", "rightLowerLeg",
];
/** Hips height of the skeleton the built-in clips were authored against. */
const REFERENCE_HIPS_HEIGHT = 0.95;
/** Distance from a shin or ankle joint to the skin, at reference scale. */
const LIMB_RADIUS = 0.05;
/** Distance from the hip joint down to the part that meets the cushion. */
const HIP_TO_SEAT = 0.19;
/** How fast the grounding offset chases its target. Fast enough to keep up
 *  with sitting down, slow enough that a noisy frame doesn't pop the body. */
const GROUND_SETTLE_RATE = 14;

/**
 * Retargeting a clip onto one avatar is the expensive part of playing a
 * gesture, so it happens once per avatar per clip and is kept.
 *
 * It used to happen on every single trigger, and the cost was worse than it
 * looked: when an avatar has no VRMLookAtQuaternionProxy,
 * `createVRMAnimationClip` builds one and adds it to the avatar's scene, so
 * every gesture click also permanently grew the scene graph. Playing with
 * the gesture menu for a minute left a visibly slower page behind.
 */
interface ClipBundle {
  full: THREE.AnimationClip;
  upper: THREE.AnimationClip;
  lower: THREE.AnimationClip;
}

interface SplitActions {
  upper: THREE.AnimationAction;
  lower: THREE.AnimationAction;
}

interface LocomotionState extends SplitActions {
  duration: number;
  weight: number;
}

interface PostureState extends SplitActions {
  url: string;
  weight: number;
  ground: GroundContact;
  /** False once released: weight eases to 0, then the actions stop. */
  active: boolean;
}

interface GestureLayer {
  url: string;
  action: THREE.AnimationAction;
  duration: number;
  fullBody: boolean;
  hold: boolean;
  ground: GroundContact;
  weight: number;
  /** Set when a newer gesture replaces this one, or a hold is released. */
  fadingOut: boolean;
}

interface AnimatorState {
  vrm: VRM;
  mixer: THREE.AnimationMixer;
  idle: LocomotionState | null;
  walk: LocomotionState | null;
  run: LocomotionState | null;
  posture: PostureState | null;
  gestures: GestureLayer[];
  /** Retargeted clips for this avatar, keyed by clip URL. */
  clips: Map<string, ClipBundle>;
  phase: number;
  speed: number;
  lastPosition: THREE.Vector3 | null;
  /** What the pose currently showing is resting on, and how much of it is
   *  blended in. Written by the animation pass, read by the grounding pass. */
  groundMode: GroundContact;
  groundWeight: number;
  /** Metres the avatar is currently sunk (negative) or lifted to meet it. */
  groundOffset: number;
  /** Rest hips height, so contact clearances scale with the body. */
  scale: number;
}

/**
 * Without this, three-vrm creates one per clip and adds it to the avatar,
 * warning each time. Creating it once up front silences the warning and
 * keeps repeated gestures from growing the scene.
 */
function ensureLookAtProxy(vrm: VRM) {
  if (!vrm.lookAt) return;
  if (vrm.scene.children.some((child) => child instanceof VRMLookAtQuaternionProxy)) return;
  const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
  proxy.name = "VRMLookAtQuaternionProxy";
  vrm.scene.add(proxy);
}

/**
 * How big this avatar is relative to the skeleton the built-in clips were
 * authored against, measured from the hips of the rest pose. Contact
 * clearances (how thick a shin is, how far the hip joint sits above the
 * cushion) are body-sized, not absolute, so everything the grounding pass
 * measures is expressed as a multiple of this.
 */
function measureRestScale(vrm: VRM): number {
  const hips = vrm.humanoid.getRawBoneNode("hips") ?? vrm.humanoid.getNormalizedBoneNode("hips");
  if (!hips) return 1;
  hips.updateWorldMatrix(true, false);
  const height = new THREE.Vector3().setFromMatrixPosition(hips.matrixWorld).y - rootY(vrm);
  // A metre-tall child avatar and a two-metre one are both plausible; a
  // zero is not, and would divide the clearances away to nothing.
  return height > 0.2 ? height / REFERENCE_HIPS_HEIGHT : 1;
}

/** World Y of the group the avatar is parented to — i.e. where its feet are
 *  meant to be. Everything the grounding pass measures is relative to it, so
 *  it works the same for a player standing on a floor at any height. */
function rootY(vrm: VRM): number {
  const parent = vrm.scene.parent;
  if (!parent) return 0;
  parent.updateWorldMatrix(true, false);
  return parent.matrixWorld.elements[13];
}

function getClipBundle(state: AnimatorState, url: string, animation: VRMAnimation): ClipBundle {
  const cached = state.clips.get(url);
  if (cached) return cached;
  const full = createVRMAnimationClip(animation, state.vrm);
  full.name = `seiza:${url}`;
  const { upper, lower } = splitClip(full, state.vrm);
  const bundle = { full, upper, lower };
  state.clips.set(url, bundle);
  return bundle;
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
  /** Held full-body pose (sitting), or null when standing. */
  posture?: GestureDefinition | null;
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

export function AvatarAnimator({
  vrm,
  getPosition,
  gesture = null,
  gestureSeq = 0,
  onGestureEnd,
  posture = null,
  holdTPose = false,
}: AvatarAnimatorProps) {
  const stateRef = useRef<AnimatorState | null>(null);
  const getPositionRef = useRef(getPosition);
  getPositionRef.current = getPosition;
  const onGestureEndRef = useRef(onGestureEnd);
  onGestureEndRef.current = onGestureEnd;

  // Per-avatar setup: mixer now, locomotion clips as soon as they load.
  useEffect(() => {
    if (!vrm) return;
    ensureLookAtProxy(vrm);
    const mixer = new THREE.AnimationMixer(vrm.scene);
    const state: AnimatorState = {
      vrm,
      mixer,
      idle: null,
      walk: null,
      run: null,
      posture: null,
      gestures: [],
      clips: new Map(),
      phase: 0,
      speed: 0,
      lastPosition: null,
      groundMode: "none",
      groundWeight: 0,
      groundOffset: 0,
      scale: measureRestScale(vrm),
    };
    stateRef.current = state;

    // Hidden until idle is ready, so a freshly loaded avatar never flashes
    // its rest T-pose for a frame or two.
    vrm.scene.visible = false;
    let cancelled = false;

    const build = (animation: VRMAnimation, url: string, loop: boolean): LocomotionState => {
      const { upper, lower } = getClipBundle(state, url, animation);
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
        state.idle = build(idle.value, LOCOMOTION_CLIPS.idle, true);
        state.idle.weight = 1;
      } else {
        console.warn("Idle animation failed to load; avatar will stand in its rest pose.", idle.reason);
      }
      if (walk.status === "fulfilled") state.walk = build(walk.value, LOCOMOTION_CLIPS.walk, true);
      if (run.status === "fulfilled") state.run = build(run.value, LOCOMOTION_CLIPS.run, true);
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
      state.clips.clear();
      vrm.humanoid.resetNormalizedPose();
      vrm.scene.position.y = 0;
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
  const gestureHold = gesture?.hold ?? false;
  const gestureGround: GroundContact = gesture?.ground ?? "none";
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
        const bundle = getClipBundle(state, gestureUrl, animation);
        // Replaying the same gesture reuses its layer and rewinds it,
        // rather than stacking a second copy of the same clip.
        let layer = state.gestures.find((existing) => existing.url === gestureUrl);
        if (!layer) {
          layer = {
            url: gestureUrl,
            action: state.mixer.clipAction(bundle.full),
            duration: bundle.full.duration,
            fullBody: gestureFullBody,
            hold: gestureHold,
            ground: gestureGround,
            weight: 0,
            fadingOut: false,
          };
          state.gestures.push(layer);
        }
        layer.fullBody = gestureFullBody;
        layer.hold = gestureHold;
        layer.ground = gestureGround;
        layer.fadingOut = false;
        layer.action.setLoop(THREE.LoopOnce, 1);
        layer.action.clampWhenFinished = true;
        layer.action.reset();
        layer.action.setEffectiveWeight(layer.weight);
        layer.action.play();
        for (const other of state.gestures) {
          if (other !== layer) other.fadingOut = true;
        }
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
  }, [vrm, gestureUrl, gestureFullBody, gestureHold, gestureGround, gestureSeq]);

  // Releasing a hold gesture: the key came up, or the player stood up.
  useEffect(() => {
    if (gestureUrl) return;
    const state = stateRef.current;
    if (!state) return;
    for (const layer of state.gestures) {
      if (layer.hold) layer.fadingOut = true;
    }
  }, [gestureUrl]);

  // Posture: sit down, and stand back up when it clears.
  const postureUrl = posture?.url ?? null;
  const postureGroundRef = useRef<GroundContact>("none");
  postureGroundRef.current = posture?.ground ?? "none";
  useEffect(() => {
    const state = stateRef.current;
    if (!vrm || !state) return;
    if (!postureUrl) {
      if (state.posture) state.posture.active = false;
      return;
    }
    if (state.posture?.url === postureUrl) {
      state.posture.active = true;
      state.posture.ground = postureGroundRef.current;
      return;
    }
    let cancelled = false;
    loadVrmAnimation(postureUrl)
      .then((animation) => {
        const current = stateRef.current;
        if (cancelled || !current || current.vrm !== vrm) return;
        if (current.posture) {
          current.posture.upper.stop();
          current.posture.lower.stop();
        }
        const bundle = getClipBundle(current, postureUrl, animation);
        const make = (part: THREE.AnimationClip) => {
          const action = current.mixer.clipAction(part);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.setEffectiveWeight(0);
          action.reset();
          action.play();
          return action;
        };
        current.posture = {
          upper: make(bundle.upper),
          lower: make(bundle.lower),
          url: postureUrl,
          weight: 0,
          ground: postureGroundRef.current,
          active: true,
        };
      })
      .catch((error) => console.warn(`Posture clip failed to load (${postureUrl}):`, error));
    return () => {
      cancelled = true;
    };
  }, [vrm, postureUrl]);

  // Negative priority: runs before VrmAvatar's vrm.update(), so the pose
  // written here reaches the rendered skeleton in the same frame.
  useFrame((_, rawDelta) => {
    const state = stateRef.current;
    if (!state) return;
    const delta = Math.min(rawDelta, MAX_DELTA);

    if (holdTPose) {
      state.vrm.humanoid.resetNormalizedPose();
      state.groundWeight = 0;
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

    // ---- posture ------------------------------------------------------------------
    const postureLayer = state.posture;
    let postureWeight = 0;
    if (postureLayer) {
      postureLayer.weight = approach(postureLayer.weight, postureLayer.active ? 1 : 0, POSTURE_FADE_RATE, delta);
      postureWeight = postureLayer.weight;
      if (!postureLayer.active && postureLayer.weight < 0.01) {
        // Stopped, but the retargeted clip stays cached for the next sit.
        postureLayer.upper.stop();
        postureLayer.lower.stop();
        state.posture = null;
        postureWeight = 0;
      }
    }

    // ---- gesture layers -----------------------------------------------------------
    let upperTakeover = 0;
    let gestureLowerTakeover = 0;
    for (const layer of state.gestures) {
      const remaining = layer.duration - layer.action.time;
      // A hold gesture stays at full weight on its last frame; a one-shot
      // fades out as it reaches the end.
      const fadeOutCap = layer.fadingOut ? 0 : layer.hold ? 1 : THREE.MathUtils.clamp(remaining / GESTURE_FADE_OUT, 0, 1);
      if (layer.fadingOut) {
        layer.weight = Math.max(0, layer.weight - delta / GESTURE_FADE_IN);
      } else {
        layer.weight = Math.min(fadeOutCap, layer.weight + delta / GESTURE_FADE_IN);
      }
      upperTakeover += layer.weight;
      if (layer.fullBody) gestureLowerTakeover += layer.weight;
    }
    upperTakeover = Math.min(1, upperTakeover);
    gestureLowerTakeover = Math.min(1, gestureLowerTakeover);

    const finished = state.gestures.filter(
      (layer) => layer.weight <= 0 && (layer.fadingOut || (!layer.hold && layer.action.time >= layer.duration - 1e-3))
    );
    if (finished.length) {
      for (const layer of finished) layer.action.stop();
      const endedNaturally = finished.some((layer) => !layer.fadingOut);
      state.gestures = state.gestures.filter((layer) => !finished.includes(layer));
      if (endedNaturally && state.gestures.length === 0) onGestureEndRef.current?.();
    }

    // ---- apply weights --------------------------------------------------------
    // Gestures win the upper body; the posture keeps whatever is left of it
    // and always owns the lower body; locomotion gets the remainder.
    const postureUpper = postureWeight * (1 - upperTakeover);
    const lowerTakeover = Math.min(1, gestureLowerTakeover + postureWeight);
    for (const loco of [state.idle, state.walk, state.run]) {
      if (!loco) continue;
      loco.upper.setEffectiveWeight(loco.weight * (1 - upperTakeover) * (1 - postureWeight));
      loco.lower.setEffectiveWeight(loco.weight * (1 - lowerTakeover));
    }
    if (state.posture) {
      state.posture.upper.setEffectiveWeight(postureUpper);
      state.posture.lower.setEffectiveWeight(postureWeight);
    }
    for (const layer of state.gestures) layer.action.setEffectiveWeight(layer.weight);

    // ---- what the pose is resting on ----------------------------------------------
    // Whichever contact is most strongly blended in wins, so crossing from a
    // chair into seiza hands the grounding over rather than fighting over it.
    state.groundMode = "none";
    state.groundWeight = 0;
    const considerGround = (mode: GroundContact, weight: number) => {
      if (mode === "none" || weight <= state.groundWeight) return;
      state.groundMode = mode;
      state.groundWeight = weight;
    };
    for (const layer of state.gestures) {
      // Only a full-body clip moves the legs, so only it can change where
      // the body meets the world; a wave while seated must not.
      if (layer.fullBody) considerGround(layer.ground, layer.weight);
    }
    if (state.posture) considerGround(state.posture.ground, postureWeight * (1 - gestureLowerTakeover));

    state.mixer.update(delta);
  }, -1);

  /**
   * Settles a resting pose onto the world, once per frame, per avatar.
   *
   * Why this exists: a .vrma clip can only bake one hip height. VRM playback
   * scales that translation by the avatar's own hips height, but leg length
   * varies independently — two avatars with identical hips heights can have
   * very different shins — so a kneeling pose that sits perfectly on the
   * skeleton it was authored for hovers above the tatami on one upload and
   * sinks through it on the next. No amount of re-authoring fixes that for
   * every body; it has to be measured on the body that's actually there.
   *
   * So: measure where the posed skeleton's contact points ended up, and slide
   * the whole model down (or up) until they're where they belong. The
   * measurement already includes the offset applied last frame, which makes
   * this a simple feedback loop — correct by the error, smooth it, repeat —
   * that converges in a few frames and then holds still.
   *
   * This measures the raw bones as they stood after the *previous* frame's
   * `vrm.update()` (VrmAvatar.tsx, priority 0) rather than this frame's —
   * a one-frame lag that a smoothed offset never shows. That's deliberate:
   * a render priority greater than zero tells react-three-fiber "I will call
   * gl.render() myself", which switches the whole canvas to manual rendering
   * and — since nothing here ever calls it — left every canvas in the app
   * (this preview included) drawing nothing but its own clear color.
   * Priority -1 keeps this on the same automatic footing as the pose layer
   * above, just in its own pass.
   */
  useFrame((_, rawDelta) => {
    const state = stateRef.current;
    if (!state) return;
    const { vrm } = state;
    const delta = Math.min(rawDelta, MAX_DELTA);

    let target = 0;
    if (!holdTPose && state.groundWeight > 0.001) {
      const base = rootY(vrm);
      const scale = state.scale;
      let error: number | null = null;

      if (state.groundMode === "floor") {
        // Whatever is lowest is what's touching: shins in seiza, feet when
        // sitting cross-legged, toes on the way in and out of both.
        let lowest = Infinity;
        for (const name of FLOOR_CONTACT_BONES) {
          const node = vrm.humanoid.getRawBoneNode(name);
          if (!node) continue;
          node.updateWorldMatrix(true, false);
          lowest = Math.min(lowest, node.matrixWorld.elements[13] - base);
        }
        if (Number.isFinite(lowest)) error = LIMB_RADIUS * scale - lowest;
      } else if (state.groundMode === "seat") {
        const hips = vrm.humanoid.getRawBoneNode("hips");
        if (hips) {
          hips.updateWorldMatrix(true, false);
          error = SEAT_HEIGHT + HIP_TO_SEAT * scale - (hips.matrixWorld.elements[13] - base);
        }
      }

      if (error !== null) {
        // Scaled by how much of the pose is blended in, so the correction
        // arrives with the pose and is gone again by the time you stand.
        target = (state.groundOffset + error) * state.groundWeight;
        // A bad rig (mislabelled bones, a metre-off hips) can't drag the
        // avatar somewhere absurd.
        target = THREE.MathUtils.clamp(target, -0.9 * scale, 0.9 * scale);
      }
    }

    state.groundOffset = approach(state.groundOffset, target, GROUND_SETTLE_RATE, delta);
    if (Math.abs(state.groundOffset) < 1e-4) state.groundOffset = 0;
    // The renderer refreshes world matrices from here on its own; writing the
    // local position is enough.
    vrm.scene.position.y = state.groundOffset;
  }, -1);

  return null;
}
