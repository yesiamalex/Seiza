import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR, useXRControllerLocomotion, XROrigin } from "@react-three/xr";
import * as THREE from "three";
import type { TouchMoveInput } from "./touchInput";
import { clampToRooms, SEATED_EYE_HEIGHT } from "../scene/layout";

export type ViewMode = "first" | "third";

const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 3.2; // meters/second — matches the walk clip (AvatarAnimator.tsx)
const RUN_MULTIPLIER = 1.9; // hold Shift, or double-tap forward on the D-pad
// How fast a player slides onto a seat, and turns to face the way it faces.
const SIT_EASE_RATE = 9;
const SIT_TURN_RATE = 6;

const THIRD_PERSON_MIN_DISTANCE = 1.5;
const THIRD_PERSON_MAX_DISTANCE = 8;
const THIRD_PERSON_DEFAULT_DISTANCE = 3.5;
const THIRD_PERSON_HEIGHT_OFFSET = 0.5;
const FOV_MIN = 50;
const FOV_MAX = 90;
const FOV_DEFAULT = 75;
const WHEEL_ZOOM_SENSITIVITY = 0.014; // meters (third person) per wheel delta unit
const WHEEL_FOV_SENSITIVITY = 0.07; // degrees (first person) per wheel delta unit
const PINCH_ZOOM_SENSITIVITY = 0.02; // meters per pixel of pinch
const PINCH_FOV_SENSITIVITY = 0.12; // degrees per pixel of pinch
const MOVE_TARGET_ARRIVE_DISTANCE = 0.25;
const JUMP_SPEED = 5; // initial upward velocity, m/s
const GRAVITY = 14; // m/s^2
const GROUNDED_EPSILON = 0.01;
const MOUSE_LOOK_SENSITIVITY = 0.0025; // radians per pixel
const TOUCH_LOOK_SENSITIVITY = 0.0042; // fingers cover fewer pixels than a mouse sweep
const PITCH_LIMIT = Math.PI / 2 - 0.05;
// How quickly the avatar turns to face where it's walking (1/s). Turning
// smoothly instead of snapping to the camera is also what keeps spring-bone
// hair from whipping around every time the view is dragged.
const AVATAR_TURN_RATE = 12;

interface PlayerRigProps {
  spawnPoint: [number, number, number];
  positionRef: MutableRefObject<[number, number, number]>;
  /** The yaw other players see: the avatar's facing. In third person that
   *  follows movement direction; in first person it follows the view. */
  rotationRef: MutableRefObject<number>;
  /** The camera's yaw, e.g. for placing new objects in front of the view. */
  lookYawRef?: MutableRefObject<number>;
  /** In edit mode the left mouse button (and a single finger) belongs to
   *  selecting and dragging objects, so looking moves to the right or
   *  middle mouse button and a two-finger drag. */
  editMode?: boolean;
  viewMode: ViewMode;
  /** Set by a floor double-click/tap (Scene.tsx → App.tsx) to walk the
   *  player there; cleared on arrival or as soon as manual movement starts. */
  moveTargetRef: MutableRefObject<THREE.Vector3 | null>;
  /** Remaining navmesh waypoints after `moveTargetRef`, consumed in
   *  order as each is reached (see src/nav/useNavMesh.ts). Empty/absent
   *  means "walk straight at the target". */
  movePathRef?: MutableRefObject<THREE.Vector3[] | null>;
  /** On-screen D-pad / jump state for touch devices — see
   *  TouchControls.tsx. Read every frame alongside the keyboard so both
   *  input paths drive exactly the same movement code. */
  touchInputRef?: MutableRefObject<TouchMoveInput>;
  /** Seat the player is sitting on, or null when standing. While seated,
   *  movement input stands them up instead of walking. */
  sitAnchor?: { position: [number, number, number]; rotationY: number } | null;
  onStandUp?: () => void;
  children?: ReactNode;
}

function lerpAngle(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

/**
 * Owns local movement and the camera: WASD / D-pad / click-to-move, jump,
 * drag-to-look, scroll and pinch zoom, a first/third-person toggle, and VR
 * thumbstick locomotion via the XR origin.
 *
 * Looking is always click-and-drag (or touch-drag), the way FrameVR works.
 * There is no pointer lock anywhere: the cursor stays free for the HUD,
 * for double-clicking the floor to walk, and for edit-mode gizmos, and
 * the same code path works on phones, where pointer lock doesn't exist.
 *
 * A detached, never-rendered virtual camera holds the player's eye
 * position and look direction. The render camera is derived from it each
 * frame: identical in first person, pulled back behind it in third person.
 * positionRef always reflects the virtual camera (the real player
 * position), never the offset third-person view, so other players see you
 * where you actually are.
 */
export function PlayerRig({
  spawnPoint,
  positionRef,
  rotationRef,
  lookYawRef,
  editMode = false,
  viewMode,
  moveTargetRef,
  movePathRef,
  touchInputRef,
  sitAnchor = null,
  onStandUp,
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
  const avatarYawRef = useRef(0);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const sitAnchorRef = useRef(sitAnchor);
  sitAnchorRef.current = sitAnchor;
  const onStandUpRef = useRef(onStandUp);
  onStandUpRef.current = onStandUp;
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
    // Ignore key events aimed at a text input (e.g. the chat box) —
    // otherwise typing "s" there also walks the player backward.
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
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
        e.preventDefault(); // Space otherwise scrolls the page or re-clicks a focused button
        if (sitAnchorRef.current) {
          onStandUpRef.current?.();
          return;
        }
        const vcam = virtualCameraRef.current!;
        if (vcam.position.y <= groundEyeY + GROUNDED_EPSILON) {
          verticalVelocityRef.current = JUMP_SPEED;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => (keysRef.current[e.code] = false);
    // Releasing keys while the window is unfocused never fires keyup, which
    // left players walking forever after alt-tabbing mid-step.
    const onBlur = () => (keysRef.current = {});
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [moveTargetRef, movePathRef, groundEyeY]);

  // Look and zoom input. One pointer-event handler covers mouse, pen, and
  // touch; deltas come from clientX/clientY because movementX/Y reports 0
  // for touch on some browsers (notably iOS Safari).
  useEffect(() => {
    if (isPresenting) return;
    const el = gl.domElement;
    const previousTouchAction = el.style.touchAction;
    // Without this the browser claims touch drags for scrolling/zooming the
    // page and the canvas never sees pointermove on mobile.
    el.style.touchAction = "none";

    const zoom = (meters: number, degrees: number) => {
      if (viewModeRef.current === "third") {
        thirdPersonDistanceRef.current = THREE.MathUtils.clamp(
          thirdPersonDistanceRef.current + meters,
          THIRD_PERSON_MIN_DISTANCE,
          THIRD_PERSON_MAX_DISTANCE
        );
      } else if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.clamp(camera.fov + degrees, FOV_MIN, FOV_MAX);
        camera.updateProjectionMatrix();
      }
    };
    const look = (dx: number, dy: number, sensitivity: number) => {
      const vcam = virtualCameraRef.current!;
      const euler = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ");
      euler.y -= dx * sensitivity;
      euler.x = THREE.MathUtils.clamp(euler.x - dy * sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
      vcam.quaternion.setFromEuler(euler);
    };

    const pointers = new Map<number, { x: number; y: number; type: string }>();
    let lookPointer: number | null = null;
    let pinch: { distance: number; midX: number; midY: number } | null = null;

    const measurePinch = () => {
      const [a, b] = [...pointers.values()];
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
    };

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (e.pointerType === "mouse") {
        const isLookButton = editMode ? e.button === 1 || e.button === 2 : e.button === 0 || e.button === 1 || e.button === 2;
        if (!isLookButton) return;
        if (e.button === 1) e.preventDefault(); // middle-click autoscroll
        lookPointer = e.pointerId;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
        return;
      }
      if (pointers.size === 2) {
        lookPointer = null;
        pinch = measurePinch();
      } else if (pointers.size === 1 && !editMode) {
        lookPointer = e.pointerId;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const tracked = pointers.get(e.pointerId);
      if (!tracked) return;
      const dx = e.clientX - tracked.x;
      const dy = e.clientY - tracked.y;
      tracked.x = e.clientX;
      tracked.y = e.clientY;

      if (pinch && pointers.size >= 2) {
        const next = measurePinch();
        const spread = pinch.distance - next.distance; // fingers closing → zoom out
        zoom(spread * PINCH_ZOOM_SENSITIVITY, spread * PINCH_FOV_SENSITIVITY);
        // Two-finger drag looks around, which is the only touch look in
        // edit mode (one finger is for objects there).
        look(next.midX - pinch.midX, next.midY - pinch.midY, TOUCH_LOOK_SENSITIVITY);
        pinch = next;
        return;
      }
      if (lookPointer === e.pointerId) {
        look(dx, dy, tracked.type === "mouse" ? MOUSE_LOOK_SENSITIVITY : TOUCH_LOOK_SENSITIVITY);
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (lookPointer === e.pointerId) {
        lookPointer = null;
        el.style.cursor = "";
      }
      if (pointers.size < 2) pinch = null;
      // Lifting one finger of a pinch hands looking back to the other,
      // instead of making the player lift and re-press it.
      if (pointers.size === 1 && !editMode) {
        const [[id, remaining]] = [...pointers.entries()];
        if (remaining.type !== "mouse") lookPointer = id;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY * WHEEL_ZOOM_SENSITIVITY, e.deltaY * WHEEL_FOV_SENSITIVITY);
    };
    // Right-drag looks, so the browser menu must not pop up over it.
    const onContextMenu = (e: Event) => e.preventDefault();

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerEnd);
    el.addEventListener("pointercancel", onPointerEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      el.style.touchAction = previousTouchAction;
      el.style.cursor = "";
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerEnd);
      el.removeEventListener("pointercancel", onPointerEnd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [isPresenting, editMode, camera, gl]);

  useXRControllerLocomotion(xrOriginRef, { speed: MOVE_SPEED * 0.6 });

  useFrame((_, rawDelta) => {
    // A long hitch (tab in background) would otherwise launch the player
    // through the bounds or deep into the floor in a single step.
    const delta = Math.min(rawDelta, 0.1);

    if (isPresenting) {
      const origin = xrOriginRef.current;
      if (!origin) return;
      clampToRooms(origin.position);
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
    let jumpPressed = false;
    if (keys.KeyW || keys.ArrowUp) move.add(forward);
    if (keys.KeyS || keys.ArrowDown) move.sub(forward);
    if (keys.KeyD || keys.ArrowRight) move.add(right);
    if (keys.KeyA || keys.ArrowLeft) move.sub(right);
    if (touch) {
      if (touch.y !== 0) move.addScaledVector(forward, touch.y);
      if (touch.x !== 0) move.addScaledVector(right, touch.x);
      if (touch.jumpRequested) {
        touch.jumpRequested = false; // consume — one press, one jump
        jumpPressed = true;
        if (!sitAnchorRef.current && vcam.position.y <= groundEyeY + GROUNDED_EPSILON) {
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

    // Writes out everything downstream reads: the networked transform, the
    // render camera, and the group the local avatar is rendered in.
    const applyTransforms = (feetY: number) => {
      const lookYaw = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ").y;
      positionRef.current = [vcam.position.x, feetY, vcam.position.z];
      rotationRef.current = avatarYawRef.current;
      if (lookYawRef) lookYawRef.current = lookYaw;

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
        rigRef.current.rotation.set(0, avatarYawRef.current, 0);
      }
      return lookYaw;
    };

    // Seated: hold the player on the chair until they ask to get up. Any
    // movement input is that request, which is also why sitting can't trap
    // anyone — there's no "stand up" button to find first.
    const sit = sitAnchorRef.current;
    if (sit) {
      if (move.lengthSq() > 0 || jumpPressed) {
        onStandUpRef.current?.();
      } else {
        const seatEye = new THREE.Vector3(sit.position[0], sit.position[1] + SEATED_EYE_HEIGHT, sit.position[2]);
        vcam.position.lerp(seatEye, 1 - Math.exp(-SIT_EASE_RATE * delta));
        verticalVelocityRef.current = 0;
        moveTargetRef.current = null;
        if (movePathRef) movePathRef.current = null;
        if (viewMode === "first") {
          avatarYawRef.current = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ").y;
        } else {
          avatarYawRef.current = lerpAngle(avatarYawRef.current, sit.rotationY, 1 - Math.exp(-SIT_TURN_RATE * delta));
        }
        applyTransforms(sit.position[1]);
        return;
      }
    }

    const heading = new THREE.Vector3();
    if (move.lengthSq() > 0) {
      heading.copy(move).normalize();
      vcam.position.addScaledVector(heading, MOVE_SPEED * (running ? RUN_MULTIPLIER : 1) * delta);
    } else if (moveTargetRef.current) {
      const target = moveTargetRef.current;
      const toTarget = new THREE.Vector3(target.x - vcam.position.x, 0, target.z - vcam.position.z);
      if (toTarget.length() < MOVE_TARGET_ARRIVE_DISTANCE) {
        // Reached this waypoint — advance along the navmesh path, or stop
        // if that was the last one.
        moveTargetRef.current = movePathRef?.current?.shift() ?? null;
      } else {
        heading.copy(toTarget).normalize();
        vcam.position.addScaledVector(heading, MOVE_SPEED * delta);
      }
    }
    clampToRooms(vcam.position);

    // Gravity/jump — applied every frame so landing on the flat floor is a
    // clean clamp back to eye height rather than separate ground detection.
    verticalVelocityRef.current -= GRAVITY * delta;
    vcam.position.y += verticalVelocityRef.current * delta;
    if (vcam.position.y <= groundEyeY) {
      vcam.position.y = groundEyeY;
      verticalVelocityRef.current = 0;
    }

    if (viewMode === "first") {
      avatarYawRef.current = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ").y;
    } else if (heading.lengthSq() > 0) {
      // Avatars face -Z at yaw 0, so facing direction (x, z) is yaw atan2(-x, -z).
      const targetYaw = Math.atan2(-heading.x, -heading.z);
      avatarYawRef.current = lerpAngle(avatarYawRef.current, targetYaw, 1 - Math.exp(-AVATAR_TURN_RATE * delta));
    }

    applyTransforms(vcam.position.y - EYE_HEIGHT);
  });

  return (
    <>
      <XROrigin ref={xrOriginRef} position={spawnPoint} />
      {/* Own avatar body: hidden in VR and in first person (the camera
          sits inside the head in both), shown in third person. It stays
          mounted either way so animation and spring bones keep running and
          switching views doesn't reload the model. */}
      <group ref={rigRef} visible={!isPresenting && viewMode === "third"}>
        {children}
      </group>
    </>
  );
}
