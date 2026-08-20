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
// IMPORTANT: rotation.x=0 on a normalized bone is NOT "arms relaxed at
// your sides" — it's literal T-pose (see applyTPose.ts, which hit this
// same fact from the other direction). An earlier version of this file
// swung around, and idle-reset to, rotation.x=0 directly, which forced
// the avatar into a T-pose-like stance whenever standing still, and
// visibly snapped between that and the walk cycle's own zero-anchored
// swing the instant movement started/stopped — a discontinuity that also
// made spring-bone physics (hair, skirts) overreact. Fixed by capturing
// each bone's own natural rest rotation once (from the file as loaded,
// before this hook ever touches it) and blending continuously around
// THAT baseline instead of zero, with amplitude fading smoothly rather
// than switching between two hand-written states.
//
// Caveat that's still unresolved: the swing direction/axis was chosen
// from the VRM normalized-rig convention but hasn't been visually
// verified against a real uploaded VRM. If a limb swings backward or
// through itself, flip the sign on the relevant SWING constant.

const CYCLE_SPEED = 7; // radians of gait phase per second, at speed ~2 m/s
const LEG_SWING = 0.5; // radians
const ARM_SWING = 0.3; // radians
const MAX_REFERENCE_SPEED = 5; // m/s — amplitude saturates at/above this
const AMPLITUDE_RAMP_START = 0.15; // m/s — below this, amplitude is 0
const SPEED_SMOOTHING = 4; // higher = snappier speed estimate, lower = smoother
const GAIT_BONES: VRMHumanBoneName[] = ["leftUpperLeg", "rightUpperLeg", "leftUpperArm", "rightUpperArm"];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

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
  const restRotationsRef = useRef<Map<VRMHumanBoneName, number> | null>(null);
  const capturedForRef = useRef<VRM | null>(null);

  useFrame((_, delta) => {
    const humanoid = vrm?.humanoid;
    if (!humanoid || delta <= 0) return;

    if (capturedForRef.current !== vrm) {
      const rests = new Map<VRMHumanBoneName, number>();
      for (const name of GAIT_BONES) {
        rests.set(name, humanoid.getNormalizedBoneNode(name)?.rotation.x ?? 0);
      }
      restRotationsRef.current = rests;
      capturedForRef.current = vrm;
    }
    const rests = restRotationsRef.current!;

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
    // Continuous amplitude (0 well below walking speed, ramping smoothly
    // up to 1) rather than a hard idle/walking branch — the swing term
    // is `amplitude * sin(phase)`, so at amplitude 0 every bone just sits
    // at its own rest rotation with no snap to get there.
    const amplitude = smoothstep(AMPLITUDE_RAMP_START, MAX_REFERENCE_SPEED, speed);
    phaseRef.current += delta * CYCLE_SPEED * (0.6 + amplitude);
    const swing = Math.sin(phaseRef.current) * amplitude;

    setBoneRotation(humanoid, "leftUpperLeg", (rests.get("leftUpperLeg") ?? 0) + swing * LEG_SWING);
    setBoneRotation(humanoid, "rightUpperLeg", (rests.get("rightUpperLeg") ?? 0) - swing * LEG_SWING);
    setBoneRotation(humanoid, "leftUpperArm", (rests.get("leftUpperArm") ?? 0) - swing * ARM_SWING);
    setBoneRotation(humanoid, "rightUpperArm", (rests.get("rightUpperArm") ?? 0) + swing * ARM_SWING);
  });
}

function setBoneRotation(humanoid: VRMHumanoid, name: VRMHumanBoneName, angle: number) {
  const node = humanoid.getNormalizedBoneNode(name);
  if (node) node.rotation.x = angle;
}
