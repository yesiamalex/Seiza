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
import { VoiceControls } from "./voice/VoiceControls";
import { GestureMatchGame } from "./interactions/GestureMatchGame";
import { HUD } from "./ui/HUD";

const xrStore = createXRStore();

export default function App() {
  const [world, setWorld] = useState<WorldConfig | null>(null);
  const [worldError, setWorldError] = useState<Error | null>(null);
  const [localVrm, setLocalVrm] = useState<VRM | null>(null);
  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const displayName = useRef(`guest-${Math.random().toString(36).slice(2, 7)}`).current;

  useEffect(() => {
    loadWorldConfig().then(setWorld).catch(setWorldError);
  }, []);

  const { selfId, players, send, connected } = usePartySocket(
    world?.id ?? "",
    displayName,
    world?.defaultAvatarUrl ?? ""
  );

  // Position sync loop. Local player doesn't actually move yet in this
  // scaffold (see TODO below) — this loop exists so a real locomotion
  // implementation has somewhere to plug in without redesigning the
  // networking path.
  const localPositionRef = useRef<[number, number, number]>([0, 0, 0]);
  useEffect(() => {
    if (!connected) return;
    const interval = window.setInterval(() => {
      send({ type: "state", position: localPositionRef.current, rotationY: 0 });
    }, 200);
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

  if (worldError) return <CenteredMessage text={`Couldn't load world: ${worldError.message}`} />;
  if (!world) return <CenteredMessage text="Loading world…" />;

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <Canvas camera={{ position: [0, 1.6, 4] }}>
        <XR store={xrStore}>
          <Scene sceneUrl={world.sceneUrl} />
          <VrmAvatar
            url={world.defaultAvatarUrl}
            position={[world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z]}
            onLoaded={setLocalVrm}
          />
          <GestureController
            vrm={localVrm}
            activeGestureUrl={activeGesture ? GESTURES[activeGesture]?.vrmaUrl ?? null : null}
          />
          <RemotePlayers players={players} selfId={selfId} />
        </XR>
      </Canvas>

      <HUD connected={connected} worldName={world.displayName}>
        <button onClick={() => xrStore.enterVR()}>Enter VR</button>
        <VoiceControls />
        <GestureMatchGame activeGesture={activeGesture} onRequestGesture={requestGesture} />
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
