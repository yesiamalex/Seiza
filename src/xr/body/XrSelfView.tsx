import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { VRMFirstPerson, type VRM } from "@pixiv/three-vrm";
import { createBodyRig } from "./bodyIk";
import { trackingStore } from "./trackingStore";

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

/**
 * Lets a headset player see their own body: hands where their hands are,
 * and no inside of their own face.
 *
 * Three pieces, all scoped to the local avatar:
 * - the avatar's head goes on a layer the XR camera doesn't draw (and the
 *   flat-screen camera does, so third person on desktop is unchanged);
 * - in a session, the avatar is rescaled so its eyes are at the player's
 *   real eye height — otherwise a 1.85m player in a 1.45m avatar would see
 *   their virtual hands land short of their real ones;
 * - the visibility itself is PlayerRig's, which draws the local avatar in
 *   VR as well as in third person.
 *
 * What other people see is untouched: their copy of this avatar is a
 * separate instance, at its own size, with its head where it belongs.
 */
export function XrSelfView({ vrm }: { vrm: VRM | null }) {
  const presenting = useXR((state) => state.session != null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const eyeHeight = useMemo(() => (vrm ? createBodyRig(vrm)?.eyeHeight ?? null : null), [vrm]);
  const fitRef = useRef(1);

  useEffect(() => {
    if (vrm) prepareFirstPerson(vrm);
  }, [vrm]);

  // Outside a session r3f's camera is the ordinary one; it has to keep
  // seeing the head that prepareFirstPerson moved off the default layer.
  useEffect(() => {
    if (!presenting) camera.layers.enable(THIRD_PERSON_ONLY);
  }, [camera, presenting]);

  useEffect(() => {
    if (!presenting) return;
    const xrCamera = gl.xr.getCamera();
    xrCamera.layers.enable(FIRST_PERSON_ONLY);
    xrCamera.layers.disable(THIRD_PERSON_ONLY);
  }, [presenting, gl]);

  useFrame((_, delta) => {
    if (!vrm || !eyeHeight) return;
    const standingEye = trackingStore.getLocalStandingEye();
    const target = presenting && standingEye > 0 ? THREE.MathUtils.clamp(standingEye / eyeHeight, MIN_FIT, MAX_FIT) : 1;
    // Eased: the standing measurement climbs over the first moments of a
    // session, and a body visibly growing in steps is worse than one
    // settling.
    fitRef.current += (target - fitRef.current) * (1 - Math.exp(-4 * Math.min(delta, 0.1)));
    if (Math.abs(fitRef.current - target) < 1e-4) fitRef.current = target;
    vrm.scene.scale.setScalar(fitRef.current);
  });

  return null;
}
