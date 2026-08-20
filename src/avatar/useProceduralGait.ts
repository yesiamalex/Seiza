import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM, VRMHumanBoneName, VRMHumanoid } from "@pixiv/three-vrm";

// No walk/run animation clip is bundled here — per THIRD_PARTY_ASSETS.md,
// nothing gets committed to this repo without a verified,
// redistribution-clear license, and "an open-source universal-rig mocap
// walk cycle" is exactly the kind of asset that needs that per-file
// diligence before it can be bundled. Until that's done for a real clip
// (the same way gestures are meant to be sourced — see
// src/avatar/gestures.ts), this is a procedural stand-in: simple sine-wave
// limb swing driven by observed movement speed, using VRM's *normalized*
// humanoid bones specifically so it works on any uploaded avatar
// regardless of the source rig's original bone axes (the same reason
// GestureController.tsx plays VRMA clips against normalized bones).
//
// Caveat: the swing direction/axis below was chosen from the VRM
// normalized-rig convention (rest pose = T-pose, arms out) but hasn't
// been visually verified against a real uploaded VRM in a running
// browser. If a limb appears to swing backward or through itself on a
// real avatar, flip the sign on the relevant SWING_* constant — the
// values are deliberately small so a wrong sign is a subtle glitch, not
// a broken-looking pose.

const CYCLE_SPEED = 7; // radians of gait phase per second, at speed ~2 m/s
const LEG_SWING = 0.5; // radians
const ARM_SWING = 0.3; // radians
const MAX_REFERENCE_SPEED = 5; // m/s — amplitude saturates at/above this
const IDLE_SPEED_THRESHOLD = 0.05; // m/s below which we call it "not moving"
const SPEED_SMOOTHING = 4; // higher = snappier speed estimate, lower = smoother

/**
 * Applies a procedural walk/run cycle to a VRM's leg/arm bones, scaled by
 * how fast `getPosition()` is actually changing — not by a networked
 * "isRunning" flag, so it works identically for the local player (whose
 * position updates every frame) and remote players (whose position only
 * updates when a "playerUpdated" message arrives, ~every 200ms — the
 * speed estimate is smoothed specifically to stay stable across that
 * gap). Set `suppressed` while a discrete gesture (bow/wave/etc, see
 * GestureController) is playing, so the two don't fight over the same
 * bones.
 */
export function useProceduralGait(vrm: VRM | null, getPosition: () => [number, number, number], suppressed: boolean) {
  const prevPosRef = useRef<[number, number, number] | null>(null);
  const speedRef = useRef(0);
  const phaseRef = useRef(0);
  const settledRef = useRef(true);

  useFrame((_, delta) => {
    const humanoid = vrm?.humanoid;
    if (!humanoid || delta <= 0) return;

    const pos = getPosition();
    if (prevPosRef.current) {
      const dx = pos[0] - prevPosRef.current[0];
      const dz = pos[2] - prevPosRef.current[2];
      const instantSpeed = Math.sqrt(dx * dx + dz * dz) / delta;
      speedRef.current = THREE.MathUtils.lerp(speedRef.current, instantSpeed, Math.min(1, delta * SPEED_SMOOTHING));
    }
    prevPosRef.current = pos;

    if (suppressed) return;

    const speed = speedRef.current;
    if (speed < IDLE_SPEED_THRESHOLD) {
      if (!settledRef.current) {
        resetBone(humanoid, "leftUpperLeg");
        resetBone(humanoid, "rightUpperLeg");
        resetBone(humanoid, "leftUpperArm");
        resetBone(humanoid, "rightUpperArm");
        phaseRef.current = 0;
        settledRef.current = true;
      }
      return;
    }
    settledRef.current = false;

    const amplitude = Math.min(1, speed / MAX_REFERENCE_SPEED);
    phaseRef.current += delta * CYCLE_SPEED * (0.6 + amplitude);
    const swing = Math.sin(phaseRef.current);

    setBoneSwing(humanoid, "leftUpperLeg", swing * LEG_SWING * amplitude);
    setBoneSwing(humanoid, "rightUpperLeg", -swing * LEG_SWING * amplitude);
    setBoneSwing(humanoid, "leftUpperArm", -swing * ARM_SWING * amplitude);
    setBoneSwing(humanoid, "rightUpperArm", swing * ARM_SWING * amplitude);
  });
}

function setBoneSwing(humanoid: VRMHumanoid, name: VRMHumanBoneName, angle: number) {
  const node = humanoid.getNormalizedBoneNode(name);
  if (node) node.rotation.x = angle;
}

function resetBone(humanoid: VRMHumanoid, name: VRMHumanBoneName) {
  const node = humanoid.getNormalizedBoneNode(name);
  if (node) node.rotation.x = 0;
}
