import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MAX_STROKE_POINTS, STROKE_COLORS, type Stroke } from "../multiplayer/types";
import { trackingStore } from "../xr/body/trackingStore";
import { buzz } from "../xr/controls";
import { penState, setPen, usePen } from "./pen";

/**
 * Drawing in the room: lines in the air or on anything, seen by everyone.
 *
 * Kept cheap at both ends. A stroke is sent once, when it's finished (the
 * one being drawn shows only on your own screen until then), and every
 * stroke in the room is one mesh, one draw call, rebuilt only when one is
 * added or taken away. The room keeps the last MAX_STROKES.
 *
 * - Flat screen and phone: with the pen on, drag across anything (a wall,
 *   the floor, a board) to draw on it; off everything, at the depth the
 *   stroke started at.
 * - Headset: with the pen on, hold the trigger to draw from the tip of
 *   the controller, or pinch with tracked hands to draw from your index
 *   finger.
 */
const RADIUS = 0.006;
/** A point only once the pen has moved this far. */
const STEP = 0.008;
/** A stroke shorter than this was a click, not a line. */
const MIN_LENGTH = 0.03;
/** Ahead of the wrist, where a controller's tip is. */
const CONTROLLER_TIP = 0.1;
const PINCH = 0.022;
const PINCH_RELEASE = 0.035;
/** In the air from a flat screen: this far along the ray, if it started on nothing. */
const AIR_DEPTH = 2;

function strokeGeometry(stroke: Stroke): THREE.BufferGeometry | null {
  const p = stroke.points;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i + 2 < p.length; i += 3) points.push(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
  if (points.length < 2) return null;
  const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.min(400, points.length * 2), RADIUS, 5, false);
  const color = new THREE.Color(STROKE_COLORS[stroke.color] ?? STROKE_COLORS[0]);
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function Strokes({ strokes, addStroke, canDraw }: { strokes: Stroke[]; addStroke: (color: number, points: number[]) => void; canDraw: boolean }) {
  const { gl, camera, scene } = useThree();
  const pen = usePen();
  const canDrawRef = useRef(canDraw);
  canDrawRef.current = canDraw;
  useEffect(() => {
    if (!canDraw && penState().on) setPen({ on: false });
  }, [canDraw]);

  // Every stroke, one mesh. Each stroke's tube is made once and kept.
  const cache = useRef(new Map<string, THREE.BufferGeometry | null>()).current;
  const material = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);
  const merged = useMemo(() => {
    const live = new Set(strokes.map((s) => s.id));
    for (const [id, g] of cache) if (!live.has(id)) {
      g?.dispose();
      cache.delete(id);
    }
    const parts: THREE.BufferGeometry[] = [];
    for (const s of strokes) {
      if (!cache.has(s.id)) cache.set(s.id, strokeGeometry(s));
      const g = cache.get(s.id);
      if (g) parts.push(g);
    }
    return parts.length ? mergeGeometries(parts) : null;
  }, [strokes, cache]);
  useEffect(() => () => merged?.dispose(), [merged]);
  useEffect(
    () => () => {
      for (const g of cache.values()) g?.dispose();
      cache.clear();
      material.dispose();
    },
    [cache, material]
  );

  // The stroke being drawn, as a line until it's sent.
  const live = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_STROKE_POINTS * 3), 3));
    geometry.setDrawRange(0, 0);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#ffffff", toneMapped: false }));
    line.frustumCulled = false;
    line.userData.noDraw = true;
    return line;
  }, []);
  const tip = useMemo(() => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
    mesh.visible = false;
    mesh.userData.noDraw = true;
    return mesh;
  }, []);
  useEffect(
    () => () => {
      live.geometry.dispose();
      (live.material as THREE.Material).dispose();
      tip.geometry.dispose();
      (tip.material as THREE.Material).dispose();
    },
    [live, tip]
  );
  useEffect(() => {
    const color = STROKE_COLORS[pen.color] ?? STROKE_COLORS[0];
    (live.material as THREE.LineBasicMaterial).color.set(color);
    (tip.material as THREE.MeshBasicMaterial).color.set(color);
  }, [pen.color, live, tip]);

  const drawing = useRef<{ points: THREE.Vector3[]; depth: number } | null>(null);
  const addRef = useRef(addStroke);
  addRef.current = addStroke;

  const showLive = () => {
    const d = drawing.current;
    const attr = live.geometry.getAttribute("position") as THREE.BufferAttribute;
    const n = d ? Math.min(d.points.length, MAX_STROKE_POINTS) : 0;
    for (let i = 0; i < n; i++) attr.setXYZ(i, d!.points[i].x, d!.points[i].y, d!.points[i].z);
    attr.needsUpdate = true;
    live.geometry.setDrawRange(0, n);
  };
  /** Sends what's drawn so far (if it's a line), and starts afresh from its end. */
  const finish = (carryOn: boolean) => {
    const d = drawing.current;
    if (!d) return;
    let length = 0;
    for (let i = 1; i < d.points.length; i++) length += d.points[i].distanceTo(d.points[i - 1]);
    if (d.points.length >= 2 && length >= MIN_LENGTH) addRef.current(penState().color, d.points.flatMap((p) => [round(p.x), round(p.y), round(p.z)]));
    drawing.current = carryOn ? { points: [d.points[d.points.length - 1].clone()], depth: d.depth } : null;
    showLive();
  };
  const addPoint = (p: THREE.Vector3) => {
    const d = drawing.current;
    if (!d) return;
    const last = d.points[d.points.length - 1];
    if (last && last.distanceTo(p) < STEP) return;
    d.points.push(p.clone());
    if (d.points.length >= MAX_STROKE_POINTS) finish(true);
    showLive();
  };

  // Flat screen: drag to draw on whatever's under the pointer.
  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastCast = 0;
    const under = (e: PointerEvent): { point: THREE.Vector3; distance: number } | null => {
      const rect = el.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        const o = hit.object as THREE.Mesh & { isSkinnedMesh?: boolean };
        if (!o.visible || o.userData.noDraw || o.isSkinnedMesh || !(o as THREE.Mesh).isMesh || !hit.face) continue;
        // Just off the surface, so the line sits on it rather than in it.
        const normal = hit.face.normal.clone().transformDirection(o.matrixWorld);
        return { point: hit.point.clone().addScaledVector(normal, RADIUS * 1.5), distance: hit.distance };
      }
      return null;
    };
    const along = (depth: number) => raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, depth);
    const down = (e: PointerEvent) => {
      if (!penState().on || !canDrawRef.current || gl.xr.isPresenting) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const hit = under(e);
      const depth = hit?.distance ?? AIR_DEPTH;
      drawing.current = { points: [hit?.point ?? along(depth)], depth };
      el.setPointerCapture?.(e.pointerId);
      showLive();
    };
    const move = (e: PointerEvent) => {
      if (!drawing.current || gl.xr.isPresenting) return;
      const now = performance.now();
      if (now - lastCast < 25) return;
      lastCast = now;
      const hit = under(e);
      addPoint(hit && Math.abs(hit.distance - drawing.current.depth) < 1.5 ? hit.point : along(drawing.current.depth));
    };
    const up = () => {
      if (drawing.current && !gl.xr.isPresenting) finish(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && penState().on) setPen({ on: false });
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
  }, [gl, camera, scene]);

  // Headset: the trigger, or a pinch, draws from the right hand.
  const pinched = useRef(false);
  const fingers = useMemo(() => new THREE.Vector3(), []);
  const at = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const session = gl.xr.getSession();
    const world = trackingStore.getLocalWorld();
    const hand = world?.right;
    if (!session || !hand?.active || !penState().on || !canDrawRef.current) {
      tip.visible = false;
      if (session && drawing.current) finish(false);
      return;
    }
    let pressing = false;
    if (hand.articulated) {
      at.copy(hand.tip);
      const gap = hand.tip.distanceTo(hand.thumb);
      pressing = pinched.current ? gap < PINCH_RELEASE : gap < PINCH;
      pinched.current = pressing;
    } else {
      fingers.set(0, 0, -1).applyQuaternion(hand.quaternion);
      at.copy(hand.position).addScaledVector(fingers, CONTROLLER_TIP);
      for (const s of session.inputSources) if (s.handedness === "right" && !s.hand) pressing = (s.gamepad?.buttons[0]?.value ?? 0) > 0.6;
    }
    tip.position.copy(at);
    tip.visible = true;
    if (pressing && !drawing.current) {
      drawing.current = { points: [at.clone()], depth: 0 };
      buzz(gl, "right", 0.15, 15);
    } else if (pressing) addPoint(at);
    else if (drawing.current) finish(false);
  });

  return (
    <>
      {merged && <mesh geometry={merged} material={material} frustumCulled={false} userData={{ noDraw: true, navIgnore: true }} />}
      <primitive object={live} />
      <primitive object={tip} />
    </>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
