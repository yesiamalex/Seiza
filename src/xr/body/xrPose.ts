import * as THREE from "three";

/**
 * Reads where a headset player's head and hands are this frame, in world
 * space, straight from the XRFrame.
 *
 * Two things about @react-three/xr and three.js that this depends on, both
 * easy to get wrong:
 *
 * - During a session, three writes the viewer pose into the XR camera's
 *   *local* matrix before any frame callback runs, but only recomputes its
 *   world matrix later, inside render. So `camera.matrixWorld` read from a
 *   useFrame is last frame's. The local matrix is current, and the XR
 *   camera's parent is the XROrigin group, so origin × local is the head as
 *   it is now.
 * - Controller and hand poses come back in the session's reference space,
 *   which is the XROrigin's space for the same reason. Same composition.
 */

export interface XrHeadSample {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Eye height above the physical floor, from the local-floor reference
   *  space. Unaffected by anything the app does to the origin (seating
   *  lowers the playspace, but not the person in it). */
  heightAboveFloor: number;
}

export interface XrHandSample {
  active: boolean;
  /** World position of the wrist. */
  position: THREE.Vector3;
  /** World orientation, -z toward the fingers and -y out of the palm. */
  quaternion: THREE.Quaternion;
  /** [index, other three], 0 open to 1 closed. */
  curl: [number, number];
  /** Tracked hands rather than held controllers. */
  articulated: boolean;
}

export interface XrBodySample {
  head: XrHeadSample;
  left: XrHandSample;
  right: XrHandSample;
}

export function createXrBodySample(): XrBodySample {
  const hand = (): XrHandSample => ({
    active: false,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    curl: [0, 0],
    articulated: false,
  });
  return {
    head: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), heightAboveFloor: 0 },
    left: hand(),
    right: hand(),
  };
}

/**
 * Turns a controller's grip pose into the hand convention above.
 *
 * WebXR's grip space points -z along the handle and puts the palm on the
 * x axis: toward -x for a right hand, +x for a left, so that +x is "to the
 * right" for both held naturally. Hand joints put the palm on -y instead.
 * A quarter turn about the handle reconciles the two, opposite ways for
 * the two hands. If a runtime ever reports the opposite palm side, these
 * two constants are the only thing to flip.
 */
const GRIP_TO_HAND = {
  left: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
  right: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
};

/** The grip's origin is the centre of the palm; the wrist is about this
 *  far back along the forearm. */
const GRIP_TO_WRIST = 0.07;

/** A hand holding a controller is never fully open — the fingers are
 *  wrapped round the handle — so a controller's curl starts here and the
 *  trigger and grip close it the rest of the way. */
const HELD_INDEX_CURL = 0.25;
const HELD_GRIP_CURL = 0.4;

const scratchMatrix = new THREE.Matrix4();
const scratchLocal = new THREE.Matrix4();
const scratchScale = new THREE.Vector3();
const scratchVector = new THREE.Vector3();
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();

function composeWorld(origin: THREE.Object3D, local: THREE.Matrix4, position: THREE.Vector3, quaternion: THREE.Quaternion) {
  scratchMatrix.multiplyMatrices(origin.matrixWorld, local);
  scratchMatrix.decompose(position, quaternion, scratchScale);
}

/**
 * How closed a tracked finger is, from how far its tip is from the wrist
 * relative to the size of this particular hand — so a child's hand and an
 * adult's read the same.
 */
function fingerCurl(frame: XRFrame, hand: XRHand, space: XRReferenceSpace, tip: XRHandJoint, size: number): number {
  const wrist = hand.get("wrist");
  const tipSpace = hand.get(tip);
  if (!wrist || !tipSpace || !frame.getJointPose) return 0;
  const a = frame.getJointPose(wrist, space);
  const b = frame.getJointPose(tipSpace, space);
  if (!a || !b) return 0;
  scratchA.set(a.transform.position.x, a.transform.position.y, a.transform.position.z);
  scratchB.set(b.transform.position.x, b.transform.position.y, b.transform.position.z);
  const distance = scratchA.distanceTo(scratchB);
  const open = size * 2.0;
  const closed = size * 0.9;
  return THREE.MathUtils.clamp((open - distance) / (open - closed), 0, 1);
}

function readHand(
  frame: XRFrame,
  source: XRInputSource,
  space: XRReferenceSpace,
  origin: THREE.Object3D,
  out: XrHandSample
): void {
  const side = source.handedness === "left" ? "left" : "right";

  if (source.hand && frame.getJointPose) {
    const wrist = source.hand.get("wrist");
    const knuckle = source.hand.get("middle-finger-phalanx-proximal");
    const wristPose = wrist ? frame.getJointPose(wrist, space) : undefined;
    if (!wristPose) return;
    scratchLocal.fromArray(wristPose.transform.matrix);
    composeWorld(origin, scratchLocal, out.position, out.quaternion);
    // Hand size, for normalising curl: wrist to the middle knuckle.
    const knucklePose = knuckle ? frame.getJointPose(knuckle, space) : undefined;
    let size = 0.09;
    if (knucklePose) {
      scratchA.set(wristPose.transform.position.x, wristPose.transform.position.y, wristPose.transform.position.z);
      scratchB.set(knucklePose.transform.position.x, knucklePose.transform.position.y, knucklePose.transform.position.z);
      size = Math.max(0.05, scratchA.distanceTo(scratchB));
    }
    out.curl[0] = fingerCurl(frame, source.hand, space, "index-finger-tip", size);
    out.curl[1] =
      (fingerCurl(frame, source.hand, space, "middle-finger-tip", size) +
        fingerCurl(frame, source.hand, space, "ring-finger-tip", size) +
        fingerCurl(frame, source.hand, space, "pinky-finger-tip", size)) /
      3;
    out.articulated = true;
    out.active = true;
    return;
  }

  if (!source.gripSpace) return;
  const gripPose = frame.getPose(source.gripSpace, space);
  if (!gripPose) return;
  scratchLocal.fromArray(gripPose.transform.matrix);
  composeWorld(origin, scratchLocal, out.position, out.quaternion);
  out.quaternion.multiply(GRIP_TO_HAND[side]);
  // Back from the palm to the wrist, along the hand's own forward axis.
  scratchVector.set(0, 0, 1).applyQuaternion(out.quaternion);
  out.position.addScaledVector(scratchVector, GRIP_TO_WRIST);
  const trigger = source.gamepad?.buttons[0]?.value ?? 0;
  const squeeze = source.gamepad?.buttons[1]?.value ?? 0;
  out.curl[0] = HELD_INDEX_CURL + (1 - HELD_INDEX_CURL) * trigger;
  out.curl[1] = HELD_GRIP_CURL + (1 - HELD_GRIP_CURL) * squeeze;
  out.articulated = false;
  out.active = true;
}

/**
 * Fills `out` with this frame's head and hands. Returns false when there
 * is no session, no origin, or no reference space yet — the first frames of
 * a session, mostly.
 */
export function readXrBody(gl: THREE.WebGLRenderer, frame: XRFrame, out: XrBodySample): boolean {
  const camera = gl.xr.getCamera();
  const origin = camera.parent;
  const space = gl.xr.getReferenceSpace();
  if (!origin || !space) return false;
  origin.updateWorldMatrix(true, false);

  camera.updateMatrix();
  composeWorld(origin, camera.matrix, out.head.position, out.head.quaternion);
  out.head.heightAboveFloor = camera.position.y;

  out.left.active = false;
  out.right.active = false;
  for (const source of frame.session.inputSources) {
    if (source.handedness === "left") readHand(frame, source, space, origin, out.left);
    else if (source.handedness === "right") readHand(frame, source, space, origin, out.right);
  }
  return true;
}

/**
 * Just the head, fresh, for code that only needs to know where the player
 * is standing (PlayerRig's collision and seating). Same composition as
 * readXrBody.
 */
export function readXrHead(gl: THREE.WebGLRenderer, position: THREE.Vector3, quaternion: THREE.Quaternion): boolean {
  const camera = gl.xr.getCamera();
  const origin = camera.parent;
  if (!origin) return false;
  origin.updateWorldMatrix(true, false);
  camera.updateMatrix();
  composeWorld(origin, camera.matrix, position, quaternion);
  return true;
}
