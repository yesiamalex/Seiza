import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR, useXRControllerLocomotion, XROrigin } from "@react-three/xr";
import * as THREE from "three";
import type { TouchMoveInput } from "./touchInput";
import { isGizmoDragging } from "../edit/gizmoState";
import { readXrHead } from "../xr/body/xrPose";
import { selfViewStore } from "../xr/body/selfViewStore";
import {
  CAMERA_RADIUS,
  ceilingHeightAt,
  clampToRooms,
  floorHeightAt,
  resolveObstacles,
  SEATED_EYE_HEIGHT,
  standUpSpot,
} from "../scene/layout";

export type ViewMode = "first" | "third";

const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 3.2; // meters/second — matches the walk clip (AvatarAnimator.tsx)
const RUN_MULTIPLIER = 1.9; // hold Shift, or double-tap forward on the D-pad
// How fast a player slides onto a seat, and turns to face the way it faces.
const SIT_EASE_RATE = 9;
const SIT_TURN_RATE = 6;
const POSTURE_CAMERA_EASE_RATE = 6;
// The walkable area is already inset by the player's radius (layout.ts);
// this is that inset, so the camera can be allowed closer to walls.
const PLAYER_RADIUS_MARGIN = 0.4;
/** First person: how far ahead of the avatar's eyes the camera sits, and
 *  how much further when looking down — where a real head would have
 *  tipped forward to — so it looks at the chest rather than into the
 *  collar. */
const EYE_CAMERA_AHEAD = 0.04;
const EYE_CAMERA_AHEAD_LOOKING_DOWN = 0.2;
const eyeTurnScratch = new THREE.Quaternion();
/** How far first person may look down or up, head and look combined. Short
 *  of vertical, so a bow plus looking down can't flip the view over. */
const SELF_VIEW_PITCH_LIMIT = 1.4;

const THIRD_PERSON_MIN_DISTANCE = 1.2;
const THIRD_PERSON_MAX_DISTANCE = 7;
const THIRD_PERSON_DEFAULT_DISTANCE = 3;
/** Height above the feet the third-person camera orbits around — roughly
 *  the chest, so the whole avatar sits in frame at any angle. */
const ORBIT_PIVOT_HEIGHT = 1.15;
/** The same pivot while seated on a chair, above the seat (which is what
 *  `feetY` is while seated), and while kneeling in seiza, above the floor.
 *  A fixed standing-height pivot left a seated or kneeling avatar at the
 *  very bottom of the frame, looking over its head at the room. */
const ORBIT_PIVOT_SEATED = 0.5;
const ORBIT_PIVOT_KNEELING = 0.62;
const FOV_MIN = 50;
const FOV_MAX = 90;
const FOV_DEFAULT = 75;
const WHEEL_ZOOM_SENSITIVITY = 0.014; // meters (third person) per wheel delta unit
const WHEEL_FOV_SENSITIVITY = 0.07; // degrees (first person) per wheel delta unit
const PINCH_ZOOM_SENSITIVITY = 0.02; // meters per pixel of pinch
const PINCH_FOV_SENSITIVITY = 0.12; // degrees per pixel of pinch
const MOVE_TARGET_ARRIVE_DISTANCE = 0.25;
const JUMP_SPEED = 5; // initial upward velocity, m/s
/** Crouching speed, as a fraction of a walk. Slow enough to read as
 *  deliberate, not so slow that crossing a room becomes a chore. */
const CROUCH_MULTIPLIER = 0.42;
/** How far the view drops while crouched. Matched to the pose rather
 *  than chosen: the clip lowers the hips ~6cm and folds the spine, which
 *  takes the head down about twice that. */
const CROUCH_EYE_DROP = 0.12;
/** How fast a VR playspace settles onto a new floor height. Slower than
 *  the desktop clamp on purpose: an instant step up is a jolt, and a jolt
 *  in a headset costs more than a floor that arrives a moment late. */
const XR_FLOOR_EASE_RATE = 8;
/** How far a seated VR player has to drive before it counts as standing
 *  up, rather than as drift or a snap turn. */
const XR_SEAT_RELEASE_DISTANCE = 0.25;
/** How far from the playspace origin a headset can plausibly be. Bigger
 *  than any real room, small enough to catch a stale desktop camera pose
 *  in the first frames of a session. */
const XR_MAX_PLAUSIBLE_HEAD_OFFSET = 12;
/** A VR player's body turns to follow their head once the head is this
 *  far round (radians), and stops once it is back within the second.
 *  Roughly where a real torso starts to follow a turning head. */
const XR_BODY_TURN_START = THREE.MathUtils.degToRad(55);
const XR_BODY_TURN_STOP = THREE.MathUtils.degToRad(8);
const XR_BODY_TURN_RATE = 5;
/** Faster than this (m/s) counts as walking, and a walking body faces
 *  where it is looking. */
const XR_MOVING_SPEED = 0.3;
const GRAVITY = 14; // m/s^2
const GROUNDED_EPSILON = 0.01;
/** How far a left-drag must travel in Edit Mode before it counts as
 *  looking around rather than a click on an object. */
const LOOK_DRAG_THRESHOLD_PX = 4;
const MOUSE_LOOK_SENSITIVITY = 0.0025; // radians per pixel
const TOUCH_LOOK_SENSITIVITY = 0.0042; // fingers cover fewer pixels than a mouse sweep
const PITCH_LIMIT = Math.PI / 2 - 0.05;
/**
 * First-person head bob.
 *
 * Driven by distance travelled rather than by a clock, so the rhythm stays
 * locked to the footsteps at any speed and doesn't drift when you speed up,
 * slow down or get pushed along a wall. One stride is a full cycle: the
 * head dips twice in it (once per foot) and sways once, which is what a
 * walk actually does.
 *
 * It moves the render camera only. `virtualCameraRef` — which is what the
 * networked position, the avatar's placement and every raycast are taken
 * from — never sees it, so bobbing can't nudge you through a wall or make
 * clicking a seat harder to land.
 */
const BOB_STRIDE = 3.2; // metres per full cycle, matching the walk clip
const BOB_VERTICAL = 0.009; // metres of dip at walking pace
const BOB_LATERAL = 0.005; // metres of sway at walking pace
const BOB_ROLL = 0.0015; // radians of roll at walking pace
/** How fast the bob fades in when you start moving and out when you stop. */
const BOB_EASE_RATE = 7;
/** Running bobs harder, but not proportionally — 1.9x the speed at 1.9x the
 *  amplitude is nauseating rather than energetic. */
const BOB_MAX_AMOUNT = 0.5;
/** Eye height while kneeling in seiza, measured from the floor. */
const SEIZA_EYE_HEIGHT = 0.82;
/** A frame that moves further than this isn't a step, it's a teleport
 *  (spawning, standing up off a seat) — don't advance the stride for it. */
const BOB_TELEPORT_DISTANCE = 0.6;

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
  /** Vertical look angle, in radians, for turning the avatar's head so
   *  other people can see where this player is looking. Written only in
   *  first person; third person parks it at 0 — see the note where it is
   *  assigned. */
  lookPitchRef?: MutableRefObject<number>;
  /** In edit mode the left mouse button (and a single finger) belongs to
   *  selecting and dragging objects, so looking moves to the right or
   *  middle mouse button and a two-finger drag. */
  editMode?: boolean;
  /** True while the player holds the crouch pose: moves slower, and the
   *  camera sits lower. */
  crouching?: boolean;
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
  /** True while the player holds any pose that moving should cancel, such
   *  as kneeling in seiza (which has no seat to sit on). */
  postureHeld?: boolean;
  /** Eye height for a held floor posture, or null when the posture is seated. */
  postureEyeHeight?: number | null;
  onStandUp?: () => void;
  /** An instant relocation (as opposed to moveTargetRef's walk-there) —
   *  used for the admin "teleport to this person" / "gather everyone
   *  here" actions in App.tsx. Set `.current` to a world-space point to
   *  warp there on the next frame; PlayerRig clears it back to null once
   *  applied, so setting the same point twice in a row (e.g. gathering
   *  to an admin who hasn't moved since the last gather) still warps
   *  each time rather than being a no-op on an unchanged ref value. */
  warpTargetRef?: MutableRefObject<THREE.Vector3 | null>;
  onWarped?: () => void;
  /** Your own avatar. Always drawn: in first person its head is hidden from
   *  the camera instead (SelfView), so you can look down at your body. */
  children?: ReactNode;
  /** Things attached to your avatar that only make sense seen from outside
   *  it, like your camera badge: shown in third person and VR, as before,
   *  and hidden in flat-screen first person, where they would sit against
   *  the camera. */
  outsideOnly?: ReactNode;
}

function lerpAngle(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

const approach = (current: number, target: number, rate: number, delta: number) =>
  current + (target - current) * (1 - Math.exp(-rate * delta));

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
  lookPitchRef,
  editMode = false,
  crouching = false,
  viewMode,
  moveTargetRef,
  movePathRef,
  touchInputRef,
  sitAnchor = null,
  postureHeld = false,
  postureEyeHeight = null,
  onStandUp,
  warpTargetRef,
  onWarped,
  children,
  outsideOnly,
}: PlayerRigProps) {
  const { camera, gl } = useThree();
  const isPresenting = useXR((s) => s.session != null);
  const keysRef = useRef<Record<string, boolean>>({});
  const rigRef = useRef<THREE.Group>(null);
  const xrOriginRef = useRef<THREE.Group>(null);
  const virtualCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  if (!virtualCameraRef.current) virtualCameraRef.current = new THREE.PerspectiveCamera();
  const thirdPersonDistanceRef = useRef(THIRD_PERSON_DEFAULT_DISTANCE);
  // Eased, so sitting down or standing up glides the framing rather than
  // jumping it.
  const orbitPivotHeightRef = useRef(ORBIT_PIVOT_HEIGHT);
  const verticalVelocityRef = useRef(0);
  const avatarYawRef = useRef(0);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const sitAnchorRef = useRef(sitAnchor);
  const previousSitAnchorRef = useRef(sitAnchor);
  sitAnchorRef.current = sitAnchor;
  const postureHeldRef = useRef(postureHeld);
  postureHeldRef.current = postureHeld;
  const postureEyeHeightRef = useRef(postureEyeHeight);
  postureEyeHeightRef.current = postureEyeHeight;
  const lastPostureEyeHeightRef = useRef(SEIZA_EYE_HEIGHT);
  if (postureEyeHeight !== null) lastPostureEyeHeightRef.current = postureEyeHeight;
  const postureCameraBlendRef = useRef(0);
  const seatedExitRef = useRef(false);
  const onStandUpRef = useRef(onStandUp);
  onStandUpRef.current = onStandUp;
  const onWarpedRef = useRef(onWarped);
  onWarpedRef.current = onWarped;
  // Eye height over whatever the player is standing on, updated each frame
  // so stepping onto the tatami platform raises them instead of sinking them.
  const groundEyeYRef = useRef(spawnPoint[1] + EYE_HEIGHT);
  // Head bob: how far through the current stride, how much of the bob is
  // faded in, and where the player was last frame (the bob is driven by
  // distance covered, not by a clock — see BOB_STRIDE).
  const bobPhaseRef = useRef(0);
  const bobAmountRef = useRef(0);
  const bobLastPositionRef = useRef<THREE.Vector2 | null>(null);
  // Motion sensitivity is a real accessibility need and a bobbing camera is
  // one of the worst offenders, so the OS setting turns it off outright.
  const crouchingRef = useRef(crouching);
  crouchingRef.current = crouching;
  /** Eased, so standing up isn't a jump cut. */
  const crouchEyeDropRef = useRef(0);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reducedMotionRef.current = query.matches;
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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
        if (vcam.position.y <= groundEyeYRef.current + GROUNDED_EPSILON) {
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
  }, [moveTargetRef, movePathRef]);

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
    let pendingLook: number | null = null;
    let lookPointer: number | null = null;
    let pinch: { distance: number; midX: number; midY: number } | null = null;

    const measurePinch = () => {
      const [a, b] = [...pointers.values()];
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
    };

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (e.pointerType === "mouse") {
        if (e.button === 1 || e.button === 2) {
          if (e.button === 1) e.preventDefault(); // middle-click autoscroll
          lookPointer = e.pointerId;
          el.setPointerCapture(e.pointerId);
          el.style.cursor = "grabbing";
          return;
        }
        if (e.button !== 0) return;
        if (!editMode) {
          lookPointer = e.pointerId;
          el.setPointerCapture(e.pointerId);
          el.style.cursor = "grabbing";
          return;
        }
        // Edit Mode: a left-drag might be grabbing a gizmo or might be
        // looking around, and which one is not knowable yet. Hold it as
        // a candidate and decide on the first movement (see
        // promoteToLook), by which point the gizmo has claimed it if it
        // was going to.
        pendingLook = e.pointerId;
        return;
      }
      if (pointers.size === 2) {
        lookPointer = null;
        pendingLook = null;
        pinch = measurePinch();
      } else if (pointers.size === 1) {
        // Same deferral on touch. Previously a single finger could not
        // look at all in Edit Mode, so on a phone you could place an
        // object and then have no way to turn and see it.
        if (editMode) pendingLook = e.pointerId;
        else lookPointer = e.pointerId;
      }
    };

    /**
     * Turns a held left-drag into a look, unless a gizmo took it.
     *
     * The threshold keeps a click that happens to jitter by a pixel from
     * spinning the camera, and the gizmo check runs here rather than at
     * pointerdown because TransformControls sets its dragging flag from
     * its own handler — at pointerdown time the answer isn't in yet.
     */
    const promoteToLook = (e: PointerEvent, dx: number, dy: number) => {
      if (pendingLook !== e.pointerId) return;
      if (isGizmoDragging()) {
        pendingLook = null;
        return;
      }
      if (Math.hypot(dx, dy) < LOOK_DRAG_THRESHOLD_PX) return;
      pendingLook = null;
      lookPointer = e.pointerId;
      if (e.pointerType === "mouse") {
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
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
      promoteToLook(e, dx, dy);
      if (lookPointer === e.pointerId) {
        look(dx, dy, tracked.type === "mouse" ? MOUSE_LOOK_SENSITIVITY : TOUCH_LOOK_SENSITIVITY);
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // A candidate that never moved far enough was a click, not a look.
      if (pendingLook === e.pointerId) pendingLook = null;
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

  // Scratch vectors for the XR branch, reused rather than allocated 72
  // times a second (90Hz headsets are the ones that can least afford it).
  const xrHead = useRef(new THREE.Vector3()).current;
  const xrDesired = useRef(new THREE.Vector3()).current;
  const xrCorrected = useRef(new THREE.Vector3()).current;
  const xrEuler = useRef(new THREE.Euler(0, 0, 0, "YXZ")).current;
  const xrQuaternion = useRef(new THREE.Quaternion()).current;
  const xrSeatOrigin = useRef(new THREE.Vector3()).current;
  const xrWasSeatedRef = useRef(false);
  const xrBodyYawRef = useRef(0);
  const xrTurningRef = useRef(false);

  /**
   * Publishes a VR player's pose the way the desktop path's
   * applyTransforms does, and puts their own body there.
   *
   * Facing comes from the headset, not from the XR origin. The origin's
   * yaw only changes on a snap turn, so taking the body's direction from
   * it meant a player could turn to face someone, in the room and on
   * their own screen, while their avatar went on facing a wall for
   * everyone else.
   *
   * But the *body* lags the head rather than copying it. A glance to the
   * side is a head turn, and with body tracking (src/xr/body) the head
   * now turns on its own; if the body swung round with every glance,
   * looking at someone would rotate your whole avatar toward them, which
   * is not what a person does. The body catches up once the head has
   * turned well past the shoulders, or as soon as you move. Seated, it
   * faces the way the seat does.
   *
   * `xrQuaternion` must already hold this frame's head orientation (see
   * readXrHead, called at the top of the XR branch).
   */
  const publishXrPose = (feetX: number, feetY: number, feetZ: number, delta: number, seatYaw: number | null) => {
    xrEuler.setFromQuaternion(xrQuaternion, "YXZ");
    const headYaw = xrEuler.y;
    const previous = positionRef.current;
    const moving = Math.hypot(feetX - previous[0], feetZ - previous[2]) / Math.max(delta, 1e-3) > XR_MOVING_SPEED;
    const goal = seatYaw ?? headYaw;
    const apart = Math.abs(Math.atan2(Math.sin(goal - xrBodyYawRef.current), Math.cos(goal - xrBodyYawRef.current)));
    if (apart > XR_BODY_TURN_START) xrTurningRef.current = true;
    if (xrTurningRef.current || moving || seatYaw !== null) {
      xrBodyYawRef.current = lerpAngle(xrBodyYawRef.current, goal, 1 - Math.exp(-XR_BODY_TURN_RATE * delta));
    }
    if (apart < XR_BODY_TURN_STOP) xrTurningRef.current = false;

    positionRef.current = [feetX, feetY, feetZ];
    rotationRef.current = xrBodyYawRef.current;
    if (lookYawRef) lookYawRef.current = headYaw;
    if (lookPitchRef) lookPitchRef.current = xrEuler.x;
    if (rigRef.current) {
      rigRef.current.position.set(feetX, feetY, feetZ);
      rigRef.current.rotation.set(0, xrBodyYawRef.current, 0);
    }
  };

  useFrame((_, rawDelta) => {
    // A long hitch (tab in background) would otherwise launch the player
    // through the bounds or deep into the floor in a single step.
    const delta = Math.min(rawDelta, 0.1);

    // An instant relocation (admin teleport/gather — see warpTargetRef's
    // doc comment) takes effect before anything else this frame, and
    // before the isPresenting branch below, since it has to relocate
    // whichever of the two position sources (the XR origin, or the
    // virtual camera) that branch is about to read from.
    if (warpTargetRef?.current) {
      const target = warpTargetRef.current;
      warpTargetRef.current = null;
      moveTargetRef.current = null; // cancel any in-flight click-to-walk
      if (movePathRef) movePathRef.current = null;
      verticalVelocityRef.current = 0;
      groundEyeYRef.current = target.y + EYE_HEIGHT;
      virtualCameraRef.current!.position.set(target.x, target.y + EYE_HEIGHT, target.z);
      const xrOrigin = xrOriginRef.current;
      if (xrOrigin) {
        if (isPresenting) {
          // Put the *head* on the target. Moving the origin there instead
          // leaves a roomscale player standing however far off-target
          // they happen to be within their own room, which for an admin
          // "gather everyone here" is the whole point missed.
          readXrHead(gl, xrHead, xrQuaternion);
          xrOrigin.position.x += target.x - xrHead.x;
          xrOrigin.position.z += target.z - xrHead.z;
          xrOrigin.position.y = target.y;
        } else {
          xrOrigin.position.set(target.x, target.y, target.z);
        }
      }
      // Leave any seat behind *here*, before the seated branch below sees
      // it: otherwise it eases the camera back onto the chair, and the
      // "just left a seat" step then puts the player beside that chair,
      // undoing the warp. onWarped (App's standUp) clears the seat and any
      // held posture for good on the next render.
      sitAnchorRef.current = null;
      previousSitAnchorRef.current = null;
      seatedExitRef.current = false;
      onWarpedRef.current?.();
    }

    if (isPresenting) {
      const origin = xrOriginRef.current;
      if (!origin) return;

      // Where the headset actually is, which is not where the origin is:
      // a player can walk around their room without the origin moving at
      // all. Everything below works from the head and corrects the origin
      // underneath it, so roomscale movement counts as movement — it
      // collides, it steps up onto the tatami, and other people see it.
      readXrHead(gl, xrHead, xrQuaternion);

      // The same two-step the desktop path uses, applied to the head and
      // then pushed back through the origin. The player's body cannot be
      // moved, so a physical step into a wall is resolved by sliding the
      // world instead — which is the usual WebXR compromise, and better
      // than letting someone stand inside a bench.
      xrDesired.set(xrHead.x, 0, xrHead.z);
      // Sanity guard for the frames around session start, where the
      // camera's world matrix can still hold the desktop camera's pose.
      // Correcting against that would shove the playspace halfway across
      // the world once; ignoring a frame costs nothing.
      const headOffset = Math.hypot(xrHead.x - origin.position.x, xrHead.z - origin.position.z);
      if (headOffset < XR_MAX_PLAUSIBLE_HEAD_OFFSET) {
        xrCorrected.copy(xrDesired);
        clampToRooms(xrCorrected);
        resolveObstacles(xrCorrected);
        origin.position.x += xrCorrected.x - xrDesired.x;
        origin.position.z += xrCorrected.z - xrDesired.z;
      } else {
        xrCorrected.copy(origin.position).setY(0);
      }

      // Stand on whatever is underfoot. Without this the whole playspace
      // stays at spawn height and the tatami platform's step up is a
      // surface you walk through rather than onto.
      const xrFloorY = floorHeightAt(xrCorrected.x, xrCorrected.z);
      // How tall this player physically is, measured rather than assumed,
      // so sitting lands their eyes on the seat whoever they are.
      const standingEye = Math.max(0.4, xrHead.y - origin.position.y);

      const xrSeat = sitAnchorRef.current;
      if (xrSeat) {
        // Pushing the stick is how you stand up, exactly as moving is on
        // desktop — there is no HUD in a headset to find a button on.
        const moved = Math.hypot(origin.position.x - xrSeatOrigin.x, origin.position.z - xrSeatOrigin.z);
        if (xrWasSeatedRef.current && moved > XR_SEAT_RELEASE_DISTANCE) {
          onStandUpRef.current?.();
        } else {
          if (!xrWasSeatedRef.current) {
            xrWasSeatedRef.current = true;
            origin.position.x += xrSeat.position[0] - xrCorrected.x;
            origin.position.z += xrSeat.position[2] - xrCorrected.z;
          }
          // Lower the playspace instead of the person: their eyes end up
          // at seat height whether they are physically standing or
          // sitting in a real chair.
          origin.position.y = THREE.MathUtils.damp(
            origin.position.y,
            xrSeat.position[1] + SEATED_EYE_HEIGHT - standingEye,
            POSTURE_CAMERA_EASE_RATE,
            delta
          );
          xrSeatOrigin.set(origin.position.x, 0, origin.position.z);
          publishXrPose(xrSeat.position[0], xrSeat.position[1], xrSeat.position[2], delta, xrSeat.rotationY);
          return;
        }
      }
      xrWasSeatedRef.current = false;
      // Damped rather than snapped: a step up read as a jolt otherwise,
      // and in a headset a jolt is worse than a slow floor.
      origin.position.y = THREE.MathUtils.damp(origin.position.y, xrFloorY, XR_FLOOR_EASE_RATE, delta);
      publishXrPose(xrCorrected.x, xrFloorY, xrCorrected.z, delta, null);
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
        if (!sitAnchorRef.current && vcam.position.y <= groundEyeYRef.current + GROUNDED_EPSILON) {
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

    /**
     * Advances the head bob and returns the offsets to apply to the render
     * camera this frame. Runs whatever the view mode, so switching between
     * first and third person doesn't snap the bob back to neutral or leave
     * it stale, and always returns zeroes when the player is seated,
     * airborne, standing still or has asked for reduced motion.
     */
    const updateHeadBob = (grounded: boolean) => {
      const previous = bobLastPositionRef.current;
      const travelled = previous ? Math.hypot(vcam.position.x - previous.x, vcam.position.z - previous.y) : 0;
      bobLastPositionRef.current = (previous ?? new THREE.Vector2()).set(vcam.position.x, vcam.position.z);
      const teleported = travelled > BOB_TELEPORT_DISTANCE;

      const speed = delta > 0 && !teleported ? travelled / delta : 0;
      const target = grounded && !reducedMotionRef.current ? Math.min(BOB_MAX_AMOUNT, speed / MOVE_SPEED) : 0;
      bobAmountRef.current += (target - bobAmountRef.current) * (1 - Math.exp(-BOB_EASE_RATE * delta));
      if (!teleported) bobPhaseRef.current = (bobPhaseRef.current + travelled / BOB_STRIDE) % 1;

      const amount = bobAmountRef.current;
      // Below this the offsets are sub-millimetre; skip the trigonometry
      // and, more importantly, stop the phase from mattering while stopped.
      if (amount < 0.002) return null;
      const angle = bobPhaseRef.current * Math.PI * 2;
      return {
        // Twice per stride: the head drops on each footfall, not each pair.
        vertical: Math.sin(angle * 2) * BOB_VERTICAL * amount,
        lateral: Math.sin(angle) * BOB_LATERAL * amount,
        roll: -Math.sin(angle) * BOB_ROLL * amount,
      };
    };

    // Writes out everything downstream reads: the networked transform, the
    // render camera, and the group the local avatar is rendered in.
    const applyTransforms = (feetY: number, grounded = true) => {
      const bob = updateHeadBob(grounded);
      const lookEuler = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ");
      const lookYaw = lookEuler.y;
      positionRef.current = [vcam.position.x, feetY, vcam.position.z];
      rotationRef.current = avatarYawRef.current;
      if (lookYawRef) lookYawRef.current = lookYaw;
      if (lookPitchRef) {
        // First person only, deliberately. In third person the camera
        // orbits the avatar rather than sitting behind its eyes (see
        // just below), so the camera's pitch is "how far above the
        // character am I looking down at them from" — nothing to do with
        // where the character is looking. Feeding that to the neck made
        // an avatar stare at the floor whenever its owner angled the
        // orbit camera down. Parking it at 0 puts the head level, which
        // is the correct neutral, and the remote side eases into it
        // rather than snapping.
        lookPitchRef.current = viewMode === "first" ? lookEuler.x : 0;
      }

      if (viewMode === "third") {
        // Orbit around the avatar rather than sitting behind the eye and
        // looking the same way it does. The old arrangement meant that
        // tilting down showed the top of the head and pushed the character
        // off to the edge; orbiting keeps them centred at any angle, and
        // zooming moves toward them instead of past them.
        const pivotTarget = sitAnchorRef.current
          ? ORBIT_PIVOT_SEATED
          : postureHeldRef.current
            ? ORBIT_PIVOT_KNEELING
            : ORBIT_PIVOT_HEIGHT;
        orbitPivotHeightRef.current = THREE.MathUtils.damp(orbitPivotHeightRef.current, pivotTarget, 4, delta);
        const pivot = new THREE.Vector3(vcam.position.x, feetY + orbitPivotHeightRef.current, vcam.position.z);
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(vcam.quaternion).multiplyScalar(thirdPersonDistanceRef.current);
        camera.position.copy(pivot).add(back);
        // Keep the camera inside the building: zooming out through a wall
        // showed the room from outside, and rising over the top showed the
        // room from above with no roof on it.
        clampToRooms(camera.position, PLAYER_RADIUS_MARGIN - CAMERA_RADIUS);
        const floor = floorHeightAt(camera.position.x, camera.position.z);
        camera.position.y = THREE.MathUtils.clamp(
          camera.position.y,
          floor + 0.3,
          ceilingHeightAt(camera.position.x, camera.position.z)
        );
        camera.lookAt(pivot);
      } else {
        camera.position.copy(vcam.position);
        camera.quaternion.copy(vcam.quaternion);
        if (bob) {
          camera.position.y += bob.vertical;
          camera.position.addScaledVector(right, bob.lateral);
          // Local-space roll, so it tilts about the view axis rather than
          // about world Z — which would look like the horizon sliding.
          camera.rotateZ(bob.roll);
        }
      }

      if (rigRef.current) {
        rigRef.current.position.set(positionRef.current[0], positionRef.current[1], positionRef.current[2]);
        rigRef.current.rotation.set(0, avatarYawRef.current, 0);

        // First person on a screen: see from your avatar's own eyes, so the
        // view kneels into seiza with the body rather than ahead of it,
        // and dips with a bow. The walk clip already moves the head, so
        // the synthetic bob above is replaced rather than added to.
        if (viewMode === "first" && !isPresenting && selfViewStore.valid) {
          const rig = rigRef.current;
          rig.updateWorldMatrix(true, false);
          camera.position.copy(selfViewStore.eye);
          rig.localToWorld(camera.position);
          // The head's turn is in the body's frame: rig·turn·rig⁻¹ in world.
          // Reduced motion keeps the eye height but not the turning.
          camera.quaternion.copy(vcam.quaternion);
          if (!reducedMotionRef.current) {
            // The look pitch is capped against the head's own: a bow already
            // tips the view well down, and looking down on top of it went
            // past vertical, flipping the view over to look back at your own
            // shoulders. Your look itself is kept, so the view returns to it
            // as you rise.
            const look = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ");
            const headPitch = new THREE.Euler().setFromQuaternion(selfViewStore.turn, "YXZ").x;
            look.x = THREE.MathUtils.clamp(look.x, -SELF_VIEW_PITCH_LIMIT - headPitch, SELF_VIEW_PITCH_LIMIT - headPitch);
            camera.quaternion
              .setFromEuler(look)
              .premultiply(eyeTurnScratch.copy(rig.quaternion).multiply(selfViewStore.turn).multiply(rig.quaternion.clone().invert()));
          }
          // Ahead along the ground, not along the view: looking straight
          // down, "along the view" is down into the collar.
          const view = camera.getWorldDirection(new THREE.Vector3());
          const ahead = new THREE.Vector3(view.x, 0, view.z);
          if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1).applyQuaternion(rig.quaternion);
          camera.position.addScaledVector(ahead.normalize(), EYE_CAMERA_AHEAD + EYE_CAMERA_AHEAD_LOOKING_DOWN * Math.max(0, -view.y));
          clampToRooms(camera.position, PLAYER_RADIUS_MARGIN - CAMERA_RADIUS);
        }
      }
      return lookYaw;
    };

    // Seated: hold the player on the chair until they ask to get up. Any
    // movement input is that request, which is also why sitting can't trap
    // anyone — there's no "stand up" button to find first.
    const sit = sitAnchorRef.current;
    const leftSeat = !sit && previousSitAnchorRef.current;
    if (leftSeat) {
      // Step clear of the seat rather than standing up inside it. Which way
      // is clear depends on the seat — see standUpSpot.
      const previous = previousSitAnchorRef.current!;
      const [x, , z] = standUpSpot(previous.position, previous.rotationY);
      vcam.position.x = x;
      vcam.position.z = z;
      seatedExitRef.current = true;
    }
    previousSitAnchorRef.current = sit;

    if (sit) {
      if (move.lengthSq() > 0 || jumpPressed) {
        onStandUpRef.current?.();
      } else {
        const seatEye = new THREE.Vector3(sit.position[0], sit.position[1] + SEATED_EYE_HEIGHT, sit.position[2]);
        vcam.position.lerp(seatEye, 1 - Math.exp(-POSTURE_CAMERA_EASE_RATE * delta));
        verticalVelocityRef.current = 0;
        moveTargetRef.current = null;
        if (movePathRef) movePathRef.current = null;
        if (viewMode === "first") {
          avatarYawRef.current = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ").y;
        } else {
          avatarYawRef.current = lerpAngle(avatarYawRef.current, sit.rotationY, 1 - Math.exp(-SIT_TURN_RATE * delta));
        }
        applyTransforms(sit.position[1], false);
        return;
      }
    } else if (postureHeldRef.current && (move.lengthSq() > 0 || jumpPressed)) {
      // Kneeling has no seat to leave, but moving still ends it.
      onStandUpRef.current?.();
    }

    const heading = new THREE.Vector3();
    if (move.lengthSq() > 0) {
      heading.copy(move).normalize();
      // Crouching wins over running: holding both should not sprint.
      const speedScale = crouchingRef.current ? CROUCH_MULTIPLIER : running ? RUN_MULTIPLIER : 1;
      vcam.position.addScaledVector(heading, MOVE_SPEED * speedScale * delta);
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
    resolveObstacles(vcam.position);

    // Gravity/jump — applied every frame so landing is a clean clamp back to
    // eye height rather than separate ground detection. The ground is not
    // always y=0: the tatami platform is a step up.
    const floorY = floorHeightAt(vcam.position.x, vcam.position.z);
    const postureTarget = postureHeldRef.current
      ? postureEyeHeightRef.current ?? SEIZA_EYE_HEIGHT
      : lastPostureEyeHeightRef.current;
    const postureBlendTarget = postureHeldRef.current ? 1 : 0;
    postureCameraBlendRef.current = approach(
      postureCameraBlendRef.current,
      postureBlendTarget,
      POSTURE_CAMERA_EASE_RATE,
      delta
    );
    const postureBlend = postureCameraBlendRef.current;
    const postureEye = postureBlend > 0.001 ? THREE.MathUtils.lerp(EYE_HEIGHT, postureTarget, postureBlend) : null;
    // Crouching lowers the view with the body. Not in VR: there the
    // headset is the camera, and moving the floor under someone who is
    // physically standing still is how you make them ill. Not while
    // sitting or kneeling either — those own the camera height already.
    crouchEyeDropRef.current = approach(
      crouchEyeDropRef.current,
      crouchingRef.current && !isPresenting && postureEye === null ? CROUCH_EYE_DROP : 0,
      POSTURE_CAMERA_EASE_RATE,
      delta
    );
    const crouchDrop = crouchEyeDropRef.current;
    const groundEyeY = floorY + (postureEye ?? EYE_HEIGHT) - crouchDrop;
    groundEyeYRef.current = groundEyeY;
    if (postureEye !== null || seatedExitRef.current) {
      verticalVelocityRef.current = 0;
      vcam.position.y = THREE.MathUtils.damp(vcam.position.y, groundEyeY, POSTURE_CAMERA_EASE_RATE, delta);
      if (seatedExitRef.current && Math.abs(vcam.position.y - groundEyeY) < 0.01) seatedExitRef.current = false;
    } else {
      verticalVelocityRef.current -= GRAVITY * delta;
      vcam.position.y += verticalVelocityRef.current * delta;
      if (vcam.position.y <= groundEyeY) {
        vcam.position.y = groundEyeY;
        verticalVelocityRef.current = 0;
      }
    }
    if (vcam.position.y <= groundEyeY && postureEye === null && !seatedExitRef.current) {
      verticalVelocityRef.current = 0;
    }

    if (viewMode === "first") {
      avatarYawRef.current = new THREE.Euler().setFromQuaternion(vcam.quaternion, "YXZ").y;
    } else if (heading.lengthSq() > 0) {
      // Avatars face -Z at yaw 0, so facing direction (x, z) is yaw atan2(-x, -z).
      const targetYaw = Math.atan2(-heading.x, -heading.z);
      avatarYawRef.current = lerpAngle(avatarYawRef.current, targetYaw, 1 - Math.exp(-AVATAR_TURN_RATE * delta));
    }

    applyTransforms(
      // The body's feet, derived from the eye. The crouch drop has to be
      // added back here or the avatar would sink into the floor by it:
      // the clip already lowers the body, and this would lower it twice.
      postureEye !== null ? floorY : vcam.position.y - EYE_HEIGHT + crouchDrop,
      vcam.position.y <= groundEyeY + GROUNDED_EPSILON
    );
  });

  return (
    <>
      <XROrigin ref={xrOriginRef} position={spawnPoint} />
      {/* Own avatar body, in every view. In first person, flat screen or
          VR, the head is hidden from the camera instead (SelfView), so you
          can look down at your own body and, in VR, your hands. */}
      <group ref={rigRef}>
        {children}
        <group visible={isPresenting || viewMode === "third"}>{outsideOnly}</group>
      </group>
    </>
  );
}
