// Building blocks for Seisugbo: merged, vertex-coloured geometry (a whole
// street in a handful of draw calls), canvas-drawn textures, clickable
// parts, pictures that load only when someone is near enough to see them,
// and night lighting that costs no lights. Some of it is forked from
// Seizora's kit (worlds/seizora/client/kit.tsx), so each world stands alone.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { nightNeed, roomLights, signWashTexture } from "../../../src/scene/roomLights";
import { drawWrapped } from "../../../src/ui/wrapLines";

export const FONT = "system-ui, -apple-system, 'Segoe UI', 'Hiragino Sans', 'Noto Sans CJK JP', 'Yu Gothic', sans-serif";

// --- merged geometry ----------------------------------------------------------------------

export type Vec3 = [number, number, number];

/**
 * Collects boxes, cylinders, and planes, each with its own colour, into one
 * geometry: one draw call however many pieces there are. Colours go in as
 * vertex colours, so one material serves every house's paint.
 */
export class Builder {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private c = new THREE.Color();
  private one = new THREE.Vector3(1, 1, 1);

  private add(g: THREE.BufferGeometry, at: Vec3, rotation: Vec3 | undefined, color: string | THREE.Color) {
    this.q.setFromEuler(this.e.set(...(rotation ?? [0, 0, 0])));
    g.applyMatrix4(this.m.compose(new THREE.Vector3(...at), this.q, this.one));
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    this.c.set(color);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = this.c.r;
      colors[i * 3 + 1] = this.c.g;
      colors[i * 3 + 2] = this.c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    // Every part needs the same attributes to merge.
    if (!g.index) g.setIndex([...Array(n).keys()]);
    this.parts.push(g);
    return this;
  }

  box(size: Vec3, at: Vec3, color: string | THREE.Color, rotation?: Vec3) {
    return this.add(new THREE.BoxGeometry(...size), at, rotation, color);
  }

  cylinder(radiusTop: number, radiusBottom: number, height: number, at: Vec3, color: string | THREE.Color, rotation?: Vec3, segments = 10) {
    return this.add(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1), at, rotation, color);
  }

  /** A flat rectangle facing +Z before `rotation`. */
  plane(w: number, h: number, at: Vec3, color: string | THREE.Color, rotation?: Vec3) {
    return this.add(new THREE.PlaneGeometry(w, h), at, rotation, color);
  }

  /** A straight bar from a to b (a wire, a pole, a line). */
  bar(a: Vec3, b: Vec3, radius: number, color: string | THREE.Color, segments = 4) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const length = va.distanceTo(vb);
    const g = new THREE.CylinderGeometry(radius, radius, length, segments, 1, true);
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, this.one));
    return this.add(g, [0, 0, 0], undefined, color);
  }

  /** A wire that sags between two points, as a few straight bars. */
  sag(a: Vec3, b: Vec3, drop: number, radius: number, color: string | THREE.Color, pieces = 6) {
    let prev = a;
    for (let i = 1; i <= pieces; i++) {
      const t = i / pieces;
      const next: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - drop * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
      this.bar(prev, next, radius, color);
      prev = next;
    }
    return this;
  }

  /** Any geometry, already placed. */
  raw(g: THREE.BufferGeometry, color: string | THREE.Color) {
    return this.add(g, [0, 0, 0], undefined, color);
  }

  get empty() {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    // Planes and boxes carry uvs and normals; cylinders too. Keep only
    // what every part shares, so they merge.
    for (const p of this.parts) {
      if (p.attributes.uv === undefined) p.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2));
    }
    const merged = mergeGeometries(this.parts, false) ?? new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

/** A vertex-coloured material: Lambert, the cheapest lit one. */
export function paint(extra: THREE.MeshLambertMaterialParameters = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
}

// --- canvas textures ----------------------------------------------------------------------

/** A canvas texture drawn once (and again whenever `deps` change). */
export function useCanvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[] = []) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [width, height]);
  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw(ctx, canvas.width, canvas.height);
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, ...deps]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** A canvas texture made once, outside React (for module-level materials). */
export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, width, height);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** Wraps `text` to `maxWidth`, draws it from (x, y), and returns the y
 *  after the last line. Breaks between words, or anywhere in Japanese. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  return drawWrapped(ctx, text, x, y, maxWidth, lineHeight);
}

// --- clickable parts --------------------------------------------------------------------------

/** A group you can click: a pointer cursor on hover, and the click kept
 *  from also reaching the floor (which would walk you there). */
export function Clickable({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  const over = (cursor: string) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = cursor;
  };
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    []
  );
  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerOver={over("pointer")}
      onPointerOut={over("")}
    >
      {children}
    </group>
  );
}

/** Not clickable and not walkable: decoration the navmesh and the pointer
 *  should both ignore. */
export const noRaycast = () => {};

// --- pictures, loaded when someone is near -------------------------------------------------------

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture>>();
/** Two downloads at a time, nearest first, so the pictures in front of you
 *  arrive before the ones across the meadow. */
const queue: { url: string; priority: () => number; resolve: (t: THREE.Texture) => void; reject: (e: unknown) => void }[] = [];
let active = 0;
const MAX_ACTIVE = 2;

function pump() {
  while (active < MAX_ACTIVE && queue.length > 0) {
    queue.sort((a, b) => a.priority() - b.priority());
    const job = queue.shift()!;
    active++;
    loader.load(
      job.url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        active--;
        job.resolve(texture);
        pump();
      },
      undefined,
      (error) => {
        active--;
        job.reject(error);
        pump();
      }
    );
  }
}

/** Loads a picture once, however many things show it. */
export function loadPicture(url: string, priority: () => number = () => 0): Promise<THREE.Texture> {
  let promise = cache.get(url);
  if (!promise) {
    promise = new Promise<THREE.Texture>((resolve, reject) => {
      queue.push({ url, priority, resolve, reject });
      pump();
    });
    cache.set(url, promise);
    promise.catch(() => cache.delete(url));
  }
  return promise;
}

const scratch = new THREE.Vector3();

/**
 * The picture for `url`, once the camera has come within `range` metres of
 * `anchor`. Until then, null: nothing is downloaded for a corner of the
 * world nobody has visited, and nothing is uploaded to the graphics card.
 */
export function useNearbyPicture(url: string, anchor: React.RefObject<THREE.Object3D | null>, range = 34): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const wanted = useRef(false);
  const camera = useRef<THREE.Camera | null>(null);
  useFrame((state) => {
    camera.current = state.camera;
    if (wanted.current || !anchor.current) return;
    if (anchor.current.getWorldPosition(scratch).distanceTo(state.camera.position) > range) return;
    wanted.current = true;
    const priority = () => {
      const a = anchor.current;
      const c = camera.current;
      return a && c ? a.getWorldPosition(new THREE.Vector3()).distanceTo(c.position) : 1e9;
    };
    loadPicture(url, priority).then(setTexture, (error) => console.warn(`[seisugbo] Could not load ${url}.`, error));
  });
  return texture;
}

/**
 * Hides `ref`'s group when the camera is further than `range` from
 * `centre`: the draw calls for a whole area stop when nobody is close
 * enough to make it out. Checked a few times a second, not every frame.
 */
export function useDrawDistance(ref: React.RefObject<THREE.Object3D | null>, centre: [number, number], range: number) {
  const since = useRef(1);
  useFrame(({ camera }, delta) => {
    since.current += delta;
    if (since.current < 0.25 || !ref.current) return;
    since.current = 0;
    ref.current.visible = Math.hypot(camera.position.x - centre[0], camera.position.z - centre[1]) < range;
  });
}

// --- night ---------------------------------------------------------------------------------------

/** 0 by day, rising through dusk to 1 at night: how much a lamp's real
 *  light is wanted. Off by day, a lamp doesn't take one of Seiza's few
 *  shared lights (LightPool) away from the lamps that need it. */
export function lampNeed(): number {
  return Math.min(1, Math.max(0, (nightNeed() - 0.3) / 0.7));
}

/**
 * Drawn in front of whatever it lies flat against, however far away: a
 * picture on its backing, a label on its plaque, paving on the grass. A few
 * millimetres of real gap isn't enough at a distance, least of all with a
 * headset's coarser depth buffer, and the two surfaces flicker through each
 * other.
 */
export const ON_TOP: THREE.MeshLambertMaterialParameters = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };

/**
 * A face washed from the top at night while the garden's lights are on, as
 * Seiza's own text boards are (src/scene/roomLights.ts): a light map, not a
 * light, so it costs nothing. Always a surface on something, so ON_TOP.
 */
export function washed(map: THREE.Texture | null, extra: THREE.MeshLambertMaterialParameters = {}) {
  return new THREE.MeshLambertMaterial({ map, lightMap: signWashTexture(), lightMapIntensity: 0, ...ON_TOP, ...extra });
}

/** Turns the wash of `faces` up at night, and the glow of `glows` (window
 *  panes, bulbs) with it. Everything outdoors follows the garden switch. */
export function useNight(faces: THREE.MeshLambertMaterial[], glows: { material: THREE.MeshBasicMaterial | THREE.MeshLambertMaterial; color: THREE.Color }[] = [], strength = 2.2) {
  const level = useRef(0);
  useFrame((_, delta) => {
    const night = nightNeed();
    const target = roomLights.pond ? 1 : 0;
    level.current += (target - level.current) * (1 - Math.exp(-delta / 0.15));
    const wash = strength * level.current * night;
    for (const face of faces) face.lightMapIntensity = wash;
    for (const g of glows) {
      const k = 0.08 + 0.92 * level.current * Math.min(1, night * 1.4);
      if ("emissive" in g.material) g.material.emissive.copy(g.color).multiplyScalar(k);
      else g.material.color.copy(g.color).multiplyScalar(k);
    }
  });
}
