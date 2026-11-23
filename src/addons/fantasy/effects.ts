import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildArrow, ELEMENT_COLORS, ELEMENTS, type Element } from "./weapons";

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

const SPARKS = 320;

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
/** The pieces round a burst: rays, feathers, beads, flames, or crystals. */
const SHARDS = 18;

/** Each element's pieces, built once and shared by every burst. */
const PIECES: Partial<Record<Element, THREE.BufferGeometry>> = {};
function piecesFor(element: Element): THREE.BufferGeometry {
  const made = PIECES[element];
  if (made) return made;
  let g: THREE.BufferGeometry;
  switch (element) {
    case "spectro":
      // A ray: long and thin, from its foot.
      g = new THREE.BoxGeometry(0.03, 1, 0.03).translate(0, 0.5, 0);
      break;
    case "havoc": {
      // A feather: a tapered vane on a quill.
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(0.07, 0.12, 0.02, 0.32);
      s.lineTo(0, 0.36);
      s.quadraticCurveTo(-0.06, 0.18, 0, 0);
      g = new THREE.ShapeGeometry(s, 4);
      break;
    }
    case "electro":
      g = new THREE.SphereGeometry(0.05, 8, 6);
      break;
    case "glacio":
      // A crystal: six-sided, pointed.
      g = new THREE.ConeGeometry(0.1, 1, 6).translate(0, 0.5, 0);
      break;
    default: {
      // A tongue of flame: a teardrop, full low down, licking to a point
      // (and Aero's, unused: it has its wind instead).
      const profile: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) {
        const y = i / 10;
        profile.push(new THREE.Vector2(0.16 * Math.sin(Math.PI * Math.pow(y, 0.55)) * (1 - 0.35 * y), y));
      }
      g = new THREE.LatheGeometry(profile, 8);
    }
  }
  return (PIECES[element] = g);
}

/** Aero's wind: three ribbons wound round a rising column. */
function buildWhirl() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const s = i / 40;
      const a = s * Math.PI * 4 + (k * Math.PI * 2) / 3;
      const r = 0.35 + s * 0.75;
      points.push(new THREE.Vector3(Math.cos(a) * r, s * 2.6, Math.sin(a) * r));
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 60, 0.025 + k * 0.008, 4, false));
  }
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  for (const p of parts) p.dispose();
  return merged;
}

/** How long each element's burst lasts: Havoc's feathers and Glacio's
 *  mist linger. */
const BURST_SECONDS: Record<Element, number> = { spectro: 1.1, havoc: 1.6, aero: 1.3, electro: 1.1, fusion: 1.2, glacio: 1.5 };
const GATHER_SECONDS = 0.42;
const HAVOC_DARK = new THREE.Color("#3a0e2c");

/**
 * One special's burst, the same everywhere it's seen. Gathering first,
 * while the wielder winds up: a ring closing in, and for some elements
 * more (Havoc's dark drawn in onto them, Aero's wind tightening, Spectro's
 * rays converging). Then the release: a flash and two shockwaves for all,
 * and each element's own:
 *
 * - Spectro: golden rays fanning out of a tall shaft of light.
 * - Havoc: a dark dome welling up, and dark feathers drifting out and down.
 * - Aero: a whirlwind winding up round the spot, rising and widening.
 * - Electro: bolts from the sky, and beads of spark circling round.
 * - Fusion: tongues of flame flickering up from a column of fire.
 * - Glacio: crystals breaking up out of the ground, and a cold mist
 *   sublimating off them as they sink (snowflakes are FantasyEffects').
 *
 * Each also lights the place round it for a moment (`light`, read by
 * FantasyLayer for a real pooled light).
 */
class Burst {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private ring2: THREE.Mesh;
  private flash: THREE.Mesh;
  private pillar: THREE.Mesh;
  private dark: THREE.Mesh;
  private whirl: THREE.Mesh;
  private shards: THREE.InstancedMesh;
  private bolts: THREE.Mesh[] = [];
  private start = -1e9;
  private element: Element = "spectro";
  private nextBolt = 0;
  private gathering = false;
  /** How bright the burst's light is now, 0 to 1. */
  light = 0;
  readonly color = new THREE.Color();

  constructor() {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), additive("#ffffff", { side: THREE.DoubleSide }));
    this.ring2 = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), additive("#ffffff", { side: THREE.DoubleSide }));
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), additive("#ffffff"));
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), additive("#ffffff", { side: THREE.DoubleSide }));
    // Havoc's dark is dark, so it can't be added light: drawn over the scene.
    this.dark = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: HAVOC_DARK, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.whirl = new THREE.Mesh(buildWhirl(), additive("#ffffff", { side: THREE.DoubleSide }));
    this.shards = new THREE.InstancedMesh(piecesFor("fusion"), additive("#ffffff", { side: THREE.DoubleSide }), SHARDS);
    this.shards.frustumCulled = false;
    this.group.add(this.ring, this.ring2, this.flash, this.pillar, this.dark, this.whirl, this.shards);
    for (let b = 0; b < 3; b++) {
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

  /** `gathering`: the wind-up at the wielder, rather than the release. */
  fire(element: Element, at: THREE.Vector3, time: number, gathering = false) {
    this.element = element;
    this.start = time;
    this.nextBolt = 0;
    this.gathering = gathering;
    this.group.position.copy(at);
    this.color.set(ELEMENT_COLORS[element]);
    for (const mesh of [this.ring, this.ring2, this.flash, this.pillar, this.whirl, ...this.bolts]) (mesh.material as THREE.MeshBasicMaterial).color.copy(this.color);
    // Havoc's feathers are dark too; the rest of the pieces glow.
    const pieces = this.shards.material as THREE.MeshBasicMaterial;
    const dark = element === "havoc";
    if ((pieces.blending === THREE.NormalBlending) !== dark) {
      pieces.blending = dark ? THREE.NormalBlending : THREE.AdditiveBlending;
      pieces.needsUpdate = true;
    }
    pieces.color.copy(dark ? HAVOC_DARK : this.color);
    this.shards.geometry = piecesFor(element);
    // Glacio's mist is white with a cold tint, not the element's colour.
    if (element === "glacio") (this.flash.material as THREE.MeshBasicMaterial).color.set("#dff8ff");
    this.group.visible = true;
  }

  update(time: number, camera: THREE.Camera) {
    if (!this.group.visible) return;
    const age = time - this.start;
    const e = this.element;
    posed = this.shards;
    const opacity = (mesh: THREE.Object3D, value: number) => ((mesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = Math.max(0, value));
    const show = (mesh: THREE.Object3D, on: boolean) => (mesh.visible = on);
    if (this.gathering) {
      if (age > GATHER_SECONDS) {
        this.group.visible = false;
        this.light = 0;
        return;
      }
      const k = age / GATHER_SECONDS;
      this.ring.scale.setScalar(2.4 - 2 * k * k);
      this.ring.position.y = 0.06;
      opacity(this.ring, 0.25 + 0.6 * k);
      for (const mesh of [this.ring2, this.pillar, ...this.bolts]) show(mesh, false);
      this.flash.scale.setScalar(0.15 + 0.35 * k);
      this.flash.position.y = 1;
      opacity(this.flash, 0.35 * k);
      // The dark drawn in onto them, closing round them.
      show(this.dark, e === "havoc");
      if (e === "havoc") {
        this.dark.scale.setScalar(2.2 - 1.8 * k);
        this.dark.position.y = 1;
        opacity(this.dark, 0.15 + 0.45 * k);
      }
      // The wind tightening round them, spinning faster.
      show(this.whirl, e === "aero");
      if (e === "aero") {
        this.whirl.scale.set(1.6 - 0.9 * k, 0.6 + 0.2 * k, 1.6 - 0.9 * k);
        this.whirl.rotation.y = -age * (6 + 10 * k);
        opacity(this.whirl, 0.5 * k);
      }
      // Light gathering in from all round.
      show(this.shards, e === "spectro");
      if (e === "spectro") {
        for (let i = 0; i < SHARDS; i++) {
          rayDirection(i, shardDir);
          const r = 2.2 * (1 - k);
          pieceMatrix(i, shardAt.set(0, 1, 0).addScaledVector(shardDir, r + 0.3), shardQ.setFromUnitVectors(UP, shardDir.negate()), shardS.set(1, 0.6 * (1 - k) + 0.05, 1));
        }
        this.shards.instanceMatrix.needsUpdate = true;
        opacity(this.shards, 0.7 * k);
      }
      this.light = 0.35 * k;
      return;
    }
    const life = BURST_SECONDS[e];
    if (age > life) {
      this.group.visible = false;
      this.light = 0;
      return;
    }

    // ---- what every element shares: two shockwaves and a flash ----------
    const grow = 1 - Math.pow(1 - Math.min(1, age / 0.5), 3);
    show(this.ring, true);
    show(this.ring2, true);
    this.ring.scale.setScalar(0.3 + grow * 3.6);
    this.ring.position.y = 0.08;
    opacity(this.ring, (e === "havoc" ? 0.7 : 1) - age / 0.7);
    const late = Math.max(0, age - 0.12);
    this.ring2.scale.setScalar(0.3 + (1 - Math.pow(1 - Math.min(1, late / 0.6), 3)) * 4.6);
    this.ring2.position.y = 0.1;
    opacity(this.ring2, 0.7 * (1 - late / 0.75));
    if (e === "glacio") {
      // A cold mist breathing out and lingering, rather than a flash.
      this.flash.scale.set(0.6 + age * 2.2, 0.4 + age * 1.1, 0.6 + age * 2.2);
      this.flash.position.y = 0.4;
      opacity(this.flash, 0.22 * Math.min(1, age / 0.15) * (1 - age / life));
    } else {
      this.flash.scale.setScalar(0.3 + Math.min(1, age / 0.12) * (e === "fusion" ? 1.25 : e === "havoc" ? 0.6 : 0.9));
      this.flash.position.y = 0.9;
      opacity(this.flash, (e === "spectro" ? 0.75 : 0.55) - age * 2.2);
    }

    // ---- the column: Spectro's tall shaft of light, Electro's, Fusion's
    // fire, and Havoc's plunging down from above onto the spot; Aero and
    // Glacio have their own instead ----------------------------------------
    const column = e === "spectro" || e === "electro" || e === "fusion" || e === "havoc";
    show(this.pillar, column);
    if (e === "havoc") {
      const fall = Math.min(1, age / 0.12);
      this.pillar.scale.set(0.22 + age * 0.3, 0.01 + fall * 6, 0.22 + age * 0.3);
      this.pillar.position.y = 6 * (1 - fall);
      opacity(this.pillar, 0.6 * (1 - age / 0.6));
    } else if (column) {
      this.pillar.position.y = 0;
      const rise = Math.min(1, age / 0.25);
      const wide = e === "fusion" ? 0.8 : e === "spectro" ? 0.28 : 0.45;
      this.pillar.scale.set(wide + age * 0.6, 0.5 + rise * (e === "fusion" ? 3.5 : 8), wide + age * 0.6);
      opacity(this.pillar, (e === "spectro" ? 0.55 : 0.4) * (1 - age / 0.8));
    }

    // ---- Havoc: a dark dome welling up and fading --------------------------
    show(this.dark, e === "havoc");
    if (e === "havoc") {
      const swell = 1 - Math.pow(1 - Math.min(1, age / 0.35), 2);
      this.dark.scale.set(0.4 + swell * 1.5, 0.25 + swell * 0.9, 0.4 + swell * 1.5);
      this.dark.position.y = 0;
      opacity(this.dark, 0.4 * (1 - age / life));
    }

    // ---- Aero: the whirlwind ------------------------------------------------
    show(this.whirl, e === "aero");
    if (e === "aero") {
      const up = Math.min(1, age / 0.3);
      this.whirl.scale.set(0.8 + age * 1.6, 0.4 + up * 1.2, 0.8 + age * 1.6);
      this.whirl.rotation.y = -age * 9;
      opacity(this.whirl, 0.75 * (1 - age / life));
    }

    // ---- the pieces -----------------------------------------------------------
    show(this.shards, e !== "aero");
    if (e !== "aero") {
      const up = age < 0.18 ? age / 0.18 : Math.max(0, 1 - (age - 0.18) / 0.7);
      let fade = 0.85 * up;
      for (let i = 0; i < SHARDS; i++) {
        const a = (i / SHARDS) * Math.PI * 2 + 0.35;
        const ring = 0.9 + (i % 3) * 0.35;
        switch (e) {
          case "spectro": {
            // Rays fanning out of the light, lengthening as they go.
            rayDirection(i, shardDir);
            const out = Math.min(1, age / 0.3);
            pieceMatrix(i, shardAt.set(0, 1, 0).addScaledVector(shardDir, 0.2 + out * 0.5), shardQ.setFromUnitVectors(UP, shardDir), shardS.set(1, 0.3 + out * (1.6 + (i % 3) * 0.5), 1));
            fade = 0.8 * (1 - age / 0.75);
            break;
          }
          case "havoc": {
            // Feathers thrown up and out, drifting down, turning as they fall.
            const t = age;
            const r = 0.4 + t * (1.2 + (i % 4) * 0.35);
            const y = 0.4 + 2.2 * t - 1.4 * t * t + (i % 3) * 0.2;
            pieceMatrix(i, shardAt.set(Math.cos(a) * r, Math.max(0.02, y), Math.sin(a) * r), shardQ.setFromEuler(shardE.set(t * (3 + (i % 3)), a + t * 2, Math.sin(t * 5 + i) * 0.8)), shardS.setScalar(1.9));
            fade = 0.9 * Math.min(1, age / 0.1) * (1 - age / life);
            break;
          }
          case "electro": {
            // Beads of spark circling round in two rising rings.
            const lap = i % 2 ? 1 : -1;
            const r = 0.7 + age * 1.6;
            const turn = a + lap * age * 9;
            pieceMatrix(i, shardAt.set(Math.cos(turn) * r, 0.5 + (i % 2) * 0.6 + age * 0.8 + 0.08 * Math.sin(time * 40 + i), Math.sin(turn) * r), shardQ.identity(), shardS.setScalar(0.6 + 0.6 * Math.abs(Math.sin(time * 25 + i))));
            fade = 0.95 * (1 - age / life);
            break;
          }
          case "glacio": {
            // Crystals breaking up out of the ground round the spot, leaning
            // out, and sinking back as they turn to mist.
            const tall = 1.1 * (0.6 + (i % 3) * 0.35);
            const lean = 0.3 + (i % 2) * 0.15;
            pieceMatrix(i, shardAt.set(Math.cos(a) * ring * 0.9, 0, Math.sin(a) * ring * 0.9), shardQ.setFromEuler(shardE.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean)), shardS.set(1, Math.max(0.001, tall * up), 1));
            break;
          }
          default: {
            // Fusion: tongues of flame licking up round the spot, each
            // flickering in height and width, swaying, and drawn in toward
            // the middle as they burn.
            const tall = 1.1 * (0.6 + (i % 3) * 0.35) * (0.75 + 0.35 * Math.sin(time * 23 + i * 1.7));
            const fat = 0.9 + 0.35 * Math.sin(time * 17 + i * 2.3);
            const sway = 0.12 * Math.sin(time * 9 + i);
            const r = ring * (0.75 - 0.25 * Math.min(1, age / 0.8));
            pieceMatrix(i, shardAt.set(Math.cos(a) * r, 0, Math.sin(a) * r), shardQ.setFromEuler(shardE.set(Math.sin(a) * sway, time * 2 + i, -Math.cos(a) * sway)), shardS.set(fat, Math.max(0.001, tall * up), fat));
          }
        }
      }
      this.shards.instanceMatrix.needsUpdate = true;
      opacity(this.shards, fade);
    }

    // ---- Electro: bolts from the sky ------------------------------------------
    const bolting = e === "electro" && age < 0.5;
    for (const bolt of this.bolts) bolt.visible = bolting;
    if (bolting && time >= this.nextBolt) {
      this.nextBolt = time + 0.05;
      for (const bolt of this.bolts) jag(bolt, camera, this.group.position);
    }

    // The light: Electro flickers, Fusion wavers, Havoc is a dim glow.
    const fade = Math.max(0, 1 - age / 0.7);
    this.light =
      e === "electro" ? fade * (0.55 + 0.45 * Math.sin(time * 60)) : e === "fusion" ? fade * (0.8 + 0.2 * Math.sin(time * 17)) : e === "havoc" ? 0.45 * fade : fade * fade;
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh === (this.shards as unknown)) return;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    });
    (this.shards.material as THREE.Material).dispose();
  }
}

const shardMatrix = new THREE.Matrix4();
const shardAt = new THREE.Vector3();
const shardDir = new THREE.Vector3();
const shardQ = new THREE.Quaternion();
const shardE = new THREE.Euler();
const shardS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let posed: THREE.InstancedMesh | null = null;
function pieceMatrix(i: number, at: THREE.Vector3, q: THREE.Quaternion, s: THREE.Vector3) {
  shardMatrix.compose(at, q, s);
  posed!.setMatrixAt(i, shardMatrix);
}
/** The i-th of Spectro's rays: spread round, tipped up a little. */
function rayDirection(i: number, out: THREE.Vector3) {
  const a = (i / SHARDS) * Math.PI * 2;
  const tip = ((i % 3) - 0.6) * 0.45;
  return out.set(Math.cos(a) * Math.cos(tip), Math.sin(tip), Math.sin(a) * Math.cos(tip));
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

const ahead = new THREE.Vector3();

const ARROW_SPEED = 30;
export const arrowSeconds = (distance: number) => distance / ARROW_SPEED;
/** A rod's bolt, slower than an arrow: it can be seen coming, and dodged. */
export const BOLT_SPEED = 11;

/** A rod's bolt: a bright core in a glow and a halo (tinted at each cast). */
function buildBolt(): THREE.Group {
  const group = new THREE.Group();
  const layer = (radius: number, tint: number, opacity: number) => {
    const m = additive("#ffffff", { opacity });
    m.userData.tint = tint;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), m);
    mesh.userData.navIgnore = true;
    group.add(mesh);
  };
  layer(0.06, 0.7, 1);
  layer(0.13, 0.2, 0.55);
  layer(0.24, 0, 0.22);
  return group;
}

interface Flight {
  mesh: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
  seconds: number;
  live: boolean;
  onLanded: (at: THREE.Vector3) => void;
  /** What it meets on the stretch it just flew, if anything: it stops
   *  there. A real projectile, so a target can step out of its way. */
  meets: ArrowTest | null;
  last: THREE.Vector3;
  /** A rod's bolt: straight, slow, wavering, not an arrow's arc. */
  bolt: boolean;
}

export type ArrowTest = (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3 | null;

class Arrows {
  readonly group = new THREE.Group();
  private plain: Flight[] = [];
  private special = {} as Record<Element, Flight>;
  private all: Flight[] = [];

  constructor() {
    const flight = (mesh: THREE.Group): Flight => {
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), start: 0, seconds: 1, live: false, onLanded: () => {}, meets: null, last: new THREE.Vector3(), bolt: false };
    };
    for (let i = 0; i < 8; i++) this.plain.push(flight(buildArrow()));
    for (const element of ELEMENTS) this.special[element] = flight(buildArrow(ELEMENT_COLORS[element]));
    for (let i = 0; i < 6; i++) this.bolts.push({ ...flight(buildBolt()), bolt: true });
    this.all = [...this.plain, ...Object.values(this.special), ...this.bolts];
  }
  private bolts: Flight[] = [];

  /** A rod's bolt, in its element's colour. */
  fireBolt(from: THREE.Vector3, to: THREE.Vector3, element: Element, time: number, onLanded: (at: THREE.Vector3) => void, meets: ArrowTest | null) {
    const f = this.bolts.find((b) => !b.live) ?? this.bolts[0];
    const color = new THREE.Color(ELEMENT_COLORS[element]);
    f.mesh.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m?.userData.tint) m.color.copy(color).lerp(new THREE.Color("#ffffff"), m.userData.tint as number);
    });
    this.launch(f, from, to, time, onLanded, meets, from.distanceTo(to) / BOLT_SPEED);
  }

  fire(from: THREE.Vector3, to: THREE.Vector3, element: Element | null, time: number, onLanded: (at: THREE.Vector3) => void, meets: ArrowTest | null) {
    const f = element ? this.special[element] : (this.plain.find((a) => !a.live) ?? this.plain[0]);
    this.launch(f, from, to, time, onLanded, meets, arrowSeconds(from.distanceTo(to)));
  }

  private launch(f: Flight, from: THREE.Vector3, to: THREE.Vector3, time: number, onLanded: (at: THREE.Vector3) => void, meets: ArrowTest | null, seconds: number) {
    f.from.copy(from);
    f.to.copy(to);
    f.start = time;
    f.seconds = Math.max(0.05, seconds);
    f.onLanded = onLanded;
    f.meets = meets;
    f.last.copy(from);
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
      // A shallow arc, highest midway, longer shots arcing more; the arrow
      // turned along it.
      const arc = (from: THREE.Vector3, to: THREE.Vector3, t: number, out: THREE.Vector3) =>
        out.lerpVectors(from, to, t).setY(out.y + Math.sin(Math.PI * t) * Math.min(1.6, from.distanceTo(to) * 0.04));
      if (f.bolt) {
        // Straight on, wavering a little, spinning.
        f.mesh.position.lerpVectors(f.from, f.to, s);
        f.mesh.position.y += 0.06 * Math.sin(time * 14);
        f.mesh.rotation.z = time * 9;
      } else arc(f.from, f.to, s, f.mesh.position);
      const met = f.meets?.(f.last, f.mesh.position);
      if (met) {
        f.live = false;
        f.mesh.visible = false;
        f.onLanded(met);
        continue;
      }
      f.last.copy(f.mesh.position);
      if (!f.bolt) f.mesh.lookAt(arc(f.from, f.to, Math.min(1, s + 0.02), ahead));
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

/**
 * What flies off each element's burst: Spectro's golden motes floating up,
 * Havoc's dark-rose sparks falling, Aero's specks thrown up on the wind,
 * Electro's quick crackle, Fusion's embers rising, Glacio's snowflakes
 * drifting slowly down.
 */
const MOTES: Record<Element, { count: number; speed: number; up: number; gravity: number; life: number; height: number; color?: string }> = {
  spectro: { count: 40, speed: 2, up: 1.2, gravity: -0.6, life: 1.1, height: 1 },
  havoc: { count: 30, speed: 3, up: 0.5, gravity: 5, life: 0.7, height: 0.5, color: "#ff4f9a" },
  aero: { count: 44, speed: 3.5, up: 4.5, gravity: 2.5, life: 1, height: 0.3 },
  electro: { count: 46, speed: 6.5, up: 0, gravity: 5, life: 0.35, height: 0.8, color: "#d4c2ff" },
  fusion: { count: 46, speed: 2.4, up: 3, gravity: -1.5, life: 1, height: 0.4, color: "#ffb35c" },
  glacio: { count: 56, speed: 1.4, up: 2.2, gravity: 0.9, life: 2, height: 0.5, color: "#f4fdff" },
};

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

  /** The bursts' lights: where each is, how bright, and in what colour. */
  get lights(): { at: THREE.Vector3; level: number; color: THREE.Color }[] {
    return this.bursts.map((b) => ({ at: b.group.position, level: b.group.visible ? b.light : 0, color: b.color }));
  }

  /** A special winding up at its wielder's feet. */
  gather(element: Element, at: THREE.Vector3, time: number) {
    (this.bursts.find((b) => !b.busy) ?? this.bursts[0]).fire(element, at, time, true);
    const lift = at.clone().setY(at.y + 1);
    const p = MOTES[element];
    this.sparks.burst(lift, this.scratch.set(p.color ?? ELEMENT_COLORS[element]), 16, p.speed * 0.4, { up: 1.2, gravity: p.gravity * 0.3 - 0.4, life: 0.5 });
  }

  special(element: Element, at: THREE.Vector3, time: number) {
    (this.bursts.find((b) => !b.busy) ?? this.bursts[0]).fire(element, at, time);
    const p = MOTES[element];
    const color = this.scratch.set(p.color ?? ELEMENT_COLORS[element]);
    this.sparks.burst(at.clone().setY(at.y + p.height), color, p.count, p.speed, p);
  }

  arrow(from: THREE.Vector3, to: THREE.Vector3, element: Element | null, time: number, onLanded: (at: THREE.Vector3) => void = () => {}, meets: ArrowTest | null = null) {
    this.arrows.fire(from, to, element, time, onLanded, meets);
  }

  /** A rod's magic bolt, slower than an arrow, straight at its mark. */
  bolt(from: THREE.Vector3, to: THREE.Vector3, element: Element, time: number, onLanded: (at: THREE.Vector3) => void = () => {}, meets: ArrowTest | null = null) {
    this.arrows.fireBolt(from, to, element, time, onLanded, meets);
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
