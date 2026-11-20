import * as THREE from "three";
import { buildArrow, ELEMENT_COLORS, type Element } from "./weapons";

/**
 * Fantasy mode's effects, all pooled and built once: a trail behind each
 * swinging blade, sparks where a blow lands, a burst for a special, and
 * arrows in flight. Additive and unlit, so they glow without a single
 * light, and nothing here allocates per frame.
 */

const additive = (color = "#ffffff", extra: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, ...extra });

// --- blade trails -------------------------------------------------------------------

const TRAIL_SAMPLES = 14;
const TRAIL_LIFE = 0.2;

/** A ribbon from the last few positions of a blade's base and tip. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private base = new Float32Array(TRAIL_SAMPLES * 3);
  private tip = new Float32Array(TRAIL_SAMPLES * 3);
  private times = new Float32Array(TRAIL_SAMPLES).fill(-1e9);
  private head = 0;
  private positions: THREE.BufferAttribute;
  private colors: THREE.BufferAttribute;
  private color = new THREE.Color();

  constructor() {
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(TRAIL_SAMPLES * 2 * 3), 3);
    this.colors = new THREE.BufferAttribute(new Float32Array(TRAIL_SAMPLES * 2 * 3), 3);
    this.positions.setUsage(THREE.DynamicDrawUsage);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", this.positions);
    geometry.setAttribute("color", this.colors);
    const index: number[] = [];
    for (let i = 0; i < TRAIL_SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    this.mesh = new THREE.Mesh(geometry, additive("#ffffff", { vertexColors: true, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.userData.navIgnore = true;
  }

  setColor(color: string) {
    this.color.set(color);
  }

  push(base: THREE.Vector3, tip: THREE.Vector3, time: number) {
    this.head = (this.head + 1) % TRAIL_SAMPLES;
    base.toArray(this.base, this.head * 3);
    tip.toArray(this.tip, this.head * 3);
    this.times[this.head] = time;
  }

  update(time: number) {
    let live = false;
    for (let i = 0; i < TRAIL_SAMPLES; i++) {
      // Newest first, so the ribbon runs from the blade back along its path.
      const s = (this.head - i + TRAIL_SAMPLES) % TRAIL_SAMPLES;
      const age = time - this.times[s];
      const fade = age < TRAIL_LIFE ? (1 - age / TRAIL_LIFE) * (1 - i / TRAIL_SAMPLES) : 0;
      if (fade > 0) live = true;
      const p = this.positions.array as Float32Array;
      const c = this.colors.array as Float32Array;
      // A faded sample collapses onto the newest one, out of sight.
      const from = fade > 0 ? s : this.head;
      for (let k = 0; k < 3; k++) {
        p[i * 6 + k] = this.base[from * 3 + k];
        p[i * 6 + 3 + k] = this.tip[from * 3 + k];
      }
      const r = this.color.r * fade, g = this.color.g * fade, b = this.color.b * fade;
      c[i * 6] = r * 0.35; c[i * 6 + 1] = g * 0.35; c[i * 6 + 2] = b * 0.35;
      c[i * 6 + 3] = r; c[i * 6 + 4] = g; c[i * 6 + 5] = b;
    }
    this.mesh.visible = live;
    if (live) {
      this.positions.needsUpdate = true;
      this.colors.needsUpdate = true;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// --- sparks ---------------------------------------------------------------------------

let dot: THREE.Texture | null = null;
function dotTexture() {
  if (dot || typeof document === "undefined") return dot;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  dot = new THREE.CanvasTexture(canvas);
  return dot;
}

const SPARKS = 220;

class Sparks {
  readonly points: THREE.Points;
  private position: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private velocity = new Float32Array(SPARKS * 3);
  private life = new Float32Array(SPARKS);
  private maxLife = new Float32Array(SPARKS).fill(1);
  private tint = new Float32Array(SPARKS * 3);
  private gravity = new Float32Array(SPARKS);
  private next = 0;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", this.position);
    geometry.setAttribute("color", this.colorAttr);
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.09,
        map: dotTexture(),
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.points.frustumCulled = false;
    this.points.userData.navIgnore = true;
  }

  burst(at: THREE.Vector3, color: THREE.Color, count: number, speed: number, options: { up?: number; gravity?: number; life?: number } = {}) {
    const p = this.position.array as Float32Array;
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % SPARKS;
      at.toArray(p, i * 3);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.4 + Math.random() * 0.8);
      this.velocity[i * 3] = Math.sin(phi) * Math.cos(theta) * v;
      this.velocity[i * 3 + 1] = Math.abs(Math.cos(phi)) * v * 0.6 + (options.up ?? 0);
      this.velocity[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * v;
      this.maxLife[i] = this.life[i] = (options.life ?? 0.4) * (0.6 + Math.random() * 0.6);
      this.gravity[i] = options.gravity ?? 7;
      color.toArray(this.tint, i * 3);
    }
  }

  update(dt: number) {
    const p = this.position.array as Float32Array;
    const c = this.colorAttr.array as Float32Array;
    let live = false;
    for (let i = 0; i < SPARKS; i++) {
      if (this.life[i] <= 0) {
        c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0;
        continue;
      }
      live = true;
      this.life[i] -= dt;
      this.velocity[i * 3 + 1] -= this.gravity[i] * dt;
      for (let k = 0; k < 3; k++) p[i * 3 + k] += this.velocity[i * 3 + k] * dt;
      const fade = Math.max(0, this.life[i] / this.maxLife[i]);
      for (let k = 0; k < 3; k++) c[i * 3 + k] = this.tint[i * 3 + k] * fade;
    }
    this.points.visible = live;
    if (live) {
      this.position.needsUpdate = true;
      this.colorAttr.needsUpdate = true;
    }
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

// --- specials ---------------------------------------------------------------------------

const BOLT_POINTS = 12;

/** One special's burst: a ring racing outward, a flash, and for lightning,
 *  bolts from the sky. */
class Burst {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private flash: THREE.Mesh;
  private bolts: THREE.Mesh[] = [];
  private start = -1e9;
  private element: Element = "lightning";
  private nextBolt = 0;

  constructor() {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), additive("#ffffff", { side: THREE.DoubleSide }));
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), additive("#ffffff"));
    this.group.add(this.ring, this.flash);
    for (let b = 0; b < 2; b++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const index: number[] = [];
      for (let i = 0; i < BOLT_POINTS - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      geometry.setIndex(index);
      const bolt = new THREE.Mesh(geometry, additive("#ffffff", { side: THREE.DoubleSide }));
      bolt.frustumCulled = false;
      this.bolts.push(bolt);
      this.group.add(bolt);
    }
    this.group.visible = false;
    this.group.traverse((o) => (o.userData.navIgnore = true));
  }

  get busy() {
    return this.group.visible;
  }

  fire(element: Element, at: THREE.Vector3, time: number) {
    this.element = element;
    this.start = time;
    this.nextBolt = 0;
    this.group.position.copy(at);
    const color = ELEMENT_COLORS[element];
    for (const mesh of [this.ring, this.flash, ...this.bolts]) (mesh.material as THREE.MeshBasicMaterial).color.set(color);
    this.group.visible = true;
  }

  update(time: number, camera: THREE.Camera) {
    if (!this.group.visible) return;
    const age = time - this.start;
    if (age > 0.9) {
      this.group.visible = false;
      return;
    }
    const grow = 1 - Math.pow(1 - Math.min(1, age / 0.5), 3);
    this.ring.scale.setScalar(0.3 + grow * 3.4);
    this.ring.position.y = 0.08;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - age / 0.7);
    this.flash.scale.setScalar(0.3 + Math.min(1, age / 0.15) * (this.element === "fire" ? 1.1 : 0.75));
    this.flash.position.y = 0.9;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.4 - age * 1.8);
    const bolting = this.element === "lightning" && age < 0.4;
    for (const bolt of this.bolts) bolt.visible = bolting;
    if (bolting && time >= this.nextBolt) {
      this.nextBolt = time + 0.05;
      for (const bolt of this.bolts) jag(bolt, camera, this.group.position);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    });
  }
}

const side = new THREE.Vector3();
const toCamera = new THREE.Vector3();
/** A new zig-zag from above down to the burst, as a ribbon facing the camera. */
function jag(bolt: THREE.Mesh, camera: THREE.Camera, origin: THREE.Vector3) {
  const attr = bolt.geometry.getAttribute("position") as THREE.BufferAttribute;
  const p = attr.array as Float32Array;
  toCamera.copy(camera.position).sub(origin).setY(0).normalize();
  side.set(-toCamera.z, 0, toCamera.x).multiplyScalar(0.06);
  const sway = (Math.random() - 0.5) * 2;
  for (let i = 0; i < BOLT_POINTS; i++) {
    const s = i / (BOLT_POINTS - 1);
    const jitter = i === 0 || i === BOLT_POINTS - 1 ? 0 : (Math.random() - 0.5) * 0.7;
    const x = sway * (1 - s) + jitter * toCamera.z;
    const z = -jitter * toCamera.x;
    const y = 7 * (1 - s);
    p[i * 6] = x - side.x; p[i * 6 + 1] = y; p[i * 6 + 2] = z - side.z;
    p[i * 6 + 3] = x + side.x; p[i * 6 + 4] = y; p[i * 6 + 5] = z + side.z;
  }
  attr.needsUpdate = true;
}

// --- arrows ---------------------------------------------------------------------------

const ARROW_SPEED = 30;
export const arrowSeconds = (distance: number) => distance / ARROW_SPEED;

interface Flight {
  mesh: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
  seconds: number;
  live: boolean;
  onLanded: (at: THREE.Vector3) => void;
}

class Arrows {
  readonly group = new THREE.Group();
  private plain: Flight[] = [];
  private special = {} as Record<Element, Flight>;
  private all: Flight[] = [];

  constructor() {
    const flight = (mesh: THREE.Group): Flight => {
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), start: 0, seconds: 1, live: false, onLanded: () => {} };
    };
    for (let i = 0; i < 8; i++) this.plain.push(flight(buildArrow()));
    for (const element of ["lightning", "fire", "ice"] as const) this.special[element] = flight(buildArrow(ELEMENT_COLORS[element]));
    this.all = [...this.plain, ...Object.values(this.special)];
  }

  fire(from: THREE.Vector3, to: THREE.Vector3, element: Element | null, time: number, onLanded: (at: THREE.Vector3) => void) {
    const f = element ? this.special[element] : (this.plain.find((a) => !a.live) ?? this.plain[0]);
    f.from.copy(from);
    f.to.copy(to);
    f.start = time;
    f.seconds = Math.max(0.05, arrowSeconds(from.distanceTo(to)));
    f.onLanded = onLanded;
    f.live = true;
    f.mesh.visible = true;
    f.mesh.position.copy(from);
    f.mesh.lookAt(to);
  }

  update(time: number) {
    for (const f of this.all) {
      if (!f.live) continue;
      const s = (time - f.start) / f.seconds;
      if (s >= 1) {
        f.live = false;
        f.mesh.visible = false;
        f.onLanded(f.to);
        continue;
      }
      f.mesh.position.lerpVectors(f.from, f.to, s);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    });
  }
}

// --- the whole set ------------------------------------------------------------------------

/** Everything above in one group, added to the scene once. */
export class FantasyEffects {
  readonly group = new THREE.Group();
  private sparks = new Sparks();
  private bursts = [new Burst(), new Burst(), new Burst(), new Burst()];
  private arrows = new Arrows();
  private scratch = new THREE.Color();

  constructor() {
    this.group.name = "seiza-fantasy-effects";
    this.group.add(this.sparks.points, this.arrows.group, ...this.bursts.map((b) => b.group));
  }

  sparksAt(at: THREE.Vector3, color: string, count = 14, speed = 3) {
    this.sparks.burst(at, this.scratch.set(color), count, speed);
  }

  special(element: Element, at: THREE.Vector3, time: number) {
    (this.bursts.find((b) => !b.busy) ?? this.bursts[0]).fire(element, at, time);
    const color = this.scratch.set(ELEMENT_COLORS[element]);
    const lift = at.clone().setY(at.y + 0.4);
    if (element === "fire") this.sparks.burst(lift, color, 40, 2.2, { up: 3, gravity: -1.5, life: 0.9 });
    else if (element === "ice") this.sparks.burst(lift, color, 36, 5, { up: 1, gravity: 9, life: 0.6 });
    else this.sparks.burst(lift, color, 30, 4, { gravity: 4, life: 0.5 });
  }

  arrow(from: THREE.Vector3, to: THREE.Vector3, element: Element | null, time: number, onLanded: (at: THREE.Vector3) => void = () => {}) {
    this.arrows.fire(from, to, element, time, onLanded);
  }

  update(time: number, dt: number, camera: THREE.Camera) {
    this.sparks.update(dt);
    for (const burst of this.bursts) burst.update(time, camera);
    this.arrows.update(time);
  }

  dispose() {
    this.sparks.dispose();
    for (const burst of this.bursts) burst.dispose();
    this.arrows.dispose();
  }
}
