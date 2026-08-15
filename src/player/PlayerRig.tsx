import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { useXR, useXRControllerLocomotion, XROrigin } from "@react-three/xr";
import * as THREE from "three";

const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 3.2; // meters/second
// Keeps players inside BaseEnvironment's walls. No real collision/physics
// in this scaffold — a radius clamp is the simplest thing that stops
// people walking through walls, not a substitute for real collision.
const BOUNDS_RADIUS = 18;

interface PlayerRigProps {
  spawnPoint: [number, number, number];
  positionRef: MutableRefObject<[number, number, number]>;
  rotationRef: MutableRefObject<number>;
  /** Disable while an edit-mode text input has focus, so the mouse cursor
   *  is free for dragging transform gizmos instead of being captured for
   *  look-around. Desktop-only; doesn't affect VR locomotion. */
  pointerLockEnabled?: boolean;
  children?: ReactNode;
}

function clampToBounds(v: THREE.Vector3) {
  const dist = Math.hypot(v.x, v.z);
  if (dist > BOUNDS_RADIUS) {
    const scale = BOUNDS_RADIUS / dist;
    v.x *= scale;
    v.z *= scale;
  }
}

/**
 * Owns local movement: desktop WASD + mouse-look (pointer lock) on the
 * main camera, VR thumbstick locomotion via the XR origin. Both paths
 * write into positionRef/rotationRef every frame — App.tsx's existing
 * network-sync loop reads those refs, and `children` (the local avatar)
 * is rendered inside a group that's kept in lockstep with whichever
 * locomotion path is active, so it moves along for free.
 */
export function PlayerRig({ spawnPoint, positionRef, rotationRef, pointerLockEnabled = true, children }: PlayerRigProps) {
  const { camera } = useThree();
  const isPresenting = useXR((s) => s.session != null);
  const keysRef = useRef<Record<string, boolean>>({});
  const rigRef = useRef<THREE.Group>(null);
  const xrOriginRef = useRef<THREE.Group>(null);

  useEffect(() => {
    camera.position.set(spawnPoint[0], spawnPoint[1] + EYE_HEIGHT, spawnPoint[2]);
    // Only meant to run once, at mount, to place the camera at spawn —
    // re-running on spawnPoint identity changes would yank the camera
    // out from under a player mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Ignore key events aimed at a text input (e.g. EditToolbar's paste-a-
    // model-URL field) — otherwise typing "s" there also walks the player
    // backward via the global listener below.
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      keysRef.current[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => (keysRef.current[e.code] = false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useXRControllerLocomotion(xrOriginRef, { speed: MOVE_SPEED * 0.6 });

  useFrame((_, delta) => {
    if (isPresenting) {
      const origin = xrOriginRef.current;
      if (!origin) return;
      clampToBounds(origin.position);
      positionRef.current = [origin.position.x, origin.position.y, origin.position.z];
      rotationRef.current = origin.rotation.y;
      return;
    }

    const keys = keysRef.current;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    const move = new THREE.Vector3();
    if (keys.KeyW || keys.ArrowUp) move.add(forward);
    if (keys.KeyS || keys.ArrowDown) move.sub(forward);
    if (keys.KeyD || keys.ArrowRight) move.add(right);
    if (keys.KeyA || keys.ArrowLeft) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * delta);
      camera.position.add(move);
    }
    clampToBounds(camera.position);

    const yaw = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ").y;
    positionRef.current = [camera.position.x, camera.position.y - EYE_HEIGHT, camera.position.z];
    rotationRef.current = yaw;

    if (rigRef.current) {
      rigRef.current.position.set(positionRef.current[0], positionRef.current[1], positionRef.current[2]);
      rigRef.current.rotation.set(0, yaw, 0);
    }
  });

  return (
    <>
      {!isPresenting && <PointerLockControls enabled={pointerLockEnabled} />}
      <XROrigin ref={xrOriginRef} position={spawnPoint} />
      {/* Own avatar body is hidden in VR (it would clip the first-person
          camera) but shown for desktop, where the camera sits outside it. */}
      <group ref={rigRef} visible={!isPresenting}>
        {children}
      </group>
    </>
  );
}
