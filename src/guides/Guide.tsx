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
import { speak } from "./speech";
import { viewerPosition } from "../xr/viewer";
import { keepMirrorClearOf } from "../scene/Mirror";

/** The viewer's eyes in the world (see viewerPosition). */
const scratchEye = new THREE.Vector3();

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
  /** What they are, on their name tag ("guide" by default): "konbini clerk". */
  role?: string;
  /** Things they say now and then to nobody in particular when you're
   *  near, in a bubble over their head: Japanese, with English under it. */
  chatter?: Chatter[];
  /** Say the Japanese line aloud too, when you're close (speech.ts). */
  speak?: boolean;
  /** Their voice: a little higher or lower (1 is the browser's own). */
  pitch?: number;
  /** Where they are, each frame (for something to follow them: a dog on its lead). */
  onPlace?: (x: number, y: number, z: number, walking: boolean) => void;
  /** Whether they may take their round's next step, from where they are to
   *  where it goes (a world holds people at a closed level crossing). When
   *  not, they wait where they are, their round paused, and go on after. */
  mayStep?: (x0: number, z0: number, x1: number, z1: number) => boolean;
}

export interface Chatter {
  ja: string;
  en: string;
}

/** A chatter bubble: the Japanese large, the English beneath. */
export function bubbleTexture(line: Chatter) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 132;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 104, 26);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(236, 108);
  ctx.lineTo(256, 128);
  ctx.lineTo(276, 108);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#1d2230";
  const fit = (text: string, size: number, weight: number) => {
    let s = size;
    do ctx.font = `${weight} ${s}px system-ui, 'Hiragino Sans', 'Noto Sans CJK JP', 'Yu Gothic', sans-serif`;
    while (ctx.measureText(text).width > 470 && --s > 12);
  };
  fit(line.ja, 34, 700);
  ctx.fillText(line.ja, 256, 50);
  ctx.fillStyle = "#4a5266";
  fit(line.en, 24, 500);
  ctx.fillText(line.en, 256, 88);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Seconds between lines, and how long each shows. */
const CHATTER_GAP: [number, number] = [9, 17];
const CHATTER_SHOW = 5.5;
const CHATTER_RANGE = 9;

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

export function Guide({ id, name, avatarUrl, stops, speed = 1, pathsOnPatrol = false, getSelfPosition, findPath, faceAt, role = "guide", chatter, speak: aloud = false, pitch = 1, onPlace, mayStep }: GuideProps) {
  const bubble = useRef<THREE.Sprite>(null);
  const bubbleMaterial = useMemo(() => new THREE.SpriteMaterial({ depthWrite: false, transparent: true, opacity: 0 }), []);
  const chat = useRef({ next: 3 + Math.random() * 6, shown: -1, line: -1 });
  useEffect(
    () => () => {
      bubbleMaterial.map?.dispose();
      bubbleMaterial.dispose();
    },
    [bubbleMaterial]
  );
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
  // The world's mirror keeps out of the way of where this guide stands.
  useEffect(() => {
    return keepMirrorClearOf(stops.map((s): [number, number] => [s.at[0], s.at[2]]));
    // The stops are fixed for the guide's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  /** How far behind the clock their round is (time spent held up), and where it put them last frame. */
  const held = useRef<{ lag: number; at: [number, number, number] | null }>({ lag: 0, at: null });
  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    const [sx, sy, sz] = getSelfPosition();
    const toVisitor = Math.hypot(sx - pos.x, sz - pos.z);
    route.at(Date.now() / 1000 - held.current.lag, onRoute);
    // Held up (the barriers are down): stay put, the round paused till they lift.
    const was = held.current.at;
    if (mayStep && was && !walk.current && !talking && !mayStep(was[0], was[2], onRoute.x, onRoute.z)) {
      held.current.lag += dt;
      [onRoute.x, onRoute.y, onRoute.z] = was;
      onRoute.heading = null;
    }
    held.current.at = [onRoute.x, onRoute.y, onRoute.z];
    let heading: number | null = null;

    if (!placed.current) {
      pos.set(onRoute.x, onRoute.y, onRoute.z);
      placed.current = true;
    }

    // Talking and not walking anywhere: come and stand beside the visitor,
    // and follow if they wander off.
    if (talking && !walk.current && toVisitor > 3.2) {
      const eye = viewerPosition(camera, scratchEye);
      const side = new THREE.Vector2(eye.x - sx, eye.z - sz);
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
    onPlace?.(pos.x, y, pos.z, heading !== null);

    // Face the visitor when near or talking; otherwise the way they walk.
    const near = toVisitor < 4.5;
    const idleFacing = faceAt ? Math.atan2(-(faceAt[0] - pos.x), -(faceAt[1] - pos.z)) : yaw.current;
    const facing =
      heading !== null && !(talking && !walk.current) ? heading + Math.PI : near || talking || waitingFor.current ? Math.atan2(-(sx - pos.x), -(sz - pos.z)) : idleFacing;
    let d = facing - yaw.current;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw.current += d * (1 - Math.exp(-dt * 5));
    g.rotation.y = yaw.current;
    const eye = viewerPosition(camera, scratchEye);
    far.current = Math.hypot(eye.x - pos.x, eye.z - pos.z) > 15;
    if (tag.current) tag.current.visible = near && !talking && chat.current.shown < 0;
    // Now and then, near you and not talking: a line, in both languages.
    const c = chat.current;
    if (chatter?.length && bubble.current) {
      c.next -= dt;
      if (c.shown >= 0) c.shown += dt;
      if (c.shown < 0 && c.next <= 0 && toVisitor < CHATTER_RANGE && !talking) {
        c.line = (c.line + 1 + Math.floor(Math.random() * Math.max(1, chatter.length - 1))) % chatter.length;
        bubbleMaterial.map?.dispose();
        bubbleMaterial.map = bubbleTexture(chatter[c.line]);
        bubbleMaterial.needsUpdate = true;
        c.shown = 0;
        if (aloud && toVisitor < 7) speak(chatter[c.line].ja, "ja-JP", { volume: 1 - toVisitor / 8, pitch });
      }
      if (c.shown >= CHATTER_SHOW || (c.shown >= 0 && talking)) {
        c.shown = -1;
        c.next = CHATTER_GAP[0] + Math.random() * (CHATTER_GAP[1] - CHATTER_GAP[0]);
      }
      bubbleMaterial.opacity = c.shown < 0 ? 0 : Math.min(1, c.shown / 0.3, (CHATTER_SHOW - c.shown) / 0.5);
      bubble.current.visible = c.shown >= 0;
    }
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
      <NameTag name={`${name} · ${role}`} position={[0, 0, 0]} speaking={false} />
      {chatter?.length ? <sprite ref={bubble} material={bubbleMaterial} position={[0, 2.42, 0]} scale={[1.25, 0.32, 1]} visible={false} raycast={noRaycast} userData={{ navIgnore: true }} /> : null}
      <sprite ref={tag} material={tagMaterial} position={[0, 2.25, 0]} scale={[0.7, 0.15, 1]} raycast={noRaycast} userData={{ navIgnore: true }} />
      {presenting && talking && <GuideXr guideId={id} />}
    </group>
  );
}
