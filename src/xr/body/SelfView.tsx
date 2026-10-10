import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { createBodyRig } from "./bodyIk";
import { trackingStore } from "./trackingStore";
import { selfViewStore } from "./selfViewStore";

/** How far the self-view may rescale an avatar to fit its owner. Beyond
 *  this the avatar has stopped being the one they chose. */
const MIN_FIT = 0.75;
const MAX_FIT = 1.35;
const IDENTITY = new THREE.Quaternion();

/** Not zero: a singular bone matrix turns lighting and spring bones to NaN. */
const HIDDEN_SCALE = 1e-3;
/** Head turns below this are idling and breathing, not a gesture, and the
 *  view shouldn't sway with them. */
const TURN_DEADZONE = 0.1;
/** How quickly the camera catches up with the eye: almost at once when
 *  standing, so seiza and bows track closely, and slowly at running speed,
 *  so a run's bouncing head doesn't bounce the view (it did, and it was
 *  dizzying). Per second. */
const EYE_FOLLOW_STILL = 25;
const EYE_FOLLOW_MOVING = 2.5;
/** Ground speed at which the slow rate applies fully: a walk. */
const FOLLOW_SLOW_SPEED = 3;
/** How much of the head's turn survives at that speed: a run's nodding
 *  head shouldn't nod the view. */
const MOVING_TURN_SHARE = 0.2;

/** The first-person near plane on a screen. The default clips your own
 *  shoulders and hands, which are closer to your eyes than anything else. */
const SELF_VIEW_NEAR = 0.04;

/**
 * Lets you see your own body in first person, on a screen or in VR, with
 * no inside of your own head in the way.
 *
 * - The head and neck are hidden by shrinking the neck bone to nothing
 *   for the frames they're drawn, much as VRChat does it. Everything
 *   weighted to them (face, hair, a hood, a collar) folds into the base of
 *   the neck instead of being cut off, so there are no torn edges and no
 *   open collar to look down into. The scale is undone before the next
 *   animation update, so spring bones never see it.
 * - On a screen the camera goes where the avatar's eyes are, measured
 *   each frame (PlayerRig reads selfViewStore), and turns as the head
 *   does. It kneels into seiza with the body instead of ahead of it, dips
 *   with a bow, and nods, shakes, and glances with the gestures.
 * - In VR the headset is the camera, so instead the avatar is rescaled to
 *   put its eyes at the player's real eye height: a 1.85m player in a
 *   1.45m avatar would otherwise see their virtual hands land short of
 *   their real ones.
 *
 * What other people see is untouched: their copy of this avatar is a
 * separate instance, at its own size, with its head where it belongs.
 */
export function SelfView({ vrm, firstPerson }: { vrm: VRM | null; firstPerson: boolean }) {
  const presenting = useXR((state) => state.session != null);
  const camera = useThree((state) => state.camera);
  const rig = useMemo(() => (vrm ? createBodyRig(vrm) : null), [vrm]);
  const fitRef = useRef(1);
  const hideHead = firstPerson || presenting;
  const hideHeadRef = useRef(hideHead);
  hideHeadRef.current = hideHead;
  const screenFirstPerson = firstPerson && !presenting;
  const scratch = useMemo(
    () => ({
      parentQuat: new THREE.Quaternion(),
      restQuat: new THREE.Quaternion(),
      eye: new THREE.Vector3(),
      turn: new THREE.Quaternion(),
      groundPos: new THREE.Vector3(),
      lastGroundPos: null as THREE.Vector3 | null,
      speed: 0,
    }),
    []
  );

  useEffect(() => () => {
    selfViewStore.valid = false;
  }, []);

  useEffect(() => {
    if (!screenFirstPerson || !(camera instanceof THREE.PerspectiveCamera)) return;
    const near = camera.near;
    camera.near = SELF_VIEW_NEAR;
    camera.updateProjectionMatrix();
    return () => {
      camera.near = near;
      camera.updateProjectionMatrix();
    };
  }, [camera, screenFirstPerson]);

  const hiddenBone = () => vrm?.humanoid.getRawBoneNode("neck") ?? vrm?.humanoid.getRawBoneNode("head");

  // First, before VrmAvatar's update: put the head back for the animation
  // and spring bones, and measure the pose that is about to be drawn. The
  // normalized bones still hold it here — the clips write the next one
  // later this frame, and VrmAvatar copies it to the mesh a frame later.
  useFrame((_, frameDelta) => {
    hiddenBone()?.scale.setScalar(1);
    const head = vrm?.humanoid.getNormalizedBoneNode("head");
    const parent = vrm?.scene.parent;
    if (!vrm || !rig || !head || !parent) {
      selfViewStore.valid = false;
      scratch.lastGroundPos = null;
      return;
    }
    head.updateWorldMatrix(true, false);
    const eye = head.localToWorld(scratch.eye.copy(rig.eyeOffset));
    parent.worldToLocal(eye);

    // The head's turn away from rest, in the group's space. Normalized
    // bones rest at identity in the model's space, so the head's rotation
    // in the group is facing·pose, and facing·pose·facing⁻¹ is the pose's
    // turn as seen from the group. The local avatar's head is never given
    // the look pitch (the camera has that already), so all of it is
    // animation.
    const turn = head.getWorldQuaternion(scratch.turn);
    turn.premultiply(parent.getWorldQuaternion(scratch.parentQuat).invert());
    turn.multiply(scratch.restQuat.copy(vrm.scene.quaternion).invert());
    const angle = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
    turn.slerp(IDENTITY, angle > TURN_DEADZONE ? TURN_DEADZONE / angle : 1);

    // Ground speed, from how far the avatar moved since last frame.
    const delta = Math.min(frameDelta, 0.1);
    parent.getWorldPosition(scratch.groundPos).setY(0);
    if (scratch.lastGroundPos && delta > 0) {
      const speed = scratch.groundPos.distanceTo(scratch.lastGroundPos) / delta;
      // A teleport is one frame's huge "speed"; ignore it.
      if (speed < 20) scratch.speed = THREE.MathUtils.damp(scratch.speed, speed, 8, delta);
    }
    scratch.lastGroundPos = (scratch.lastGroundPos ?? new THREE.Vector3()).copy(scratch.groundPos);
    const moving = THREE.MathUtils.clamp(scratch.speed / FOLLOW_SLOW_SPEED, 0, 1);
    turn.slerp(IDENTITY, moving * (1 - MOVING_TURN_SHARE));

    if (!selfViewStore.valid) {
      selfViewStore.eye.copy(eye);
      selfViewStore.turn.copy(turn);
    } else {
      const follow = 1 - Math.exp(-THREE.MathUtils.lerp(EYE_FOLLOW_STILL, EYE_FOLLOW_MOVING, moving) * delta);
      selfViewStore.eye.lerp(eye, follow);
      selfViewStore.turn.slerp(turn, follow);
    }
    selfViewStore.valid = true;
  }, -1);

  useFrame((_, delta) => {
    if (!vrm || !rig) return;
    // After VrmAvatar's update, so it lasts through this frame's render.
    if (hideHeadRef.current) hiddenBone()?.scale.setScalar(HIDDEN_SCALE);

    const standingEye = presenting ? trackingStore.getLocalStandingEye() : 0;
    const target = standingEye > 0 ? THREE.MathUtils.clamp(standingEye / rig.eyeHeight, MIN_FIT, MAX_FIT) : 1;
    // Eased: the standing measurement climbs over the first moments of a
    // session, and a body visibly growing in steps is worse than one
    // settling.
    fitRef.current += (target - fitRef.current) * (1 - Math.exp(-4 * Math.min(delta, 0.1)));
    if (Math.abs(fitRef.current - target) < 1e-4) fitRef.current = target;
    vrm.scene.scale.setScalar(fitRef.current);
  });

  return null;
}
