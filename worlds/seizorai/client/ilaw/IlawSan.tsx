// Ilaw-san in the world: a student guide (one of the CC0 VRoid Studio
// samples the world already offers as avatars, animated by Seiza's own
// walk and idle clips), walking a loop of the exhibits (hall, garden,
// meadow, classroom) and pausing at each. She waves when you ask her
// something and smiles while you talk.
//
// Its route runs on the wall clock, so every visitor sees it in the same
// place without anything sent over the network. Click it (point and pull
// the trigger in a headset, or look at it in a phone viewer) to talk. While
// you're talking it waits beside you, on your screen only, then floats back
// onto its route.
//
// Cheap for an avatar: the same model file visitors may already have
// loaded, no light, and her animation updates only every third frame
// when she's far from you.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { AvatarAnimator } from "../../../../src/avatar/AvatarAnimator";
import { buildGestureRegistry, findGesture, type GestureDefinition } from "../../../../src/avatar/gestures";
import { VrmAvatar } from "../../../../src/avatar/VrmAvatar";
import { NameTag } from "../../../../src/multiplayer/NameTag";
import { floorHeightAt } from "../../../../src/scene/layout";
import { registerGazeTarget } from "../../../../src/xr/hud/gaze";
import { Clickable } from "../kit";
import { setChatOpen, useChat } from "./store";
import { XrChat } from "./Xr";

/** The route: [x, z, seconds to wait there]. Through the doorways, round
 *  the pond, down the steps, and back. */
const ROUTE: [number, number, number][] = [
  [5.0, 12.0, 30], // the welcome board
  [0, 15.0, 0],
  [0, 18.6, 0],
  [-4.4, 26.6, 30], // the solar array
  [-1.0, 22.4, 0],
  [3.2, 22.6, 0],
  [5.4, 27.2, 30], // the battery
  [2.2, 34.6, 0],
  [0, 36.6, 0],
  [0, 41.6, 0],
  [4.2, 44.0, 25], // a turbine
  [-4.2, 43.6, 20], // the other
  [0, 41.6, 0],
  [0, 36.6, 0],
  [0, 22.0, 0],
  [0, 18.6, 0],
  [0, 15.0, 0],
  [0, -2.8, 0],
  [0, -10.8, 0],
  [1.4, -18.6, 30], // the control room
  [-4.4, -12.6, 25], // the lab
  [0, -10.8, 0],
  [0, -2.8, 0],
];
const SPEED = 0.9; // metres a second: an unhurried stroll
/** The model: Sendagaya Shino, a CC0 VRoid Studio sample (pixiv Inc.),
 *  fetched at build time with the other preset avatars. */
export const ILAW_AVATAR = "/avatars/vroid/sendagaya-shino.vrm";

interface Leg {
  from: THREE.Vector2;
  to: THREE.Vector2;
  start: number;
  travel: number;
  wait: number;
}

const LEGS: Leg[] = (() => {
  const legs: Leg[] = [];
  let t = 0;
  for (let i = 0; i < ROUTE.length; i++) {
    const [x, z, wait] = ROUTE[i];
    const [nx, nz] = ROUTE[(i + 1) % ROUTE.length];
    const from = new THREE.Vector2(x, z);
    const to = new THREE.Vector2(nx, nz);
    const travel = from.distanceTo(to) / SPEED;
    legs.push({ from, to, start: t, travel, wait });
    t += wait + travel;
  }
  return legs;
})();
const LOOP = LEGS[LEGS.length - 1].start + LEGS[LEGS.length - 1].wait + LEGS[LEGS.length - 1].travel;

/** Where Ilaw-san is on its route at `seconds` (wall clock), and which way
 *  it's heading. The same for everyone. */
export function routeAt(seconds: number, out: THREE.Vector2): number {
  const t = ((seconds % LOOP) + LOOP) % LOOP;
  let leg = LEGS[0];
  for (const l of LEGS) if (l.start <= t) leg = l;
  const into = t - leg.start;
  const dir = leg.to.clone().sub(leg.from);
  if (into < leg.wait || leg.travel === 0) {
    out.copy(leg.from);
  } else {
    const k = (into - leg.wait) / leg.travel;
    // Ease into and out of each stop.
    out.copy(leg.from).lerp(leg.to, k * k * (3 - 2 * k));
  }
  return Math.atan2(dir.x, dir.y);
}

// --- the name tag --------------------------------------------------------------------------------

function tagTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 56;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(20,22,30,0.72)";
  ctx.beginPath();
  ctx.roundRect(8, 6, 240, 44, 20);
  ctx.fill();
  ctx.fillStyle = "#ffd58a";
  ctx.textAlign = "center";
  ctx.font = "600 24px system-ui, sans-serif";
  ctx.fillText("Click to ask me!", 128, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const noRaycast = () => {};

export function IlawSan({ getSelfPosition }: { getSelfPosition: () => [number, number, number] }) {
  const root = useRef<THREE.Group>(null);
  const hit = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const presenting = useXR((s) => s.session != null);
  const { open, messages } = useChat();
  const [vrm, setVrm] = useState<VRM | null>(null);
  const tagMaterial = useMemo(() => new THREE.SpriteMaterial({ map: tagTexture(), depthWrite: false, transparent: true }), []);
  useEffect(
    () => () => {
      tagMaterial.map?.dispose();
      tagMaterial.dispose();
    },
    [tagMaterial]
  );

  // Each answer comes with a gesture and a face (brain.ts picks them by
  // what kind of answer it is): a wave hello, gasshō for thanks, a bow to
  // decline, a shrug when she doesn't know, pointing at a reading. Opening
  // the chat is a wave.
  const [move, setMove] = useState<{ gesture: GestureDefinition | null; seq: number }>({ gesture: null, seq: 0 });
  const lastId = useRef(-1);
  const latest = [...messages].reverse().find((m) => m.from === "ilaw");
  useEffect(() => {
    if (!open) return;
    const reply = latest?.reply;
    const fresh = latest && latest.id !== lastId.current;
    if (latest) lastId.current = latest.id;
    const name = fresh && latest.id > 0 ? reply?.gesture : "wave";
    setMove((m) => ({ gesture: findGesture(GESTURES, name ?? null), seq: m.seq + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, latest?.id]);
  const mood = latest?.id && latest.id > 0 ? latest.reply?.mood ?? "happy" : "happy";

  // While this visitor is talking to her, she waits beside them; afterwards
  // she walks back onto the route everyone else sees.
  const route = useMemo(() => new THREE.Vector2(), []);
  const pos = useMemo(() => new THREE.Vector2(), []);
  const held = useRef<THREE.Vector2 | null>(null);
  const placed = useRef(false);
  const yaw = useRef(0);
  const far = useRef(false);
  const tag = useRef<THREE.Sprite>(null);
  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    const heading = routeAt(Date.now() / 1000, route);
    const [sx, , sz] = getSelfPosition();
    if (open) {
      if (!held.current) {
        // A step away from you, to the side, so she's in view.
        const toward = new THREE.Vector2(camera.position.x - sx, camera.position.z - sz);
        if (toward.lengthSq() < 0.01) toward.set(1, 0);
        toward.normalize();
        held.current = new THREE.Vector2(sx, sz).addScaledVector(new THREE.Vector2(-toward.y, toward.x), 1.3);
      }
    } else held.current = null;
    const goal = held.current ?? route;
    const previous = pos.clone();
    if (!placed.current) {
      pos.copy(goal);
      placed.current = true;
    } else {
      // On the route she follows it exactly; off it (coming to you, or
      // going back) she walks at a stroll, or jumps if it's far.
      const gap = pos.distanceTo(goal);
      const step = 1.3 * delta;
      if (gap > 30) pos.copy(goal);
      else if (gap > step) pos.add(goal.clone().sub(pos).setLength(step));
      else pos.copy(goal);
    }
    g.position.set(pos.x, floorHeightAt(pos.x, pos.y), pos.y);
    // Face you when you're near, otherwise the way she's walking.
    const moved = pos.clone().sub(previous);
    const near = Math.hypot(sx - pos.x, sz - pos.y) < 4.5;
    const goalYaw = near || open ? Math.atan2(-(sx - pos.x), -(sz - pos.y)) : moved.lengthSq() > 1e-8 ? Math.atan2(-moved.x, -moved.y) : headingYaw(heading);
    let d = goalYaw - yaw.current;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw.current += d * (1 - Math.exp(-delta * 5));
    g.rotation.y = yaw.current;
    far.current = Math.hypot(camera.position.x - pos.x, camera.position.z - pos.y) > 15;
    if (tag.current) tag.current.visible = near && !open;
  });

  useEffect(() => {
    const mesh = hit.current;
    if (!mesh) return;
    return registerGazeTarget(mesh, { keyAt: () => "ilaw", select: () => setChatOpen(true) });
  }, []);

  return (
    <group ref={root}>
      <Clickable onClick={() => setChatOpen(true)}>
        {/* An invisible target the size of a person, easy to click. */}
        <mesh ref={hit} position={[0, 0.85, 0]} visible={false} userData={{ navIgnore: true }}>
          <boxGeometry args={[0.7, 1.7, 0.7]} />
        </mesh>
      </Clickable>
      <VrmAvatar url={ILAW_AVATAR} onLoaded={setVrm} updateEvery={() => (far.current ? 3 : 1)} />
      <AvatarAnimator
        vrm={vrm}
        updateEvery={() => (far.current ? 3 : 1)}
        getPosition={() => root.current?.position ?? new THREE.Vector3()}
        gesture={open ? move.gesture : null}
        gestureSeq={move.seq}
        onGestureEnd={() => setMove((m) => ({ ...m, gesture: null }))}
        expression={open ? mood : null}
      />
      <NameTag name="Ilaw-san · guide" position={[0, 0, 0]} speaking={false} />
      <sprite ref={tag} material={tagMaterial} position={[0, 2.25, 0]} scale={[0.7, 0.15, 1]} raycast={noRaycast} userData={{ navIgnore: true }} />
      {presenting && open && <XrChat />}
    </group>
  );
}

/** routeAt's heading (atan2(dx, dz)) as an avatar's rotationY, which faces
 *  (−sin y, −cos y). */
/** Seiza's built-in gestures, which Ilaw-san's answers name. */
const GESTURES = buildGestureRegistry({});

const headingYaw = (heading: number) => heading + Math.PI;
