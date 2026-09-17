import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import * as THREE from "three";
import { loadWorldConfig, type WorldConfig } from "./config/worldConfig";
import { Scene } from "./scene/Scene";
import { VrmAvatar } from "./avatar/VrmAvatar";
import { AvatarAnimator } from "./avatar/AvatarAnimator";
import { buildGestureRegistry, findGesture, SIT_GESTURE_NAME, type GestureDefinition } from "./avatar/gestures";
import type { Seat } from "./scene/layout";
import type { VRM } from "@pixiv/three-vrm";
import { useRoomSocket } from "./multiplayer/useRoomSocket";
import { RemotePlayers } from "./multiplayer/RemotePlayers";
import { PlayerRig, type ViewMode } from "./player/PlayerRig";
import { TouchControls } from "./player/TouchControls";
import { createTouchMoveInput, type TouchMoveInput } from "./player/touchInput";
import { useNavMesh } from "./nav/useNavMesh";
import { useRealtimeMedia } from "./media/useRealtimeMedia";
import { MediaControls } from "./media/MediaControls";
import { CameraBadge } from "./media/CameraBadge";
import { WorldObjects } from "./edit/WorldObjects";
import { EditToolbar } from "./edit/EditToolbar";
import { TextEditorDialog } from "./edit/TextEditorDialog";
import { GesturePanel } from "./interactions/GesturePanel";
import { ChatPanel } from "./chat/ChatPanel";
import { HUD } from "./ui/HUD";
import { JoinScreen, type JoinedIdentity } from "./ui/JoinScreen";
import { CameraViewToggle } from "./ui/CameraViewToggle";
import { AvatarChooser } from "./ui/AvatarChooser";
import { useMediaQuery, useWantsTouchControls } from "./ui/useMediaQuery";
import { saveProfile } from "./profile/profileStore";
import { panelStyle, pillButtonActiveStyle, pillButtonStyle } from "./ui/styles";
import { CloseIcon, PersonIcon, VrHeadsetIcon } from "./ui/icons";
import type { WorldObject, WorldObjectKind } from "./multiplayer/types";

// Keep baseline immersive VR compatible with headsets that do not implement
// optional scene-understanding or DOM-overlay features. These are not needed
// for Seiza's controller-based locomotion or in-world UI.
const xrStore = createXRStore({ meshDetection: false, planeDetection: false, domOverlay: false });
const OBJECT_COLORS = ["#c94f4f", "#4f8fc9", "#4fc97e", "#c9a94f", "#9a4fc9"];
// Boards and screens get the app's accent rather than a random colour.
const ACCENT_OBJECT_COLOR = "#e8c37a";
// How far a "share my screen" from the toolbar will reach for a display.
const SHARE_REACH = 30;
const NETWORK_TICK_MS = 200;
// Custom clips don't declare a duration up front. AvatarAnimator reports
// the real end; this only bounds how long a stuck gesture can stay "active".
const GESTURE_FALLBACK_SECONDS = 10;

/** Number-key slots for the gesture menu: 1–9, then 0 for the tenth. */
function gestureKeyIndex(code: string): number | null {
  if (!/^Digit[0-9]$/.test(code)) return null;
  const digit = Number(code.slice(5));
  return digit === 0 ? 9 : digit - 1;
}

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export default function App() {
  const [world, setWorld] = useState<WorldConfig | null>(null);
  const [worldError, setWorldError] = useState<Error | null>(null);
  const [joined, setJoined] = useState<JoinedIdentity | null>(null);
  const [localVrm, setLocalVrm] = useState<VRM | null>(null);
  const [localGesture, setLocalGesture] = useState<{ gesture: GestureDefinition; seq: number } | null>(null);
  const localGestureRef = useRef<{ gesture: GestureDefinition; seq: number } | null>(null);
  localGestureRef.current = localGesture;
  const [seat, setSeat] = useState<Seat | null>(null);
  // A held full-body pose: sitting when on a seat, kneeling for seiza.
  const [posture, setPostureState] = useState<GestureDefinition | null>(null);
  // These mirror the state for the frame loop and callbacks, which must not
  // send a stand-up message on every frame a movement key is held.
  const seatRef = useRef<Seat | null>(null);
  const postureRef = useRef<GestureDefinition | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  // Touch devices start in third person: seeing your own avatar makes the
  // D-pad's directions obvious. Desktop starts in first person. Both look
  // around by dragging; neither uses pointer lock.
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "third" : "first"
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");
  const [xrError, setXrError] = useState<string | null>(null);
  const [webglLost, setWebglLost] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const moveTargetRef = useRef<THREE.Vector3 | null>(null);
  const movePathRef = useRef<THREE.Vector3[] | null>(null);
  // Environment geometry the navmesh is generated from — Scene's own
  // group, so avatars and edit gizmos elsewhere in the graph aren't
  // baked into the walkable surface.
  const navSourceRef = useRef<THREE.Group | null>(null);
  const navMesh = useNavMesh(navSourceRef);
  const touchInputRef = useRef<TouchMoveInput>(createTouchMoveInput());
  const showTouchControls = useWantsTouchControls();
  const hasHoverPointer = useMediaQuery("(hover: hover)");
  const gestureSeqRef = useRef(0);
  const gestureTimerRef = useRef<number | null>(null);

  useEffect(() => {
    loadWorldConfig().then(setWorld).catch(setWorldError);
  }, []);

  const gestures = useMemo(
    () => (world ? buildGestureRegistry({ enabledGestures: world.enabledGestures, customGestures: world.customGestures }) : []),
    [world]
  );
  // The menu and number keys only offer gestures a player triggers
  // directly; `sit` is hidden because chairs trigger it.
  const menuGestures = useMemo(() => gestures.filter((g) => !g.hidden), [gestures]);
  const sitGesture = useMemo(() => findGesture(gestures, SIT_GESTURE_NAME), [gestures]);

  useEffect(() => () => {
    if (gestureTimerRef.current !== null) window.clearTimeout(gestureTimerRef.current);
  }, []);

  // A blob: URL for your own uploaded avatar lives as long as it's in use.
  const localAvatarUrl = joined?.localUrl ?? null;
  useEffect(() => {
    if (!localAvatarUrl) return;
    return () => URL.revokeObjectURL(localAvatarUrl);
  }, [localAvatarUrl]);

  const voiceSignalHandlerRef = useRef<(from: string, data: unknown) => void>(() => {});
  const roomId = world && joined ? world.id : "";
  const {
    selfId,
    players,
    objects,
    messages,
    send,
    addObject,
    moveObject,
    removeObject,
    sendChat,
    setPosture: sendPosture,
    setObjectText,
    presentOnObject,
    setMedia,
    connected,
    connectionState,
    editorPasswordRequired,
    isEditor,
    editorAuthPending,
    editorAuthFailed,
    authEditor,
    roomFull,
    environmentUrl,
    setEnvironment,
  } = useRoomSocket(
    roomId,
    joined?.displayName ?? "",
    joined?.url ?? "",
    useCallback((from: string, data: unknown) => voiceSignalHandlerRef.current(from, data), [])
  );

  // Rebuild the walkable surface whenever the environment changes — on
  // first load, and on every editor environment swap. Debounced inside
  // the hook, since a swapped glTF is still streaming when this fires.
  useEffect(() => {
    if (!joined) return;
    navMesh.rebuild();
  }, [joined, environmentUrl, navMesh]);

  const sendSignal = useCallback((to: string, data: unknown) => send({ type: "voiceSignal", to, data }), [send]);
  const media = useRealtimeMedia({ selfId, players, sendSignal });
  voiceSignalHandlerRef.current = media.handleSignal;

  // Tell the room which of our streams is which, so receivers can put each
  // one where it belongs (spatial audio, the panel beside us, a screen).
  useEffect(() => {
    if (!connected) return;
    setMedia(media.localMedia);
  }, [connected, media.localMedia, setMedia]);

  const positionRef = useRef<[number, number, number]>([0, 0, 0]);
  const rotationRef = useRef(0);
  const lookYawRef = useRef(0);

  // media.updateSpatial is recreated whenever `players` changes (i.e.
  // often) — read it through a ref inside the interval below rather than
  // as an effect dependency, so the interval doesn't need to be torn
  // down and rebuilt on every remote-player update.
  const updateSpatialRef = useRef(media.updateSpatial);
  updateSpatialRef.current = media.updateSpatial;

  useEffect(() => {
    if (!connected) return;
    const interval = window.setInterval(() => {
      send({ type: "state", position: positionRef.current, rotationY: rotationRef.current });
      updateSpatialRef.current(positionRef.current);
    }, NETWORK_TICK_MS);
    return () => window.clearInterval(interval);
  }, [connected, send]);

  const endGesture = useCallback(() => {
    if (gestureTimerRef.current !== null) window.clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = null;
    send({ type: "gesture", gesture: null });
  }, [send]);

  const applyPosture = useCallback(
    (next: GestureDefinition | null) => {
      postureRef.current = next;
      setPostureState(next);
      sendPosture(next?.name ?? null);
    },
    [sendPosture]
  );

  const sitDown = useCallback(
    (target: Seat) => {
      seatRef.current = target;
      setSeat(target);
      applyPosture(sitGesture);
      moveTargetRef.current = null;
      movePathRef.current = null;
    },
    [applyPosture, sitGesture]
  );

  /** Leaves a seat, or drops a held pose like seiza. */
  const standUp = useCallback(() => {
    if (!seatRef.current && !postureRef.current) return;
    seatRef.current = null;
    setSeat(null);
    applyPosture(null);
  }, [applyPosture]);

  const requestGesture = useCallback(
    (name: string) => {
      const gesture = findGesture(gestures, name);
      if (!gesture) return;
      // A held full-body pose (seiza) is a posture, and its key toggles it:
      // press once to kneel, again to stand. Moving stands up too.
      if (gesture.hold && gesture.fullBody) {
        if (postureRef.current?.name === gesture.name) standUp();
        else {
          seatRef.current = null;
          setSeat(null);
          applyPosture(gesture);
        }
        return;
      }
      // Re-triggering a gesture that's already being held would restart the
      // clip on every key repeat, which is exactly the spam a held pose is
      // meant to avoid.
      if (gesture.hold && localGestureRef.current?.gesture.name === name) return;
      gestureSeqRef.current += 1;
      // The definition stays set after a one-shot clip ends; AvatarAnimator
      // plays only when `seq` changes, so there's nothing to reset.
      setLocalGesture({ gesture, seq: gestureSeqRef.current });
      send({ type: "gesture", gesture: name });
      if (gestureTimerRef.current !== null) window.clearTimeout(gestureTimerRef.current);
      gestureTimerRef.current = null;
      // A held pose ends when the player lets go, so it gets no timer.
      if (!gesture.hold) {
        gestureTimerRef.current = window.setTimeout(endGesture, ((gesture.duration ?? GESTURE_FALLBACK_SECONDS) + 1) * 1000);
      }
    },
    [gestures, send, endGesture, applyPosture, standUp]
  );

  /** Lets go of a held pose. With no name, releases whatever is held. */
  const releaseGesture = useCallback(
    (name?: string) => {
      const current = localGestureRef.current;
      if (!current?.gesture.hold) return;
      if (name && current.gesture.name !== name) return;
      setLocalGesture(null);
      send({ type: "gesture", gesture: null });
    },
    [send]
  );

  // Keyboard: C toggles the avatar menu, Escape closes it, and 1–9 plus 0
  // play gestures. A hold gesture (raise hand) lasts as long as the key is
  // down, so these listen for keyup too.
  useEffect(() => {
    const heldKeys = new Set<string>();
    const gestureFor = (code: string) => {
      const index = gestureKeyIndex(code);
      return index === null ? null : (menuGestures[index] ?? null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Modifier check: otherwise Ctrl+C (copy) would toggle the menu.
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.code === "KeyC") {
        setAvatarMenuOpen((open) => !open);
        return;
      }
      if (event.code === "Escape") {
        setAvatarMenuOpen(false);
        return;
      }
      if (event.code === "KeyV") {
        setViewMode((mode) => (mode === "first" ? "third" : "first"));
        return;
      }
      if (!joined) return;
      const gesture = gestureFor(event.code);
      if (!gesture || event.repeat || heldKeys.has(event.code)) return;
      heldKeys.add(event.code);
      requestGesture(gesture.name);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!heldKeys.delete(event.code)) return;
      const gesture = gestureFor(event.code);
      if (gesture?.hold) releaseGesture(gesture.name);
    };
    // Switching tabs mid-press never delivers the keyup, which would
    // otherwise leave a hand raised forever.
    const onBlur = () => {
      heldKeys.clear();
      releaseGesture();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [menuGestures, requestGesture, releaseGesture, joined]);

  const handleSpawn = useCallback(
    (kind: WorldObjectKind, modelUrl?: string, pitch = 0) => {
      const [px, py, pz] = positionRef.current;
      // In front of the camera, not the avatar: in third person those differ,
      // and you want the object where you're looking.
      const yaw = lookYawRef.current;
      const flat = Math.abs(pitch) > 0.6;
      // Put each kind where it's actually used: a note on a desk, a board at
      // eye level, a screen a little above that.
      const distance = flat ? 1.1 : 2;
      const height = flat ? 0.78 : kind === "screen" ? 1.9 : kind === "text" ? 1.6 : 1;
      const spawnPosition: [number, number, number] = [
        px - Math.sin(yaw) * distance,
        py + height,
        pz - Math.cos(yaw) * distance,
      ];
      addObject({
        kind,
        modelUrl,
        color:
          kind === "text" || kind === "screen"
            ? ACCENT_OBJECT_COLOR
            : OBJECT_COLORS[Math.floor(Math.random() * OBJECT_COLORS.length)],
        position: spawnPosition,
        // Boards and screens face whoever placed them.
        rotationY: yaw + Math.PI,
        pitch,
        scale: 1,
        text: kind === "text" ? "" : undefined,
      });
    },
    [addObject]
  );

  // --- boards, notes and screens --------------------------------------------
  const [editingText, setEditingText] = useState<WorldObject | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canEditWorld = world?.editingEnabled !== false && (!editorPasswordRequired || isEditor);

  const screens = useMemo(() => Object.values(objects).filter((object) => object.kind === "screen"), [objects]);
  const myScreenId = useMemo(() => screens.find((screen) => screen.presenterId === selfId)?.id ?? null, [screens, selfId]);
  const myScreenIdRef = useRef<string | null>(null);
  myScreenIdRef.current = myScreenId;

  const handleEditText = useCallback(
    (object: WorldObject) => {
      if (!canEditWorld) {
        setNotice("This world needs the editor password before you can write on a board.");
        return;
      }
      setEditingText(object);
    },
    [canEditWorld]
  );

  const presentOn = useCallback(
    async (object: WorldObject) => {
      if (object.presenterId === selfId) {
        presentOnObject(object.id, false);
        media.stopScreen();
        return;
      }
      if (object.presenterId) {
        setNotice("Someone else is presenting on that screen.");
        return;
      }
      // Capture first, claim second: claiming and then having the picker
      // dismissed would lock a screen to a presenter with nothing to show.
      const started = media.screenOn || (await media.startScreen());
      if (!started) return;
      presentOnObject(object.id, true);
    },
    [media, presentOnObject, selfId]
  );

  /** "Share your screen" from the toolbar picks the nearest free display. */
  const shareOnNearestScreen = useCallback((): string | null => {
    const free = screens.filter((screen) => !screen.presenterId || screen.presenterId === selfId);
    if (free.length === 0) return "There's no screen in this world yet. Place one from Edit world, then click it.";
    const [px, py, pz] = positionRef.current;
    const nearest = free
      .map((screen) => ({
        screen,
        distance: Math.hypot(screen.position[0] - px, screen.position[1] - py, screen.position[2] - pz),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest.distance > SHARE_REACH) return "Walk closer to a screen, then click it to present.";
    void presentOn(nearest.screen);
    return null;
  }, [presentOn, screens, selfId]);

  const stopSharing = useCallback(() => {
    const id = myScreenIdRef.current;
    if (id) presentOnObject(id, false);
    media.stopScreen();
  }, [media, presentOnObject]);

  // A share can also end on its own, from the browser's own "Stop sharing"
  // button. Give the screen back rather than leaving it claimed and blank.
  const screenOn = media.screenOn;
  useEffect(() => {
    if (screenOn) return;
    const id = myScreenIdRef.current;
    if (id) presentOnObject(id, false);
  }, [screenOn, presentOnObject]);

  const resolveScreenStream = useCallback(
    (object: WorldObject) => {
      if (!object.presenterId) return null;
      if (object.presenterId === selfId) return media.localScreenStream;
      return media.getStream(object.presenterId, players[object.presenterId]?.media?.screen);
    },
    // streamsVersion is the signal that a remote stream has arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media.getStream, media.localScreenStream, media.streamsVersion, players, selfId]
  );

  // The first person into an empty room places whatever the world config says
  // it should start with. Only when alone, so two people arriving together
  // don't both place a set.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !world || !joined || !connected) return;
    const defaults = world.defaultObjects ?? [];
    if (defaults.length === 0) return;
    if (Object.keys(objects).length > 0) {
      seededRef.current = true; // this room already has its furniture
      return;
    }
    if (!canEditWorld || Object.keys(players).length !== 1) return;
    seededRef.current = true;
    for (const object of defaults) {
      addObject({
        kind: object.kind,
        modelUrl: object.modelUrl,
        color: object.color ?? ACCENT_OBJECT_COLOR,
        position: object.position,
        rotationY: object.rotationY ?? 0,
        pitch: object.pitch ?? 0,
        scale: object.scale ?? 1,
        text: object.text,
      });
    }
  }, [addObject, canEditWorld, connected, joined, objects, players, world]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedObjectId) return;
    removeObject(selectedObjectId);
    setSelectedObjectId(null);
  }, [selectedObjectId, removeObject]);

  const handleSnapToFloor = useCallback(() => {
    if (!selectedObjectId) return;
    const object = objects[selectedObjectId];
    if (!object) return;
    const halfHeight = object.kind === "model" ? 0 : 0.5 * object.scale;
    moveObject(object.id, [object.position[0], halfHeight, object.position[2]], object.rotationY);
  }, [objects, selectedObjectId, moveObject]);

  // Double-click (or double-tap) the floor to walk there, in either view.
  // Disabled while editing, where a floor click shouldn't yank you away.
  const handleFloorClick = useCallback(
    (point: THREE.Vector3) => {
      if (editMode) return;
      // Walking somewhere is also a way of getting up.
      standUp();
      const destination = point.clone();
      const from = new THREE.Vector3(positionRef.current[0], positionRef.current[1], positionRef.current[2]);
      // Route around walls/pillars when a navmesh is available; fall back
      // to a straight-line walk when it isn't (see useNavMesh).
      const path = navMesh.findPath(from, destination);
      if (path && path.length > 1) {
        const waypoints = path.slice(1); // path[0] is where we already are
        moveTargetRef.current = waypoints.shift() ?? destination;
        movePathRef.current = waypoints;
      } else {
        moveTargetRef.current = destination;
        movePathRef.current = null;
      }
    },
    [editMode, navMesh, standUp]
  );

  if (worldError) return <CenteredMessage text={`Couldn't load world: ${worldError.message}`} />;
  if (!world) return <CenteredMessage text="Loading world…" />;
  if (roomFull) return <CenteredMessage text={`This world is currently full (${roomFull} people). Please try again later.`} />;
  if (!joined) return <JoinScreen world={world} onJoin={setJoined} />;

  const editingEnabled = world.editingEnabled !== false;
  const voiceVisible = world.voiceEnabled;
  const currentWorld = world;

  async function enterVR() {
    setXrError(null);
    if (!("xr" in navigator)) {
      setXrError("WebXR is not available in this browser or device.");
      return;
    }
    try {
      await xrStore.enterVR();
    } catch (error) {
      console.warn("Unable to start immersive VR:", error);
      setXrError("This device cannot start immersive VR. Try a WebXR-compatible browser or continue in desktop mode.");
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <Canvas
        // near/far are deliberately tight around the world's actual size.
        // The default 0.1–1000 range spends most of the depth buffer on
        // distance nothing occupies, which shows up as surfaces flickering
        // against each other when the camera moves.
        camera={{ position: [0, 1.6, 4], near: 0.12, far: 260 }}
        shadows
        // Rendering at the full device pixel ratio means four times the
        // pixels on a typical high-density screen, which is what pushed
        // weaker GPUs into dropped frames and lost contexts.
        dpr={[1, 1.5]}
        gl={{ powerPreference: "high-performance" }}
        fallback={<CenteredMessage text="3D graphics are unavailable in this browser." />}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            setWebglLost(true);
          });
          gl.domElement.addEventListener("webglcontextrestored", () => setWebglLost(false));
        }}
      >
        <XR store={xrStore}>
          {/* A room-level environment uploaded through the editor wins
              over the deployment's static world.json sceneUrl. The group
              wrapper is what the navmesh is generated from. */}
          <group ref={navSourceRef}>
            <Scene
              sceneUrl={environmentUrl ?? world.sceneUrl}
              onFloorDoubleClick={handleFloorClick}
              // In Edit Mode a click belongs to the object gizmos, so the
              // seats stop accepting clicks entirely.
              onSit={editMode ? undefined : sitDown}
              occupiedSeatId={seat?.id ?? null}
              // Placed objects cast shadows and can be dragged, so the
              // otherwise-frozen shadow map refreshes when they change.
              shadowRefreshKey={objects}
            />
          </group>
          <PlayerRig
            spawnPoint={[world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z]}
            positionRef={positionRef}
            rotationRef={rotationRef}
            lookYawRef={lookYawRef}
            editMode={editMode}
            viewMode={viewMode}
            moveTargetRef={moveTargetRef}
            movePathRef={movePathRef}
            touchInputRef={touchInputRef}
            sitAnchor={seat ? { position: seat.position, rotationY: seat.rotationY } : null}
            postureHeld={!!posture}
            onStandUp={standUp}
          >
            <VrmAvatar url={joined.localUrl ?? joined.url} onLoaded={setLocalVrm} />
            {/* Your own camera, so you can see what everyone else sees. */}
            <CameraBadge stream={media.localCameraStream} mirrored />
            <AvatarAnimator
              vrm={localVrm}
              getPosition={() => positionRef.current}
              gesture={localGesture?.gesture ?? null}
              gestureSeq={localGesture?.seq ?? 0}
              onGestureEnd={endGesture}
              posture={posture}
            />
          </PlayerRig>
          <RemotePlayers
            players={players}
            selfId={selfId}
            speakingLevels={media.speakingLevels}
            gestures={gestures}
            getStream={media.getStream}
            streamsVersion={media.streamsVersion}
          />
          <WorldObjects
            objects={objects}
            editMode={editMode && editingEnabled && isEditor}
            selectedId={selectedObjectId}
            transformMode={transformMode}
            onSelect={setSelectedObjectId}
            onMove={moveObject}
            onEditText={handleEditText}
            onPresentToggle={(object) => void presentOn(object)}
            resolveScreenStream={resolveScreenStream}
          />
        </XR>
      </Canvas>

      <HUD
        connectionState={connectionState}
        worldName={world.displayName}
        touchControlsVisible={showTouchControls}
        topRight={(
          <div style={{ position: "relative", pointerEvents: "auto", flexShrink: 0 }}>
            <button
              type="button"
              aria-expanded={avatarMenuOpen}
              style={avatarMenuOpen ? { ...pillButtonStyle, background: "rgba(232,195,122,0.24)", borderColor: "rgba(232,195,122,0.7)" } : pillButtonStyle}
              onClick={() => setAvatarMenuOpen((open) => !open)}
              title="Avatar (C)"
            >
              Avatar {hasHoverPointer && <kbd style={{ opacity: 0.7, fontSize: 10 }}>C</kbd>}
            </button>
            {avatarMenuOpen && (
              <div
                className="seiza-popover-down"
                role="dialog"
                aria-label="Avatar"
                style={{
                  ...panelStyle,
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  zIndex: 30,
                  width: "min(360px, calc(100vw - 32px))",
                  maxHeight: "calc(100svh - 96px)",
                  overflowY: "auto",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>Avatar</strong>
                  <button type="button" aria-label="Close" onClick={() => setAvatarMenuOpen(false)} style={{ ...pillButtonStyle, padding: 6 }}>
                    <CloseIcon size={14} />
                  </button>
                </div>
                <AvatarChooser
                  world={currentWorld}
                  value={joined.choice}
                  rememberLocally={joined.remember}
                  onChange={(selection) => {
                    setJoined((identity) => (identity ? { ...identity, ...selection } : identity));
                    if (joined.remember) void saveProfile(currentWorld.id, { displayName: joined.displayName, avatar: selection.choice });
                    setAvatarMessage("Avatar updated for everyone in the room.");
                  }}
                />
                {avatarMessage && <small style={{ color: "#7CFF9E" }}>{avatarMessage}</small>}
              </div>
            )}
          </div>
        )}
      >
        {(seat || posture) && (
          <button type="button" style={pillButtonActiveStyle} onClick={standUp} title="Or just move">
            <PersonIcon /> Stand up
          </button>
        )}
        <button type="button" style={pillButtonStyle} onClick={() => void enterVR()}>
          <VrHeadsetIcon /> Enter VR
        </button>
        <CameraViewToggle viewMode={viewMode} onToggle={() => setViewMode((v) => (v === "first" ? "third" : "first"))} />
        <MediaControls
          media={media}
          voiceEnabled={voiceVisible}
          onShareScreen={shareOnNearestScreen}
          onStopScreen={stopSharing}
        />
        <GesturePanel
          gestures={menuGestures}
          lastGesture={localGesture ? { name: localGesture.gesture.name, seq: localGesture.seq } : null}
          onRequestGesture={requestGesture}
          onReleaseGesture={releaseGesture}
          activePosture={posture?.name ?? null}
          showShortcuts={hasHoverPointer}
        />
        <ChatPanel
          open={chatOpen}
          onToggle={() => setChatOpen((v) => !v)}
          messages={messages}
          selfId={selfId}
          onSend={sendChat}
          connected={connected}
        />
        <EditToolbar
          enabled={editingEnabled}
          connected={connected}
          editMode={editMode}
          onToggleEditMode={() => {
            setEditMode((v) => !v);
            setSelectedObjectId(null);
          }}
          onSpawn={handleSpawn}
          selectedId={selectedObjectId}
          transformMode={transformMode}
          onTransformModeChange={setTransformMode}
          onSnapToFloor={handleSnapToFloor}
          onDeselect={() => setSelectedObjectId(null)}
          onDeleteSelected={handleDeleteSelected}
          editorPasswordRequired={editorPasswordRequired}
          isEditor={isEditor}
          editorAuthPending={editorAuthPending}
          editorAuthFailed={editorAuthFailed}
          onAuthEditor={authEditor}
          environmentUrl={environmentUrl}
          onSetEnvironment={setEnvironment}
        />
      </HUD>
      {showTouchControls && !webglLost && <TouchControls inputRef={touchInputRef} />}
      {editingText && (
        <TextEditorDialog
          initialText={editingText.text ?? ""}
          surface={Math.abs(editingText.pitch ?? 0) > 0.6 ? "note" : "board"}
          onSave={(text) => {
            setObjectText(editingText.id, text);
            setEditingText(null);
          }}
          onCancel={() => setEditingText(null)}
        />
      )}
      {webglLost && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "auto", background: "rgba(6,7,9,0.86)", color: "white", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
          <div style={{ maxWidth: 420 }}>
            <h2>3D graphics paused</h2>
            <p>The browser lost its graphics context. We are waiting for it to recover. Reload this page if the scene does not return.</p>
          </div>
        </div>
      )}
      {(xrError || notice) && (
        <div
          role="alert"
          onClick={() => setNotice(null)}
          style={{ position: "absolute", left: "50%", bottom: 82, transform: "translateX(-50%)", maxWidth: "min(420px, 90vw)", padding: "10px 14px", borderRadius: 10, backgroundColor: xrError ? "rgba(80,30,24,0.94)" : "rgba(28,34,46,0.94)", color: "white", fontFamily: "system-ui, sans-serif", fontSize: 13, textAlign: "center", pointerEvents: "auto", cursor: notice ? "pointer" : "default" }}
        >
          {xrError ?? notice}
        </div>
      )}
    </div>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: "100%",
        padding: 16,
        boxSizing: "border-box",
        color: "white",
        background: "#0c0e16",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <p>{text}</p>
    </div>
  );
}
