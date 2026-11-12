/**
 * A guide in the world: a VRM avatar with a home spot (near where visitors
 * arrive) and an occasional short stroll, both on the shared clock
 * (route.ts), so everyone sees them in the same place. They talk with
 * whoever clicks them (store.ts, GuideHud.tsx, GuideXr.tsx).
 *
 * While you talk, the guide walks over and stays beside you, following if
 * you wander. Ask them to walk you somewhere and they lead the way along
 * the world's paths, waiting if you fall behind. All of that happens on
 * your screen only: everyone else still sees them at home. After a chat or
 * a walk they linger a little, then walk back home. Each answer comes
 * with one of Seiza's gestures and a face, chosen by brain.ts: a wave
 * hello, gasshō for thanks, a bow to decline, a shrug when they don't
 * know, pointing at a reading or the way.
 *
 * Cheap for an avatar: a model visitors may already have loaded, Seiza's
 * own animation clips, no light, and animation updated every third frame
 * when far away. Paths are looked up only when a walk starts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { AvatarAnimator } from "../avatar/AvatarAnimator";
import { buildGestureRegistry, findGesture, type GestureDefinition } from "../avatar/gestures";
import { VrmAvatar } from "../avatar/VrmAvatar";
import { NameTag } from "../multiplayer/NameTag";
import { floorHeightAt, getGround } from "../scene/layout";
import { registerGazeTarget } from "../xr/hud/gaze";
import { GuideXr } from "./GuideXr";
import { measure, pointAlong, Route, type Point, type RoutePosition, type Stop } from "./route";
import { guideSays, openGuide, stopLeading, useGuides } from "./store";
import { L, useLang } from "../i18n/lang";

export interface GuideProps {
  id: string;
  name: string;
  avatarUrl: string;
  /** The patrol. Stops with `wait: 0` are corners to walk through. */
  stops: Stop[];
  /** Metres a second on patrol: a stroll is about 1. */
  speed?: number;
  /** Walk the patrol along the world's paths (a model world's navmesh),
   *  rather than straight from stop to stop. */
  pathsOnPatrol?: boolean;
  getSelfPosition: () => [number, number, number];
  /** The world's walking routes (WorldSceneProps.findPath). */
  findPath?: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3[] | null;
  /** Where to look while standing, when nobody is near: the spawn point,
   *  say, so they greet arrivals. */
  faceAt?: [number, number];
}

const GESTURES = buildGestureRegistry({});
/** How far behind the visitor may fall before a guide leading them waits. */
const WAIT_FOR = 5.5;
/** Seconds a guide lingers after a chat or a walk before heading home. */
const IDLE_BEFORE_RETURN = 25;
/** Further than this, a guide you call on appears beside you. */
const FAR_AWAY = 25;
/** Leading and coming over are a little brisker than the patrol. */
const BRISK = 1.4;
const noRaycast = () => {};
/** The click target: drawn (so it can be hit) but writes nothing. */
const HIT_MATERIAL = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

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
  ctx.fillText(L("Click to ask me!", "クリックして質問してね!"), 128, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A local walk: along points, at a pace, for this visitor's view only. */
interface Walk {
  points: Point[];
  along: number[];
  done: number;
  kind: "come" | "lead" | "return";
}

export function Guide({ id, name, avatarUrl, stops, speed = 1, pathsOnPatrol = false, getSelfPosition, findPath, faceAt }: GuideProps) {
  const root = useRef<THREE.Group>(null);
  const hit = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const presenting = useXR((s) => s.session != null);
  const { open, threads, leading } = useGuides();
  const talking = open === id;
  const myLead = leading?.guide === id ? leading.place : null;
  const [vrm, setVrm] = useState<VRM | null>(null);
  const lang = useLang();
  const tagMaterial = useMemo(() => new THREE.SpriteMaterial({ map: tagTexture(), depthWrite: false, transparent: true }), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      tagMaterial.map?.dispose();
      tagMaterial.dispose();
    },
    [tagMaterial]
  );

  // The patrol, along the world's paths once they're there (a model
  // world's navmesh loads after the world does).
  const pathOf = (a: Point, b: Point): Point[] | null => {
    const p = findPath?.(new THREE.Vector3(...a), new THREE.Vector3(...b));
    return p && p.length > 1 ? p.map((v) => [v.x, v.y, v.z] as Point) : null;
  };
  const [route, setRoute] = useState(() => new Route(stops, speed));
  useEffect(() => {
    if (!pathsOnPatrol) return;
    const timer = window.setInterval(() => {
      if (!getGround()) return;
      window.clearInterval(timer);
      setRoute(new Route(stops, speed, pathOf));
    }, 800);
    return () => window.clearInterval(timer);
    // The stops are fixed for the guide's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsOnPatrol]);

  // Each answer's gesture and face. Opening a chat is a wave.
  const thread = threads[id] ?? [];
  const latest = [...thread].reverse().find((m) => m.from === "guide");
  const [move, setMove] = useState<{ gesture: GestureDefinition | null; seq: number }>({ gesture: null, seq: 0 });
  const lastId = useRef(-1);
  useEffect(() => {
    if (!talking) return;
    const fresh = latest && latest.id !== lastId.current;
    if (latest) lastId.current = latest.id;
    const name = fresh && thread.length > 1 ? latest?.reply?.gesture : "wave";
    setMove((m) => ({ gesture: findGesture(GESTURES, name ?? null), seq: m.seq + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talking, latest?.id]);
  const mood = latest?.reply?.mood ?? "happy";

  const pos = useMemo(() => new THREE.Vector3(), []);
  const onRoute = useMemo<RoutePosition>(() => ({ x: 0, y: 0, z: 0, heading: null }), []);
  const walk = useRef<Walk | null>(null);
  const placed = useRef(false);
  const yaw = useRef(0);
  const far = useRef(false);
  const tag = useRef<THREE.Sprite>(null);
  const waitingFor = useRef(false);

  const startWalk = (to: Point, kind: Walk["kind"]) => {
    const from: Point = [pos.x, pos.y, pos.z];
    const points = pathOf(from, to) ?? [from, to];
    walk.current = { points, along: measure(points), done: 0, kind };
  };

  // Lead the way when asked; come back to the patrol when done.
  useEffect(() => {
    if (myLead) startWalk(myLead.at, "lead");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLead]);
  // When the chat closes, wait a while where they are (you may come back
  // with another question), then walk home.
  const returnAt = useRef<number | null>(null);
  useEffect(() => {
    if (talking) returnAt.current = null;
    else if (placed.current && walk.current?.kind !== "lead") returnAt.current = performance.now() + IDLE_BEFORE_RETURN * 1000;
  }, [talking]);

  const scratch = useMemo<RoutePosition>(() => ({ x: 0, y: 0, z: 0, heading: null }), []);
  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    const [sx, sy, sz] = getSelfPosition();
    const toVisitor = Math.hypot(sx - pos.x, sz - pos.z);
    route.at(Date.now() / 1000, onRoute);
    let heading: number | null = null;

    if (!placed.current) {
      pos.set(onRoute.x, onRoute.y, onRoute.z);
      placed.current = true;
    }

    // Talking and not walking anywhere: come and stand beside the visitor,
    // and follow if they wander off.
    if (talking && !walk.current && toVisitor > 3.2) {
      const side = new THREE.Vector2(camera.position.x - sx, camera.position.z - sz);
      if (side.lengthSq() < 0.01) side.set(1, 0);
      side.normalize();
      const spot: Point = [sx - side.y * 1.3, sy, sz + side.x * 1.3];
      // From across the campus, a walk over would take minutes: they're
      // simply there, as if they'd seen you coming.
      if (toVisitor > FAR_AWAY) pos.set(...spot);
      else startWalk(spot, "come");
    }

    const w = walk.current;
    if (w) {
      const length = w.along[w.along.length - 1];
      // Leading: wait while the visitor catches up.
      waitingFor.current = w.kind === "lead" && toVisitor > WAIT_FOR;
      if (!waitingFor.current) w.done = Math.min(length, w.done + BRISK * dt);
      pointAlong(w.points, w.along, w.done, scratch);
      pos.set(scratch.x, scratch.y, scratch.z);
      heading = waitingFor.current ? null : scratch.heading;
      if (w.done >= length - 1e-3) {
        walk.current = null;
        if (w.kind === "lead" && myLead) {
          stopLeading();
          guideSays(id, { text: L(`Here we are: ${myLead.label}.`, `着きました。${myLead.labelJa ?? myLead.label}です。`), gesture: "point", mood: "happy", suggestions: [], via: "chat" });
          openGuide(id);
        } else if (w.kind === "return" && Math.hypot(onRoute.x - pos.x, onRoute.z - pos.z) > 2) {
          // The patrol moved on while walking back: catch it up.
          startWalk([onRoute.x, onRoute.y, onRoute.z], "return");
        }
      }
    } else if (!talking && returnAt.current !== null) {
      // Lingering after a chat or a walk, then heading home.
      if (performance.now() > returnAt.current) {
        returnAt.current = null;
        startWalk([onRoute.x, onRoute.y, onRoute.z], "return");
      }
    } else if (!talking) {
      // Home, or on one of their strolls (the round).
      pos.set(onRoute.x, onRoute.y, onRoute.z);
      heading = onRoute.heading;
    }

    // Feet on the floor: the path's own heights in a model world, the
    // built-in floor plan's otherwise.
    const y = getGround() ? pos.y : floorHeightAt(pos.x, pos.z);
    g.position.set(pos.x, y, pos.z);

    // Face the visitor when near or talking; otherwise the way they walk.
    const near = toVisitor < 4.5;
    const idleFacing = faceAt ? Math.atan2(-(faceAt[0] - pos.x), -(faceAt[1] - pos.z)) : yaw.current;
    const facing =
      heading !== null && !(talking && !walk.current) ? heading + Math.PI : near || talking || waitingFor.current ? Math.atan2(-(sx - pos.x), -(sz - pos.z)) : idleFacing;
    let d = facing - yaw.current;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw.current += d * (1 - Math.exp(-dt * 5));
    g.rotation.y = yaw.current;
    far.current = Math.hypot(camera.position.x - pos.x, camera.position.z - pos.z) > 15;
    if (tag.current) tag.current.visible = near && !talking;
  });

  useEffect(() => {
    const mesh = hit.current;
    if (!mesh) return;
    return registerGazeTarget(mesh, { keyAt: () => id, select: () => openGuide(id) });
  }, [id]);

  return (
    <group ref={root}>
      <mesh
        ref={hit}
        position={[0, 0.85, 0]}
        material={HIT_MATERIAL}
        userData={{ navIgnore: true }}
        onClick={(event) => {
          event.stopPropagation();
          openGuide(id);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[0.7, 1.7, 0.7]} />
      </mesh>
      <VrmAvatar url={avatarUrl} onLoaded={setVrm} updateEvery={() => (far.current ? 3 : 1)} />
      <AvatarAnimator
        vrm={vrm}
        updateEvery={() => (far.current ? 3 : 1)}
        getPosition={() => root.current?.position ?? new THREE.Vector3()}
        gesture={talking ? move.gesture : null}
        gestureSeq={move.seq}
        onGestureEnd={() => setMove((m) => ({ ...m, gesture: null }))}
        expression={talking ? mood : null}
      />
      <NameTag name={`${name} · guide`} position={[0, 0, 0]} speaking={false} />
      <sprite ref={tag} material={tagMaterial} position={[0, 2.25, 0]} scale={[0.7, 0.15, 1]} raycast={noRaycast} userData={{ navIgnore: true }} />
      {presenting && talking && <GuideXr guideId={id} />}
    </group>
  );
}
