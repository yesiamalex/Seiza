import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { trackingStore } from "../body/trackingStore";
import { hitTest, layoutHud, type HudButton, type XrHudModel } from "./hudPanel";
import { gazeMode, LazyYaw, registerGazeTarget } from "./gaze";
import { GazeCursor } from "./GazeCursor";

export type { XrHudModel } from "./hudPanel";

/** Physical width of the panel, in metres: about a wide phone held at a
 *  comfortable distance. */
const PANEL_WIDTH = 0.3;
/** How far off the palm the panel floats, toward the face. */
const PALM_OFFSET = 0.12;
/** Palm-toward-face, as the cosine between the palm and the line to the
 *  eyes. Opens above the first, closes below the second — the gap is what
 *  stops the menu flickering at the boundary. */
const OPEN_FACING = 0.55;
const CLOSE_FACING = 0.25;
/** Seconds the palm may turn away before the menu closes, so pointing at
 *  a button with the other hand doesn't close it mid-press. */
const CLOSE_DELAY = 0.45;
/** Where a pinned menu goes: this far ahead of the eyes, this far below. */
const PIN_DISTANCE = 0.6;
const PIN_DROP = 0.18;
/** The X button on a left controller (xr-standard mapping). */
const PIN_BUTTON = 4;
const HINT_SECONDS = 12;
/** Gaze mode's menu button: this wide, this far ahead, this far below the
 *  eyes and to the right, following the view. */
const GAZE_BUTTON_WIDTH = 0.11;
const GAZE_BUTTON_DISTANCE = 0.62;
const GAZE_BUTTON_DROP = 0.3;
const GAZE_BUTTON_SIDE = 0.16;
/** Gaze mode opens the menu this far below eye level: high enough that it
 *  clears the Menu button beneath it. */
const GAZE_PIN_DROP = 0.0;

const up = new THREE.Vector3(0, 1, 0);
const palm = new THREE.Vector3();
const toHead = new THREE.Vector3();
const flatForward = new THREE.Vector3();

/**
 * The menu inside a headset: what the flat-screen control bar is
 * outside one.
 *
 * Opens when you turn your left palm toward your face — the wrist-menu
 * convention most headset software already uses, and it needs no button,
 * so it works the same with hand tracking. Controller players can also
 * press X to pin it in the air in front of them, so it stays while they
 * move and their arm can rest. Point at a button with the right hand and
 * pull the trigger (or pinch).
 *
 * A phone in a Cardboard-style viewer has no controllers and no hand
 * tracking, only gaze: look at something and tap the screen, or keep
 * looking (gaze.ts, GazeCursor.tsx). For those sessions (no tracked input
 * at all) there's a small Menu button low in view; it stays put while you
 * look around a little, so you can look at it, and catches up when you
 * turn away. Select it to open the menu in front of you, and again to
 * close it. The first-time hint says so instead.
 *
 * Mounts nothing outside a session. Everything it shows and does comes in
 * through `model` (see XrHudModel), so this module knows nothing about
 * rooms, media or gestures beyond what it is handed.
 */
export function XrHud({ model }: { model: XrHudModel }) {
  const session = useXR((state) => state.session);
  return session ? <XrHudPanel model={model} session={session} /> : null;
}

/** Everything that changes what the panel looks like. When this string is
 *  unchanged the canvas is not redrawn — App re-renders several times a
 *  second, and re-uploading a texture each time would be waste. */
function signatureOf(model: XrHudModel): string {
  return JSON.stringify([
    model.title,
    model.people,
    model.voice,
    model.gestures.map((g) => g.name),
    model.activeGesture,
    model.seiza?.active ?? null,
    model.crouch?.active ?? null,
    model.standUp != null,
    model.chat.map((m) => m.id),
    model.request?.text ?? null,
    model.together ? [model.together.name, model.together.gestures.map((g) => g.name), model.together.waiting] : null,
  ]);
}

function XrHudPanel({ model, session }: { model: XrHudModel; session: XRSession }) {
  const panelRef = useRef<THREE.Mesh>(null);
  const hintRef = useRef<THREE.Mesh>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const pinnedRef = useRef(false);
  const closeTimerRef = useRef(0);
  const pinHeldRef = useRef(false);
  const everOpenedRef = useRef(false);
  const elapsedRef = useRef(0);
  const hintPlacedRef = useRef(false);
  const hoverRef = useRef<string | null>(null);
  const pressedRef = useRef<HudButton | null>(null);
  /** No controllers or hands: a phone in a viewer (see above). */
  const [gaze, setGaze] = useState(false);
  const gazeRef = useRef(false);
  const gazeButtonRef = useRef<THREE.Mesh>(null);
  const gazeYaw = useMemo(() => new LazyYaw(), []);
  /** A hold button (raise hand) pressed by gaze stays held until selected
   *  again, since a gaze can't keep a button held down. */
  const gazeHeldRef = useRef<HudButton | null>(null);

  // Buttons call through to whatever the model is *now*, not to the one
  // the layout was built from, so a re-layout only has to happen when
  // what is shown changes.
  const modelRef = useRef(model);
  modelRef.current = model;
  const signature = signatureOf(model);
  const layout = useMemo(() => {
    const m = modelRef.current;
    const live = (): XrHudModel => modelRef.current;
    return layoutHud({
      ...m,
      onVoice: () => live().onVoice(),
      onGestureStart: (name) => live().onGestureStart(name),
      onGestureEnd: (name) => live().onGestureEnd(name),
      seiza: m.seiza && { active: m.seiza.active, toggle: () => live().seiza?.toggle() },
      crouch: m.crouch && { active: m.crouch.active, start: () => live().crouch?.start(), end: () => live().crouch?.end() },
      standUp: m.standUp && (() => live().standUp?.()),
      onExit: () => live().onExit(),
      together: m.together && { ...m.together, onAsk: (gesture) => live().together?.onAsk(gesture) },
    });
    // The signature is the whole dependency on purpose: see signatureOf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const canvas = useMemo(() => document.createElement("canvas"), []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [canvas]);

  const redraw = () => {
    if (canvas.width !== layout.width || canvas.height !== layout.height) {
      canvas.width = layout.width;
      canvas.height = layout.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    layout.draw(ctx, hoverRef.current, pressedRef.current?.id ?? null);
    texture.needsUpdate = true;
  };
  const redrawRef = useRef(redraw);
  redrawRef.current = redraw;
  useEffect(() => redraw(), [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const hint = useMemo(() => makeHintTexture(gaze), [gaze]);
  const gazeLabel = useMemo(() => makeGazeButtonTexture(open), [open]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => hint.dispose(), [hint]);
  useEffect(() => () => gazeLabel.dispose(), [gazeLabel]);

  /** Opens the menu pinned in front of you, or closes it: gaze mode's
   *  button, and the X button on a controller. */
  const placePinned = (panel: THREE.Object3D, head: THREE.Vector3, headQuaternion: THREE.Quaternion, drop = PIN_DROP) => {
    flatForward.set(0, 0, -1).applyQuaternion(headQuaternion).setY(0);
    if (flatForward.lengthSq() < 1e-6) flatForward.set(0, 0, -1);
    flatForward.normalize();
    panel.position.copy(head).addScaledVector(flatForward, PIN_DISTANCE).addScaledVector(up, -drop);
    panel.lookAt(head);
  };
  const toggleFromGaze = () => {
    const world = trackingStore.getLocalWorld();
    const panel = panelRef.current;
    pinnedRef.current = !pinnedRef.current;
    // At eye level, above the Menu button, so the menu never covers the
    // button that closes it (with gaze, whatever is nearest under the
    // centre of view is what gets selected).
    if (pinnedRef.current && world && panel) placePinned(panel, world.head.position, world.head.quaternion, GAZE_PIN_DROP);
  };

  // Gaze targets (gaze.ts): the Menu button, and the menu's own buttons.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const toggleRef = useRef(toggleFromGaze);
  toggleRef.current = toggleFromGaze;
  useEffect(() => () => void (gazeMode.active = false), []);
  useEffect(() => {
    const button = gazeButtonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const buttonAt = (uv: THREE.Vector2) => {
      const l = layoutRef.current;
      const hit = hitTest(l, uv.x * l.width, (1 - uv.y) * l.height);
      return hit && !hit.disabled ? hit : null;
    };
    const offButton = registerGazeTarget(button, { keyAt: () => "menu", select: () => toggleRef.current() });
    const offPanel = registerGazeTarget(panel, {
      keyAt: (uv) => (openRef.current ? (buttonAt(uv)?.id ?? null) : null),
      select: (uv) => {
        if (!openRef.current) return;
        const hit = buttonAt(uv);
        if (!hit) return;
        if (!hit.hold) {
          hit.onPress();
          return;
        }
        const held = gazeHeldRef.current;
        held?.onRelease?.();
        gazeHeldRef.current = null;
        if (held?.id !== hit.id) {
          hit.onPress();
          gazeHeldRef.current = hit;
        }
      },
    });
    return () => {
      offButton();
      offPanel();
    };
  }, []);

  // A held button must be let go if the panel goes away under the
  // pointer, or a raised hand would stay up with nothing left to release
  // it.
  const releasePressed = () => {
    const pressed = pressedRef.current;
    pressedRef.current = null;
    if (pressed?.hold) pressed.onRelease?.();
  };
  useEffect(() => {
    if (!open) releasePressed();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    elapsedRef.current += delta;
    const world = trackingStore.getLocalWorld();
    const panel = panelRef.current;
    if (!world || !panel) return;
    const head = world.head.position;

    // Gaze mode: nothing tracked at all, only the head (and screen taps).
    let tracked = false;
    for (const source of session.inputSources) {
      if (source.targetRayMode === "tracked-pointer" || source.hand) tracked = true;
    }
    if (!tracked !== gazeRef.current) {
      gazeRef.current = !tracked;
      setGaze(!tracked);
    }
    gazeMode.active = gazeRef.current;
    const gazeButton = gazeButtonRef.current;
    if (gazeButton) {
      gazeButton.visible = gazeRef.current;
      if (gazeRef.current) {
        // Anchored to a yaw that only follows once you've turned well away
        // (LazyYaw), so you can turn your head to look at the button.
        flatForward.set(0, 0, -1).applyQuaternion(world.head.quaternion).setY(0);
        if (flatForward.lengthSq() < 1e-6) flatForward.set(0, 0, -1);
        const yaw = gazeYaw.update(Math.atan2(-flatForward.x, -flatForward.z), delta);
        flatForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        // Right of forward, in the floor plane.
        toHead.set(-flatForward.z, 0, flatForward.x);
        const goal = palm
          .copy(head)
          .addScaledVector(flatForward, GAZE_BUTTON_DISTANCE)
          .addScaledVector(toHead, GAZE_BUTTON_SIDE)
          .addScaledVector(up, -GAZE_BUTTON_DROP);
        // Follows walking at once (it's anchored to you, just not to where
        // you look); the lazy yaw does the gliding.
        gazeButton.position.copy(goal);
        gazeButton.lookAt(head);
      }
    }

    // X pins and unpins. Read as an edge, so holding it does nothing more.
    let pinPressed = false;
    for (const source of session.inputSources) {
      if (source.handedness === "left" && source.gamepad?.buttons[PIN_BUTTON]?.pressed) pinPressed = true;
    }
    if (pinPressed && !pinHeldRef.current) {
      pinnedRef.current = !pinnedRef.current;
      // Placed once, then left where it is, so you can walk away from it
      // and come back.
      if (pinnedRef.current) placePinned(panel, head, world.head.quaternion);
    }
    pinHeldRef.current = pinPressed;

    let shouldOpen = pinnedRef.current;
    if (!pinnedRef.current) {
      const left = world.left;
      if (left.active) {
        palm.set(0, -1, 0).applyQuaternion(left.quaternion);
        toHead.copy(head).sub(left.position).normalize();
        const facing = palm.dot(toHead);
        if (facing > OPEN_FACING) {
          shouldOpen = true;
          closeTimerRef.current = 0;
        } else if (openRef.current) {
          closeTimerRef.current += delta;
          shouldOpen = facing > CLOSE_FACING || closeTimerRef.current < CLOSE_DELAY;
        }
        if (shouldOpen) {
          panel.position.copy(left.position).addScaledVector(palm, PALM_OFFSET);
          panel.lookAt(head);
        }
      }
    }
    if (shouldOpen !== openRef.current) {
      openRef.current = shouldOpen;
      if (shouldOpen) everOpenedRef.current = true;
      setOpen(shouldOpen);
    }

    // First-time hint, floating ahead and a little low, lazily following
    // the gaze until the menu has been found once.
    const hintMesh = hintRef.current;
    if (hintMesh) {
      const show = !everOpenedRef.current && elapsedRef.current < HINT_SECONDS;
      hintMesh.visible = show;
      if (show) {
        flatForward.set(0, 0, -1).applyQuaternion(world.head.quaternion).setY(0);
        if (flatForward.lengthSq() > 1e-6) flatForward.normalize();
        const goal = toHead.copy(head).addScaledVector(flatForward, 0.9).addScaledVector(up, -0.25);
        // Appears in place the first time rather than gliding in from
        // wherever the mesh was created.
        if (!hintPlacedRef.current) hintMesh.position.copy(goal);
        else hintMesh.position.lerp(goal, 1 - Math.exp(-3 * delta));
        hintPlacedRef.current = true;
        hintMesh.lookAt(head);
      }
    }
  });

  const toCanvas = (event: ThreeEvent<PointerEvent>) =>
    event.uv ? { x: event.uv.x * layout.width, y: (1 - event.uv.y) * layout.height } : null;

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const point = toCanvas(event);
    const hit = point ? hitTest(layout, point.x, point.y) : null;
    const id = hit && !hit.disabled ? hit.id : null;
    // Sliding off a held button lets go of it, as lifting off would.
    if (pressedRef.current?.hold && pressedRef.current.id !== id) releasePressed();
    if (id !== hoverRef.current) {
      hoverRef.current = id;
      redrawRef.current();
    }
  };

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const point = toCanvas(event);
    const hit = point ? hitTest(layout, point.x, point.y) : null;
    if (!hit || hit.disabled) return;
    pressedRef.current = hit;
    if (hit.hold) hit.onPress();
    redrawRef.current();
  };

  const onPointerUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const pressed = pressedRef.current;
    pressedRef.current = null;
    if (pressed) {
      if (pressed.hold) {
        pressed.onRelease?.();
      } else {
        // A click lands on release, and only if the ray is still on the
        // button it started on — the flat HUD's rule too.
        const point = toCanvas(event);
        const hit = point ? hitTest(layout, point.x, point.y) : null;
        if (hit?.id === pressed.id) pressed.onPress();
      }
    }
    redrawRef.current();
  };

  const onPointerLeave = () => {
    releasePressed();
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      redrawRef.current();
    }
  };

  const aspect = layout.height / layout.width;
  return (
    <>
      <mesh
        ref={panelRef}
        visible={open}
        // Unmounted pointer handling would be cleaner, but the mesh has to
        // exist for the frame loop to place it before the first open; an
        // invisible mesh with no handlers is the same thing.
        onPointerMove={open ? onPointerMove : undefined}
        onPointerDown={open ? onPointerDown : undefined}
        onPointerUp={open ? onPointerUp : undefined}
        onPointerLeave={open ? onPointerLeave : undefined}
        scale={[PANEL_WIDTH, PANEL_WIDTH * aspect, 1]}
        renderOrder={1000}
        userData={{ navIgnore: true }}
      >
        <planeGeometry args={[1, 1]} />
        {/* Drawn over everything: a menu that sinks into your own forearm
            or a nearby wall can't be read. Unlit, so it is the HUD's own
            colours rather than the room's lighting on them. */}
        <meshBasicMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={hintRef} visible={false} scale={[0.42, 0.42 * (HINT_HEIGHT / HINT_WIDTH), 1]} renderOrder={1000} raycast={() => null}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={hint} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <GazeCursor session={session} />
      {/* Gaze mode's Menu button (see the comment at the top). */}
      <mesh
        ref={gazeButtonRef}
        visible={false}
        onClick={(event) => {
          event.stopPropagation();
          if (gazeRef.current) toggleFromGaze();
        }}
        scale={[GAZE_BUTTON_WIDTH, GAZE_BUTTON_WIDTH * (GAZE_HEIGHT / GAZE_WIDTH), 1]}
        renderOrder={1001}
        userData={{ navIgnore: true }}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={gazeLabel} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}

const HINT_WIDTH = 900;
const HINT_HEIGHT = 190;

const GAZE_WIDTH = 360;
const GAZE_HEIGHT = 140;

/** Text drawn no wider than `maxWidth`: the font shrinks until it fits, so
 *  a device whose system font runs wide (Android's) can't spill it past
 *  the panel's edge. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, weight: string, size: number) {
  let px = size;
  ctx.font = `${weight} ${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  while (px > 12 && ctx.measureText(text).width > maxWidth) {
    px -= 1;
    ctx.font = `${weight} ${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  }
  ctx.fillText(text, x, y);
}

/** Gaze mode's button: "Menu", or "Close" while the menu is open. */
function makeGazeButtonTexture(open: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = GAZE_WIDTH;
  canvas.height = GAZE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = open ? "rgba(124,255,158,0.32)" : "rgba(18,18,22,0.9)";
    ctx.beginPath();
    ctx.roundRect(4, 4, GAZE_WIDTH - 8, GAZE_HEIGHT - 8, (GAZE_HEIGHT - 8) / 2);
    ctx.fill();
    ctx.strokeStyle = open ? "rgba(124,255,158,0.75)" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(ctx, open ? "Close" : "Menu", GAZE_WIDTH / 2, GAZE_HEIGHT / 2 + 2, GAZE_WIDTH - 60, "600", 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** "Here's how to open the menu", shown once, at the start of a session. */
function makeHintTexture(gaze: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = HINT_WIDTH;
  canvas.height = HINT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(18,18,22,0.88)";
    ctx.beginPath();
    ctx.roundRect(3, 3, HINT_WIDTH - 6, HINT_HEIGHT - 6, 40);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const room = HINT_WIDTH - 90;
    if (gaze) {
      fitText(ctx, "Look at Menu, below right, and tap the screen", HINT_WIDTH / 2, 72, room, "600", 44);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      fitText(ctx, "Look at any button and tap to press it", HINT_WIDTH / 2, 130, room, "400", 36);
    } else {
      fitText(ctx, "Turn your left palm toward you for the menu", HINT_WIDTH / 2, 72, room, "600", 44);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      fitText(ctx, "Or press X to pin it in front of you", HINT_WIDTH / 2, 130, room, "400", 36);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
