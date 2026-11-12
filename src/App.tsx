import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import * as THREE from "three";
import { loadWorldConfig, type WorldConfig } from "./config/worldConfig";
import { Scene } from "./scene/Scene";
import { VrmAvatar } from "./avatar/VrmAvatar";
import { AvatarAnimator, type AnimatorLayerWeights } from "./avatar/AvatarAnimator";
import {
  buildGestureRegistry,
  CROUCH_GESTURE_NAME,
  findGesture,
  SEIZA_GESTURE_NAME,
  SIT_GESTURE_NAME,
  LIE_GESTURE_NAME,
  type GestureDefinition,
} from "./avatar/gestures";
import type { Seat } from "./scene/layout";
import { roomLights } from "./scene/roomLights";
import { setPlayerFilter, usePlayerFilter } from "./multiplayer/playerFilter";
import {
  answerTogether,
  askTogether,
  nearbyPeople,
  onTogetherEnd,
  onTogetherStart,
  setAllowRequests,
  setTogetherConnection,
  togetherAskingLine,
  togetherAskLine,
  togetherLabel,
  useTogether,
} from "./interactions/together";
import { TogetherPrompt } from "./interactions/TogetherPrompt";
import { duetPosture, LASTING_TOGETHER, TOGETHER_GESTURES, togetherSpacing, type PlayerState, type TogetherGesture } from "./multiplayer/types";
import type { VRM } from "@pixiv/three-vrm";
import { useRoomSocket } from "./multiplayer/useRoomSocket";
import { RemotePlayers } from "./multiplayer/RemotePlayers";
import { ParticipantRoster } from "./admin/ParticipantRoster";
import { AdminButton } from "./admin/AdminButton";
import { PlayerRig, type ViewMode } from "./player/PlayerRig";
import { TouchControls } from "./player/TouchControls";
import { createTouchMoveInput, type TouchMoveInput } from "./player/touchInput";
import { useNavMesh } from "./nav/useNavMesh";
import { useRealtimeMedia, VOICE_ENABLED } from "./media/useRealtimeMedia";
import { XrBodyTracker } from "./xr/body/XrBodyTracker";
import { TrackedBody } from "./xr/body/TrackedBody";
import { reachScale, setAvatarReach } from "./avatar/avatarReach";
import { SelfView } from "./xr/body/SelfView";
import { LOCAL_TRACKING_SOURCE } from "./xr/body/trackingStore";
import { XrHud, type XrHudModel } from "./xr/hud/XrHud";
import {
  enduranceExpression,
  enduranceTremble,
  NUMB_AFTER,
  NUMB_DURATION,
  seizaSeconds,
  useSeizaEndurance,
  setSeizaReactions,
  useSeizaReactions,
} from "./avatar/seizaEndurance";
import { SeizaMood } from "./avatar/SeizaMood";
import { formatSeizaTime, loadSeizaTimerView, saveSeizaTimerView, SeizaTimer, SeizaTimerBadge, type SeizaTimerView } from "./ui/SeizaTimer";
import { MediaControls } from "./media/MediaControls";
import { CameraBadge } from "./media/CameraBadge";
import { ScreenZoomOverlay } from "./media/ScreenZoomOverlay";
import { ImageViewer } from "./edit/ImageViewer";
import { L, useLang } from "./i18n/lang";
import { LangToggle } from "./i18n/LangToggle";
import { gestureLabel } from "./i18n/gestureLabels";
import { PresentSourceChooser } from "./media/PresentSourceChooser";
import { WorldObjects } from "./edit/WorldObjects";
import { EditToolbar } from "./edit/EditToolbar";
import { TextEditorDialog } from "./edit/TextEditorDialog";
import { GesturePanel } from "./interactions/GesturePanel";
import { ChatPanel } from "./chat/ChatPanel";
import { HUD } from "./ui/HUD";
import { useExclusiveMenu } from "./ui/exclusiveMenu";
import { FpsCounter } from "./ui/FpsCounter";
import { Toast } from "./ui/Toast";
import { ControlsGuide, hasSeenControlsGuide } from "./ui/ControlsGuide";
import { TopCenterCluster } from "./ui/TopCenterCluster";
import { hasMoved, NETWORK_TICK_MS, shouldSendState, shouldStepAway, type SentState } from "./multiplayer/presence";
import { JoinScreen, type JoinedIdentity } from "./ui/JoinScreen";
import { CameraViewToggle } from "./ui/CameraViewToggle";
import { AvatarChooser } from "./ui/AvatarChooser";
import { useMediaQuery, useWantsTouchControls } from "./ui/useMediaQuery";
import { saveProfile } from "./profile/profileStore";
import { deliverWorldMessage, unwrapWorldMessage, WorldExtension, WorldOverlay, wrapWorldMessage } from "./worlds/WorldExtension";
import { BAR_LABEL_CLASS, barButtonActiveStyle, barButtonStyle, inputStyle, panelStyle, pillButtonStyle, primaryButtonStyle } from "./ui/styles";
import { CloseIcon, LockIcon, PersonIcon, VrHeadsetIcon } from "./ui/icons";
import { isTextObjectKind, type PresentSource, type WorldObject, type WorldObjectKind } from "./multiplayer/types";

// Keep baseline immersive VR compatible with headsets that do not implement
// optional scene-understanding or DOM-overlay features. These are not needed
// for Seiza's controller-based locomotion or in-world UI.
//
// Development aid, on localhost only: ?xrEmulate=gaze stands the built-in
// headset emulator in for a phone in a Cardboard-style viewer (stereo, and
// no controllers or hands), to check the headset interface's gaze mode
// without a phone. It needs a browser with no WebXR of its own, which the
// emulator then fills in.
const xrEmulateGaze =
  typeof window !== "undefined" && window.location.hostname === "localhost" && new URLSearchParams(window.location.search).get("xrEmulate") === "gaze";
const xrStore = createXRStore({
  meshDetection: false,
  planeDetection: false,
  domOverlay: false,
  // Gaze and screen taps are handled by Seiza's own gaze selection
  // (src/xr/hud/gaze.ts), which catches every way a phone viewer reports a
  // tap; the library's would press buttons a second time.
  gaze: false,
  screenInput: false,
  ...(xrEmulateGaze ? { emulate: { type: "metaQuest3" as const, stereoEnabled: true, syntheticEnvironment: false } } : {}),
});
if (xrEmulateGaze) {
  xrStore.subscribe((state) => {
    const device = state.emulator;
    if (!device) return;
    for (const input of [...Object.values(device.controllers), ...Object.values(device.hands)]) if (input) input.connected = false;
    // So a test can turn the emulated head (look down, look around).
    (window as unknown as { __seizaXrDevice?: unknown }).__seizaXrDevice = device;
  });
}
const OBJECT_COLORS = ["#c94f4f", "#4f8fc9", "#4fc97e", "#c9a94f", "#9a4fc9"];
// Boards and screens get the app's accent rather than a random colour.
const ACCENT_OBJECT_COLOR = "#e8c37a";
// How far a "share my screen" from the toolbar will reach for a display.
const SHARE_REACH = 30;
/** How far from the target a teleport or gather lands (metres). */
const GATHER_RADIUS = 1.1;
// Custom clips don't declare a duration up front. AvatarAnimator reports
// the real end; this only bounds how long a stuck gesture can stay "active".
const GESTURE_FALLBACK_SECONDS = 10;
/** Someone holding a pose this close to a seat is in it, so it's taken:
 *  a seat puts its sitter exactly on its spot, and no two seats are this
 *  close together. */
const SEAT_TAKEN_RADIUS = 0.3;
/** How often to recheck who's near enough to ask for a together gesture. */
const NEARBY_CHECK_MS = 300;

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
  // Everything in the HUD redraws in the visitor's language (src/i18n/).
  useLang();
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
  // Read by the key handler, which is bound once and must not be rebound
  // every time Edit Mode flips.
  const editModeRef = useRef(false);
  editModeRef.current = editMode;
  // Same reason as editModeRef: the key handler is bound once.
  const crouchGestureRef = useRef<GestureDefinition | null>(null);
  const [xrError, setXrError] = useState<string | null>(null);
  const [webglLost, setWebglLost] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  // One panel open at a time across the whole HUD (see exclusiveMenu.ts).
  useExclusiveMenu("chat", chatOpen, () => setChatOpen(false));
  useExclusiveMenu("avatar", avatarMenuOpen, () => setAvatarMenuOpen(false));
  // Edit mode's panel counts too, but opening another panel only tucks it
  // away: edit mode itself ends only by its own close button (or Done).
  // Minimised, the world is all yours to walk and edit in, which on a
  // small phone the panel otherwise covers.
  const [editPanelOpen, setEditPanelOpen] = useState(true);
  useExclusiveMenu("edit", editMode && editPanelOpen, () => setEditPanelOpen(false));
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  /** Id of the screen object currently blown up to fill the viewport. */
  const [zoomedScreenId, setZoomedScreenId] = useState<string | null>(null);
  // A placed picture opened large (ImageViewer), by object id.
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  /** A free screen that was clicked and is waiting for the player to
   *  choose what to put on it. */
  const [pendingPresentId, setPendingPresentId] = useState<string | null>(null);
  const moveTargetRef = useRef<THREE.Vector3 | null>(null);
  const movePathRef = useRef<THREE.Vector3[] | null>(null);
  // Environment geometry the navmesh is generated from — Scene's own
  // group, so avatars and edit gizmos elsewhere in the graph aren't
  // baked into the walkable surface.
  const navSourceRef = useRef<THREE.Group | null>(null);
  // A world made of its own model brings a navmesh baked from it, which is
  // also its ground for walking (src/nav/navGround.ts).
  const navMesh = useNavMesh(navSourceRef, world?.environment === "model" ? world.navMeshUrl ?? null : null);
  const touchInputRef = useRef<TouchMoveInput>(createTouchMoveInput());
  const showTouchControls = useWantsTouchControls();
  const hasHoverPointer = useMediaQuery("(hover: hover)");
  // Shown once on a first visit; "?" or the help button reopens it.
  const [guideOpen, setGuideOpen] = useState(() => !hasSeenControlsGuide());
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
  const lieGesture = useMemo(() => findGesture(gestures, LIE_GESTURE_NAME), [gestures]);
  // The kneeling pose the app is named for, offered as its own button on
  // touch (requestGesture already toggles it, so one handler does both).
  const seizaGesture = useMemo(() => findGesture(gestures, SEIZA_GESTURE_NAME), [gestures]);
  const crouchGesture = useMemo(() => findGesture(gestures, CROUCH_GESTURE_NAME), [gestures]);
  // Crouch is an ordinary held gesture, so the existing machinery already
  // plays it, holds it, releases it and syncs it. All that is left is to
  // notice it is active and slow the walk down.
  const crouching = localGesture?.gesture.name === CROUCH_GESTURE_NAME;
  crouchGestureRef.current = crouchGesture;

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
  // Forward-reference: the callback passed into useRoomSocket has to
  // exist before `media` does (useRealtimeMedia needs selfId/players,
  // which only exist *after* useRoomSocket returns) — same trick
  // voiceSignalHandlerRef above already uses.
  const forceMuteHandlerRef = useRef<(muted: boolean) => void>(() => {});
  // Set by an admin's "teleport to this person" / "gather everyone
  // here" — see PlayerRig's warpTargetRef doc comment.
  const warpTargetRef = useRef<THREE.Vector3 | null>(null);
  const positionRef = useRef<[number, number, number]>([0, 0, 0]);
  const rotationRef = useRef(0);
  /**
   * Teleport/gather: hand the point to PlayerRig, and also move the
   * networked position right away. PlayerRig applies the warp inside the
   * render loop, which browsers pause in background tabs and minimised
   * windows; without this, a gathered player in such a tab didn't move for
   * anyone else until they switched back to it, so gathering looked broken.
   */
  const requestWarp = (target: THREE.Vector3) => {
    warpTargetRef.current = target;
    positionRef.current = [target.x, target.y, target.z];
  };
  // For a world's own code (WorldExtension): stable, so its effects don't rerun.
  const warpTo = useCallback((p: [number, number, number]) => {
    warpTargetRef.current = new THREE.Vector3(p[0], p[1], p[2]);
    positionRef.current = [p[0], p[1], p[2]];
  }, []);
  const getSelfPosition = useCallback(() => positionRef.current, []);
  const faceYawRef = useRef<number | null>(null);
  // Avatars face -Z at yaw 0 (facingVector in layout.ts).
  const faceToward = useCallback((x: number, z: number) => {
    const [px, , pz] = positionRef.current;
    if (Math.hypot(x - px, z - pz) > 1e-3) faceYawRef.current = Math.atan2(-(x - px), -(z - pz));
  }, []);
  // Read by the gather handler, which is created before selfId exists.
  const selfIdRef = useRef<string | null>(null);
  const roomId = world && joined ? world.id : "";
  // Set while an idle background tab has stepped out of the room (see the
  // away effect below); the socket closes and rejoins when it flips back.
  const [away, setAway] = useState(false);
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
    setCalm,
    setObjectText,
    setObjectLink,
    presentOnObject,
    setMedia,
    connected,
    connectionState,
    editorPasswordRequired,
    isEditor,
    editorAuthPending,
    editorAuthFailed,
    authEditor,
    adminKeyRequired,
    isAdmin,
    adminAuthPending,
    adminAuthFailed,
    authAdmin,
    wasKicked,
    adminKick,
    adminSetMute,
    adminGatherAll,
    roomPasswordSet,
    passwordRequired,
    joinWithPassword,
    adminSetRoomPassword,
    roomFull,
    environmentUrl,
    setEnvironment,
    skyboxUrl,
    setSkybox,
    roomSky,
    setRoomSky,
    worldState,
    setWorldState,
    lights,
    setLight,
  } = useRoomSocket(
    roomId,
    joined?.displayName ?? "",
    joined?.url ?? "",
    useCallback((from: string, data: unknown) => voiceSignalHandlerRef.current(from, data), []),
    useMemo(
      () => ({
        onForceMute: (muted: boolean) => forceMuteHandlerRef.current(muted),
        onGatherRequest: (position: [number, number, number]) => {
          // Everyone lands on their own spot in a ring around the admin
          // (picked from their connection id, so it's stable and spread
          // out) instead of all on one point inside the admin's avatar.
          const id = selfIdRef.current ?? "";
          let hash = 0;
          for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
          const angle = ((hash % 360) / 360) * Math.PI * 2;
          requestWarp(new THREE.Vector3(
            position[0] + Math.sin(angle) * GATHER_RADIUS,
            position[1],
            position[2] + Math.cos(angle) * GATHER_RADIUS
          ));
        },
      }),
      []
    ),
    away
  );
  // Fittings that read the switches every frame (text boards, world code).
  Object.assign(roomLights, lights);
  selfIdRef.current = selfId;

  // Rebuild the walkable surface whenever the environment changes — on
  // first load, and on every editor environment swap. Debounced inside
  // the hook, since a swapped glTF is still streaming when this fires.
  useEffect(() => {
    if (!joined) return;
    navMesh.rebuild();
  }, [joined, environmentUrl, navMesh]);

  const sendSignal = useCallback((to: string, data: unknown) => send({ type: "voiceSignal", to, data }), [send]);
  const media = useRealtimeMedia({ selfId, players, sendSignal });
  // The relay also carries a world's own private messages (WorldExtension).
  voiceSignalHandlerRef.current = (from, data) => {
    const world = unwrapWorldMessage(data);
    if (world) deliverWorldMessage(from, world.data);
    else media.handleSignal(from, data);
  };
  const sendWorldMessage = useCallback((to: string, data: unknown) => sendSignal(to, wrapWorldMessage(data)), [sendSignal]);
  const filter = usePlayerFilter();
  // Chat from someone this viewer blocked doesn't show (playerFilter.ts).
  const shownMessages = useMemo(
    () => (filter.blocked.size ? messages.filter((m) => !filter.blocked.has(m.senderId)) : messages),
    [messages, filter]
  );
  forceMuteHandlerRef.current = media.forceMute;

  // Tell the room which of our streams is which, so receivers can put each
  // one where it belongs (spatial audio, the panel beside us, a screen).
  useEffect(() => {
    if (!connected) return;
    setMedia(media.localMedia);
  }, [connected, media.localMedia, setMedia]);

  const lookYawRef = useRef(0);
  const lookPitchRef = useRef(0);
  // What the local avatar's animation is doing, for body tracking to
  // step aside from (see TrackedBody).
  const localLayerWeightsRef = useRef<AnimatorLayerWeights>({ gesture: 0, posture: 0 });

  // media.updateSpatial is recreated whenever `players` changes (i.e.
  // often) — read it through a ref inside the interval below rather than
  // as an effect dependency, so the interval doesn't need to be torn
  // down and rebuilt on every remote-player update.
  const updateSpatialRef = useRef(media.updateSpatial);
  updateSpatialRef.current = media.updateSpatial;

  useEffect(() => {
    if (!connected) return;
    // Starts empty on every (re)connect, so the first tick always sends
    // and a rejoining player never sits at the room's origin.
    let last: SentState | null = null;
    const interval = window.setInterval(() => {
      const position = positionRef.current;
      const rotationY = rotationRef.current;
      const headPitch = lookPitchRef.current;
      const now = Date.now();
      if (shouldSendState(last, { position, rotationY, headPitch }, now, document.hidden)) {
        send({ type: "state", position, rotationY, headPitch });
        last = { position: [position[0], position[1], position[2]], rotationY, headPitch, at: now, moved: hasMoved(last, position) };
      }
      updateSpatialRef.current(position);
    }, NETWORK_TICK_MS);
    return () => window.clearInterval(interval);
  }, [connected, send]);

  // ---- stepping out when idle in the background ----------------------
  // A tab left open and forgotten kept a seat in the room, and its
  // heartbeat, indefinitely. After an hour hidden and untouched, with
  // nothing being sent (listening alone doesn't count as sending, so a
  // muted listener steps out too), it leaves the room; the first key,
  // click, or return to the tab rejoins. Voice keeps playing in a hidden
  // tab right up to that point, since listening from another tab is real
  // use.
  const lastInputAtRef = useRef(Date.now());
  const hiddenSinceRef = useRef<number | null>(typeof document !== "undefined" && document.hidden ? Date.now() : null);
  const sendingMediaRef = useRef(false);
  sendingMediaRef.current = (media.micEnabled && !media.muted) || media.cameraOn || media.screenOn;
  useEffect(() => {
    const wake = () => {
      lastInputAtRef.current = Date.now();
      setAway(false);
    };
    const onVisibility = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else {
        hiddenSinceRef.current = null;
        wake();
      }
    };
    const inputs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const type of inputs) window.addEventListener(type, wake, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    // Background timers are throttled to about once a minute anyway.
    const check = window.setInterval(() => {
      const step = shouldStepAway({
        hiddenSince: hiddenSinceRef.current,
        lastInputAt: lastInputAtRef.current,
        sendingMedia: sendingMediaRef.current,
        now: Date.now(),
      });
      if (step) setAway(true);
    }, 60_000);
    return () => {
      for (const type of inputs) window.removeEventListener(type, wake);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(check);
    };
  }, []);
  const wasAwayRef = useRef(false);
  useEffect(() => {
    if (wasAwayRef.current && !away) {
      setNotice(L("You were away for over an hour, so Seiza stepped you out of the room to save bandwidth. You're back in now.", "1時間以上離れていたため、通信量を節約するために部屋から一時退出していました。いま戻りました。"));
    }
    wasAwayRef.current = away;
  }, [away]);

  const endGesture = useCallback(() => {
    if (gestureTimerRef.current !== null) window.clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = null;
    // Clear it locally too. Only the server was told before, so your own
    // avatar kept the finished gesture as "current", and with it that
    // gesture's facial expression, until the next gesture replaced it.
    setLocalGesture(null);
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

  const playersRef = useRef(players);
  playersRef.current = players;
  const sitDown = useCallback(
    (target: Seat) => {
      // One to a seat: someone sitting or lying there already is right on
      // its spot, since that's where a seat puts you.
      const [sx, , sz] = target.position;
      const taken = Object.values(playersRef.current).some(
        (player) =>
          player.id !== selfIdRef.current &&
          player.posture !== null &&
          Math.hypot(player.position[0] - sx, player.position[2] - sz) < SEAT_TAKEN_RADIUS
      );
      if (taken) {
        setNotice(L(`Someone's already in the ${target.label.toLowerCase()}.`, "そこにはもう誰かがいます。"));
        return;
      }
      seatRef.current = target;
      setSeat(target);
      const lying = target.pose === "lie" && lieGesture;
      applyPosture(lying ? lieGesture : sitGesture);
      // Lying, the view starts straight up the body (see PlayerRig).
      if (lying) faceYawRef.current = target.rotationY;
      moveTargetRef.current = null;
      movePathRef.current = null;
    },
    [applyPosture, lieGesture, sitGesture]
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
      if (event.key === "?") {
        setGuideOpen((open) => !open);
        return;
      }
      // Crouch, held rather than toggled. Z and not Ctrl: crouch-walking
      // means holding the key while pressing W, and Ctrl+W closes the tab
      // in every Chromium browser — a shortcut a page cannot intercept.
      // Shift is already run, and Minecraft's own Shift-to-sneak is
      // therefore taken; C and V are the avatar menu and the view toggle.
      if (joined && crouchGestureRef.current && event.code === "KeyZ") {
        if (!event.repeat && !heldKeys.has(event.code)) {
          heldKeys.add(event.code);
          requestGesture(crouchGestureRef.current.name);
        }
        return;
      }
      // Gizmo mode, the way every 3D editor does it. Only while editing,
      // so G and R stay free for gestures the rest of the time — which
      // is also why these are checked before the gesture lookup below.
      if (editModeRef.current) {
        if (event.code === "KeyG") {
          setTransformMode("translate");
          return;
        }
        if (event.code === "KeyR") {
          setTransformMode("rotate");
          return;
        }
      }
      if (!joined) return;
      const gesture = gestureFor(event.code);
      if (!gesture || event.repeat || heldKeys.has(event.code)) return;
      heldKeys.add(event.code);
      requestGesture(gesture.name);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyZ" && heldKeys.delete(event.code)) {
        if (crouchGestureRef.current) releaseGesture(crouchGestureRef.current.name);
        return;
      }
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
    /**
     * `url` is the asset this object is made of, if it needs one: the model
     * for a "model", the picture or clip for an "image"/"video". They're
     * carried in different fields on the wire (see WorldObject.src) but
     * there's only ever one of them per object, so callers pass one URL.
     */
    (kind: WorldObjectKind, url?: string, pitch = 0) => {
      const [px, py, pz] = positionRef.current;
      // In front of the camera, not the avatar: in third person those differ,
      // and you want the object where you're looking.
      const yaw = lookYawRef.current;
      const flat = Math.abs(pitch) > 0.6;
      const picture = kind === "image" || kind === "video";
      // Put each kind where it's actually used: a note on a desk, a board at
      // eye level, a screen or a picture a little above that, a chair on the
      // floor (its own geometry is measured up from its base).
      const furniture = kind === "chair" || kind === "bed";
      const distance = flat ? 1.1 : kind === "chair" ? 1.4 : kind === "bed" ? 2.2 : 2;
      const height =
        furniture
          ? 0
          : flat
            ? 0.78
            : kind === "screen"
              ? 1.9
              : picture
                ? 1.75
                : kind === "text"
                  ? 1.6
                  : // A sign spawns at waist height, which is under
                    // SIGN_POST_MAX_Y, so it arrives standing on a post.
                    // Raise it past that and the post drops away and it
                    // becomes a wall plaque.
                    kind === "sign"
                    ? 1.1
                    : 1;
      const spawnPosition: [number, number, number] = [
        px - Math.sin(yaw) * distance,
        py + height,
        pz - Math.cos(yaw) * distance,
      ];
      addObject({
        kind,
        modelUrl: kind === "model" ? url : undefined,
        src: picture ? url : undefined,
        color:
          isTextObjectKind(kind) || kind === "screen" || picture
            ? ACCENT_OBJECT_COLOR
            : OBJECT_COLORS[Math.floor(Math.random() * OBJECT_COLORS.length)],
        position: spawnPosition,
        // A placed object's face is its local +Z, so taking the placer's
        // yaw turns boards, screens, and pictures toward them, lays a note
        // the right way up to read, and turns a chair to sit in facing the
        // way they look. It was yaw + π, which showed everyone the back of
        // what they had just placed (and their writing on its far side).
        // A bed is the exception: turned round, foot toward the placer, so
        // the headboard doesn't hide the mattress.
        rotationY: kind === "bed" ? yaw + Math.PI : yaw,
        pitch,
        scale: 1,
        text: isTextObjectKind(kind) ? "" : undefined,
      });
    },
    [addObject]
  );

  // --- boards, notes and screens --------------------------------------------
  const [editingText, setEditingText] = useState<WorldObject | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ---- seiza endurance (see avatar/seizaEndurance.ts) -------------------
  const seizaReactions = useSeizaReactions();
  const seiza = useSeizaEndurance(posture?.name === SEIZA_GESTURE_NAME && seizaReactions);
  // Off also means others never see this avatar doze: tell the room, on
  // every (re)connection, since a new connection starts without the flag.
  useEffect(() => {
    if (selfId) setCalm(!seizaReactions);
  }, [selfId, seizaReactions, setCalm]);
  const [seizaView, setSeizaViewState] = useState<SeizaTimerView>(loadSeizaTimerView);
  const setSeizaView = useCallback((view: SeizaTimerView) => {
    setSeizaViewState(view);
    saveSeizaTimerView(view);
  }, []);
  const [seizaBest, setSeizaBest] = useState(() => {
    try {
      return Number(localStorage.getItem("seiza-best-seconds")) || 0;
    } catch {
      return 0;
    }
  });
  const [numbLegs, setNumbLegs] = useState(false);
  const seizaStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (seiza.startedAt != null) {
      seizaStartRef.current = seiza.startedAt;
      return;
    }
    const start = seizaStartRef.current;
    if (start == null) return;
    seizaStartRef.current = null;
    // Switched off mid-sit, not stood up: nothing to score.
    if (!seizaReactions) return;
    // Just stood up: score it, and make the legs pay for a long sit.
    const seconds = seizaSeconds(start);
    const record = seconds > seizaBest;
    if (record) {
      setSeizaBest(seconds);
      try {
        localStorage.setItem("seiza-best-seconds", String(Math.floor(seconds)));
      } catch {
        // Not remembered in a private window; the record still shows now.
      }
    }
    const time = formatSeizaTime(seconds);
    if (seconds >= NUMB_AFTER) {
      setNumbLegs(true);
      window.setTimeout(() => setNumbLegs(false), NUMB_DURATION * 1000);
      setNotice(L(`${time} in seiza, and your legs have fallen asleep. しびれた… ${record ? "New personal best." : ""}`, `正座 ${time}、足がしびれました… ${record ? "自己ベスト更新!" : ""}`).trim());
    } else if (record && seconds >= 60) {
      setNotice(L(`${time} in seiza. New personal best.`, `正座 ${time}。自己ベスト更新!`));
    }
    // seizaBest is read for the comparison only; re-running on it would
    // score the same sit twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seiza.startedAt]);
  // When this deployment has an admin key configured, it supersedes the
  // editor password for gating Edit Mode entirely (see ADMIN.md) — a
  // deployment either uses the plain shared editor password (the
  // original, still-default behavior below) or the admin key, not a mix
  // of both gating the same toggle.
  const canEditWorld =
    world?.editingEnabled !== false && (adminKeyRequired ? isAdmin : !editorPasswordRequired || isEditor);

  // Restructuring the room (canEditWorld) and taking part in it are two
  // different permissions, deliberately. Anyone who has joined may write
  // on a board that already exists and may present on a screen that's
  // free; only an editor/admin may place, move, or delete those objects
  // or swap the environment. The server enforces exactly this split —
  // see the comments on objectSetText and objectPresent in worker/room.ts
  // — and this constant exists so the UI stops pretending otherwise.
  const canParticipate = world?.editingEnabled !== false;

  // Feeds EditToolbar's single auth gate from whichever secret actually
  // governs it for this deployment — see authLabel's doc comment on
  // EditToolbarProps for why the gate itself doesn't change, only which
  // state/handler/copy it's wired to.
  const editGateProps = adminKeyRequired
    ? {
        editorPasswordRequired: true,
        isEditor: isAdmin,
        editorAuthPending: adminAuthPending,
        editorAuthFailed: adminAuthFailed,
        onAuthEditor: authAdmin,
        authLabel: "admin key",
      }
    : {
        editorPasswordRequired,
        isEditor,
        editorAuthPending,
        editorAuthFailed,
        onAuthEditor: authEditor,
        authLabel: "editor password",
      };

  // Admin moderation actions. Kick/mute are simple pass-throughs — the
  // server is the actual authority and re-checks admin status itself
  // (see types.ts) — but "teleport to this person" and "gather everyone
  // here" both end in the same local warp, so they share this helper.
  const teleportToPlayer = useCallback(
    (targetId: string) => {
      const target = players[targetId];
      if (!target) return;
      // Arrive a step in front of them, facing distance rather than inside
      // their avatar. Avatars face -Z at yaw 0 (see PlayerRig).
      const yaw = target.rotationY ?? 0;
      requestWarp(new THREE.Vector3(
        target.position[0] - Math.sin(yaw) * GATHER_RADIUS,
        target.position[1],
        target.position[2] - Math.cos(yaw) * GATHER_RADIUS
      ));
    },
    [players]
  );

  const screens = useMemo(() => Object.values(objects).filter((object) => object.kind === "screen"), [objects]);
  const myScreenId = useMemo(() => screens.find((screen) => screen.presenterId === selfId)?.id ?? null, [screens, selfId]);
  const myScreenIdRef = useRef<string | null>(null);
  myScreenIdRef.current = myScreenId;

  const handleEditText = useCallback(
    (object: WorldObject) => {
      // Writing on an existing board is participation, not editing — the
      // only thing that can withhold it is a world with editing switched
      // off wholesale in its config.
      if (!canParticipate) {
        setNotice(L("Writing on boards is turned off in this world.", "このワールドではボードへの書き込みはできません。"));
        return;
      }
      setEditingText(object);
    },
    [canParticipate]
  );

  const openImage = useCallback((object: WorldObject) => setOpenImageId(object.id), []);
  const closeImage = useCallback(() => setOpenImageId(null), []);

  const presentOn = useCallback(
    async (object: WorldObject, explicitSource?: PresentSource) => {
      const source: PresentSource = explicitSource ?? "screen";
      if (object.presenterId === selfId) {
        presentOnObject(object.id, false);
        // Only stop the capture that was feeding this screen. Stopping
        // the screen share when the surface was showing a camera would
        // kill an unrelated share.
        if ((object.presenterSource ?? "screen") === "screen") media.stopScreen();
        return;
      }
      if (object.presenterId) {
        // Someone else has this screen. Clicking it used to be a refusal;
        // showing them what's on it is the more useful answer, and it is
        // free — the stream is already arriving.
        setZoomedScreenId(object.id);
        return;
      }
      // A free screen can carry either stream, and clicking it cannot
      // know which was meant, so ask rather than assume. `source` is
      // only passed explicitly from the chooser below and from the media
      // panel's own two buttons; a bare click lands here and opens it.
      if (!explicitSource) {
        setPendingPresentId(object.id);
        return;
      }
      // Capture first, claim second: claiming and then having the picker
      // dismissed would lock a screen to a presenter with nothing to show.
      const started =
        source === "camera"
          ? media.cameraOn || (await media.startCamera())
          : media.screenOn || (await media.startScreen());
      if (!started) return;
      presentOnObject(object.id, true, source);
    },
    [media, presentOnObject, selfId]
  );

  /** "Share your screen" (or camera) from the toolbar picks the nearest
   *  free display. */
  const shareOnNearestScreen = useCallback((source: PresentSource = "screen"): string | null => {
    const free = screens.filter((screen) => !screen.presenterId || screen.presenterId === selfId);
    if (free.length === 0) return L("There's no screen in this world yet. Place one from Edit world, then click it.", "このワールドにはまだスクリーンがありません。ワールド編集で置いてから、クリックしてください。");
    const [px, py, pz] = positionRef.current;
    const nearest = free
      .map((screen) => ({
        screen,
        distance: Math.hypot(screen.position[0] - px, screen.position[1] - py, screen.position[2] - pz),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest.distance > SHARE_REACH) return L("Walk closer to a screen, then click it to present.", "スクリーンに近づいてから、クリックして発表してください。");
    void presentOn(nearest.screen, source);
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

  // Most recent message per speaker, for the bubbles over their heads
  // (ChatBubble.tsx). Derived from the chat log that already exists
  // rather than carried on a second channel, so a bubble and the panel
  // can never disagree about what somebody said.
  const lastMessages = useMemo(() => {
    const latest: Record<string, { id: string; text: string }> = {};
    // Newest wins: the log is chronological, so a later message simply
    // overwrites the entry for that sender.
    for (const message of shownMessages) {
      latest[message.senderId] = { id: message.id, text: message.text };
    }
    return latest;
  }, [shownMessages]);

  const resolveScreenStream = useCallback(
    (object: WorldObject) => {
      if (!object.presenterId) return null;
      // A screen is just a surface; the presenter chooses whether it
      // carries their shared screen or their webcam.
      const source = object.presenterSource ?? "screen";
      if (object.presenterId === selfId) {
        return source === "camera" ? media.localCameraStream : media.localScreenStream;
      }
      const streamId = players[object.presenterId]?.media?.[source];
      return media.getStream(object.presenterId, streamId);
    },
    // streamsVersion is the signal that a remote stream has arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media.getStream, media.localScreenStream, media.localCameraStream, media.streamsVersion, players, selfId]
  );

  // The zoom overlay closes itself if the presentation ends underneath
  // it — the object is deleted, the presenter leaves, or they stop
  // sharing — rather than leaving a frozen last frame on screen.
  const zoomedScreen = zoomedScreenId ? objects[zoomedScreenId] : null;
  const zoomedStream = zoomedScreen ? resolveScreenStream(zoomedScreen) : null;
  const zoomedPresenterName =
    zoomedScreen?.presenterId === selfId
      ? L("Your screen", "あなたの画面")
      : L(`${players[zoomedScreen?.presenterId ?? ""]?.displayName ?? "Someone"}'s screen`, `${players[zoomedScreen?.presenterId ?? ""]?.displayName ?? "だれか"} さんの画面`);
  useEffect(() => {
    if (zoomedScreenId && !zoomedStream) setZoomedScreenId(null);
  }, [zoomedScreenId, zoomedStream]);

  // The screen awaiting a choice. Closes itself if that screen is
  // deleted, or claimed by somebody else while the prompt is open.
  const pendingPresentScreen = pendingPresentId ? objects[pendingPresentId] : null;
  useEffect(() => {
    if (!pendingPresentId) return;
    const target = objects[pendingPresentId];
    if (!target || target.presenterId) setPendingPresentId(null);
  }, [pendingPresentId, objects]);


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

  const playersForNames = useRef(players);
  playersForNames.current = players;
  const nameOfPlayer = useCallback((id: string) => playersForNames.current[id]?.displayName ?? L("Someone", "だれか"), []);
  // Together gestures (src/interactions/together.ts): the store reaches the
  // room server through `send`; on a mutual yes, turn to the partner and play.
  useEffect(() => setTogetherConnection(send, nameOfPlayer), [send, nameOfPlayer]);
  const requestGestureRef = useRef(requestGesture);
  requestGestureRef.current = requestGesture;
  const standUpRef = useRef(standUp);
  standUpRef.current = standUp;
  useEffect(() => {
    const offStart = onTogetherStart(({ gesture, partner, role }) => {
      // Every together gesture: each steps (only themselves) to arm's
      // length from the midpoint between them and faces the other, so hands
      // meet wherever the two stood when one asked. Both sides do the same
      // sum from the same two positions, so they land facing each other.
      const other = playersForNames.current[partner];
      if (other) {
        const [sx, sy, sz] = positionRef.current;
        const [px, , pz] = other.position;
        const mx = (sx + px) / 2, mz = (sz + pz) / 2;
        let dx = sx - mx, dz = sz - mz;
        const length = Math.hypot(dx, dz);
        if (length < 1e-3) {
          // Standing on the same spot: step back along the way this player faces.
          dx = Math.sin(rotationRef.current);
          dz = Math.cos(rotationRef.current);
        } else {
          dx /= length;
          dz /= length;
        }
        // Scaled by both partners' arms, which both sides know (each has
        // both avatars loaded), so both work out the same spacing.
        const half = (togetherSpacing(gesture) * (reachScale(selfIdRef.current) + reachScale(partner))) / 4;
        warpTo([mx + dx * half, sy, mz + dz * half]);
        faceToward(mx - dx * half, mz - dz * half);
      }
      // After the step lands: a warp stands the player up first. A lasting
      // one (the slow dance) is this player's part, held until either stops.
      const clip = LASTING_TOGETHER.includes(gesture) ? duetPosture(gesture, role) : gesture;
      window.setTimeout(() => requestGestureRef.current(clip), 150);
    });
    // The partner stopped, walked off, or left: stop this side too.
    const offEnd = onTogetherEnd(() => {
      if (postureRef.current && LASTING_TOGETHER.some((g) => postureRef.current?.name.startsWith(g))) standUpRef.current();
    });
    return () => {
      offStart();
      offEnd();
    };
  }, [faceToward, warpTo]);
  const together = useTogether();
  // Offered when this world has the clips: a lasting one (the slow dance)
  // is its two parts, lead and follow, rather than a clip of its own.
  const togetherGestures = TOGETHER_GESTURES.filter((name) =>
    LASTING_TOGETHER.includes(name)
      ? gestures.some((g) => g.name === duetPosture(name, "lead")) && gestures.some((g) => g.name === duetPosture(name, "follow"))
      : gestures.some((g) => g.name === name)
  );
  // Who's within reach, rechecked a few times a second. Worked out only
  // when the app happened to re-render, it went stale whenever you walked
  // up to someone standing still (your own movement doesn't re-render
  // anything), so the menu said nobody was near until something else did.
  useEffect(() => {
    if (!selfId) return;
    setAvatarReach(selfId, localVrm);
    return () => setAvatarReach(selfId, null);
  }, [selfId, localVrm]);
  const [nearby, setNearby] = useState<PlayerState[]>([]);
  const togetherOffered = togetherGestures.length > 0;
  useEffect(() => {
    if (!togetherOffered) {
      setNearby([]);
      return;
    }
    const check = () =>
      setNearby((previous) => {
        const next = nearbyPeople(playersRef.current, selfIdRef.current, positionRef.current);
        const same = next.length === previous.length && next.every((p, i) => p.id === previous[i].id && p.displayName === previous[i].displayName);
        return same ? previous : next;
      });
    check();
    const timer = window.setInterval(check, NEARBY_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [togetherOffered]);
  const waitingRequest = together.incoming[0] ?? null;

  if (worldError) return <CenteredMessage text={L(`Couldn't load world: ${worldError.message}`, `ワールドを読み込めませんでした:${worldError.message}`)} />;
  if (!world) return <CenteredMessage text={L("Loading world…", "ワールドを読み込み中…")} />;
  if (roomFull) return <CenteredMessage text={L(`This world is currently full (${roomFull} people). Please try again later.`, `このワールドは満員です(${roomFull}人)。しばらくしてからもう一度お試しください。`)} />;
  if (wasKicked) return <CenteredMessage text={L("An admin removed you from this room. Reload the page if you'd like to rejoin.", "管理者によって部屋から退出させられました。もう一度入るにはページを再読み込みしてください。")} />;
  if (passwordRequired) return <RoomPasswordGate onSubmit={joinWithPassword} />;
  if (!joined) return <JoinScreen world={world} onJoin={setJoined} />;

  const editingEnabled = world.editingEnabled !== false;
  const voiceVisible = world.voiceEnabled;
  const currentWorld = world;

  async function enterVR() {
    setXrError(null);
    if (!("xr" in navigator)) {
      setXrError(L("WebXR is not available in this browser or device.", "このブラウザまたは端末ではWebXRを使えません。"));
      return;
    }
    try {
      await xrStore.enterVR();
    } catch (error) {
      console.warn("Unable to start immersive VR:", error);
      setXrError(L("This device cannot start immersive VR. Try a WebXR-compatible browser or continue in desktop mode.", "この端末ではVRを開始できません。WebXR対応のブラウザを使うか、このまま画面で続けてください。"));
    }
  }

  // The headset menu (src/xr/hud): the same controls as the flat control
  // bar, handed over as data so that module knows nothing about rooms or
  // media.
  const xrHudModel: XrHudModel = {
    title: L(currentWorld.displayName, currentWorld.displayNameJa ?? currentWorld.displayName),
    people: Math.max(1, Object.keys(players).length),
    voice: !(VOICE_ENABLED && voiceVisible)
      ? "unavailable"
      : media.micEnabled
        ? media.muted
          ? "muted"
          : "live"
        : media.connecting
          ? "connecting"
          : "off",
    onVoice: () => (media.micEnabled ? media.toggleMute() : void media.enableMic()),
    // Seiza gets its own toggle below rather than a slot in the grid: it
    // is a posture, so "is it on" is a different question from "is this
    // gesture playing".
    gestures: menuGestures
      .filter((g) => g.name !== SEIZA_GESTURE_NAME)
      // A held full-body pose (the dance) toggles, like seiza: press to
      // start, press again to stop, lit while it's on.
      .map((g) => ({ name: g.name, label: gestureLabel(g), hold: g.hold && !g.fullBody })),
    activeGesture: localGesture?.gesture.name ?? posture?.name ?? null,
    onGestureStart: requestGesture,
    onGestureEnd: (name) => releaseGesture(name),
    seiza: seizaGesture
      ? { active: posture?.name === SEIZA_GESTURE_NAME, toggle: () => requestGesture(seizaGesture.name) }
      : null,
    crouch: crouchGesture
      ? { active: crouching, start: () => requestGesture(crouchGesture.name), end: () => releaseGesture(crouchGesture.name) }
      : null,
    standUp: seat || posture ? standUp : null,
    chat: messages.slice(-3).map((m) => ({ id: m.id, name: m.senderName, text: m.text })),
    onExit: () => void xrStore.getState().session?.end(),
    request: waitingRequest
      ? {
          text: togetherAskLine(nameOfPlayer(waitingRequest.peer), waitingRequest.gesture),
          accept: () => answerTogether(waitingRequest.id, true),
          decline: () => answerTogether(waitingRequest.id, false),
        }
      : null,
    together:
      nearby[0] && togetherGestures.length
        ? {
            name: nearby[0].displayName,
            gestures: togetherGestures.map((name) => ({ name, label: togetherLabel(name) })),
            onAsk: (gesture) => askTogether(nearby[0].id, gesture as TogetherGesture),
            waiting: together.outgoing
              ? togetherAskingLine(nameOfPlayer(together.outgoing.peer), together.outgoing.gesture)
              : null,
          }
        : null,
  };

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
        fallback={<CenteredMessage text={L("3D graphics are unavailable in this browser.", "このブラウザでは3Dグラフィックスを使えません。")} />}
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
              builtin={world.environment !== "model"}
              viewDistance={world.viewDistance}
              environmentIsCustom={!!environmentUrl}
              environmentCollision={currentWorld.environmentCollision !== false}
              skyboxUrl={skyboxUrl}
              onFloorDoubleClick={handleFloorClick}
              // In Edit Mode a click belongs to the object gizmos, so the
              // seats stop accepting clicks entirely.
              onSit={editMode ? undefined : sitDown}
              occupiedSeatId={seat?.id ?? null}
              lights={lights}
              onToggleLight={setLight}
              // Placed objects cast shadows and can be dragged, so the
              // otherwise-frozen shadow map refreshes when they change.
              shadowRefreshKey={objects}
              sky={world.sky}
              roomSky={roomSky}
            />
            {/* The world's own exhibits and controls, if it ships any. */}
            <WorldExtension
              worldId={world.id}
              canEdit={canEditWorld}
              connected={connected}
              objects={objects}
              removeObject={removeObject}
              roomSky={roomSky}
              setRoomSky={setRoomSky}
              worldState={worldState}
              setWorldState={setWorldState}
              lights={lights}
              selfId={selfId}
              players={players}
              getSelfPosition={getSelfPosition}
              playGesture={requestGesture}
              warp={warpTo}
              faceToward={faceToward}
              sendWorldMessage={sendWorldMessage}
              setPlayerFilter={setPlayerFilter}
              findPath={navMesh.findPath}
            />
          </group>
          <PlayerRig
            spawnPoint={[world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z]}
            spawnRotationY={world.spawnRotationY}
            positionRef={positionRef}
            rotationRef={rotationRef}
            lookYawRef={lookYawRef}
            lookPitchRef={lookPitchRef}
            // Numb legs after a long seiza walk like a crouch: slow and low.
            crouching={crouching || numbLegs}
            editMode={editMode}
            viewMode={viewMode}
            moveTargetRef={moveTargetRef}
            movePathRef={movePathRef}
            touchInputRef={touchInputRef}
            sitAnchor={seat}
            postureHeld={!!posture}
            postureEyeHeight={posture?.name === "seiza" ? 0.82 : null}
            onStandUp={standUp}
            // Without these two, admin "teleport to" and "gather everyone"
            // set a warp target nothing ever read, so both did nothing.
            warpTargetRef={warpTargetRef}
            faceYawRef={faceYawRef}
            onWarped={standUp}
            outsideOnly={
              <>
                {/* Your own camera, so you can see what everyone else sees. */}
                <CameraBadge stream={media.localCameraStream} mirrored />
                <SeizaMood phase={seiza.phase} />
              </>
            }
          >
            <VrmAvatar url={joined.localUrl ?? joined.url} onLoaded={setLocalVrm} />
            <AvatarAnimator
              vrm={localVrm}
              getPosition={() => positionRef.current}
              gesture={localGesture?.gesture ?? null}
              gestureSeq={localGesture?.seq ?? 0}
              onGestureEnd={endGesture}
              posture={posture}
              speakingLevel={media.localSpeakingLevel}
              layerWeightsRef={localLayerWeightsRef}
              expression={enduranceExpression(seiza.phase)}
              doze={seiza.phase === "dozing"}
              tremble={numbLegs ? 0.6 : enduranceTremble(seiza.phase)}
            />
            {/* VR only: your own hands and body following yours. */}
            <TrackedBody vrm={localVrm} source={LOCAL_TRACKING_SOURCE} layerWeightsRef={localLayerWeightsRef} />
            {/* First person, VR or screen: your body seen from your eyes,
                with your head hidden from your own camera. */}
            <SelfView vrm={localVrm} firstPerson={viewMode === "first"} lying={posture?.ground === "body"} />
          </PlayerRig>
          <XrBodyTracker positionRef={positionRef} rotationRef={rotationRef} onSend={(pose) => send({ type: "tracking", pose })} />
          <XrHud model={xrHudModel} />
          <RemotePlayers
            players={players}
            selfId={selfId}
            speakingLevels={media.speakingLevels}
            lastMessages={lastMessages}
            gestures={gestures}
            getStream={media.getStream}
            streamsVersion={media.streamsVersion}
          />
          <WorldObjects
            objects={objects}
            editMode={editMode && canEditWorld}
            selectedId={selectedObjectId}
            transformMode={transformMode}
            onSelect={setSelectedObjectId}
            onMove={moveObject}
            onEditText={handleEditText}
            onPresentToggle={(object) => void presentOn(object)}
            onOpenImage={openImage}
            resolveScreenStream={resolveScreenStream}
            onSit={editMode ? undefined : sitDown}
            occupiedSeatId={seat?.id ?? null}
          />
        </XR>
      </Canvas>

      {pendingPresentScreen && (
        <PresentSourceChooser
          cameraOn={media.cameraOn}
          onCancel={() => setPendingPresentId(null)}
          onChoose={(source) => {
            const target = pendingPresentScreen;
            setPendingPresentId(null);
            void presentOn(target, source);
          }}
        />
      )}

      {zoomedScreen && zoomedStream && (
        <ScreenZoomOverlay
          stream={zoomedStream}
          label={zoomedPresenterName}
          onClose={() => setZoomedScreenId(null)}
        />
      )}

      <HUD
        connectionState={connectionState}
        worldName={L(world.displayName, world.displayNameJa ?? world.displayName)}
        touchControlsVisible={showTouchControls}
        editing={editMode}
        topLeft={(
          <ParticipantRoster
            worldName={L(world.displayName, world.displayNameJa ?? world.displayName)}
            connectionState={connectionState}
            players={players}
            selfId={selfId}
            isAdmin={isAdmin}
            onMute={(targetId, muted) => adminSetMute(targetId, muted)}
            onKick={(targetId) => adminKick(targetId)}
            onTeleportTo={teleportToPlayer}
            onGatherAll={adminGatherAll}
          />
        )}
        topRight={(
          <>
            <TopCenterCluster
              side={
                seiza.startedAt != null && seizaView === "badge" ? (
                  <SeizaTimerBadge startedAt={seiza.startedAt} onOpen={() => setSeizaView("full")} />
                ) : undefined
              }
            >
              {adminKeyRequired && (
                <AdminButton
                  isAdmin={isAdmin}
                  authPending={adminAuthPending}
                  authFailed={adminAuthFailed}
                  onSubmit={authAdmin}
                  roomPasswordSet={roomPasswordSet}
                  onSetRoomPassword={adminSetRoomPassword}
                />
              )}
              <button
                type="button"
                aria-label={L("Controls guide", "操作ガイド")}
                title={L("Controls (?)", "操作方法 (?)")}
                aria-expanded={guideOpen}
                // Opens only. While the guide is open, a press here already
                // closes it as an outside press (on pointerdown), so a toggle
                // would close it and then reopen it on the click.
                onClick={() => setGuideOpen(true)}
                style={{ ...pillButtonStyle, width: 36, height: 36, padding: 0, justifyContent: "center", flexShrink: 0, pointerEvents: "auto", fontWeight: 600 }}
              >
                ?
              </button>
              <LangToggle style={{ height: 36, flexShrink: 0, pointerEvents: "auto" }} />
            </TopCenterCluster>
            <div style={{ position: "relative", pointerEvents: "auto", flexShrink: 0 }}>
            <button
              type="button"
              aria-expanded={avatarMenuOpen}
              style={avatarMenuOpen ? { ...pillButtonStyle, background: "rgba(232,195,122,0.24)", borderColor: "rgba(232,195,122,0.7)" } : pillButtonStyle}
              onClick={() => setAvatarMenuOpen((open) => !open)}
              title={L("Avatar (C)", "アバター (C)")}
            >
              {L("Avatar", "アバター")} {hasHoverPointer && <kbd style={{ opacity: 0.7, fontSize: 10 }}>C</kbd>}
            </button>
            {avatarMenuOpen && (
              <div
                className="seiza-popover-down"
                role="dialog"
                aria-label={L("Avatar", "アバター")}
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
                  <strong>{L("Avatar", "アバター")}</strong>
                  <button type="button" aria-label={L("Close", "閉じる")} onClick={() => setAvatarMenuOpen(false)} style={{ ...pillButtonStyle, padding: 6 }}>
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
                    setAvatarMessage(L("Avatar updated for everyone in the room.", "部屋の全員にアバターが更新されました。"));
                  }}
                />
                {avatarMessage && <small style={{ color: "#7CFF9E" }}>{avatarMessage}</small>}
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={seizaReactions}
                    onChange={(e) => setSeizaReactions(e.target.checked)}
                    style={{ marginTop: 2, accentColor: "#e8c37a" }}
                  />
                  <span style={{ display: "grid", gap: 2 }}>
                    <span>{L("Seiza reactions", "正座のリアクション")}</span>
                    <small style={{ opacity: 0.6, lineHeight: 1.4 }}>
                      {L(
                        "Your avatar dozes off and winces the longer it kneels. Turn off to keep it composed for meetings; you still see everyone else's.",
                        "正座が長くなるとアバターが居眠りしたり、しびれて顔をしかめたりします。会議では落ち着いたままにするにはオフにしてください。ほかの人のリアクションは見えます。"
                      )}
                    </small>
                  </span>
                </label>
              </div>
            )}
            </div>
          </>
        )}
      >
        {(seat || posture) && (
          <button
            type="button"
            className="seiza-bar-btn"
            style={barButtonActiveStyle}
            onClick={standUp}
            aria-label={L("Stand up", "立つ")}
            title={L("Stand up (or just move)", "立つ(または移動する)")}
          >
            <PersonIcon />
            <span className={BAR_LABEL_CLASS}>{L("Stand up", "立つ")}</span>
          </button>
        )}
        <button
          type="button"
          className="seiza-bar-btn"
          style={barButtonStyle}
          onClick={() => void enterVR()}
          aria-label={L("Enter VR", "VRに入る")}
          title={L("Enter VR", "VRに入る")}
        >
          <VrHeadsetIcon />
          <span className={BAR_LABEL_CLASS}>VR</span>
        </button>
        <CameraViewToggle viewMode={viewMode} onToggle={() => setViewMode((v) => (v === "first" ? "third" : "first"))} />
        <div className="seiza-bar-divider" aria-hidden />
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
          together={
            togetherGestures.length
              ? {
                  gestures: togetherGestures.map((name) => ({ name, label: togetherLabel(name) })),
                  nearby: nearby.map((p) => ({ id: p.id, name: p.displayName })),
                  allow: together.allow,
                  onAllowChange: setAllowRequests,
                  waiting: !!together.outgoing,
                  onAsk: askTogether,
                }
              : null
          }
        />
        <div className="seiza-bar-divider" aria-hidden />
        <ChatPanel
          open={chatOpen}
          onToggle={() => setChatOpen((v) => !v)}
          messages={shownMessages}
          selfId={selfId}
          onSend={sendChat}
          connected={connected}
        />
        <div className="seiza-bar-divider" aria-hidden />
        <EditToolbar
          enabled={editingEnabled}
          connected={connected}
          editMode={editMode}
          panelOpen={editPanelOpen}
          onToggleEditMode={() => {
            // Minimised, the bar button brings the tools back rather than
            // ending edit mode out from under the player.
            if (editMode && !editPanelOpen) {
              setEditPanelOpen(true);
              return;
            }
            setEditPanelOpen(true);
            setEditMode((v) => !v);
            setSelectedObjectId(null);
          }}
          onMinimize={() => setEditPanelOpen(false)}
          onExit={() => {
            setEditMode(false);
            setSelectedObjectId(null);
          }}
          onSpawn={handleSpawn}
          selectedId={selectedObjectId}
          transformMode={transformMode}
          onTransformModeChange={setTransformMode}
          onSnapToFloor={handleSnapToFloor}
          onDeselect={() => setSelectedObjectId(null)}
          onDeleteSelected={handleDeleteSelected}
          selectedImage={selectedObjectId && objects[selectedObjectId]?.kind === "image" ? objects[selectedObjectId] : null}
          onSetLink={setObjectLink}
          editorPasswordRequired={editGateProps.editorPasswordRequired}
          isEditor={editGateProps.isEditor}
          editorAuthPending={editGateProps.editorAuthPending}
          editorAuthFailed={editGateProps.editorAuthFailed}
          onAuthEditor={editGateProps.onAuthEditor}
          authLabel={editGateProps.authLabel}
          environmentUrl={environmentUrl}
          onSetEnvironment={setEnvironment}
          skyboxUrl={skyboxUrl}
          onSetSkybox={setSkybox}
          worldSky={world.sky}
          roomSky={roomSky}
          onSetRoomSky={setRoomSky}
        />
      </HUD>
      {/* A world's own cards and controls (WorldExtension). Beside the HUD,
          not inside it: on a phone the HUD's controls fold into a drawer,
          which hid every world card until the drawer was opened. */}
      <WorldOverlay />
      {openImageId && objects[openImageId]?.kind === "image" && <ImageViewer object={objects[openImageId]} onClose={closeImage} />}
      {/* Someone is talking but the browser still holds audio back (the
          Join click usually unlocks it; see src/media/audioContext.ts). */}
      {media.audioBlocked && (
        <button
          type="button"
          onClick={media.unlockAudio}
          style={{ ...pillButtonStyle, position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", zIndex: 45, pointerEvents: "auto", fontWeight: 600 }}
        >
          🔈 {L("Tap to hear the room", "タップして音声を聞く")}
        </button>
      )}
      <TogetherPrompt
        nameOf={nameOfPlayer}
        near={nearby[0] ? { id: nearby[0].id, name: nearby[0].displayName } : null}
        busy={!!localGesture || !!posture || !!seat}
        gestures={togetherGestures.map((name) => ({ name, label: togetherLabel(name) }))}
      />
      {showTouchControls && !webglLost && (
        <TouchControls
          inputRef={touchInputRef}
          // Only offered when this deployment actually has the clip —
          // world.json can narrow the built-in gesture list, and a
          // button that silently does nothing is worse than no button.
          onToggleSeiza={seizaGesture ? () => requestGesture(seizaGesture.name) : undefined}
          seizaActive={posture?.name === SEIZA_GESTURE_NAME}
          onCrouchStart={crouchGesture ? () => requestGesture(crouchGesture.name) : undefined}
          onCrouchEnd={crouchGesture ? () => releaseGesture(crouchGesture.name) : undefined}
          crouching={crouching}
        />
      )}
      {!webglLost && <FpsCounter aboveTouchControls={showTouchControls} />}
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
            <h2>{L("3D graphics paused", "3D表示が一時停止しています")}</h2>
            <p>{L("The browser lost its graphics context. We are waiting for it to recover. Reload this page if the scene does not return.", "ブラウザがグラフィックスを失いました。回復を待っています。画面が戻らない場合はページを再読み込みしてください。")}</p>
          </div>
        </div>
      )}
      {/* An XR error outranks a plain notice, but either one must be able
          to leave the screen — see Toast.tsx for why that's stated so
          firmly. Whichever is showing is the one `onDismiss` clears. */}
      <ControlsGuide open={guideOpen} onClose={() => setGuideOpen(false)} touch={showTouchControls} />
      {seiza.startedAt != null && seizaView !== "badge" && (
        <SeizaTimer
          startedAt={seiza.startedAt}
          best={seizaBest}
          view={seizaView}
          onViewChange={setSeizaView}
          onTurnOff={() => {
            setSeizaReactions(false);
            setNotice(L("Your avatar will now kneel composed, for everyone. Others' reactions still show. Turn yours back on in the Avatar menu.", "あなたのアバターは落ち着いて正座するようになりました。ほかの人のリアクションは表示されます。アバターメニューで元に戻せます。"));
          }}
        />
      )}
      {(xrError || notice) && (
        <Toast
          message={xrError ?? notice ?? ""}
          tone={xrError ? "error" : "info"}
          onDismiss={() => (xrError ? setXrError(null) : setNotice(null))}
        />
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

/**
 * Shown instead of the world whenever useRoomSocket's `passwordRequired`
 * is true (see that flag's doc comment) — a returning admin who's
 * already inside can set/change this from AdminButton, but reaching it
 * from the outside always goes through this gate first, no exceptions.
 */
function RoomPasswordGate({ onSubmit }: { onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
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
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (password) onSubmit(password);
        }}
        style={{ ...panelStyle, width: "min(320px, 90vw)", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <strong style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          <LockIcon size={16} /> {L("This room requires a password", "この部屋にはパスワードが必要です")}
        </strong>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={L("Room password", "部屋のパスワード")}
          style={inputStyle}
          autoFocus
        />
        <button type="submit" style={primaryButtonStyle} disabled={!password}>
          {L("Join", "参加")}
        </button>
      </form>
    </div>
  );
}
