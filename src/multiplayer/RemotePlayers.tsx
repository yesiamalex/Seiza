import { useState } from "react";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../avatar/VrmAvatar";
import { GestureController } from "../avatar/GestureController";
import { GESTURES } from "../avatar/gestures";
import type { PlayerState } from "./types";

interface RemotePlayersProps {
  players: Record<string, PlayerState>;
  selfId: string | null;
}

/** Renders every connected player except the local one. */
export function RemotePlayers({ players, selfId }: RemotePlayersProps) {
  return (
    <>
      {Object.values(players)
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <RemotePlayerAvatar key={p.id} player={p} />
        ))}
    </>
  );
}

function RemotePlayerAvatar({ player }: { player: PlayerState }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const gestureUrl = player.activeGesture ? GESTURES[player.activeGesture]?.vrmaUrl ?? null : null;

  return (
    <>
      <VrmAvatar url={player.avatarUrl} position={player.position} rotationY={player.rotationY} onLoaded={setVrm} />
      <GestureController vrm={vrm} activeGestureUrl={gestureUrl} />
    </>
  );
}
