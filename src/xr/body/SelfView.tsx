import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { VRMFirstPerson, type VRM } from "@pixiv/three-vrm";
import { createBodyRig } from "./bodyIk";
import { trackingStore } from "./trackingStore";
import { EYE_HEIGHT } from "../../player/PlayerRig";

const FIRST_PERSON_ONLY = VRMFirstPerson.DEFAULT_FIRSTPERSON_ONLY_LAYER;
const THIRD_PERSON_ONLY = VRMFirstPerson.DEFAULT_THIRDPERSON_ONLY_LAYER;

/** How far the self-view may rescale an avatar to fit its owner. Beyond
 *  this the avatar has stopped being the one they chose. */
const MIN_FIT = 0.75;
const MAX_FIT = 1.35;

/**
 * Prepares a VRM so a camera inside its head can see the rest of it.
 *
 * Uploaded VRMs carry first-person annotations, and three-vrm's setup()
 * uses them to put a copy of the body *without* the head on one layer and
 * the head itself on another. Designer avatars are built in code and have
 * none, so for them the meshes hung under the head bone go to the
 * third-person layer directly — which is the same result, reached the
 * simple way their simple structure allows.
 */
function prepareFirstPerson(vrm: VRM) {
  if (vrm.firstPerson) {
    vrm.firstPerson.setup({ firstPersonOnlyLayer: FIRST_PERSON_ONLY, thirdPersonOnlyLayer: THIRD_PERSON_ONLY });
    return;
  }
  vrm.humanoid.getRawBoneNode("head")?.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) object.layers.set(THIRD_PERSON_ONLY);
  });
}

/** How much further back the body goes when you look straight down, so
 *  the camera clears the neck instead of looking down through it. */
const LOOK_DOWN_BACK = 0.1;

/**
 * Lets you see your own body in first person: hands where your hands are
 * in VR, your torso and feet below you on a flat screen, and no inside of
 * your own face in either.
 *
 * Scoped to the local avatar:
 * - the avatar's head goes on a layer the first-person camera doesn't draw
 *   (and the third-person camera does, so third person is unchanged);
 * - the avatar is rescaled so its eyes are at the camera's height: the
 *   player's real eye height in VR, otherwise a 1.85m player in a 1.45m
 *   avatar would see their virtual hands land short of their real ones,
 *   and the flat-screen eye height on a screen, otherwise a tall avatar
 *   would put the camera inside its neck;
 * - on a screen, the body sits back by the depth of its face, so the
 *   camera is where its eyes are rather than at the back of its head.
 *   (VR needs none of that: TrackedBody puts the head under the headset.)
 *
 * What other people see is untouched: their copy of this avatar is a
 * separate instance, at its own size, with its head where it belongs.
 */
export function SelfView({ vrm, firstPerson }: { vrm: VRM | null; firstPerson: boolean }) {
  const presenting = useXR((state) => state.session != null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const rig = useMemo(() => (vrm ? createBodyRig(vrm) : null), [vrm]);
  const fitRef = useRef(1);
  const screenFirstPerson = firstPerson && !presenting;

  useEffect(() => {
    if (vrm) prepareFirstPerson(vrm);
  }, [vrm]);

  // Outside a session r3f's camera is the ordinary one. In third person it
  // has to keep seeing the head that prepareFirstPerson moved off the
  // default layer; in first person it sees the headless body instead.
  useEffect(() => {
    if (presenting) return;
    if (screenFirstPerson) {
      camera.layers.enable(FIRST_PERSON_ONLY);
      camera.layers.disable(THIRD_PERSON_ONLY);
    } else {
      camera.layers.disable(FIRST_PERSON_ONLY);
      camera.layers.enable(THIRD_PERSON_ONLY);
    }
  }, [camera, presenting, screenFirstPerson]);

  useEffect(() => {
    if (!presenting) return;
    const xrCamera = gl.xr.getCamera();
    xrCamera.layers.enable(FIRST_PERSON_ONLY);
    xrCamera.layers.disable(THIRD_PERSON_ONLY);
  }, [presenting, gl]);

  const view = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    if (!vrm || !rig) return;
    if (presenting) {
      const standingEye = trackingStore.getLocalStandingEye();
      const target = standingEye > 0 ? THREE.MathUtils.clamp(standingEye / rig.eyeHeight, MIN_FIT, MAX_FIT) : 1;
      // Eased: the standing measurement climbs over the first moments of a
      // session, and a body visibly growing in steps is worse than one
      // settling.
      fitRef.current += (target - fitRef.current) * (1 - Math.exp(-4 * Math.min(delta, 0.1)));
      if (Math.abs(fitRef.current - target) < 1e-4) fitRef.current = target;
    } else {
      // A fixed target on a screen, so switching views simply snaps.
      fitRef.current = screenFirstPerson ? THREE.MathUtils.clamp(EYE_HEIGHT / rig.eyeHeight, MIN_FIT, MAX_FIT) : 1;
    }
    vrm.scene.scale.setScalar(fitRef.current);

    let back = 0;
    if (screenFirstPerson) {
      camera.getWorldDirection(view);
      back = rig.eyeForward * fitRef.current + LOOK_DOWN_BACK * Math.max(0, -view.y);
    }
    // Avatars face -Z in the group they're drawn in, so +Z is behind them.
    vrm.scene.position.z = back;
  });

  return null;
}
