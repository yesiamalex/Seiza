import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../avatar/VrmAvatar";
import { AvatarAnimator, type AnimatorLayerWeights } from "../avatar/AvatarAnimator";
import { TrackedBody } from "../xr/body/TrackedBody";
import { findGesture, SEIZA_GESTURE_NAME, type GestureDefinition } from "../avatar/gestures";
import { enduranceExpression, enduranceTremble, useSeizaEndurance } from "../avatar/seizaEndurance";
import { SeizaMood } from "../avatar/SeizaMood";
import { ChatBubble } from "../chat/ChatBubble";
import { CameraBadge } from "../media/CameraBadge";
import { NameTag } from "./NameTag";
import type { PlayerState } from "./types";

interface RemotePlayersProps {
  players: Record<string, PlayerState>;
  selfId: string | null;
  speakingLevels: Record<string, number>;
  /** Most recent chat message per player id, for the floating bubbles. */
  lastMessages?: Record<string, { id: string; text: string }>;
  gestures: GestureDefinition[];
  /** A peer's live stream by id, for the camera panel beside them. */
  getStream?: (peerId: string, streamId: string | null | undefined) => MediaStream | null;
  /** Changes when remote streams appear or disappear. */
  streamsVersion?: number;
}

/**
 * At most this many camera panels are decoded at once. In a full room every
 * camera would otherwise be a live video decode, whether or not you can see
 * the person; the nearest few are the ones worth paying for.
 */
const MAX_VISIBLE_CAMERAS = 4;

const SPEAKING_THRESHOLD = 0.05;
// Position updates arrive ~5 times a second. Following them with an
// exponential ease instead of jumping keeps motion smooth, gives the
// animator a believable ground speed, and stops spring-bone hair from
// whipping every 200ms.
const FOLLOW_RATE = 10;
/** Inside this radius (metres, horizontal) a remote avatar is hidden so
 *  the camera never ends up inside its mesh; it reappears a little
 *  further out so the two thresholds can't oscillate. */
const AVATAR_HIDE_DISTANCE = 0.55;
const AVATAR_SHOW_DISTANCE = 0.7;
const SNAP_DISTANCE = 6;

/** Renders every connected player except the local one. */
export function RemotePlayers({ players, selfId, speakingLevels, lastMessages, gestures, getStream, streamsVersion = 0 }: RemotePlayersProps) {
  const [visibleCameras, setVisibleCameras] = useState<string[]>([]);
  const playersRef = useRef(players);
  playersRef.current = players;
  const sinceCheck = useRef(0);

  // Which camera panels are close enough to be worth decoding. Recomputed a
  // couple of times a second rather than every frame — people don't move
  // fast enough for that to show.
  useFrame((state, delta) => {
    sinceCheck.current += delta;
    if (sinceCheck.current < 0.5) return;
    sinceCheck.current = 0;
    const nearest = Object.values(playersRef.current)
      .filter((player) => player.id !== selfId && player.media?.camera)
      .map((player) => ({
        id: player.id,
        distance: state.camera.position.distanceToSquared(
          new THREE.Vector3(player.position[0], player.position[1], player.position[2])
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_VISIBLE_CAMERAS)
      .map((entry) => entry.id);
    setVisibleCameras((previous) =>
      previous.length === nearest.length && previous.every((id, index) => id === nearest[index]) ? previous : nearest
    );
  });

  return (
    <>
      {Object.values(players)
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <RemotePlayerAvatar
            key={p.id}
            player={p}
            gestures={gestures}
            speakingLevel={speakingLevels[p.id] ?? 0}
            lastMessage={lastMessages?.[p.id] ?? null}
            cameraStream={getStream?.(p.id, p.media?.camera) ?? null}
            cameraActive={visibleCameras.includes(p.id)}
            streamsVersion={streamsVersion}
          />
        ))}
    </>
  );
}

function lerpAngle(from: number, to: number, t: number) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * t;
}

function RemotePlayerAvatar({
  player,
  speakingLevel,
  lastMessage,
  gestures,
  cameraStream,
  cameraActive,
}: {
  player: PlayerState;
  /** Raw mic RMS: the boolean indicator and lip sync both derive from it. */
  speakingLevel: number;
  lastMessage: { id: string; text: string } | null;
  gestures: GestureDefinition[];
  cameraStream: MediaStream | null;
  cameraActive: boolean;
  /** Only here to re-render this avatar when its stream arrives. */
  streamsVersion: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const targetRef = useRef(player);
  targetRef.current = player;
  const smoothed = useRef<THREE.Vector3 | null>(null);
  const yaw = useRef(player.rotationY);
  const layerWeightsRef = useRef<AnimatorLayerWeights>({ gesture: 0, posture: 0 });

  useFrame((state, delta) => {
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

    // Hide an avatar that has walked into the camera.
    //
    // Two people standing on the same spot is normal here — there is no
    // body collision between players — and in first person the result is
    // the inside of someone's head filling the screen, with the camera's
    // near plane slicing through it. Hiding at close range is the
    // standard fix, and is better than clamping the near plane toward
    // zero, which wrecks depth precision for the entire scene.
    //
    // Compared in the XZ plane only: a tall avatar standing right on top
    // of you should disappear, and vertical distance to their hips
    // shouldn't rescue them. Hysteresis stops an avatar hovering at the
    // boundary from strobing.
    const camera = state.camera.position;
    const dx = camera.x - group.position.x;
    const dz = camera.z - group.position.z;
    const distance = Math.hypot(dx, dz);
    const threshold = group.visible ? AVATAR_HIDE_DISTANCE : AVATAR_SHOW_DISTANCE;
    group.visible = distance > threshold;
  });

  // AvatarAnimator only plays when the sequence number changes, so a
  // gesture that was already running before we joined isn't replayed.
  // Names this client's world.json doesn't define are ignored.
  const seq = player.gestureSeq ?? 0;
  const gesture = findGesture(gestures, player.activeGesture);
  // A posture is a held pose, not a gesture, so it survives them: a seated
  // player who waves stays seated here too. Unknown names are ignored, so a
  // deployment that removed a clip just shows that player standing.
  const posture = findGesture(gestures, player.posture ?? null);
  const seiza = useSeizaEndurance(player.posture === SEIZA_GESTURE_NAME);

  return (
    <group ref={groupRef}>
      <VrmAvatar url={player.avatarUrl} onLoaded={setVrm} />
      <AvatarAnimator
        vrm={vrm}
        getPosition={() => groupRef.current?.position ?? new THREE.Vector3()}
        gesture={gesture}
        gestureSeq={seq}
        posture={posture}
        speakingLevel={speakingLevel}
        headPitch={player.headPitch ?? 0}
        layerWeightsRef={layerWeightsRef}
        expression={enduranceExpression(seiza.phase)}
        doze={seiza.phase === "dozing"}
        tremble={enduranceTremble(seiza.phase)}
      />
      <SeizaMood phase={seiza.phase} />
      {/* Only does anything while this player is in a headset. */}
      <TrackedBody vrm={vrm} source={player.id} layerWeightsRef={layerWeightsRef} />
      <NameTag name={player.displayName} position={[0, 0, 0]} speaking={speakingLevel > SPEAKING_THRESHOLD} />
      {/* Clear of both the name tag (1.9m) and the speaker glyph that
          sits just above it (~2.2m) — at 2.22 the bubble and the glyph
          drew straight through each other whenever somebody typed while
          talking, which is a common pairing rather than an edge case. */}
      <ChatBubble text={lastMessage?.text ?? null} messageId={lastMessage?.id ?? null} y={2.52} />
      <CameraBadge stream={cameraStream} active={cameraActive} />
    </group>
  );
}
