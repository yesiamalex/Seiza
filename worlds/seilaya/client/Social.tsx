// The in-world side of Seilaya's safety tools: who is inside this visitor's
// personal space (hidden from them) and who is close enough to ask for a
// together gesture, checked a few times a second; a soft ring on the floor
// that shows the boundary while someone is inside it; and the pronoun tags
// others have chosen to share, under their names.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import type { PlayerState } from "../../../src/multiplayer/types";
import { isPlayerHidden } from "../../../src/multiplayer/playerFilter";
import { FONT } from "./kit";
import { applyFilter, checkTogether, effectiveBubble, emit, REACH, state, useSafety } from "./safety";

/** Checks per second: people walk slowly enough that this never shows. */
const CHECK_HZ = 6;
/** Someone hidden by the bubble reappears a little further out than where
 *  they disappeared, so a person standing at the edge doesn't flicker. */
const HYSTERESIS = 0.25;

export function SafetyLoop({ selfId, players, getSelfPosition }: { selfId: string | null; players: Record<string, PlayerState>; getSelfPosition: () => [number, number, number] }) {
  const since = useRef(0);
  const playersRef = useRef(players);
  playersRef.current = players;
  const ring = useRef<THREE.Mesh>(null);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#f3d9a4", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  const ringOpacity = useRef(0);

  useFrame((_, delta) => {
    const [sx, , sz] = getSelfPosition();
    const radius = effectiveBubble();
    // The ring follows this visitor every frame; the checks run a few times a second.
    if (ring.current) {
      ring.current.position.set(sx, 0.03, sz);
      ring.current.scale.setScalar(Math.max(radius, 0.01));
      const target = radius > 0 && state.inBubble.size > 0 && !state.inRefuge ? 0.55 : 0;
      ringOpacity.current += (target - ringOpacity.current) * (1 - Math.exp(-delta / 0.15));
      ringMaterial.opacity = ringOpacity.current;
      ring.current.visible = ringOpacity.current > 0.01;
    }
    since.current += delta;
    if (since.current < 1 / CHECK_HZ) return;
    since.current = 0;
    checkTogether();

    let changed = false;
    const nearby: string[] = [];
    for (const player of Object.values(playersRef.current)) {
      if (player.id === selfId) continue;
      const d = Math.hypot(player.position[0] - sx, player.position[2] - sz);
      const inside = state.inBubble.has(player.id);
      const nowInside = radius > 0 && d < radius + (inside ? HYSTERESIS : 0);
      if (nowInside !== inside) {
        changed = true;
        if (nowInside) state.inBubble.add(player.id);
        else state.inBubble.delete(player.id);
      }
      if (d <= REACH && !state.blocked.has(player.id)) nearby.push(player.id);
    }
    for (const id of state.inBubble) {
      if (!playersRef.current[id]) {
        state.inBubble.delete(id);
        changed = true;
      }
    }
    if (changed) applyFilter();
    nearby.sort();
    if (changed || nearby.join() !== state.nearby.join()) {
      state.nearby = nearby;
      emit();
    }
  });

  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} material={ringMaterial} visible={false} renderOrder={1}>
      {/* A unit ring, scaled to the bubble's radius. */}
      <ringGeometry args={[0.94, 1, 64]} />
    </mesh>
  );
}

// --- pronoun tags --------------------------------------------------------------------------------

/** Just under Seiza's name tag (1.9 m), small, so the two read together. */
const TAG_HEIGHT = 1.72;
const FOLLOW_RATE = 10;

function PronounTag({ player, pronouns }: { player: PlayerState; pronouns: string }) {
  const group = useRef<THREE.Group>(null);
  const smoothed = useRef<THREE.Vector3 | null>(null);
  const playerRef = useRef(player);
  playerRef.current = player;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = `600 34px ${FONT}`;
      const width = Math.min(240, ctx.measureText(pronouns).width + 32);
      ctx.fillStyle = "rgba(20,24,36,0.78)";
      ctx.beginPath();
      ctx.roundRect((256 - width) / 2, 8, width, 48, 24);
      ctx.fill();
      ctx.fillStyle = "#f3d9a4";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pronouns, 128, 33);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [pronouns]);
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const p = playerRef.current;
    // The same easing Seiza's avatars use, so the tag stays with its avatar.
    const goal = new THREE.Vector3(p.position[0], p.position[1] + TAG_HEIGHT, p.position[2]);
    if (!smoothed.current || smoothed.current.distanceTo(goal) > 6) smoothed.current = goal;
    else smoothed.current.lerp(goal, 1 - Math.exp(-FOLLOW_RATE * Math.min(delta, 0.1)));
    g.position.copy(smoothed.current);
    g.visible = !isPlayerHidden(p.id);
  });

  return (
    <group ref={group}>
      <Billboard>
        <mesh renderOrder={2}>
          <planeGeometry args={[0.5, 0.125]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

export function PronounTags({ players, selfId }: { players: Record<string, PlayerState>; selfId: string | null }) {
  const safety = useSafety();
  return (
    <>
      {[...safety.pronouns.entries()].map(([id, pronouns]) => {
        const player = players[id];
        if (!player || id === selfId) return null;
        return <PronounTag key={`${id}:${pronouns}`} player={player} pronouns={pronouns} />;
      })}
    </>
  );
}
