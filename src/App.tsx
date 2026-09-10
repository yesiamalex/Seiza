import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { optimizeVrmAvatar } from "./avatar/optimizeVrm";
import { loadWorldConfig, type WorldConfig } from "./config/worldConfig";
import { Scene } from "./scene/Scene";
import { VrmAvatar } from "./avatar/VrmAvatar";
import { GestureController } from "./avatar/GestureController";
import { useProceduralGait } from "./avatar/useProceduralGait";
import { GESTURES } from "./avatar/gestures";
import { useRoomSocket } from "./multiplayer/useRoomSocket";
import { RemotePlayers } from "./multiplayer/RemotePlayers";
import { PlayerRig, type ViewMode } from "./player/PlayerRig";
import { TouchControls } from "./player/TouchControls";
import { createTouchMoveInput, isCoarsePointer, type TouchMoveInput } from "./player/touchInput";
import { useNavMesh } from "./nav/useNavMesh";
import { useVoiceChat } from "./voice/useVoiceChat";
import { VoiceControls } from "./voice/VoiceControls";
import { WorldObjects } from "./edit/WorldObjects";
import { EditToolbar } from "./edit/EditToolbar";
import { GestureMatchGame } from "./interactions/GestureMatchGame";
import { ChatPanel } from "./chat/ChatPanel";
import { HUD } from "./ui/HUD";
import { JoinScreen } from "./ui/JoinScreen";
import { CameraViewToggle } from "./ui/CameraViewToggle";
import { AvatarPicker } from "./ui/AvatarPicker";
import { panelStyle, pillButtonStyle, popoverStyle } from "./ui/styles";
import { VrHeadsetIcon } from "./ui/icons";
import type { WorldObject } from "./multiplayer/types";

// Keep baseline immersive VR compatible with headsets that do not implement
// optional scene-understanding or DOM-overlay features. These are not needed
// for Seiza's controller-based locomotion or in-world UI.
const xrStore = createXRStore({ meshDetection: false, planeDetection: false, domOverlay: false });
const OBJECT_COLORS = ["#c94f4f", "#4f8fc9", "#4fc97e", "#c9a94f", "#9a4fc9"];
const NETWORK_TICK_MS = 200;

interface JoinedIdentity {
  displayName: string;
  avatarUrl: string;
}

export default function App() {
  const [world, setWorld] = useState<WorldConfig | null>(null);
  const [worldError, setWorldError] = useState<Error | null>(null);
  const [joined, setJoined] = useState<JoinedIdentity | null>(null);
  const [localVrm, setLocalVrm] = useState<VRM | null>(null);
  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  // First person needs Pointer Lock (unsupported on mobile browsers) and
  // WASD (no keyboard on a phone), so a touch visitor defaulted into it
  // can neither look nor move. Third person is the mode that actually
  // works there: drag to look, tap the floor to walk.
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "third" : "first"
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");
  const [xrError, setXrError] = useState<string | null>(null);
  const [webglLost, setWebglLost] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRightsConfirmed, setAvatarRightsConfirmed] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const moveTargetRef = useRef<THREE.Vector3 | null>(null);
  const movePathRef = useRef<THREE.Vector3[] | null>(null);
  // Environment geometry the navmesh is generated from — Scene's own
  // group, so avatars and edit gizmos elsewhere in the graph aren't
  // baked into the walkable surface.
  const navSourceRef = useRef<THREE.Group | null>(null);
  const navMesh = useNavMesh(navSourceRef);
  const touchInputRef = useRef<TouchMoveInput>(createTouchMoveInput());
  const [showTouchControls] = useState(isCoarsePointer);
  const gestureTimerRef = useRef<number | null>(null);

  useEffect(() => {
    loadWorldConfig().then(setWorld).catch(setWorldError);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyC") return;
      // Without the modifier check this swallows Ctrl+C / Cmd+C — i.e.
      // copying anything on the page would toggle the avatar menu.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      setAvatarMenuOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => () => {
    if (gestureTimerRef.current !== null) window.clearTimeout(gestureTimerRef.current);
  }, []);

  // Escape any active pointer lock the moment edit mode turns on, so the
  // cursor is immediately free to drag transform gizmos.
  useEffect(() => {
    if (editMode && document.pointerLockElement) document.exitPointerLock();
  }, [editMode]);


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
    joined?.avatarUrl ?? "",
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
  const voice = useVoiceChat({ selfId, players, sendSignal });
  voiceSignalHandlerRef.current = voice.handleSignal;

  const positionRef = useRef<[number, number, number]>([0, 0, 0]);
  const rotationRef = useRef(0);

  // voice.updateSpatial is recreated whenever `players` changes (i.e.
  // often) — read it through a ref inside the interval below rather than
  // as an effect dependency, so the interval doesn't need to be torn
  // down and rebuilt on every remote-player update, and so it never
  // calls a stale closure bound to an old `players` snapshot.
  const updateSpatialRef = useRef(voice.updateSpatial);
  updateSpatialRef.current = voice.updateSpatial;

  useEffect(() => {
    if (!connected) return;
    const interval = window.setInterval(() => {
      send({ type: "state", position: positionRef.current, rotationY: rotationRef.current });
      updateSpatialRef.current(positionRef.current);
    }, NETWORK_TICK_MS);
    return () => window.clearInterval(interval);
  }, [connected, send]);

  const requestGesture = useCallback(
    (gesture: string) => {
      if (!GESTURES[gesture]?.available) return;
      if (gestureTimerRef.current !== null) window.clearTimeout(gestureTimerRef.current);
      setActiveGesture(gesture);
      send({ type: "gesture", gesture });
      // Auto-clears locally after a rough guess at clip duration. A real
      // implementation should read the clip's actual length instead of
      // guessing — TODO.
      gestureTimerRef.current = window.setTimeout(() => {
        gestureTimerRef.current = null;
        setActiveGesture(null);
      }, 2000);
    },
    [send]
  );

  const handleSpawn = useCallback(
    (kind: WorldObject["kind"], modelUrl?: string) => {
      const [px, py, pz] = positionRef.current;
      const yaw = rotationRef.current;
      const distance = 2;
      const spawnPosition: [number, number, number] = [px - Math.sin(yaw) * distance, py + 1, pz - Math.cos(yaw) * distance];
      addObject({
        kind,
        modelUrl,
        color: OBJECT_COLORS[Math.floor(Math.random() * OBJECT_COLORS.length)],
        position: spawnPosition,
        rotationY: 0,
        scale: 1,
      });
    },
    [addObject]
  );

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

  // Double-click-to-move: only in third person (in first person the cursor is
  // pointer-locked and clicking means something else — look-lock, not a
  // world-space point) and not while editing (where a floor click should
  // do nothing rather than yank you away mid-edit).
  const handleFloorClick = useCallback(
    (point: THREE.Vector3) => {
      if (editMode || viewMode !== "third") return;
      const destination = point.clone();
      const from = new THREE.Vector3(positionRef.current[0], positionRef.current[1], positionRef.current[2]);
      // Route around walls/pillars when a navmesh is available; fall back
      // to the old straight-line walk when it isn't (see useNavMesh).
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
    [editMode, viewMode, navMesh]
  );

  if (worldError) return <CenteredMessage text={`Couldn't load world: ${worldError.message}`} />;
  if (!world) return <CenteredMessage text="Loading world…" />;
  if (roomFull) return <CenteredMessage text={`This world is currently full (${roomFull} people). Please try again later.`} />;
  if (!joined) return <JoinScreen world={world} onJoin={(displayName, avatarUrl) => setJoined({ displayName, avatarUrl })} />;

  const editingEnabled = world.editingEnabled !== false;
  const voiceVisible = world.voiceEnabled;

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

  async function uploadAvatar(file: File) {
    setAvatarMessage(null);
    if (!avatarRightsConfirmed) {
      setAvatarMessage("Confirm that you have permission to use this avatar first.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".vrm")) {
      setAvatarMessage("Choose a .vrm avatar file.");
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      setAvatarMessage("That avatar is over 60MB. Choose a smaller export.");
      return;
    }
    setAvatarUploading(true);
    try {
      const result = await optimizeVrmAvatar(file);
      const response = await fetch("/api/avatars", { method: "POST", body: result.blob });
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? `Avatar upload failed (${response.status}).`);
      setJoined((identity) => identity ? { ...identity, avatarUrl: payload.url! } : identity);
      setAvatarMessage("Avatar updated. Reconnecting the room…");
      setAvatarRightsConfirmed(false);
    } catch (error) {
      setAvatarMessage(error instanceof Error ? error.message : "Avatar upload failed.");
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <Canvas
        camera={{ position: [0, 1.6, 4] }}
        shadows
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
            <Scene sceneUrl={environmentUrl ?? world.sceneUrl} onFloorDoubleClick={handleFloorClick} />
          </group>
          <PlayerRig
            spawnPoint={[world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z]}
            positionRef={positionRef}
            rotationRef={rotationRef}
            pointerLockEnabled={!editMode}
            viewMode={viewMode}
            moveTargetRef={moveTargetRef}
            movePathRef={movePathRef}
            touchInputRef={touchInputRef}
          >
            <VrmAvatar url={joined.avatarUrl} onLoaded={setLocalVrm} />
            <GestureController
              vrm={localVrm}
              activeGestureUrl={activeGesture ? GESTURES[activeGesture]?.vrmaUrl ?? null : null}
            />
            {viewMode === "third" && <LocalGaitController vrm={localVrm} positionRef={positionRef} suppressed={!!activeGesture} />}
          </PlayerRig>
          <RemotePlayers players={players} selfId={selfId} speakingLevels={voice.speakingLevels} />
          <WorldObjects
            objects={objects}
            editMode={editMode && editingEnabled && isEditor}
            selectedId={selectedObjectId}
            transformMode={transformMode}
            onSelect={setSelectedObjectId}
            onMove={moveObject}
          />
        </XR>
      </Canvas>

      <HUD
        connectionState={connectionState}
        worldName={world.displayName}
        touchControlsVisible={showTouchControls}
        topRight={(
          <div style={{ position: "relative", pointerEvents: "auto" }}>
            <button style={avatarMenuOpen ? { ...pillButtonStyle, background: "rgba(232,195,122,0.24)", borderColor: "rgba(232,195,122,0.7)" } : pillButtonStyle} onClick={() => setAvatarMenuOpen((open) => !open)} title="Avatar (C)">
              Avatar <kbd style={{ opacity: 0.7, fontSize: 10 }}>C</kbd>
            </button>
            {avatarMenuOpen && (
              <div className="seiza-popover-right" style={{ ...panelStyle, ...popoverStyle, left: "auto", right: 0, transform: "none", transformOrigin: "top right", width: "min(320px, calc(100vw - 32px))", display: "flex", flexDirection: "column", gap: 8 }}>
                <strong>Avatar</strong>
                <small style={{ opacity: 0.75 }}>VRM files use the VRM humanoid mapping, so licensed gesture clips can retarget automatically.</small>
                <AvatarPicker
                  presets={world.defaultAvatars ?? []}
                  selectedUrl={joined.avatarUrl}
                  onSelect={(url) => {
                    setJoined((identity) => (identity ? { ...identity, avatarUrl: url } : identity));
                    setAvatarMessage(url ? "Avatar updated. Reconnecting the room…" : "Using the built-in placeholder avatar.");
                  }}
                  disabled={avatarUploading}
                />
                <button style={pillButtonStyle} onClick={() => { setJoined((identity) => identity ? { ...identity, avatarUrl: "" } : identity); setAvatarMessage("Using the built-in placeholder avatar."); }}>Use default avatar</button>
                {world.allowAvatarUpload !== false && (
                  <>
                    <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12 }}>
                      <input type="checkbox" checked={avatarRightsConfirmed} onChange={(event) => setAvatarRightsConfirmed(event.target.checked)} />
                      <span>I have permission to use and share this avatar in this room.</span>
                    </label>
                    <input type="file" accept=".vrm" disabled={avatarUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.currentTarget.value = ""; }} />
                  </>
                )}
                {avatarUploading && <small>Uploading and checking the file…</small>}
                {avatarMessage && <small style={{ color: avatarMessage.includes("updated") || avatarMessage.includes("default") ? "#7CFF9E" : "#ffb347" }}>{avatarMessage}</small>}
              </div>
            )}
          </div>
        )}
      >
        <button style={pillButtonStyle} onClick={() => void enterVR()}>
          <VrHeadsetIcon /> Enter VR
        </button>
        <CameraViewToggle viewMode={viewMode} onToggle={() => setViewMode((v) => (v === "first" ? "third" : "first"))} />
        {voiceVisible && <VoiceControls voice={voice} />}
        <GestureMatchGame activeGesture={activeGesture} onRequestGesture={requestGesture} enabledGestures={world.enabledGestures} />
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
      {webglLost && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "auto", background: "rgba(6,7,9,0.86)", color: "white", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
          <div style={{ maxWidth: 420 }}>
            <h2>3D graphics paused</h2>
            <p>The browser lost its graphics context. We are waiting for it to recover. Reload this page if the scene does not return.</p>
          </div>
        </div>
      )}
      {xrError && (
        <div role="alert" style={{ position: "absolute", left: "50%", bottom: 82, transform: "translateX(-50%)", maxWidth: "min(420px, 90vw)", padding: "10px 14px", borderRadius: 10, backgroundColor: "rgba(80,30,24,0.94)", color: "white", fontFamily: "system-ui, sans-serif", fontSize: 13, textAlign: "center", pointerEvents: "auto" }}>
          {xrError}
        </div>
      )}
    </div>
  );
}

/** Thin bridge so useProceduralGait (needs useFrame) can run inside the
 *  Canvas tree while reading the local player's per-frame position from
 *  the same ref App.tsx already uses for network sync. */
function LocalGaitController({
  vrm,
  positionRef,
  suppressed,
}: {
  vrm: VRM | null;
  positionRef: React.MutableRefObject<[number, number, number]>;
  suppressed: boolean;
}) {
  useProceduralGait(vrm, () => positionRef.current, suppressed);
  return null;
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
