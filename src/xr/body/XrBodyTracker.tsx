import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { createXrBodySample, readXrBody, type XrHandSample } from "./xrPose";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "./trackingStore";
import { TRACKING_SEND_INTERVAL_MS, type TrackedHand, type TrackedPoint, type TrackedPose } from "./trackingWire";

interface XrBodyTrackerProps {
  /** The local player's feet and body yaw, as PlayerRig publishes them —
   *  the same values the local avatar is drawn at, which is what makes
   *  poses expressed relative to them land back exactly on the hands. */
  positionRef: MutableRefObject<[number, number, number]>;
  rotationRef: MutableRefObject<number>;
  /** Sends a pose to the room: at most every TRACKING_SEND_INTERVAL_MS,
   *  and once with null when the session ends. */
  onSend: (pose: TrackedPose | null) => void;
}

/** A standing adult's eye height, used until the headset has reported
 *  one, so the first frames of a session aren't divided by zero. */
const DEFAULT_STANDING_EYE = 1.6;
/** Below this the "standing" measurement is someone who has been sitting
 *  or kneeling since the session began, not a real standing height. */
const MIN_STANDING_EYE = 0.9;
/** Above this a "standing" measurement is a tracking glitch, or the
 *  headset held up while putting it on, not anyone's eyes. */
const MAX_STANDING_EYE = 2.1;
/** The eyes relative to the top of the neck, which the head pivots on:
 *  up and forward (-z). Looking down swings the eyes down round it. */
const EYE_ABOVE_NECK = 0.1;
const EYE_AHEAD_OF_NECK = 0.08;

/**
 * Samples the local headset and controllers every frame and turns them
 * into a TrackedPose: for the local avatar immediately (so your own hands
 * follow yours with no network in between), and for everyone else ten
 * times a second.
 *
 * Renders nothing and does nothing outside an immersive session. Runs at
 * priority -0.9: after AvatarAnimator (-1), which has to have written the
 * base pose first, and before TrackedBody (-0.5), which reads this.
 */
export function XrBodyTracker({ positionRef, rotationRef, onSend }: XrBodyTrackerProps) {
  const gl = useThree((state) => state.gl);
  const presenting = useXR((state) => state.session != null);
  const sample = useRef(createXrBodySample()).current;
  const standingEyeRef = useRef(0);
  const lastSentRef = useRef(0);
  const trackingRef = useRef(false);
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  // Leaving VR has to be announced, or every other client goes on holding
  // this avatar in its last tracked pose until the stale timeout.
  useEffect(() => {
    if (presenting) return;
    standingEyeRef.current = 0;
    trackingStore.set(LOCAL_TRACKING_SOURCE, null);
    trackingStore.setLocalWorld(null, 0);
    if (trackingRef.current) {
      trackingRef.current = false;
      onSendRef.current(null);
    }
  }, [presenting]);

  useFrame((_, __, frame?: XRFrame) => {
    if (!presenting || !frame) return;
    if (!readXrBody(gl, frame, sample)) return;

    // How high the eyes would be with the head level: the neck's height,
    // plus the eyes' height above it. The eyes themselves drop several
    // centimetres whenever you look down (at your hands, a menu, someone
    // shorter), and measured from them, every glance down was a crouch.
    const level = levelEyeHeight(sample);
    // Standing eye height, measured rather than asked for: the highest the
    // head has been this session. Bending to pick something up then reads
    // as bending, and a tall player and a short one both read as standing
    // when they stand.
    if (level <= MAX_STANDING_EYE) standingEyeRef.current = Math.max(standingEyeRef.current, level);
    const standingEye = standingEyeRef.current >= MIN_STANDING_EYE ? standingEyeRef.current : DEFAULT_STANDING_EYE;

    const pose = encodePose(sample, positionRef.current, rotationRef.current, standingEye, level);
    trackingStore.set(LOCAL_TRACKING_SOURCE, pose);
    trackingStore.setLocalWorld(sample, standingEye);
    trackingRef.current = true;

    const now = performance.now();
    if (now - lastSentRef.current >= TRACKING_SEND_INTERVAL_MS) {
      lastSentRef.current = now;
      onSendRef.current(pose);
    }
  }, -0.9);

  return null;
}

const bodyInverse = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const local = new THREE.Vector3();
const localQ = new THREE.Quaternion();

/** World → body frame (see trackingWire.ts): relative to the feet, unrotated
 *  by the body's yaw, and divided by standing eye height. */
function toBodyPoint(
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  feet: [number, number, number],
  scale: number
): TrackedPoint {
  local.set(position.x - feet[0], position.y - feet[1], position.z - feet[2]).applyQuaternion(bodyInverse).divideScalar(scale);
  localQ.copy(bodyInverse).multiply(quaternion);
  return [local.x, local.y, local.z, localQ.x, localQ.y, localQ.z, localQ.w];
}

function toBodyHand(hand: XrHandSample, feet: [number, number, number], scale: number): TrackedHand | null {
  if (!hand.active) return null;
  const pose = toBodyPoint(hand.position, hand.quaternion, feet, scale);
  if (!hand.articulated) return { pose, curl: [hand.curl[0], hand.curl[1]], held: true };
  const [x, y, z] = toBodyPoint(hand.tip, hand.quaternion, feet, scale);
  return { pose, curl: [hand.curl[0], hand.curl[1]], tip: [x, y, z] };
}

const eyeFromNeck = new THREE.Vector3();

/** The head's height above the floor as if it were level: the neck pivot
 *  (the eyes, less their offset turned by the head's pitch and roll) plus
 *  the eyes' height above it. The origin only ever turns about the
 *  vertical, so the world rotation's vertical part is the playspace's. */
function levelEyeHeight(sample: ReturnType<typeof createXrBodySample>): number {
  eyeFromNeck.set(0, EYE_ABOVE_NECK, -EYE_AHEAD_OF_NECK).applyQuaternion(sample.head.quaternion);
  return sample.head.heightAboveFloor - eyeFromNeck.y + EYE_ABOVE_NECK;
}

function encodePose(
  sample: ReturnType<typeof createXrBodySample>,
  feet: [number, number, number],
  bodyYaw: number,
  standingEye: number,
  levelEye: number
): TrackedPose {
  bodyInverse.setFromAxisAngle(yAxis, -bodyYaw);
  return {
    head: toBodyPoint(sample.head.position, sample.head.quaternion, feet, standingEye),
    left: toBodyHand(sample.left, feet, standingEye),
    right: toBodyHand(sample.right, feet, standingEye),
    height: THREE.MathUtils.clamp(levelEye / standingEye, 0.3, 1.1),
  };
}
