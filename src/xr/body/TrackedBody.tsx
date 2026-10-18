import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { AnimatorLayerWeights } from "../../avatar/AvatarAnimator";
import { applyTrackedPose, createBodyRig, PoseOverlay, type BodyRig, type TrackedWeights } from "./bodyIk";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "./trackingStore";
import { TRACKING_STALE_MS, type TrackedPoint, type TrackedPose } from "./trackingWire";


interface TrackedBodyProps {
  vrm: VRM | null;
  /** Whose pose to apply: a remote player's id, or LOCAL_TRACKING_SOURCE. */
  source: string;
  /** Live weights from this avatar's AvatarAnimator, so tracking can step
   *  aside for a gesture instead of fighting it. */
  layerWeightsRef?: MutableRefObject<AnimatorLayerWeights>;
}

/** How fast tracking takes over an avatar and hands it back. Slow enough
 *  that putting a controller down reads as lowering an arm. */
const BLEND_RATE = 5;
/** How fast a remote avatar eases toward each new 10Hz pose. Fast enough
 *  that a wave keeps its shape, slow enough that it doesn't ratchet. */
const FOLLOW_RATE = 14;

const approach = (current: number, target: number, rate: number, delta: number) =>
  current + (target - current) * (1 - Math.exp(-rate * delta));

/** A TrackedPose that eases instead of jumping, plus how present each hand
 *  is, so a controller that drops out fades rather than snapping. */
interface SmoothedPose {
  pose: TrackedPose;
  hand: { left: number; right: number };
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

function easePoint(current: TrackedPoint, next: TrackedPoint, t: number) {
  for (let i = 0; i < 3; i++) current[i] += (next[i] - current[i]) * t;
  qa.set(current[3], current[4], current[5], current[6]);
  qb.set(next[3], next[4], next[5], next[6]);
  qa.slerp(qb, t);
  current[3] = qa.x;
  current[4] = qa.y;
  current[5] = qa.z;
  current[6] = qa.w;
}

const clonePoint = (point: TrackedPoint): TrackedPoint => [...point] as TrackedPoint;

function easePose(smoothed: SmoothedPose | null, next: TrackedPose, t: number, delta: number): SmoothedPose {
  if (!smoothed) {
    return {
      pose: {
        head: clonePoint(next.head),
        left: next.left && { pose: clonePoint(next.left.pose), curl: [...next.left.curl] },
        right: next.right && { pose: clonePoint(next.right.pose), curl: [...next.right.curl] },
        height: next.height,
      },
      hand: { left: next.left ? 1 : 0, right: next.right ? 1 : 0 },
    };
  }
  easePoint(smoothed.pose.head, next.head, t);
  smoothed.pose.height += (next.height - smoothed.pose.height) * t;
  for (const side of ["left", "right"] as const) {
    const incoming = next[side];
    const current = smoothed.pose[side];
    smoothed.hand[side] = approach(smoothed.hand[side], incoming ? 1 : 0, BLEND_RATE, delta);
    if (!incoming) continue;
    if (!current) {
      // A hand coming back into view starts where it is, not swept in
      // from wherever it was last seen.
      smoothed.pose[side] = { pose: clonePoint(incoming.pose), curl: [...incoming.curl] };
      continue;
    }
    easePoint(current.pose, incoming.pose, t);
    current.curl[0] += (incoming.curl[0] - current.curl[0]) * t;
    current.curl[1] += (incoming.curl[1] - current.curl[1]) * t;
  }
  return smoothed;
}

const NO_LAYERS: AnimatorLayerWeights = { gesture: 0, posture: 0 };

/**
 * Drives one avatar from body tracking, when there is any for it.
 *
 * Mounted on every avatar, local and remote, and costs nothing for one
 * whose owner isn't in a headset. When a pose is arriving it fades in and
 * takes the head, arms, fingers and (for a physical crouch) legs; when the
 * poses stop it fades back out and the avatar's own animation carries on.
 *
 * It steps aside rather than competing:
 * - a gesture clip (picked from the wrist menu, say) takes the whole body
 *   back while it plays, so a wave is the canned wave, not two waves
 *   fighting — and tracking resumes as the clip fades;
 * - a posture keeps the legs (you can't crouch out of a chair), but the
 *   head and arms stay tracked, so a seated player can still gesture.
 *
 * Priority -0.5: after AvatarAnimator (-1) has written the frame's
 * animation and XrBodyTracker (-0.9) the local pose, before VrmAvatar's
 * vrm.update() (0) copies the result onto the visible skeleton.
 */
export function TrackedBody({ vrm, source, layerWeightsRef }: TrackedBodyProps) {
  const rigRef = useRef<BodyRig | null>(null);
  const overlay = useRef(new PoseOverlay()).current;
  const smoothedRef = useRef<SmoothedPose | null>(null);
  const weightRef = useRef(0);
  const weights = useRef<TrackedWeights>({ head: 0, arms: 0, hand: { left: 0, right: 0 }, legs: 0 }).current;

  useEffect(() => {
    rigRef.current = vrm ? createBodyRig(vrm) : null;
    overlay.clear();
    smoothedRef.current = null;
    weightRef.current = 0;
  }, [vrm, overlay]);

  useFrame((_, rawDelta) => {
    const rig = rigRef.current;
    if (!rig) return;
    // Always first, even with nothing to apply: it is what takes last
    // frame's pose back off bones that animation doesn't rewrite.
    overlay.restore();

    const delta = Math.min(rawDelta, 0.05);
    const sample = trackingStore.get(source);
    const fresh = sample != null && performance.now() - sample.receivedAt < TRACKING_STALE_MS;
    weightRef.current = approach(weightRef.current, fresh ? 1 : 0, BLEND_RATE, delta);
    if (fresh) {
      // Your own avatar is not smoothed: it is drawn from this frame's
      // headset pose, and any easing would show as your hands trailing
      // your real ones.
      const t = source === LOCAL_TRACKING_SOURCE ? 1 : 1 - Math.exp(-FOLLOW_RATE * delta);
      smoothedRef.current = easePose(smoothedRef.current, sample.pose, t, delta);
    }
    const smoothed = smoothedRef.current;
    const weight = weightRef.current;
    if (!smoothed || weight < 0.001) {
      if (weight < 0.001) smoothedRef.current = null;
      return;
    }

    const layers = layerWeightsRef?.current ?? NO_LAYERS;
    // Lying down, the pose has the whole body: an upright headset turning
    // a lying head would fold the neck.
    const free = weight * (1 - Math.min(1, layers.gesture)) * (1 - (layers.lying ?? 0));
    weights.head = free;
    weights.arms = free;
    weights.hand.left = smoothed.hand.left;
    weights.hand.right = smoothed.hand.right;
    weights.legs = free * (1 - Math.min(1, layers.posture));
    applyTrackedPose(rig, overlay, smoothed.pose, weights);
  }, -0.5);

  return null;
}
