import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import type { VRM } from "@pixiv/three-vrm";
import { loadWorldConfig, type WorldConfig } from "./config/worldConfig";
import { Scene } from "./scene/Scene";
import { VrmAvatar } from "./avatar/VrmAvatar";
import { GestureController } from "./avatar/GestureController";
import { GESTURES } from "./avatar/gestures";
import { usePartySocket } from "./multiplayer/usePartySocket";
import { RemotePlayers } from "./multiplayer/RemotePlayers";
import { PlayerRig } from "./player/PlayerRig";
import { useVoiceChat } from "./voice/useVoiceChat";
import { VoiceControls } from "./voice/VoiceControls";
import { WorldObjects } from "./edit/WorldObjects";
import { EditToolbar } from "./edit/EditToolbar";
import { GestureMatchGame } from "./interactions/GestureMatchGame";
import { HUD } from "./ui/HUD";
import { JoinScreen } from "./ui/JoinScreen";
import type { WorldObject } from "./multiplayer/types";

const xrStore = createXRStore();
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

  useEffect(() => {
    loadWorldConfig().then(setWorld).catch(setWorldError);
  }, []);

  // Escape any active pointer lock the moment edit mode turns on, so the
  // cursor is immediately free to drag transform gizmos.
  useEffect(() => {
    if (editMode && document.pointerLockElement) document.exitPointerLock();
  }, [editMode]);

  const voiceSignalHandlerRef = useRef<(from: string, data: unknown) => void>(() => {});
  const roomId = world && joined ? world.id : "";
  const { selfId, players, objects, send, addObject, moveObject, removeObject, connected } = usePartySocket(
    roomId,
    joined?.displayName ?? "",
    joined?.avatarUrl ?? "",
    useCallback((from: string, data: unknown) => voiceSignalHandlerRef.current(from, data), [])
  );

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
      setActiveGesture(gesture);
      send({ type: "gesture", gesture });
      // Auto-clears locally after a rough guess at clip duration. A real
      // implementation should read the clip's actual length instead of
      // guessing — TODO.
      window.setTimeout(() => setActiveGesture(null), 2000);
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

  if (worldError) return <CenteredMessage text={`Couldn't load world: ${worldError.message}`} />;
  if (!world) return <CenteredMessage text="Loading world…" />;
  if (!joined) return <JoinScreen world={world} onJoin={(displayName, avatarUrl) => setJoined({ displayName, avatarUrl })} />;

  const editingEnabled = world.editingEnabled !== false;
  const voiceVisible = world.voiceEnabled;

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <Canvas camera={{ position: [0, 1.6, 4] }} shadows>
        <XR store={xrStore}>
          <Scene sceneUrl={world.sceneUrl} />
          <PlayerRig
            spawnPoint={[world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z]}
            positionRef={positionRef}
            rotationRef={rotationRef}
            pointerLockEnabled={!editMode}
          >
            <VrmAvatar url={joined.avatarUrl} onLoaded={setLocalVrm} />
            <GestureController
              vrm={localVrm}
              activeGestureUrl={activeGesture ? GESTURES[activeGesture]?.vrmaUrl ?? null : null}
            />
          </PlayerRig>
          <RemotePlayers players={players} selfId={selfId} />
          <WorldObjects
            objects={objects}
            editMode={editMode && editingEnabled}
            selectedId={selectedObjectId}
            onSelect={setSelectedObjectId}
            onMove={moveObject}
          />
        </XR>
      </Canvas>

      <HUD connected={connected} worldName={world.displayName}>
        <button onClick={() => xrStore.enterVR()}>Enter VR</button>
        {voiceVisible && <VoiceControls voice={voice} />}
        <GestureMatchGame activeGesture={activeGesture} onRequestGesture={requestGesture} />
        <EditToolbar
          enabled={editingEnabled}
          editMode={editMode}
          onToggleEditMode={() => {
            setEditMode((v) => !v);
            setSelectedObjectId(null);
          }}
          onSpawn={handleSpawn}
          selectedId={selectedObjectId}
          onDeselect={() => setSelectedObjectId(null)}
          onDeleteSelected={handleDeleteSelected}
        />
      </HUD>
    </div>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        width: "100vw",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p>{text}</p>
    </div>
  );
}
