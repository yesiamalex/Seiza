import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { trackingStore } from "../body/trackingStore";
import { hitTest, layoutHud, type HudButton, type XrHudModel } from "./hudPanel";

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

  const hint = useMemo(() => makeHintTexture(), []);
  useEffect(
    () => () => {
      texture.dispose();
      hint.dispose();
    },
    [texture, hint]
  );

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

    // X pins and unpins. Read as an edge, so holding it does nothing more.
    let pinPressed = false;
    for (const source of session.inputSources) {
      if (source.handedness === "left" && source.gamepad?.buttons[PIN_BUTTON]?.pressed) pinPressed = true;
    }
    if (pinPressed && !pinHeldRef.current) {
      pinnedRef.current = !pinnedRef.current;
      if (pinnedRef.current) {
        // Placed once, then left where it is, so you can walk away from
        // it and come back.
        flatForward.set(0, 0, -1).applyQuaternion(world.head.quaternion).setY(0);
        if (flatForward.lengthSq() < 1e-6) flatForward.set(0, 0, -1);
        flatForward.normalize();
        panel.position.copy(head).addScaledVector(flatForward, PIN_DISTANCE).addScaledVector(up, -PIN_DROP);
        panel.lookAt(head);
      }
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
    </>
  );
}

const HINT_WIDTH = 900;
const HINT_HEIGHT = 190;

/** "Here's how to open the menu", shown once, at the start of a session. */
function makeHintTexture(): THREE.CanvasTexture {
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
    ctx.font = "600 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("Turn your left palm toward you for the menu", HINT_WIDTH / 2, 72);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("Or press X to pin it in front of you", HINT_WIDTH / 2, 130);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
