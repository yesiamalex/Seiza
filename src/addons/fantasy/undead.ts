import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { UNDEAD } from "./combat";
import { ELEMENT_COLORS, type Element } from "./weapons";

/**
 * A necromancer's undead (combat.ts's UNDEAD): three small skeletons that
 * rise out of the ground, walk to the nearest fighter, strike, and sink
 * back after a while. The necromancer's own browser moves them and says
 * where they are a few times a second; everyone else's glides theirs
 * there. Built once and shared: a skeleton is five meshes.
 */
export interface Risen {
  x: number;
  z: number;
  /** Where it's headed (someone else's: where its owner last said). */
  tx: number;
  tz: number;
  /** Which way it faces, radians about Y (0 faces +z). */
  face: number;
  lastStrike: number;
  /** When it last lunged at someone. */
  lunge: number;
  /** How far it has walked, for its stride. */
  stride: number;
}

const bone = new THREE.MeshStandardMaterial({ color: "#d9d2bf", roughness: 0.8 });
const eyes = new Map<Element, THREE.MeshBasicMaterial>();
const eyesOf = (element: Element) => {
  let m = eyes.get(element);
  if (!m) eyes.set(element, (m = new THREE.MeshBasicMaterial({ color: ELEMENT_COLORS[element], toneMapped: false })));
  return m;
};

const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
const limb = (length: number, radius: number) => new THREE.CylinderGeometry(radius, radius * 0.8, length, 6).translate(0, -length / 2, 0);

/** Parts in metres, about 1 m tall, facing +z. */
const SHAPES = (() => {
  const ribs = [0.62, 0.55, 0.48].map((y, i) => new THREE.TorusGeometry(0.095 - i * 0.008, 0.012, 4, 12, Math.PI * 1.4).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.2).translate(0, y, 0.01));
  const body = merge([
    new THREE.SphereGeometry(0.095, 12, 10).scale(1, 1.08, 1.05).translate(0, 0.86, 0),
    new THREE.BoxGeometry(0.1, 0.04, 0.08).translate(0, 0.77, 0.03),
    new THREE.CylinderGeometry(0.016, 0.016, 0.42, 6).translate(0, 0.56, -0.03),
    ...ribs,
    new THREE.BoxGeometry(0.2, 0.06, 0.09).translate(0, 0.36, 0),
    new THREE.BoxGeometry(0.26, 0.03, 0.05).translate(0, 0.69, -0.01),
  ]);
  const sockets = merge([-1, 1].map((s) => new THREE.SphereGeometry(0.022, 6, 4).translate(s * 0.035, 0.875, 0.085)));
  return { body, sockets, arm: limb(0.36, 0.016), leg: limb(0.36, 0.02) };
})();

interface Skeleton {
  root: THREE.Group;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
}

function buildSkeleton(element: Element): Skeleton {
  const root = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number] = [0, 0, 0]) => {
    const pivot = new THREE.Group();
    pivot.position.set(...at);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.userData.navIgnore = true;
    pivot.add(mesh);
    root.add(pivot);
    return pivot;
  };
  add(SHAPES.body, bone);
  add(SHAPES.sockets, eyesOf(element));
  return {
    root,
    armL: add(SHAPES.arm, bone, [-0.14, 0.68, 0]),
    armR: add(SHAPES.arm, bone, [0.14, 0.68, 0]),
    legL: add(SHAPES.leg, bone, [-0.06, 0.36, 0]),
    legR: add(SHAPES.leg, bone, [0.06, 0.36, 0]),
  };
}

/** How long one takes to sink back into the ground. */
const SINK_SECONDS = 0.6;

/** Someone's three undead: where they are, and drawn. */
export class Pack {
  readonly group = new THREE.Group();
  readonly risen: Risen[];
  private skeletons: Skeleton[];
  /** When they rose, and when they started to sink (Infinity: not yet). */
  readonly born: number;
  sinkingFrom = Infinity;
  /** When their owner last said where they are (someone else's). */
  heard: number;

  constructor(
    readonly element: Element,
    at: [number, number][],
    now: number
  ) {
    this.born = this.heard = now;
    this.risen = at.map(([x, z]) => ({ x, z, tx: x, tz: z, face: 0, lastStrike: now, lunge: -Infinity, stride: 0 }));
    this.skeletons = this.risen.map(() => buildSkeleton(element));
    for (const s of this.skeletons) this.group.add(s.root);
    this.group.name = "seiza-undead";
  }

  get gone() {
    return this.sinkingFrom + SINK_SECONDS < performance.now() / 1000;
  }

  sink(now: number) {
    if (this.sinkingFrom === Infinity) this.sinkingFrom = now;
  }

  /** The one nearest (x, z) lunges: it just struck someone there. */
  lungeNearest(x: number, z: number, now: number) {
    let nearest: Risen | null = null;
    for (const r of this.risen) if (!nearest || Math.hypot(r.x - x, r.z - z) < Math.hypot(nearest.x - x, nearest.z - z)) nearest = r;
    if (nearest) {
      nearest.lunge = now;
      nearest.face = Math.atan2(x - nearest.x, z - nearest.z);
    }
  }

  /** Moves one toward (x, z), at its pace, turning to face the way. */
  static step(r: Risen, x: number, z: number, dt: number, stopShort = 0) {
    const dx = x - r.x;
    const dz = z - r.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) r.face = Math.atan2(dx, dz);
    const move = Math.min(Math.max(0, d - stopShort), UNDEAD.speed * dt);
    if (move <= 0) return;
    r.x += (dx / d) * move;
    r.z += (dz / d) * move;
    r.stride += move;
  }

  /** Poses and places them; `floorAt` gives the ground's height. */
  draw(now: number, floorAt: (x: number, z: number) => number) {
    const risen = Math.min(1, (now - this.born) / UNDEAD.rise);
    const sunk = this.sinkingFrom === Infinity ? 0 : Math.min(1, (now - this.sinkingFrom) / SINK_SECONDS);
    // Out of the ground and back into it, about their own height.
    const under = (1 - risen * risen * (3 - 2 * risen) + sunk) * 1.05;
    this.risen.forEach((r, i) => {
      const s = this.skeletons[i];
      s.root.position.set(r.x, floorAt(r.x, r.z) - under, r.z);
      s.root.rotation.y = r.face;
      const swing = Math.sin(r.stride * 5.5) * 0.6;
      const lunge = Math.max(0, 1 - (now - r.lunge) / 0.45);
      s.legL.rotation.x = swing;
      s.legR.rotation.x = -swing;
      // Arms dangle and swing as they walk, and come up to strike.
      s.armL.rotation.x = -swing * 0.5 - lunge * 1.6;
      s.armR.rotation.x = swing * 0.5 - lunge * 1.6;
      s.root.rotation.x = lunge * 0.25 + 0.06 * Math.sin(now * 3 + i);
    });
  }

  dispose() {
    this.group.removeFromParent();
  }
}
