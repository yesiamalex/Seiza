import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../avatar/VrmAvatar";
import { AvatarAnimator } from "../avatar/AvatarAnimator";
import { findGesture, SIT_GESTURE_NAME, type GestureDefinition } from "../avatar/gestures";
import { NameTag } from "./NameTag";
import type { PlayerState } from "./types";

interface RemotePlayersProps {
  players: Record<string, PlayerState>;
  selfId: string | null;
  speakingLevels: Record<string, number>;
  gestures: GestureDefinition[];
}

const SPEAKING_THRESHOLD = 0.05;
// Position updates arrive ~5 times a second. Following them with an
// exponential ease instead of jumping keeps motion smooth, gives the
// animator a believable ground speed, and stops spring-bone hair from
// whipping every 200ms.
const FOLLOW_RATE = 10;
const SNAP_DISTANCE = 6;

/** Renders every connected player except the local one. */
export function RemotePlayers({ players, selfId, speakingLevels, gestures }: RemotePlayersProps) {
  return (
    <>
      {Object.values(players)
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <RemotePlayerAvatar
            key={p.id}
            player={p}
            gestures={gestures}
            speaking={(speakingLevels[p.id] ?? 0) > SPEAKING_THRESHOLD}
          />
        ))}
    </>
  );
}

function lerpAngle(from: number, to: number, t: number) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * t;
}

function RemotePlayerAvatar({ player, speaking, gestures }: { player: PlayerState; speaking: boolean; gestures: GestureDefinition[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const targetRef = useRef(player);
  targetRef.current = player;
  const smoothed = useRef<THREE.Vector3 | null>(null);
  const yaw = useRef(player.rotationY);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const target = targetRef.current;
    const goal = new THREE.Vector3(target.position[0], target.position[1], target.position[2]);
    const t = 1 - Math.exp(-FOLLOW_RATE * Math.min(delta, 0.1));
    if (!smoothed.current || smoothed.current.distanceTo(goal) > SNAP_DISTANCE) {
      smoothed.current = goal;
    } else {
      smoothed.current.lerp(goal, t);
    }
    yaw.current = lerpAngle(yaw.current, target.rotationY, t);
    group.position.copy(smoothed.current);
    group.rotation.y = yaw.current;
  });

  // AvatarAnimator only plays when the sequence number changes, so a
  // gesture that was already running before we joined isn't replayed.
  // Names this client's world.json doesn't define are ignored.
  const seq = player.gestureSeq ?? 0;
  const gesture = findGesture(gestures, player.activeGesture);
  // Sitting is a posture, not a gesture, so it survives them: a seated
  // player who waves stays seated here too.
  const posture = player.posture === "sit" ? findGesture(gestures, SIT_GESTURE_NAME) : null;

  return (
    <group ref={groupRef}>
      <VrmAvatar url={player.avatarUrl} onLoaded={setVrm} />
      <AvatarAnimator
        vrm={vrm}
        getPosition={() => groupRef.current?.position ?? new THREE.Vector3()}
        gesture={gesture}
        gestureSeq={seq}
        posture={posture}
      />
      <NameTag name={player.displayName} position={[0, 0, 0]} speaking={speaking} />
    </group>
  );
}
