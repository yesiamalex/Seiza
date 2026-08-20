import { useState } from "react";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../avatar/VrmAvatar";
import { GestureController } from "../avatar/GestureController";
import { useProceduralGait } from "../avatar/useProceduralGait";
import { GESTURES } from "../avatar/gestures";
import { NameTag } from "./NameTag";
import type { PlayerState } from "./types";

interface RemotePlayersProps {
  players: Record<string, PlayerState>;
  selfId: string | null;
  speakingLevels: Record<string, number>;
}

const SPEAKING_THRESHOLD = 0.05;

/** Renders every connected player except the local one. */
export function RemotePlayers({ players, selfId, speakingLevels }: RemotePlayersProps) {
  return (
    <>
      {Object.values(players)
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <RemotePlayerAvatar key={p.id} player={p} speaking={(speakingLevels[p.id] ?? 0) > SPEAKING_THRESHOLD} />
        ))}
    </>
  );
}

function RemotePlayerAvatar({ player, speaking }: { player: PlayerState; speaking: boolean }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const gestureUrl = player.activeGesture ? GESTURES[player.activeGesture]?.vrmaUrl ?? null : null;

  useProceduralGait(vrm, () => player.position, !!gestureUrl);

  return (
    <>
      <VrmAvatar url={player.avatarUrl} position={player.position} rotationY={player.rotationY} onLoaded={setVrm} />
      <GestureController vrm={vrm} activeGestureUrl={gestureUrl} />
      <NameTag name={player.displayName} position={player.position} speaking={speaking} />
    </>
  );
}
