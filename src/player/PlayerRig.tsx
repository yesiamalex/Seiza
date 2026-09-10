import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { useXR, useXRControllerLocomotion, XROrigin } from "@react-three/xr";
import * as THREE from "three";
import type { TouchMoveInput } from "./touchInput";

export type ViewMode = "first" | "third";

const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 3.2; // meters/second
const RUN_MULTIPLIER = 1.9; // hold Shift
// Keeps players inside BaseEnvironment's walls. No real collision/physics
// in this scaffold — a radius clamp is the simplest thing that stops
// people walking through walls, not a substitute for real collision.
const BOUNDS_RADIUS = 18;

const THIRD_PERSON_MIN_DISTANCE = 1.5;
const THIRD_PERSON_MAX_DISTANCE = 8;
const THIRD_PERSON_DEFAULT_DISTANCE = 3.5;
const THIRD_PERSON_HEIGHT_OFFSET = 0.5;
const FOV_MIN = 50;
const FOV_MAX = 90;
const FOV_DEFAULT = 75;
const ZOOM_WHEEL_SENSITIVITY = 0.0035;
const MOVE_TARGET_ARRIVE_DISTANCE = 0.25;
const JUMP_SPEED = 5; // initial upward velocity, m/s
const GRAVITY = 14; // m/s^2
const GROUNDED_EPSILON = 0.01;
const DRAG_LOOK_SENSITIVITY = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.05;

interface PlayerRigProps {
  spawnPoint: [number, number, number];
  positionRef: MutableRefObject<[number, number, number]>;
  rotationRef: MutableRefObject<number>;
  /** Disable while an edit-mode text input has focus, so the mouse cursor
   *  is free for dragging transform gizmos instead of being captured for
   *  look-around. Desktop-only; doesn't affect VR locomotion. */
  pointerLockEnabled?: boolean;
  viewMode: ViewMode;
  /** Set by a floor click (see Scene.tsx's onFloorClick / App.tsx) to
   *  walk the player there automatically; cleared on arrival or as soon
   *  as WASD is pressed, whichever comes first. Third-person only — see
   *  the click handler wiring in App.tsx for why. */
  moveTargetRef: MutableRefObject<THREE.Vector3 | null>;
  /** Remaining navmesh waypoints after `moveTargetRef`, consumed in
   *  order as each is reached (see src/nav/useNavMesh.ts). Empty/absent
   *  means "walk straight at the target", the pre-navmesh behavior. */
  movePathRef?: MutableRefObject<THREE.Vector3[] | null>;
  /** On-screen D-pad / jump state for touch devices — see
   *  TouchControls.tsx. Read every frame alongside the keyboard so both
   *  input paths drive exactly the same movement code. */
  touchInputRef?: MutableRefObject<TouchMoveInput>;
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
 * Owns local movement: desktop WASD + mouse-look (pointer lock) with a
 * first/third-person toggle and scroll-wheel zoom, VR thumbstick
 * locomotion via the XR origin. Both paths write into
 * positionRef/rotationRef every frame — App.tsx's existing network-sync
 * loop reads those refs, and `children` (the local avatar) is rendered
 * inside a group kept in lockstep with whichever locomotion path is
 * active, so it moves along for free.
 *
 * First/third person is implemented by decoupling "the player's actual
 * transform" from "what the render camera shows": a detached,
 * never-rendered virtualCamera holds position + look direction, driven
 * by PointerLockControls in first person or click-drag in third person,
 * and the real render camera is derived from it each frame — identical
 * to it in first person, offset behind it in third person.
 * positionRef/rotationRef always reflect the virtual camera (the real
 * player transform), never the visually-offset third-person view, so
 * other players always see you where you actually are regardless of
 * which camera mode you're locally using.
 */
export function PlayerRig({
  spawnPoint,
  positionRef,
  rotationRef,
  pointerLockEnabled = true,
  viewMode,
  moveTargetRef,
  movePathRef,
  touchInputRef,
  children,
}: PlayerRigProps) {
  const { camera, gl } = useThree();
  const isPresenting = useXR((s) => s.session != null);
  const keysRef = useRef<Record<string, boolean>>({});
  const rigRef = useRef<THREE.Group>(null);
  const xrOriginRef = useRef<THREE.Group>(null);
  const virtualCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  if (!virtualCameraRef.current) virtualCameraRef.current = new THREE.PerspectiveCamera();
  const thirdPersonDistanceRef = useRef(THIRD_PERSON_DEFAULT_DISTANCE);
  const verticalVelocityRef = useRef(0);
  const groundEyeY = spawnPoint[1] + EYE_HEIGHT;

  useEffect(() => {
    virtualCameraRef.current!.position.set(spawnPoint[0], spawnPoint[1] + EYE_HEIGHT, spawnPoint[2]);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = FOV_DEFAULT;
      camera.updateProjectionMatrix();
    }
    // Only meant to run once, at mount, to place the camera at spawn —
    // re-running on spawnPoint identity changes would yank the camera
    // out from under a player mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Ignore key events aimed at a text input (e.g. EditToolbar's paste-a-
    // model-URL field, or the chat box) — otherwise typing "s" there also
    // walks the player backward via the global listener below.
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      keysRef.current[e.code] = true;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        // Manual input cancels an in-progress click-to-move, including
        // any remaining navmesh waypoints — otherwise releasing WASD
        // would resume walking the old route.
        moveTargetRef.current = null;
        if (movePathRef) movePathRef.current = null;
      }
      if (e.code === "Space") {
        e.preventDefault(); // Space otherwise scrolls the page when nothing else has focus
        const vcam = virtualCameraRef.current!;
        if (vcam.position.y <= groundEyeY + GROUNDED_EPSILON) {
          verticalVelocityRef.current = JUMP_SPEED;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => (keysRef.current[e.code] = false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [moveTargetRef, movePathRef]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (viewMode === "third") {
        thirdPersonDistanceRef.current = THREE.MathUtils.clamp(
          thirdPersonDistanceRef.current + e.deltaY * ZOOM_WHEEL_SENSITIVITY * 4,
          THIRD_PERSON_MIN_DISTANCE,
          THIRD_PERSON_MAX_DISTANCE
        );
      } else if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * ZOOM_WHEEL_SENSITIVITY * 20, FOV_MIN, FOV_MAX);
        camera.updateProjectionMatrix();
      }
    };
    const el = gl.domElement;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [viewMode, camera, gl]);

  // Third person deliberately does NOT use pointer lock — capturing the
  // cursor and driving the view from every raw mouse movement fights
  // with the actual point of third person (look at/inspect your own
  // avatar, click HUD buttons, click the floor to move) the same way it
  // would in FrameVR. Instead: click-drag orbits the view and the cursor
  // stays free otherwise. First person keeps pointer lock — that one IS
  // meant to behave like a classic FPS look, and is desktop-only in
  // practice (Pointer Lock isn't available on mobile browsers, which is
  // why App.tsx starts touch devices in third person).
  useEffect(() => {
    if (viewMode !== "third" || !pointerLockEnabled) return;
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    // Without this the browser claims touch drags for scrolling/zooming
    // and the look-drag never gets pointermove events on mobile.
    const previousTouchAction = el.style.touchAction;
    el.style.touchAction = "none";

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      // Deltas are measured from clientX/clientY rather than
      // movementX/movementY: the latter is only dependable for mouse
      // input — touch pointers report 0 on some browsers (notably iOS
      // Safari), which silently made drag-to-look do nothing on phones.
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const vcam = virtualCameraRef.current!;
      const euler = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ");
      euler.y -= dx * DRAG_LOOK_SENSITIVITY;
      euler.x = THREE.MathUtils.clamp(euler.x - dy * DRAG_LOOK_SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
      vcam.quaternion.setFromEuler(euler);
    };
    const endDrag = (e: PointerEvent) => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    return () => {
      el.style.touchAction = previousTouchAction;
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
    };
  }, [viewMode, pointerLockEnabled, gl]);

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

    const vcam = virtualCameraRef.current!;
    const keys = keysRef.current;
    const forward = new THREE.Vector3();
    vcam.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, vcam.up).normalize();

    const touch = touchInputRef?.current;
    const move = new THREE.Vector3();
    if (keys.KeyW || keys.ArrowUp) move.add(forward);
    if (keys.KeyS || keys.ArrowDown) move.sub(forward);
    if (keys.KeyD || keys.ArrowRight) move.add(right);
    if (keys.KeyA || keys.ArrowLeft) move.sub(right);
    if (touch) {
      if (touch.y !== 0) move.addScaledVector(forward, touch.y);
      if (touch.x !== 0) move.addScaledVector(right, touch.x);
      if (touch.jumpRequested) {
        touch.jumpRequested = false; // consume — one press, one jump
        if (vcam.position.y <= groundEyeY + GROUNDED_EPSILON) {
          verticalVelocityRef.current = JUMP_SPEED;
        }
      }
      // Any on-screen movement cancels an in-progress tap-to-walk, same
      // as WASD does — otherwise the two fight over the player.
      if (touch.x !== 0 || touch.y !== 0) {
        moveTargetRef.current = null;
        if (movePathRef) movePathRef.current = null;
      }
    }
    const running = !!(keys.ShiftLeft || keys.ShiftRight) || !!touch?.running;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * (running ? RUN_MULTIPLIER : 1) * delta);
      vcam.position.add(move);
    } else if (viewMode === "third" && moveTargetRef.current) {
      const target = moveTargetRef.current;
      const toTarget = new THREE.Vector3(target.x - vcam.position.x, 0, target.z - vcam.position.z);
      const dist = toTarget.length();
      if (dist < MOVE_TARGET_ARRIVE_DISTANCE) {
        // Reached this waypoint — advance along the navmesh path, or
        // stop if that was the last one (or there was no path at all and
        // this was a plain straight-line target).
        const nextWaypoint = movePathRef?.current?.shift() ?? null;
        moveTargetRef.current = nextWaypoint;
      } else {
        toTarget.normalize();
        vcam.position.addScaledVector(toTarget, MOVE_SPEED * delta);
      }
    }
    clampToBounds(vcam.position);

    // Gravity/jump — applied every frame (not just while airborne) so
    // landing back on a flat floor (the only terrain this scaffold has —
    // see BOUNDS_RADIUS's own note about no real collision) is a clean
    // clamp back to groundEyeY rather than needing separate ground-detection.
    verticalVelocityRef.current -= GRAVITY * delta;
    vcam.position.y += verticalVelocityRef.current * delta;
    if (vcam.position.y <= groundEyeY) {
      vcam.position.y = groundEyeY;
      verticalVelocityRef.current = 0;
    }

    const yaw = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ").y;
    positionRef.current = [vcam.position.x, vcam.position.y - EYE_HEIGHT, vcam.position.z];
    rotationRef.current = yaw;

    if (viewMode === "third") {
      const behind = new THREE.Vector3(0, 0, thirdPersonDistanceRef.current).applyQuaternion(vcam.quaternion);
      camera.position.copy(vcam.position).add(behind);
      camera.position.y += THIRD_PERSON_HEIGHT_OFFSET;
      camera.quaternion.copy(vcam.quaternion);
    } else {
      camera.position.copy(vcam.position);
      camera.quaternion.copy(vcam.quaternion);
    }

    if (rigRef.current) {
      rigRef.current.position.set(positionRef.current[0], positionRef.current[1], positionRef.current[2]);
      rigRef.current.rotation.set(0, yaw, 0);
    }
  });

  return (
    <>
      {/* First person only — see the drag-to-orbit effect above for why
          third person doesn't use this. Fully unmounted (not just
          `enabled={false}`) while editing: drei's PointerLockControls
          attaches a global `click` -> `.lock()` listener in an effect
          that doesn't depend on its `enabled` prop at all, so toggling
          `enabled` alone still re-captured the cursor on every click in
          edit mode — the opposite of what edit mode needs (a free
          cursor to click/drag objects). Unmounting removes that
          listener entirely instead of trying to out-race it. */}
      {!isPresenting && viewMode === "first" && pointerLockEnabled && <PointerLockControls camera={virtualCameraRef.current} />}
      <XROrigin ref={xrOriginRef} position={spawnPoint} />
      {/* Own avatar body: hidden in VR and in first person (the camera
          sits at/inside the head in both cases — clipping and a jarring
          view of the inside of your own head), shown in third person,
          where it's the whole point. */}
      <group ref={rigRef} visible={!isPresenting && viewMode === "third"}>
        {children}
      </group>
    </>
  );
}
