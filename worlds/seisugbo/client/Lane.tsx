// The lane: a model of a Cebu neighbourhood, built in code from the
// students' photos and drawings. Painted houses close together, galvanized
// roofs held down with old tyres, power lines strung pole to pole, fiesta
// bunting, washing out to dry, a sari-sari store on the corner, a rack of
// bulad drying in the sun, and a barangay arch at the entrance. The
// walking tour's photos stand along it on placards.
//
// Built for a phone and a standalone headset: everything that doesn't move
// is merged into one mesh per material (vertex colours carry each house's
// paint), so the whole lane is about a dozen draw calls before its photos,
// and none of it is drawn when you're far away (useDrawDistance).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PooledLight } from "../../../src/scene/LightPool";
import { nightNeed, roomLights } from "../../../src/scene/roomLights";
import type { Obstacle } from "../../../src/scene/layout";
import { addBacking, dims, Labels, Picture, type LabelPlacement, type Placement } from "./art";
import { PIECE_BY_ID } from "./collection";
import { TITLE } from "./info";
import { Builder, canvasTexture, Clickable, FONT, noRaycast, paint, useDrawDistance, useNight, washed, type Vec3 } from "./kit";
import { ARCH_X, BAMBOO, HOUSES, LANE, LANE_CENTRE, PALMS, PATH, POLES, RACK, seeded, STORE, TOUR, TOUR_Z, Y, type House } from "./plan";
import { openPiece } from "./viewer";

const GROUND_FLOOR = 2.7;
const UPPER_FLOOR = 2.4;
const BUNTING = ["#e2392f", "#f6c624", "#2f6fd0", "#2fa35a", "#ef6fa8", "#f08a24", "#f4f1ea"];
const CLOTHES = ["#e2574c", "#3f7fd0", "#f2c14e", "#f4f1ea", "#4caf7a", "#7a4fc8", "#ef8fb0", "#2b2f3a"];

/** The tour placards' photos, in walking order: Previous and Next follow
 *  the lane. */
export const TOUR_SEQUENCE = TOUR.map((t) => t.id);

const TOUR_SIZE = 1.05;
const TOUR_PHOTO_Y = Y + 1.78;

function tourPlacements(): Placement[] {
  return TOUR.map((t) => ({
    id: t.id,
    at: [t.x, TOUR_PHOTO_Y, TOUR_Z[t.side]] as Vec3,
    // North-side placards face south, onto the lane; south-side ones north.
    rotationY: t.side === "north" ? Math.PI : 0,
    size: TOUR_SIZE,
  }));
}

// --- geometry ------------------------------------------------------------------------------

/** Street lamps hang over the lane from the power poles. */
const LAMP_Y = 4.3;
const LAMPS: Vec3[] = POLES.map(([x, z]) => [x, Y + LAMP_Y + 0.12, z - 1.15]);

interface LaneGeometry {
  bulbs: THREE.BufferGeometry;
  painted: THREE.BufferGeometry;
  roofs: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  cloth: THREE.BufferGeometry;
  wires: THREE.BufferGeometry;
}

function frontZ(h: House, offset = 0) {
  return h.front + h.out * offset;
}

/** One house: walls, upper floor, roof, door curtain, windows. */
function addHouse(h: House, b: Builder, roofs: Builder, glass: Builder, cloth: Builder, rand: () => number) {
  const w = h.x1 - h.x0;
  const cx = (h.x0 + h.x1) / 2;
  const cz = h.front - (h.out * h.depth) / 2;
  const rotFront = h.out === 1 ? 0 : Math.PI; // a plane facing the lane
  // Hollow-block ground floor, a darker plinth where the rain splashes.
  b.box([w, GROUND_FLOOR, h.depth], [cx, Y + GROUND_FLOOR / 2, cz], h.paint);
  b.box([w + 0.03, 0.32, h.depth + 0.03], [cx, Y + 0.16, cz], new THREE.Color(h.paint).multiplyScalar(0.72));
  let top = Y + GROUND_FLOOR;
  let roofDepth = h.depth;
  let roofZ = cz;
  if (h.floors === 2) {
    // The upper floor juts out over the lane, as they do.
    const jut = 0.5;
    const d = h.depth - 0.3 + jut;
    const z = h.front + h.out * jut - (h.out * d) / 2;
    b.box([w + 0.06, UPPER_FLOOR, d], [cx, top + UPPER_FLOOR / 2, z], h.upper ?? h.paint);
    // Floor joists showing under the jut.
    for (let x = h.x0 + 0.3; x < h.x1 - 0.1; x += 0.6) b.box([0.08, 0.12, jut + 0.05], [x, top - 0.06, h.front + (h.out * jut) / 2], "#5b3f28");
    // Plank lines on wooden cladding; ribs on galvanized sheet.
    const ribColor = new THREE.Color(h.upper ?? h.paint).multiplyScalar(0.8);
    for (let y = top + 0.3; y < top + UPPER_FLOOR - 0.1; y += 0.3) b.box([w + 0.07, 0.025, 0.01], [cx, y, h.front + h.out * (jut + 0.005)], ribColor);
    // An upper window, lit at night.
    const wx = cx + (h.door < 0.5 ? 0.6 : -0.6);
    glass.plane(1.0, 0.8, [wx, top + 1.3, h.front + h.out * (jut + 0.012)], "#ffffff", [0, rotFront, 0]);
    for (let i = -2; i <= 2; i++) b.box([0.025, 0.82, 0.02], [wx + i * 0.2, top + 1.3, h.front + h.out * (jut + 0.02)], "#2b3a33");
    top += UPPER_FLOOR;
    roofDepth = d;
    roofZ = z;
  }
  // Corrugated sheet roof, sloping back from the lane, with the tyres and
  // stones that hold it down in a typhoon.
  const tilt = -h.out * 0.12;
  roofs.box([w + 0.5, 0.05, roofDepth + 0.7], [cx, top + 0.22, roofZ + h.out * 0.15], h.roof, [tilt, 0, 0]);
  const tyres = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < tyres; i++) {
    const tx = h.x0 + 0.5 + rand() * (w - 1);
    const tz = roofZ + (rand() - 0.5) * (roofDepth - 1);
    const ty = top + 0.22 + (tz - (roofZ + h.out * 0.15)) * -Math.tan(tilt) + 0.08;
    b.cylinder(0.28, 0.28, 0.16, [tx, ty, tz], "#1e1e1e", [tilt, 0, 0], 10);
  }
  // Door: an open doorway with a curtain, the usual thing.
  const dx = h.x0 + 0.55 + h.door * (w - 1.1);
  b.box([1.0, 2.15, 0.06], [dx, Y + 1.075, frontZ(h, 0.03)], "#3a2a20");
  cloth.plane(0.86, 1.95, [dx, Y + 1.13, frontZ(h, 0.07)], h.curtain, [0, rotFront, 0]);
  // A ground floor window with a grille, lit at night.
  const wx = dx > cx ? h.x0 + 0.9 : h.x1 - 0.9;
  if (Math.abs(wx - dx) > 1.1) {
    glass.plane(1.0, 0.85, [wx, Y + 1.55, frontZ(h, 0.012)], "#ffffff", [0, rotFront, 0]);
    for (let i = -2; i <= 2; i++) b.box([0.022, 0.88, 0.022], [wx + i * 0.2, Y + 1.55, frontZ(h, 0.03)], "#2b3a33");
    b.box([1.1, 0.05, 0.12], [wx, Y + 1.1, frontZ(h, 0.05)], new THREE.Color(h.paint).multiplyScalar(0.85));
  }
  // A blue tarp patched over part of the side wall.
  if (h.tarp) {
    const side = rand() < 0.5 ? h.x0 - 0.01 : h.x1 + 0.01;
    cloth.plane(h.depth * 0.6, 1.8, [side, Y + 1.6, cz + (rand() - 0.5) * 0.6], "#2f6fb5", [0, Math.PI / 2, 0.05]);
  }
  // Potted plants in old tins by the door.
  for (let i = 0; i < 2; i++) {
    const px = dx + (i === 0 ? -0.75 : 0.75);
    if (px < h.x0 + 0.2 || px > h.x1 - 0.2) continue;
    const pz = frontZ(h, 0.3);
    b.cylinder(0.14, 0.12, 0.3, [px, Y + 0.15, pz], i ? "#b5bcc2" : "#c0603a");
    b.raw(new THREE.IcosahedronGeometry(0.24, 0).translate(px, Y + 0.48, pz), "#3f8f45");
  }
  // Washing on a line along the front, under the jut.
  if (h.laundry) {
    const lineY = Y + 2.45;
    const lz = frontZ(h, h.floors === 2 ? 0.42 : 0.35);
    b.bar([h.x0 + 0.1, lineY, lz], [h.x1 - 0.1, lineY, lz], 0.006, "#ddd");
    for (let x = h.x0 + 0.35; x < h.x1 - 0.35; x += 0.42 + rand() * 0.18) {
      const cw = 0.28 + rand() * 0.22;
      const ch = 0.32 + rand() * 0.38;
      cloth.plane(cw, ch, [x, lineY - ch / 2 - 0.01, lz], CLOTHES[Math.floor(rand() * CLOTHES.length)], [0, rotFront, 0]);
    }
  }
}

function addStore(b: Builder, glass: Builder, cloth: Builder, rand: () => number) {
  const { x0, x1, front, depth } = STORE;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const cz = front - depth / 2;
  b.box([w, 2.9, depth], [cx, Y + 1.45, cz], "#7cc3a0");
  b.box([w + 0.03, 0.32, depth + 0.03], [cx, Y + 0.16, cz], "#4f8a6c");
  // The store window: a dark opening behind a green grille, a ledge to
  // buy over, shelves of goods, and strips of sachets hanging down.
  const ox = cx - 0.3;
  const ow = 2.3;
  b.box([ow, 1.25, 0.05], [ox, Y + 1.65, front + 0.01], "#2a2620");
  for (let row = 0; row < 3; row++) {
    const sy = Y + 1.2 + row * 0.38;
    b.box([ow - 0.1, 0.03, 0.3], [ox, sy, front + 0.18], "#8b6a48");
    for (let x = ox - ow / 2 + 0.12; x < ox + ow / 2 - 0.1; x += 0.11 + rand() * 0.05) {
      const ph = 0.12 + rand() * 0.16;
      b.box([0.08, ph, 0.08], [x, sy + ph / 2 + 0.015, front + 0.15], BUNTING[Math.floor(rand() * BUNTING.length)]);
    }
  }
  for (let x = ox - ow / 2 + 0.15; x < ox + ow / 2 - 0.1; x += 0.28) {
    cloth.plane(0.09, 0.42 + rand() * 0.2, [x, Y + 2.02, front + 0.32], BUNTING[Math.floor(rand() * 5)], [0, 0, 0]);
  }
  for (let i = 0; i <= 11; i++) b.box([0.02, 1.25, 0.02], [ox - ow / 2 + (i * ow) / 11, Y + 1.65, front + 0.37], "#2f6b4a");
  b.box([ow + 0.2, 0.06, 0.06], [ox, Y + 2.3, front + 0.37], "#2f6b4a");
  b.box([ow + 0.25, 0.07, 0.5], [ox, Y + 1.02, front + 0.25], "#8b6a48");
  // An awning over the window.
  b.box([ow + 0.6, 0.04, 0.9], [ox, Y + 2.62, front + 0.42], "#c8402f", [-0.22, 0, 0]);
  // Door at the side, and a bench out front: the tambayan, where people sit.
  b.box([0.9, 2.1, 0.06], [x1 - 0.55, Y + 1.05, front + 0.03], "#3a2a20");
  b.box([1.8, 0.06, 0.38], [ox, Y + 0.45, front + 0.85], "#a87b4c");
  for (const sx of [-0.8, 0.8]) b.box([0.06, 0.44, 0.34], [ox + sx, Y + 0.22, front + 0.85], "#7a5634");
  // Roof.
  b.box([w + 0.5, 0.05, depth + 0.6], [cx, Y + 3.05, cz + 0.1], "#9a5a3a", [-0.1, 0, 0]);
}

function addArch(b: Builder) {
  for (const z of [LANE.z0 - 0.5, LANE.z1 + 0.5]) {
    b.box([0.6, 4.4, 0.6], [ARCH_X, Y + 2.2, z], "#e9e2cf");
    b.box([0.75, 0.3, 0.75], [ARCH_X, Y + 0.15, z], "#b8ab90");
    b.box([0.72, 0.2, 0.72], [ARCH_X, Y + 4.45, z], "#c9a24a");
  }
  b.box([0.5, 1.2, 5.9], [ARCH_X, Y + 5.1, (LANE.z0 + LANE.z1) / 2], "#2f6fd0");
  b.box([0.56, 0.12, 6.1], [ARCH_X, Y + 5.76, (LANE.z0 + LANE.z1) / 2], "#c9a24a");
  b.box([0.56, 0.12, 6.1], [ARCH_X, Y + 4.44, (LANE.z0 + LANE.z1) / 2], "#c9a24a");
}

function addPoles(b: Builder, wires: Builder, rand: () => number) {
  const H = 7.2;
  for (const [x, z] of POLES) {
    b.cylinder(0.12, 0.16, H, [x, Y + H / 2, z], "#9a948a", undefined, 8);
    // A street lamp on an arm over the lane.
    b.bar([x, Y + LAMP_Y + 0.35, z], [x, Y + LAMP_Y + 0.25, z - 1.1], 0.035, "#5d6266");
    b.box([0.34, 0.08, 0.2], [x, Y + LAMP_Y + 0.2, z - 1.15], "#4a4f53");
    b.box([1.6, 0.1, 0.1], [x, Y + H - 0.4, z], "#6b5a48");
    // A transformer on every other pole.
    if (x > 0 && x < 12) b.cylinder(0.24, 0.24, 0.7, [x + 0.35, Y + H - 1.2, z + 0.1], "#7d878c");
  }
  for (const [x, z] of BAMBOO) b.cylinder(0.05, 0.06, 5.2, [x, Y + 2.6, z], "#b9a56a", undefined, 6);
  // Four lines pole to pole, sagging.
  for (let i = 0; i < POLES.length - 1; i++) {
    const [ax, az] = POLES[i];
    const [bx, bz] = POLES[i + 1];
    for (let k = 0; k < 4; k++) {
      const off = -0.7 + k * 0.45;
      wires.sag([ax + off, Y + 6.8, az], [bx + off, Y + 6.8, bz], 0.45 + k * 0.05, 0.012, "#1c1c1c");
    }
  }
  // And drops to every house: the tangle overhead that every photo of a
  // Cebu street has.
  for (const h of HOUSES) {
    const pole = POLES.reduce((best, p) => (Math.abs(p[0] - (h.x0 + h.x1) / 2) < Math.abs(best[0] - (h.x0 + h.x1) / 2) ? p : best));
    const drops = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < drops; k++) {
      const hx = h.x0 + 0.4 + rand() * (h.x1 - h.x0 - 0.8);
      const hy = Y + (h.floors === 2 ? GROUND_FLOOR + UPPER_FLOOR - 0.3 : GROUND_FLOOR - 0.25);
      const hz = h.front + h.out * (h.floors === 2 ? 0.52 : 0.02);
      wires.sag([pole[0] + (rand() - 0.5) * 1.2, Y + 6.5, pole[1]], [hx, hy, hz], 0.25 + rand() * 0.3, 0.01, "#1c1c1c", 5);
    }
  }
  // The store's line comes across the lane.
  wires.sag([POLES[1][0], Y + 6.5, POLES[1][1]], [STORE.x0 + 0.5, Y + 2.7, STORE.front + 0.02], 0.5, 0.01, "#1c1c1c", 6);
}

function addBunting(cloth: Builder, wires: Builder) {
  const north: Vec3[] = POLES.map(([x, z]) => [x, Y + 4.6, z]);
  const south: Vec3[] = [[-3.4, Y + 4.4, 58.02], [STORE.x0 + 1.4, Y + 2.85, STORE.front + 0.02], ...BAMBOO.map(([x, z]): Vec3 => [x, Y + 4.4, z])];
  const strings: [Vec3, Vec3][] = [];
  for (let i = 0; i < north.length; i++) {
    if (south[i]) strings.push([north[i], south[i]]);
    if (south[i + 1]) strings.push([north[i], south[i + 1]]);
  }
  // And one string along the lane's whole length.
  strings.push([[LANE.x0 + 1, Y + 4.9, (LANE.z0 + LANE.z1) / 2], [LANE.x1 - 0.5, Y + 4.9, (LANE.z0 + LANE.z1) / 2]]);
  let c = 0;
  for (const [a, b] of strings) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const length = va.distanceTo(vb);
    const drop = 0.25 + length * 0.02;
    wires.sag(a, b, drop, 0.006, "#e8e2d0", 6);
    const along = vb.clone().sub(va);
    const yaw = Math.atan2(-along.z, along.x);
    for (let d = 0.2; d < length - 0.2; d += 0.32) {
      const t = d / length;
      const p = va.clone().lerp(vb, t);
      p.y -= drop * 4 * t * (1 - t);
      const tri = new THREE.BufferGeometry();
      tri.setAttribute("position", new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, 0, -0.28, 0], 3));
      tri.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
      tri.applyMatrix4(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1)));
      cloth.raw(tri, BUNTING[c++ % BUNTING.length]);
    }
  }
}

function addRack(b: Builder) {
  const { x0, x1, z0, z1 } = RACK;
  const top = Y + 0.85;
  for (const x of [x0, x1]) for (const z of [z0, z1]) b.cylinder(0.035, 0.035, 0.85, [x, Y + 0.425, z], "#b9a56a", undefined, 5);
  b.box([x1 - x0 + 0.1, 0.02, z1 - z0 + 0.1], [(x0 + x1) / 2, top, (z0 + z1) / 2], "#8a7a55");
  // Rows of bulad laid out to dry.
  const fish = new THREE.SphereGeometry(1, 6, 3);
  for (let x = x0 + 0.14; x < x1 - 0.08; x += 0.17) {
    for (let z = z0 + 0.12; z < z1 - 0.06; z += 0.2) {
      const g = fish.clone().scale(0.075, 0.012, 0.032).rotateY(0.3).translate(x, top + 0.02, z);
      b.raw(g, (x * 7 + z * 3) % 1 > 0.5 ? "#c9a46c" : "#b48b58");
    }
  }
  fish.dispose();
  // Two taller poles and a line, for the fish Group C cut out to hang.
  for (const x of [x0 - 0.2, x1 + 0.2]) b.cylinder(0.04, 0.045, 2.6, [x, Y + 1.3, (z0 + z1) / 2], "#b9a56a", undefined, 5);
  b.bar([x0 - 0.2, Y + 2.45, (z0 + z1) / 2], [x1 + 0.2, Y + 2.45, (z0 + z1) / 2], 0.006, "#e8e2d0");
}

function addPlacards(b: Builder, places: Placement[]) {
  for (const p of places) {
    const piece = PIECE_BY_ID[p.id];
    const [, h] = dims(piece, p.size);
    const back = p.rotationY === 0 ? -1 : 1;
    // A post behind the photo, and a plaque for the label below it.
    b.box([0.09, p.at[1] - Y + h / 2, 0.09], [p.at[0], Y + (p.at[1] - Y + h / 2) / 2, p.at[2] + back * 0.07], "#4a3a2c");
    b.box([0.86, 0.26, 0.03], [p.at[0], Y + 1.02, p.at[2] + back * 0.035], "#4a3a2c");
    addBacking(b, p, "frame");
  }
}

function addPalms(b: Builder, leaves: Builder, rand: () => number) {
  for (const [x, z] of PALMS) {
    // A trunk that leans and curves, in segments.
    let p = new THREE.Vector3(x, Y, z);
    const lean = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize().multiplyScalar(0.12);
    for (let i = 0; i < 8; i++) {
      const next = p.clone().add(new THREE.Vector3(lean.x * (1 + i * 0.25), 0.9, lean.z * (1 + i * 0.25)));
      b.bar([p.x, p.y, p.z], [next.x, next.y, next.z], 0.17 - i * 0.008, "#8a7556", 7);
      p = next;
    }
    for (let i = 0; i < 9; i++) {
      const yaw = (i / 9) * Math.PI * 2 + rand() * 0.3;
      const frond = new THREE.PlaneGeometry(0.7, 3, 1, 3);
      // Droop the frond: bend its far end down.
      const pos = frond.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const along = (pos.getY(v) + 1.5) / 3;
        pos.setZ(v, -along * along * 1.4);
      }
      frond.translate(0, 1.5, 0);
      frond.rotateX(-1.2);
      frond.rotateY(yaw);
      frond.translate(p.x, p.y, p.z);
      frond.computeVertexNormals();
      leaves.raw(frond, i % 2 ? "#4f8f3a" : "#3f7a30");
    }
    b.raw(new THREE.SphereGeometry(0.28, 6, 4).translate(p.x, p.y - 0.15, p.z), "#6b5a2a");
  }
}

function buildLane(): LaneGeometry {
  const rand = seeded(20260214);
  const b = new Builder();
  const roofs = new Builder();
  const glass = new Builder();
  const cloth = new Builder();
  const wires = new Builder();
  for (const h of HOUSES) addHouse(h, b, roofs, glass, cloth, rand);
  addStore(b, glass, cloth, rand);
  addArch(b);
  addPoles(b, wires, rand);
  addBunting(cloth, wires);
  addRack(b);
  addPlacards(b, tourPlacements());
  addPalms(b, cloth, rand);
  // Blue water drums and a pair of monobloc chairs, the furniture of
  // every lane.
  for (const [x, z] of [
    [-2.6, 62.5],
    [12.0, 61.95],
    [-1.4, 57.7],
  ] as [number, number][]) {
    b.cylinder(0.3, 0.3, 0.85, [x, Y + 0.425, z], "#2f63b5", undefined, 12);
    b.cylinder(0.31, 0.31, 0.04, [x, Y + 0.86, z], "#244f91", undefined, 12);
  }
  for (const [x, z, yaw, color] of [
    [9.6, 61.1, 2.6, "#f2f0ea"],
    [10.4, 61.2, 3.5, "#d23b31"],
  ] as [number, number, number, string][]) {
    const q = new THREE.Euler(0, yaw, 0);
    const at = (dx: number, dy: number, dz: number): Vec3 => {
      const v = new THREE.Vector3(dx, dy, dz).applyEuler(q);
      return [x + v.x, Y + v.y, z + v.z];
    };
    b.box([0.46, 0.05, 0.44], at(0, 0.44, 0), color, [0, yaw, 0]);
    b.box([0.46, 0.42, 0.04], at(0, 0.68, -0.22), color, [-0.12 + 0, yaw, 0]);
    for (const [lx, lz] of [
      [-0.2, -0.19],
      [0.2, -0.19],
      [-0.2, 0.19],
      [0.2, 0.19],
    ])
      b.box([0.04, 0.44, 0.04], at(lx, 0.22, lz), color, [0, yaw, 0]);
  }
  const bulbs = new Builder();
  for (const at of LAMPS) bulbs.box([0.26, 0.05, 0.14], at, "#ffffff");
  return { bulbs: bulbs.build(), painted: b.build(), roofs: roofs.build(), glass: glass.build(), cloth: cloth.build(), wires: wires.build() };
}

// --- textures ------------------------------------------------------------------------------------

function concreteTexture() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#a9a59c";
      ctx.fillRect(0, 0, w, h);
      const rand = seeded(7);
      for (let i = 0; i < 2600; i++) {
        const v = 140 + Math.floor(rand() * 50);
        ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`;
        ctx.fillRect(rand() * w, rand() * h, 2, 2);
      }
      // Slab joints, and a few stains and cracks.
      ctx.strokeStyle = "rgba(70,66,60,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.lineTo(w, 1);
      ctx.moveTo(1, 0);
      ctx.lineTo(1, h);
      ctx.stroke();
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        let x = rand() * w;
        let y = rand() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) ctx.lineTo((x += (rand() - 0.5) * 30), (y += (rand() - 0.5) * 30));
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = "rgba(80,74,60,0.12)";
        ctx.beginPath();
        ctx.ellipse(rand() * w, rand() * h, 10 + rand() * 25, 6 + rand() * 15, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [1, 1]
  );
}

function corrugatedTexture() {
  return canvasTexture(
    64,
    64,
    (ctx, w, h) => {
      for (let x = 0; x < w; x++) {
        const v = 200 + Math.round(55 * Math.cos((x / w) * Math.PI * 2 * 4));
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, 0, 1, h);
      }
      ctx.fillStyle = "rgba(120,60,30,0.25)";
      for (let i = 0; i < 8; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 6, 3);
    },
    [6, 1]
  );
}

function archSign(front: boolean) {
  return canvasTexture(1024, 200, (ctx, w, h) => {
    ctx.fillStyle = "#2f6fd0";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (front) {
      ctx.font = `600 40px ${FONT}`;
      ctx.fillText("Maayong pag-abot sa", w / 2, 44);
      ctx.font = `800 92px ${FONT}`;
      ctx.fillStyle = "#f6c624";
      ctx.fillText(TITLE.toUpperCase(), w / 2, 118);
      ctx.fillStyle = "#ffffff";
      ctx.font = `500 30px ${FONT}`;
      ctx.fillText("ようこそ · Welcome", w / 2, 178);
    } else {
      ctx.font = `700 54px ${FONT}`;
      ctx.fillText("Salamat! Amping!", w / 2, 70);
      ctx.font = `500 34px ${FONT}`;
      ctx.fillText("ありがとう · Thank you, come again", w / 2, 140);
    }
  });
}

function storeSign() {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#f6c624";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c8402f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText("SARI-SARI STORE", w / 2, 52);
    ctx.fillStyle = "#3a2a20";
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText("Tindahan ni Mayang · Load · Ice", w / 2, 102);
  });
}

// --- the scene -------------------------------------------------------------------------------------

export function Lane() {
  const area = useRef<THREE.Group>(null);
  useDrawDistance(area, LANE_CENTRE, 60);
  const geometry = useMemo(buildLane, []);
  useEffect(
    () => () => {
      for (const g of Object.values(geometry)) g.dispose();
    },
    [geometry]
  );
  const m = useMemo(() => {
    const concrete = concreteTexture();
    const lane = concrete.clone();
    lane.repeat.set((LANE.x1 - LANE.x0) / 2.5, (LANE.z1 - LANE.z0) / 2.5);
    lane.needsUpdate = true;
    const path = concrete.clone();
    path.repeat.set((PATH.x1 - PATH.x0) / 2.5, (PATH.z1 - PATH.z0) / 2.5);
    path.needsUpdate = true;
    return {
      painted: paint(),
      roofs: paint({ map: corrugatedTexture() }),
      cloth: paint({ side: THREE.DoubleSide }),
      wires: paint(),
      glass: new THREE.MeshLambertMaterial({ color: "#2a3036", emissive: new THREE.Color("#000") }),
      bulbs: new THREE.MeshBasicMaterial({ color: "#333", toneMapped: false }),
      lane: new THREE.MeshLambertMaterial({ map: lane }),
      path: new THREE.MeshLambertMaterial({ map: path }),
      archFront: washed(archSign(true)),
      archBack: washed(archSign(false)),
      store: washed(storeSign()),
    };
  }, []);
  useEffect(
    () => () => {
      for (const material of Object.values(m)) {
        (material as THREE.MeshLambertMaterial).map?.dispose();
        material.dispose();
      }
    },
    [m]
  );
  const windowGlow = useMemo(
    () => [
      { material: m.glass, color: new THREE.Color("#ffc874") },
      { material: m.bulbs, color: new THREE.Color("#fff3d6") },
    ],
    [m]
  );
  useNight([m.archFront, m.archBack, m.store], windowGlow);
  // The street lamps' light: Seiza's pooled lights, on the garden switch.
  const lamp = useRef(0);
  useFrame((_, delta) => {
    const target = roomLights.pond ? 6 * nightNeed() : 0;
    lamp.current += (target - lamp.current) * (1 - Math.exp(-delta / 0.2));
  });

  const places = useMemo(tourPlacements, []);
  const labels = useMemo<LabelPlacement[]>(
    () =>
      // Just in front of each placard's plaque.
      places.map((p) => ({ id: p.id, at: [p.at[0], Y + 1.02, p.at[2] + (p.rotationY === 0 ? -0.018 : 0.018)] as Vec3, rotationY: p.rotationY, width: 0.8 })),
    [places]
  );
  const cutouts = useMemo<Placement[]>(
    () => [
      { id: "c2", at: [RACK.x0 + 0.6, Y + 2.1, (RACK.z0 + RACK.z1) / 2], rotationY: 0, size: 0.6 },
      { id: "c4", at: [RACK.x1 - 0.6, Y + 2.1, (RACK.z0 + RACK.z1) / 2], rotationY: 0, size: 0.6 },
    ],
    []
  );
  const sway = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!sway.current) return;
    const t = clock.elapsedTime;
    sway.current.children.forEach((c, i) => {
      c.rotation.z = Math.sin(t * 1.3 + i * 1.7) * 0.06;
    });
  });

  const archMid = (LANE.z0 + LANE.z1) / 2;
  return (
    <group ref={area}>
      <mesh geometry={geometry.painted} material={m.painted} castShadow receiveShadow />
      <mesh geometry={geometry.roofs} material={m.roofs} castShadow />
      <mesh geometry={geometry.glass} material={m.glass} raycast={noRaycast} />
      <mesh geometry={geometry.bulbs} material={m.bulbs} raycast={noRaycast} userData={{ navIgnore: true }} />
      {LAMPS.map((at, i) => (
        <PooledLight key={i} position={[at[0], at[1] - 0.2, at[2]]} color="#ffe2b0" intensityRef={lamp} distance={11} />
      ))}
      <mesh geometry={geometry.cloth} material={m.cloth} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.wires} material={m.wires} raycast={noRaycast} userData={{ navIgnore: true }} />
      {/* Paving, a hair above the grass. */}
      <mesh position={[(LANE.x0 + LANE.x1) / 2, Y + 0.012, (LANE.z0 + LANE.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={m.lane} receiveShadow userData={{ navIgnore: true }}>
        <planeGeometry args={[LANE.x1 - LANE.x0, LANE.z1 - LANE.z0]} />
      </mesh>
      <mesh position={[(PATH.x0 + PATH.x1) / 2, Y + 0.011, (PATH.z0 + PATH.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={m.path} receiveShadow userData={{ navIgnore: true }}>
        <planeGeometry args={[PATH.x1 - PATH.x0, PATH.z1 - PATH.z0]} />
      </mesh>
      {/* The arch's sign: welcome on the way in, thanks on the way out.
          Click it for the lane's card. */}
      <Clickable onClick={() => openPiece("board:lane")}>
        <mesh position={[ARCH_X - 0.26, Y + 5.1, archMid]} rotation={[0, -Math.PI / 2, 0]} material={m.archFront} userData={{ navIgnore: true }}>
          <planeGeometry args={[5.6, 1.1]} />
        </mesh>
        <mesh position={[ARCH_X + 0.26, Y + 5.1, archMid]} rotation={[0, Math.PI / 2, 0]} material={m.archBack} userData={{ navIgnore: true }}>
          <planeGeometry args={[5.6, 1.1]} />
        </mesh>
      </Clickable>
      <mesh position={[STORE.x0 + 1.5, Y + 2.95, STORE.front + 0.02]} material={m.store} userData={{ navIgnore: true }}>
        <planeGeometry args={[2.6, 0.65]} />
      </mesh>
      {places.map((p) => (
        <Picture key={p.id} place={p} sequence={TOUR_SEQUENCE} />
      ))}
      <Labels labels={labels} />
      <group ref={sway}>
        {cutouts.map((p) => (
          <group key={p.id} position={[p.at[0], Y + 2.45, p.at[2]]}>
            <Picture place={{ ...p, at: [0, p.at[1] - (Y + 2.45), 0] }} sequence={["c2", "c4"]} />
          </group>
        ))}
      </group>
    </group>
  );
}

/** The lane's solid parts, for Seiza's collision (setWorldObstacles). */
export function laneObstacles(): Obstacle[] {
  const o = (x0: number, x1: number, z0: number, z1: number): Obstacle => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, halfX: (x1 - x0) / 2, halfZ: (z1 - z0) / 2, rotationY: 0 });
  const list: Obstacle[] = [];
  for (const h of HOUSES) {
    const back = h.front - h.out * h.depth;
    list.push(o(h.x0, h.x1, Math.min(h.front, back), Math.max(h.front, back)));
  }
  list.push(o(STORE.x0, STORE.x1, STORE.front - STORE.depth, STORE.front + 0.45));
  for (const z of [LANE.z0 - 0.5, LANE.z1 + 0.5]) list.push(o(ARCH_X - 0.3, ARCH_X + 0.3, z - 0.3, z + 0.3));
  for (const [x, z] of [...POLES, ...BAMBOO]) list.push(o(x - 0.15, x + 0.15, z - 0.15, z + 0.15));
  list.push(o(RACK.x0 - 0.25, RACK.x1 + 0.25, RACK.z0 - 0.05, RACK.z1 + 0.05));
  for (const t of TOUR) list.push(o(t.x - 0.1, t.x + 0.1, TOUR_Z[t.side] - 0.12, TOUR_Z[t.side] + 0.12));
  for (const [x, z] of PALMS) list.push(o(x - 0.2, x + 0.2, z - 0.2, z + 0.2));
  return list;
}
