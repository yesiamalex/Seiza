// Seishore's town, built in code: the street of shops and houses, the
// konbini you can walk into, the coast road and its sea wall, the boats on
// the sand, the shrine by the campsite, and everything a Japanese street
// has: utility poles and their wires, vending machines, a curved traffic
// mirror, a bus stop, wind chimes under the eaves. Each material is one
// merged geometry (Builder): a handful of draw calls for the whole town.
import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PooledLight } from "../../../src/scene/LightPool";
import { roomLights } from "../../../src/scene/roomLights";
import { floorHeightAt, OUTER_GROUND_Y } from "../../../src/scene/layout";
import { skyState } from "../../../src/sky/skyState";
import { Builder, canvasTexture, Clickable, FONT, lampNeed, noRaycast, ON_TOP, paint, useDrawDistance, useNight, washed, type Vec3 } from "../../seisugbo/client/kit";
import {
  BOATS,
  BUILDINGS,
  CAFE_COUNTER,
  CAFE_TABLES,
  DINER_TABLES,
  DRINK_BAR,
  FAMIRESU,
  FENCE,
  OFFERING_AT,
  OMIKUJI_AT,
  PASS,
  PLATFORM,
  ROOM_HEIGHT,
  STATIONS,
  STRIP,
  TEMPLE,
  TEMPLE_OFFERING,
  TRACK,
  VIEW_BENCH,
  WALL,
  BUS_STOP,
  CAFE,
  CAFE_BENCH,
  CAFE_BOARD,
  COUNTER,
  FRIDGES,
  frontOf,
  GONDOLAS,
  KONBINI,
  KONBINI_DOOR,
  KONBINI_HEIGHT,
  LANE,
  MAGAZINES,
  MIRROR_AT,
  POLES,
  PROMENADE,
  PROMENADE_BENCHES,
  ROAD,
  SEAWALL,
  SHRINE,
  SHRINE_BENCH,
  VENDING,
  Y,
  type Building,
} from "./plan";

const G = OUTER_GROUND_Y;
const TEMPLE_WOOD = "#6e4a30";
const TEMPLE_WHITE = "#efe9dc";
const STOREY = 2.7;
const UPPER = 2.6;
const PITCH = 0.42;
const EAVE = 0.45;
const TORII_RED = "#d2452e";
const WOOD_DARK = "#3a2c22";
const WOOD = "#8a6545";
const CONCRETE = "#b9b6ad";
const SAND = (x: number, z: number) => floorHeightAt(x, z);

/** A triangular prism along x: a gable's attic, from `base` up to the ridge. */
function gable(b: Builder, x0: number, x1: number, z0: number, z1: number, base: number, rise: number, color: string) {
  const shape = new THREE.Shape();
  const half = (z1 - z0) / 2;
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(x0, base, (z0 + z1) / 2);
  b.raw(g, color);
}

/** A tiled gable roof, its ridge along x, over a box z0..z1 whose walls top out at `top`. */
function roof(b: Builder, x0: number, x1: number, z0: number, z1: number, top: number, color: string, wall: string) {
  const d = z1 - z0;
  const rise = (d / 2) * Math.tan(PITCH);
  gable(b, x0, x1, z0, z1, top, rise, wall);
  const run = d / 2 + EAVE;
  const length = run / Math.cos(PITCH);
  const ridge = top + rise + 0.04;
  for (const s of [-1, 1]) {
    b.box([x1 - x0 + 0.5, 0.1, length], [(x0 + x1) / 2, ridge - (run / 2) * Math.tan(PITCH), (z0 + z1) / 2 + s * (run / 2)], color, [s * PITCH, 0, 0]);
  }
  // The ridge tiles, a little darker.
  b.box([x1 - x0 + 0.55, 0.16, 0.24], [(x0 + x1) / 2, ridge + 0.06, (z0 + z1) / 2], new THREE.Color(color).multiplyScalar(0.8));
}

/** A window: a frame and its glass (the glass glows at night). */
function windowPane(b: Builder, glass: Builder, x: number, y: number, z: number, out: number, w: number, h: number, frame = "#e9e7e1") {
  b.box([w + 0.1, h + 0.1, 0.06], [x, y, z + out * 0.02], frame);
  glass.plane(w, h, [x, y, z + out * 0.055], "#ffffff", [0, out > 0 ? 0 : Math.PI, 0]);
  // The sash: two panes, side by side.
  b.box([0.04, h, 0.04], [x, y, z + out * 0.07], frame);
}

/** Thin vertical bars across an opening: koshi lattice, a balcony rail. */
function bars(b: Builder, x0: number, x1: number, y0: number, y1: number, z: number, every: number, color: string, r = 0.02) {
  for (let x = x0; x <= x1 + 1e-6; x += every) b.box([r * 2, y1 - y0, r * 2], [x, (y0 + y1) / 2, z], color);
}

/** A ground floor you walk into: walls, glass panes where the windows are
 *  (`windows`, along the front), its door open, a floor and a ceiling. */
function addRoom(h: Building, b: Builder, panes: Builder, inside: Builder, windows: [number, number][], height: number) {
  const { front, back, out } = frontOf(h);
  const z0 = Math.min(front, back);
  const z1 = Math.max(front, back);
  const zc = (z0 + z1) / 2;
  const w = h.x1 - h.x0;
  const wallColor = h.wood ? WOOD_DARK : h.wall;
  b.box([WALL, height, z1 - z0], [h.x0 + WALL / 2, Y + height / 2, zc], wallColor);
  b.box([WALL, height, z1 - z0], [h.x1 - WALL / 2, Y + height / 2, zc], wallColor);
  b.box([w, height, WALL], [(h.x0 + h.x1) / 2, Y + height / 2, back - out * (WALL / 2)], wallColor);
  // The front: solid between the openings, a header over them all.
  const fz = front - out * (WALL / 2);
  const openings = [...windows, h.door!].sort((a, c) => a[0] - c[0]);
  let x = h.x0;
  for (const [a, c] of openings) {
    if (a > x) b.box([a - x, height, WALL], [(x + a) / 2, Y + height / 2, fz], wallColor);
    x = c;
  }
  if (h.x1 > x) b.box([h.x1 - x, height, WALL], [(x + h.x1) / 2, Y + height / 2, fz], wallColor);
  for (const [a, c] of windows) {
    b.box([c - a, 0.55, WALL], [(a + c) / 2, Y + 0.275, fz], wallColor);
    panes.plane(c - a, height - 0.95, [(a + c) / 2, Y + 0.55 + (height - 0.95) / 2, fz], "#ffffff");
    b.box([0.05, height - 0.95, WALL + 0.02], [(a + c) / 2, Y + 0.55 + (height - 0.95) / 2, fz], "#3a3330");
  }
  const [d0, d1] = h.door!;
  b.box([d1 - d0, height - 2.15, WALL], [(d0 + d1) / 2, Y + 2.15 + (height - 2.15) / 2, fz], wallColor);
  for (const a of [d0 - 0.25, d1 + 0.25]) panes.plane(0.5, 2.1, [a, Y + 1.05, fz - out * 0.08], "#ffffff");
  inside.plane(w - 0.4, z1 - z0 - 0.4, [(h.x0 + h.x1) / 2, Y + 0.012, zc], h.kind === "cafe" ? "#9a7452" : "#d9d2c4", [-Math.PI / 2, 0, 0]);
  inside.plane(w - 0.4, z1 - z0 - 0.4, [(h.x0 + h.x1) / 2, Y + height - 0.02, zc], "#f3efe6", [Math.PI / 2, 0, 0]);
}

function addHouse(h: Building, b: Builder, glass: Builder, roofs: Builder) {
  const { front, back, out } = frontOf(h);
  const z0 = Math.min(front, back);
  const z1 = Math.max(front, back);
  const xc = (h.x0 + h.x1) / 2;
  const zc = (z0 + z1) / 2;
  const w = h.x1 - h.x0;
  const d = h.depth;
  const top = Y + STOREY + (h.floors === 2 ? UPPER : 0);
  b.box([w + 0.04, 0.28, d + 0.04], [xc, Y + 0.14, zc], "#97958d");
  if (!h.door) b.box([w, STOREY, d], [xc, Y + STOREY / 2, zc], h.wood ? WOOD_DARK : h.wall);
  if (h.floors === 2) b.box([w, UPPER, d], [xc, Y + STOREY + UPPER / 2, zc], h.wall);
  roof(roofs, h.x0, h.x1, z0, z1, top, h.roof, h.wall);
  // A little eave over the ground floor's front (hisashi).
  if (h.floors === 2) roofs.box([w + 0.2, 0.06, 0.75], [xc, Y + STOREY + 0.08, front + out * 0.33], h.roof, [out * 0.28, 0, 0]);
  const f = front + out * 0.001;
  if (h.kind === "house") {
    // The genkan's sliding door, latticed, and a frosted window.
    const dx = h.x0 + 1.1;
    b.box([1.5, 2.05, 0.06], [dx, Y + 0.28 + 1.02, f + out * 0.02], "#5a4232");
    bars(b, dx - 0.65, dx + 0.65, Y + 0.4, Y + 2.2, f + out * 0.06, 0.13, "#b48a5c", 0.015);
    windowPane(b, glass, h.x1 - 1.3, Y + 1.45, f, out, 1.4, 0.95);
    // A nameplate and a post box by the door.
    b.box([0.22, 0.32, 0.04], [dx + 1.0, Y + 1.5, f + out * 0.03], "#e8dcc4");
  }
  if (h.floors === 2) {
    // Upstairs: two windows, and a balcony with its rail and an AC unit.
    windowPane(b, glass, h.x0 + w * 0.3, Y + STOREY + 1.25, f, out, 1.1, 1.0);
    windowPane(b, glass, h.x0 + w * 0.72, Y + STOREY + 1.25, f, out, 1.1, 1.0);
    const bz = front + out * 0.55;
    b.box([w * 0.62, 0.08, 0.9], [h.x0 + w * 0.5, Y + STOREY + 0.2, front + out * 0.45], "#c9c6bd");
    bars(b, h.x0 + w * 0.2, h.x0 + w * 0.8, Y + STOREY + 0.24, Y + STOREY + 1.15, bz, 0.12, "#6c6f73", 0.012);
    b.box([w * 0.62, 0.04, 0.04], [h.x0 + w * 0.5, Y + STOREY + 1.16, bz], "#6c6f73");
    b.box([0.78, 0.55, 0.28], [h.x0 + w * 0.78, Y + STOREY + 0.52, front + out * 0.3], "#f1f1ee");
    b.cylinder(0.18, 0.18, 0.02, [h.x0 + w * 0.78 - 0.12, Y + STOREY + 0.52, front + out * 0.45], "#7d8085", [Math.PI / 2, 0, 0], 12);
  }
}

function addCafe(h: Building, b: Builder, panes: Builder, inside: Builder, lit: Builder, cloth: Builder) {
  const { front, out } = frontOf(h);
  const xc = (h.x0 + h.x1) / 2;
  addRoom(h, b, panes, inside, [[h.x0 + 0.5, h.door![0] - 0.45]], ROOM_HEIGHT);
  cloth.box([h.x1 - h.x0 + 0.1, 0.05, 0.9], [xc, Y + STOREY - 0.05, front + out * 0.42], "#4f6b4a", [out * 0.3, 0, 0]);
  // Potted plants either side of the door.
  for (const x of [h.door![0] - 0.25, h.door![1] + 0.22]) {
    b.cylinder(0.17, 0.14, 0.34, [x, Y + 0.17, front + out * 0.28], "#a35e3d", undefined, 10);
    b.cylinder(0.0, 0.26, 0.62, [x, Y + 0.64, front + out * 0.28], "#3f6e3a", undefined, 7);
  }
  // The counter: wood, the espresso machine, the cake case, the grinder.
  const c = CAFE_COUNTER;
  inside.box([c.x1 - c.x0, 1.0, c.z1 - c.z0], [(c.x0 + c.x1) / 2, Y + 0.5, (c.z0 + c.z1) / 2], "#7a5636");
  inside.box([c.x1 - c.x0 + 0.06, 0.05, c.z1 - c.z0 + 0.06], [(c.x0 + c.x1) / 2, Y + 1.02, (c.z0 + c.z1) / 2], "#d9c3a0");
  inside.box([0.62, 0.46, 0.45], [c.x0 + 0.55, Y + 1.27, (c.z0 + c.z1) / 2], "#c9ccd0");
  inside.box([0.5, 0.06, 0.2], [c.x0 + 0.55, Y + 1.12, c.z1 - 0.06], "#2b2d30");
  panes.box([0.9, 0.4, 0.5], [c.x1 - 0.7, Y + 1.25, (c.z0 + c.z1) / 2], "#ffffff");
  for (let i = 0; i < 4; i++) inside.box([0.14, 0.1, 0.14], [c.x1 - 1.0 + i * 0.2, Y + 1.12, (c.z0 + c.z1) / 2], ["#f4e1c1", "#7a3e2a", "#f2c9d2", "#e8d29a"][i]);
  inside.cylinder(0.09, 0.11, 0.3, [c.x0 + 1.25, Y + 1.2, (c.z0 + c.z1) / 2], "#3a2c22", undefined, 10);
  // Shelves of beans and cups on the back wall.
  for (const y of [1.45, 1.85]) inside.box([3.0, 0.04, 0.24], [(c.x0 + c.x1) / 2, Y + y, c.z0 - 0.72], "#8a6545");
  for (let i = 0; i < 9; i++) inside.cylinder(0.05, 0.05, 0.1, [c.x0 + 0.3 + i * 0.33, Y + 1.52, c.z0 - 0.72], i % 2 ? "#f4f2ec" : "#5a7d6e", undefined, 8);
  // Tables for two, round, with a chair each side; coffee on them.
  for (const [x, z] of CAFE_TABLES) {
    inside.cylinder(0.32, 0.32, 0.04, [x, Y + 0.74, z], "#c49a6c", undefined, 16);
    inside.cylinder(0.04, 0.05, 0.72, [x, Y + 0.36, z], "#2b2522", undefined, 8);
    for (const s of [-1, 1]) {
      inside.box([0.4, 0.05, 0.4], [x + s * 0.55, Y + 0.44, z], "#8a6545");
      inside.box([0.05, 0.45, 0.38], [x + s * 0.76, Y + 0.68, z], "#8a6545");
      for (const [lx, lz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) inside.box([0.03, 0.42, 0.03], [x + s * 0.55 + lx, Y + 0.21, z + lz], "#2b2522");
      inside.cylinder(0.045, 0.035, 0.08, [x + s * 0.14, Y + 0.8, z], "#f4f2ec", undefined, 10);
    }
  }
  // Warm pendant lamps over the tables.
  for (const [x, z] of CAFE_TABLES) {
    inside.bar([x, Y + ROOM_HEIGHT - 0.02, z], [x, Y + ROOM_HEIGHT - 0.55, z], 0.008, "#222");
    lit.cylinder(0.08, 0.16, 0.14, [x, Y + ROOM_HEIGHT - 0.6, z], "#ffd79a", undefined, 12);
  }
}

/** The family restaurant: a wide glass front, tables for four in
 *  booths by the window, the kitchen behind its pass, the drink bar. */
function addFamiresu(h: Building, b: Builder, panes: Builder, inside: Builder, lit: Builder, roofs: Builder) {
  const { front, back, out } = frontOf(h);
  const z0 = Math.min(front, back);
  const z1 = Math.max(front, back);
  const xc = (h.x0 + h.x1) / 2;
  addRoom(h, b, panes, inside, [[h.door![1] + 0.4, h.x1 - 0.4]], ROOM_HEIGHT);
  // A band round the top, the restaurant's red, and a shallow roof.
  b.box([h.x1 - h.x0 + 0.1, 0.5, z1 - z0 + 0.1], [xc, Y + ROOM_HEIGHT + 0.25, (z0 + z1) / 2], "#c2523d");
  roof(roofs, h.x0, h.x1, z0, z1, Y + ROOM_HEIGHT + 0.5, h.roof, "#f6efe2");
  // Booths: a table for four, bench seats either side with tall backs.
  for (const [x, z] of DINER_TABLES) {
    inside.box([1.1, 0.05, 0.64], [x, Y + 0.74, z], "#e9e3d6");
    inside.box([0.1, 0.72, 0.1], [x, Y + 0.36, z], "#55504a");
    for (const s of [-1, 1]) {
      const sz = z + s * 0.62;
      inside.box([1.2, 0.42, 0.5], [x, Y + 0.21, sz + s * 0.02], "#b5473a");
      inside.box([1.2, 0.75, 0.14], [x, Y + 0.8, sz + s * 0.3], "#b5473a");
    }
    // Plates, a menu stand, water glasses.
    for (const dx of [-0.28, 0.28]) {
      inside.cylinder(0.13, 0.11, 0.02, [x + dx, Y + 0.78, z - 0.12], "#ffffff", undefined, 14);
      inside.cylinder(0.13, 0.11, 0.02, [x + dx, Y + 0.78, z + 0.12], "#ffffff", undefined, 14);
    }
    inside.box([0.12, 0.2, 0.06], [x - 0.48, Y + 0.87, z], "#c2523d");
    lit.cylinder(0.05, 0.3, 0.12, [x, Y + ROOM_HEIGHT - 0.5, z], "#fff2d0", undefined, 14);
    inside.bar([x, Y + ROOM_HEIGHT - 0.02, z], [x, Y + ROOM_HEIGHT - 0.44, z], 0.008, "#222");
  }
  // The kitchen's pass: a steel shelf, heat lamps, the kitchen behind.
  inside.box([PASS.x1 - PASS.x0, 1.05, PASS.z1 - PASS.z0], [(PASS.x0 + PASS.x1) / 2, Y + 0.52, (PASS.z0 + PASS.z1) / 2], "#cfd3d6");
  inside.box([PASS.x1 - PASS.x0, 0.04, 0.4], [(PASS.x0 + PASS.x1) / 2, Y + 1.4, (PASS.z0 + PASS.z1) / 2], "#b9bec2");
  for (let i = 0; i < 4; i++) lit.box([0.3, 0.05, 0.12], [PASS.x0 + 0.8 + i * 1.7, Y + 1.36, (PASS.z0 + PASS.z1) / 2], "#ffb36b");
  // The stoves and pots behind the pass.
  const kz = back - out * 0.55;
  inside.box([PASS.x1 - PASS.x0, 0.9, 0.7], [(PASS.x0 + PASS.x1) / 2, Y + 0.45, kz], "#8f9598");
  for (let i = 0; i < 3; i++) inside.cylinder(0.2, 0.18, 0.28, [PASS.x0 + 1.4 + i * 2.0, Y + 1.04, kz], "#c9ccd0", undefined, 14);
  // The drink bar: its machine, cups, the glow of its panel.
  const d = DRINK_BAR;
  inside.box([d.x1 - d.x0, 1.0, d.z1 - d.z0], [(d.x0 + d.x1) / 2, Y + 0.5, (d.z0 + d.z1) / 2], "#3a3d42");
  lit.box([0.03, 0.5, 1.4], [d.x1 + 0.005, Y + 1.3, (d.z0 + d.z1) / 2], "#7fd3e6");
  for (let i = 0; i < 4; i++) inside.cylinder(0.04, 0.035, 0.1, [d.x1 - 0.1, Y + 1.06, d.z0 + 0.3 + i * 0.35], "#e9f3f7", undefined, 8);
}

/** The railway: its bed and ballast, sleepers and rails, the fence, the
 *  low wall where the meadow is lower, the platforms with their shelters. */
function addRailway(b: Builder, roofs: Builder, marks: Builder) {
  const length = TRACK.z1 - TRACK.z0;
  const zc = (TRACK.z0 + TRACK.z1) / 2;
  b.box([STRIP.x1 - PLATFORM.x1, 0.04, length], [(PLATFORM.x1 + STRIP.x1) / 2, G + 0.0, zc], "#8a7f72");
  for (let z = TRACK.z0 + 0.3; z < TRACK.z1; z += 0.62) b.box([2.0, 0.08, 0.2], [TRACK.x, G + 0.05, z], "#9e9a92");
  for (const s of [-1, 1]) {
    b.box([0.07, 0.12, length], [TRACK.x + (s * TRACK.gauge) / 2, G + 0.15, zc], "#5d5650");
    b.box([0.05, 0.02, length], [TRACK.x + (s * TRACK.gauge) / 2, G + 0.215, zc], "#b7b9bb");
  }
  // The meadow lies lower: a low concrete wall where the strip stands above it.
  b.box([0.25, 0.7, 34], [STRIP.x0 - 0.12, G - 0.35, 55], "#b9b6ad");
  // The fence: posts and two rails, open where you go through.
  const cuts = [TRACK.z0, ...FENCE.gaps.flat(), TRACK.z1];
  for (let i = 0; i < cuts.length; i += 2) {
    const a = cuts[i];
    const c = cuts[i + 1];
    for (let z = a; z <= c; z += 2) b.box([0.06, 1.1, 0.06], [FENCE.x, G + 0.55, z], "#6b7f6a");
    for (const y of [0.45, 1.05]) b.box([0.04, 0.05, c - a], [FENCE.x, G + y, (a + c) / 2], "#6b7f6a");
  }
  for (const st of STATIONS) {
    const len = st.z1 - st.z0;
    const mid = (st.z0 + st.z1) / 2;
    // The platform: concrete, its yellow tactile line along the edge.
    b.box([PLATFORM.x1 - PLATFORM.x0, 0.06, len], [(PLATFORM.x0 + PLATFORM.x1) / 2, G + 0.03, mid], "#c9c5bc");
    marks.plane(0.25, len, [PLATFORM.x1 - 0.3, G + 0.065, mid], "#f2c42e", [-Math.PI / 2, 0, 0]);
    // The shelter: two posts, a roof, the bench under it.
    const sz = mid + 2.2;
    for (const dz of [-1.4, 1.4]) b.box([0.08, 2.5, 0.08], [PLATFORM.x0 + 0.15, G + 1.25, sz + dz], "#7d7f82");
    roofs.box([1.1, 0.06, 3.4], [PLATFORM.x0 + 0.45, G + 2.55, sz], "#3f4652", [0, 0, -0.12]);
    b.box([0.42, 0.06, 1.7], [PLATFORM.x0 + 0.3, G + 0.45, sz], WOOD);
    b.box([0.06, 0.4, 1.7], [PLATFORM.x0 + 0.1, G + 0.7, sz], WOOD);
    for (const dz of [-0.7, 0.7]) b.box([0.38, 0.44, 0.06], [PLATFORM.x0 + 0.3, G + 0.22, sz + dz], "#7d7f82");
    // The station sign's two legs (the sign itself is drawn with its words).
    for (const dz of [-0.75, 0.75]) b.box([0.06, 1.9, 0.06], [PLATFORM.x0 + 0.25, G + 0.95, mid - 2.5 + dz], "#7d7f82");
  }
}

/** The temple, Seikai-ji: a roofed gate, the bronze incense burner, the main
 *  hall up on its stone base, and pines. */
function addTemple(b: Builder, roofs: Builder) {
  const z = TEMPLE.z;
  const base = floorHeightAt(TEMPLE.hallX, z);
  // The gate.
  const gb = floorHeightAt(TEMPLE.gateX, z);
  for (const dz of [-1.5, 1.5]) b.cylinder(0.17, 0.19, 3.2, [TEMPLE.gateX, gb + 1.6, z + dz], TEMPLE_WOOD, undefined, 10);
  b.box([0.4, 0.3, 3.6], [TEMPLE.gateX, gb + 3.0, z], TEMPLE_WOOD);
  roof(roofs, TEMPLE.gateX - 1.0, TEMPLE.gateX + 1.0, z - 2.1, z + 2.1, gb + 3.15, "#3c3a38", TEMPLE_WOOD);
  // A stone path to the hall.
  for (let x = TEMPLE.gateX - 1.0; x > TEMPLE.hallX + 2.2; x -= 0.75) b.box([0.6, 0.06, 1.0], [x, floorHeightAt(x, z) + 0.03, z], "#a8a49b");
  // The incense burner: a bronze bowl on legs, a little roof over it.
  const bb = floorHeightAt(TEMPLE.burnerX, z);
  b.cylinder(0.45, 0.32, 0.4, [TEMPLE.burnerX, bb + 0.75, z], "#4e4a3e", undefined, 14);
  for (const a of [0, 2.1, 4.2]) b.box([0.08, 0.6, 0.08], [TEMPLE.burnerX + Math.cos(a) * 0.3, bb + 0.3, z + Math.sin(a) * 0.3], "#3f3b32");
  for (const a of [0.8, 2.4, 3.9, 5.5]) b.box([0.06, 0.8, 0.06], [TEMPLE.burnerX + Math.cos(a) * 0.4, bb + 1.35, z + Math.sin(a) * 0.4], "#3f3b32");
  b.cylinder(0.0, 0.62, 0.35, [TEMPLE.burnerX, bb + 1.9, z], "#3f3b32", undefined, 8);
  // The main hall: a stone base, a raised floor and verandah, white walls
  // between dark posts, the doors open, a great roof.
  b.box([5.0, 0.6, 5.6], [TEMPLE.hallX - 0.35, base + 0.3, z], "#9d9a92");
  b.box([4.2, 0.12, 4.8], [TEMPLE.hallX - 0.35, base + 0.66, z], TEMPLE_WOOD);
  b.box([3.4, 2.4, 4.0], [TEMPLE.hallX - 0.55, base + 1.92, z], TEMPLE_WHITE);
  for (const dz of [-2.0, -0.7, 0.7, 2.0]) b.box([0.16, 2.5, 0.16], [TEMPLE.hallX + 1.2, base + 1.95, z + dz], TEMPLE_WOOD);
  b.box([0.08, 2.0, 1.3], [TEMPLE.hallX + 1.16, base + 1.72, z], "#2a1d15");
  b.box([0.1, 0.2, 4.2], [TEMPLE.hallX + 1.2, base + 3.1, z], TEMPLE_WOOD);
  roof(roofs, TEMPLE.hallX - 2.8, TEMPLE.hallX + 1.9, z - 2.9, z + 2.9, base + 3.2, "#3c3a38", TEMPLE_WHITE);
  // Steps up to the verandah.
  for (let i = 0; i < 3; i++) b.box([0.35, 0.2, 1.6], [TEMPLE.hallX + 1.95 + i * 0.32, base + 0.6 - i * 0.2, z], "#a8a49b");
  // The offering box before the doors.
  b.box([0.7, 0.45, 0.5], [TEMPLE_OFFERING[0], floorHeightAt(...TEMPLE_OFFERING) + 0.23, TEMPLE_OFFERING[1]], "#5a3c26");
  // The bench, pines.
  const benchY = floorHeightAt(TEMPLE.burnerX + 0.4, z + 3.2);
  b.box([1.8, 0.06, 0.42], [TEMPLE.burnerX + 0.4, benchY + 0.45, z + 3.2], WOOD);
  for (const dx of [-0.7, 0.7]) b.box([0.06, 0.44, 0.38], [TEMPLE.burnerX + 0.4 + dx, benchY + 0.22, z + 3.2], WOOD_DARK);
  for (const [dx, dz, sc] of [
    [3.2, 4.2, 1],
    [4.5, -4.4, 0.85],
    [-4.6, 4.0, 1.1],
  ] as [number, number, number][]) {
    const x = TEMPLE.hallX + dx;
    const pz = z + dz;
    const py = floorHeightAt(x, pz);
    b.bar([x, py, pz], [x + 0.35 * sc, py + 2.6 * sc, pz], 0.13 * sc, "#5b4433", 6);
    for (const [h, r] of [
      [2.3, 1.3],
      [3.0, 1.0],
      [3.6, 0.7],
    ])
      b.cylinder(r * 0.6 * sc, r * sc, 0.45 * sc, [x + 0.35 * sc, py + h * sc, pz], "#2f4f35", undefined, 9);
  }
}

function addFish(h: Building, b: Builder, cloth: Builder) {
  const { front, out } = frontOf(h);
  const xc = (h.x0 + h.x1) / 2;
  // Open-fronted: the shutter rolled up, the shop dark behind.
  b.box([h.x1 - h.x0 - 0.3, 2.3, 0.05], [xc, Y + 1.25, front - out * 0.9], "#2b2522");
  b.box([h.x1 - h.x0, 0.32, 0.12], [xc, Y + 2.55, front + out * 0.03], "#8e9396");
  // A blue and white striped awning.
  for (let i = 0; i < 8; i++) {
    const x = h.x0 + ((i + 0.5) * (h.x1 - h.x0)) / 8;
    cloth.box([(h.x1 - h.x0) / 8, 0.04, 1.0], [x, Y + 2.38, front + out * 0.48], i % 2 ? "#ffffff" : "#2f6fd0", [out * 0.28, 0, 0]);
  }
  // The display: boxes of ice and fish on a table out front.
  b.box([h.x1 - h.x0 - 0.6, 0.75, 0.8], [xc, Y + 0.38, front + out * 0.2], "#6d6a64");
  for (let i = 0; i < 4; i++) {
    const x = h.x0 + 0.7 + i * ((h.x1 - h.x0 - 1.4) / 3);
    b.box([0.68, 0.16, 0.5], [x, Y + 0.83, front + out * 0.2], "#f4f4f2");
    b.box([0.6, 0.04, 0.42], [x, Y + 0.91, front + out * 0.2], "#dde9ef");
    for (let k = 0; k < 3; k++) {
      const fish = new THREE.SphereGeometry(0.06, 8, 5);
      fish.scale(2.6, 0.55, 0.8);
      fish.rotateY(0.3 * (k - 1));
      fish.translate(x - 0.18 + k * 0.18, Y + 0.95, front + out * (0.12 + 0.08 * (k % 2)));
      b.raw(fish, k % 2 ? "#a9b4bd" : "#c9d2d8");
    }
  }
}

function addSurf(h: Building, b: Builder) {
  const { front, out } = frontOf(h);
  const xc = (h.x0 + h.x1) / 2;
  // A wooden deck, a wide opening, surfboards leaning by the door.
  b.box([h.x1 - h.x0 + 0.2, 0.1, 0.55], [xc, Y + 0.05, front + out * 0.27], "#a57d55");
  b.box([h.x1 - h.x0 - 1.2, 2.1, 0.05], [xc - 0.3, Y + 1.25, front + out * 0.01], "#1f2a30");
  const colors = ["#f2c14e", "#ef6f5c", "#ffffff", "#4fb3d9", "#9ad16b"];
  colors.forEach((color, i) => {
    const board = new THREE.SphereGeometry(0.5, 14, 8);
    board.scale(0.27, 1.0 + (i % 2) * 0.25, 0.045);
    board.rotateX(out * 0.18);
    board.translate(h.x0 + 0.5 + i * 0.4, Y + 1.15, front + out * 0.22);
    b.raw(board, color);
  });
}

function addKonbini(h: Building, b: Builder, glass: Builder, inside: Builder, lit: Builder, panes: Builder) {
  const { front, back } = frontOf(h);
  const xc = (h.x0 + h.x1) / 2;
  const zc = (front + back) / 2;
  const w = h.x1 - h.x0;
  const d = h.depth;
  const H = KONBINI_HEIGHT;
  // Walls: back and sides solid; the front all glass between white mullions.
  b.box([0.2, H, d], [h.x0 + 0.1, Y + H / 2, zc], h.wall);
  b.box([0.2, H, d], [h.x1 - 0.1, Y + H / 2, zc], h.wall);
  b.box([w, H, 0.2], [xc, Y + H / 2, back + 0.1], h.wall);
  b.box([w + 0.3, 0.3, d + 0.3], [xc, Y + H + 0.15, zc], "#dcdedb");
  b.box([w, 0.6, 0.22], [xc, Y + H - 0.3, front - 0.1], h.wall);
  b.box([w, 0.25, 0.22], [xc, Y + 0.12, front - 0.1], "#9a9c9a");
  for (let x = h.x0 + 0.1; x <= h.x1 - 0.05; x += w / 6) b.box([0.08, H - 0.6, 0.12], [x, Y + (H - 0.6) / 2, front - 0.06], "#f4f5f2");
  // The panes, either side of the door (the door's own two leaves, open).
  panes.plane(KONBINI_DOOR.x0 - h.x0 - 0.2, H - 0.85, [(h.x0 + 0.1 + KONBINI_DOOR.x0) / 2, Y + 0.25 + (H - 0.85) / 2, front - 0.08], "#ffffff");
  panes.plane(h.x1 - 0.1 - KONBINI_DOOR.x1, H - 0.85, [(KONBINI_DOOR.x1 + h.x1 - 0.1) / 2, Y + 0.25 + (H - 0.85) / 2, front - 0.08], "#ffffff");
  for (const x of [KONBINI_DOOR.x0 - 0.36, KONBINI_DOOR.x1 + 0.36]) panes.plane(0.7, 2.1, [x, Y + 1.15, front - 0.14], "#ffffff");
  // Inside: a light floor, the ceiling, its lights.
  inside.plane(w - 0.4, d - 0.4, [xc, Y + 0.012, zc], "#e8e9e6", [-Math.PI / 2, 0, 0]);
  inside.plane(w - 0.4, d - 0.4, [xc, Y + H - 0.62, zc], "#f6f6f3", [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) lit.plane(0.5, 2.0, [h.x0 + 1.4 + i * 1.8, Y + H - 0.64, back + 1.8 + j * 2.8], "#ffffff", [Math.PI / 2, 0, 0]);
  // Shelves: white gondolas, rows of goods.
  const goods = ["#e94f3d", "#f2c14e", "#3d8fd9", "#57b36a", "#f08a3c", "#ffffff", "#9b59b6", "#e3e3e3"];
  let k = 0;
  for (const g of GONDOLAS) {
    const gx = (g.x0 + g.x1) / 2;
    const gz = (g.z0 + g.z1) / 2;
    inside.box([g.x1 - g.x0, 1.4, g.z1 - g.z0], [gx, Y + 0.7, gz], "#f1f2f0");
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < 9; i++)
        for (const side of [-1, 1]) {
          const z = g.z0 + 0.2 + i * ((g.z1 - g.z0 - 0.4) / 8);
          inside.box([0.06, 0.2, 0.26], [gx + side * ((g.x1 - g.x0) / 2 + 0.03), Y + 0.3 + row * 0.3, z], goods[k++ % goods.length]);
        }
  }
  // Fridges along the back wall, lit, cans and bottles behind the glass.
  inside.box([FRIDGES.x1 - FRIDGES.x0, 2.1, FRIDGES.z1 - FRIDGES.z0], [(FRIDGES.x0 + FRIDGES.x1) / 2, Y + 1.05, (FRIDGES.z0 + FRIDGES.z1) / 2], "#cfd3d6");
  for (let row = 0; row < 5; row++)
    for (let i = 0; i < 20; i++) lit.box([0.11, 0.24, 0.05], [FRIDGES.x0 + 0.15 + i * 0.2, Y + 0.4 + row * 0.34, FRIDGES.z1 + 0.01], goods[(i + row * 3) % goods.length]);
  // The counter, its register, the hot case.
  inside.box([COUNTER.x1 - COUNTER.x0, 1.0, COUNTER.z1 - COUNTER.z0], [(COUNTER.x0 + COUNTER.x1) / 2, Y + 0.5, (COUNTER.z0 + COUNTER.z1) / 2], "#f3f1ec");
  inside.box([COUNTER.x1 - COUNTER.x0 + 0.06, 0.05, COUNTER.z1 - COUNTER.z0 + 0.06], [(COUNTER.x0 + COUNTER.x1) / 2, Y + 1.02, (COUNTER.z0 + COUNTER.z1) / 2], "#b88c5d");
  inside.box([0.34, 0.3, 0.4], [COUNTER.x0 + 0.3, Y + 1.2, COUNTER.z1 - 0.6], "#2c2f33");
  glass.box([0.5, 0.32, 0.6], [COUNTER.x0 + 0.3, Y + 1.21, COUNTER.z0 + 0.7], "#ffffff");
  // Magazines by the window, the way every konbini has them.
  inside.box([MAGAZINES.x1 - MAGAZINES.x0, 1.0, MAGAZINES.z1 - MAGAZINES.z0], [(MAGAZINES.x0 + MAGAZINES.x1) / 2, Y + 0.5, (MAGAZINES.z0 + MAGAZINES.z1) / 2], "#e7e8e5");
  for (let i = 0; i < 12; i++) inside.box([0.2, 0.28, 0.02], [MAGAZINES.x0 + 0.15 + i * 0.21, Y + 1.05, MAGAZINES.z0 + 0.1], goods[(i * 5) % goods.length], [-0.4, 0, 0]);
  // A red post box outside, and a bicycle.
  b.cylinder(0.22, 0.22, 1.0, [h.x0 + 0.6, Y + 0.5, front + 0.45], "#d1302b", undefined, 14);
  b.cylinder(0.25, 0.25, 0.08, [h.x0 + 0.6, Y + 1.03, front + 0.45], "#a8231f", undefined, 14);
  bicycle(b, h.x0 + 1.8, front + 0.5, 0, "#2f6fd0");
}

function bicycle(b: Builder, x: number, z: number, yaw: number, color: string) {
  const q = new THREE.Euler(0, yaw, 0);
  const p = (dx: number, dy: number, dz: number): Vec3 => {
    const v = new THREE.Vector3(dx, dy, dz).applyEuler(q);
    return [x + v.x, Y + v.y, z + v.z];
  };
  for (const dx of [-0.52, 0.52]) {
    const wheel = new THREE.TorusGeometry(0.32, 0.025, 6, 18);
    wheel.rotateY(yaw);
    const at = p(dx, 0.34, 0);
    wheel.translate(at[0], at[1], at[2]);
    b.raw(wheel, "#2a2a2a");
  }
  b.bar(p(-0.52, 0.34, 0), p(0.1, 0.55, 0), 0.025, color);
  b.bar(p(0.1, 0.55, 0), p(0.52, 0.34, 0), 0.025, color);
  b.bar(p(-0.15, 0.85, 0), p(0.1, 0.55, 0), 0.025, color);
  b.bar(p(0.42, 0.95, 0), p(0.52, 0.34, 0), 0.025, color);
  b.box([0.22, 0.05, 0.1], p(-0.15, 0.88, 0), "#222", [0, yaw, 0]);
  b.box([0.05, 0.05, 0.5], p(0.42, 0.98, 0), "#888", [0, yaw, 0]);
  // A mamachari's basket.
  b.box([0.32, 0.24, 0.38], p(0.62, 0.86, 0), "#9a9ea3", [0, yaw, 0]);
}

/** A concrete utility pole: crossarms, insulators, and on some a street lamp. */
function pole(b: Builder, x: number, z: number, base: number, lampToward: [number, number] | null): Vec3 {
  b.cylinder(0.13, 0.16, 8, [x, base + 4, z], "#a3a29c", undefined, 10);
  for (const h of [7.2, 6.6]) {
    b.box([1.3, 0.1, 0.1], [x, base + h, z], "#6e6d68");
    for (const dx of [-0.55, 0, 0.55]) b.cylinder(0.04, 0.05, 0.12, [x + dx, base + h + 0.1, z], "#e8e8e4", undefined, 6);
  }
  if (!lampToward) return [x, base + 7.25, z];
  const [dx, dz] = lampToward;
  b.bar([x, base + 5.2, z], [x + dx * 1.1, base + 5.5, z + dz * 1.1], 0.03, "#7a7c80");
  b.box([0.5, 0.12, 0.22], [x + dx * 1.2, base + 5.45, z + dz * 1.2], "#d9dbde");
  return [x, base + 7.25, z];
}

function buildTown() {
  const b = new Builder();
  const roofs = new Builder();
  const glass = new Builder();
  const cloth = new Builder();
  const wires = new Builder();
  const inside = new Builder();
  const lit = new Builder();
  const panes = new Builder();
  const marks = new Builder();
  const torii = new Builder();

  for (const h of BUILDINGS) {
    if (h.kind === "konbini") {
      addKonbini(h, b, glass, inside, lit, panes);
      continue;
    }
    if (h.kind === "famiresu") {
      addFamiresu(h, b, panes, inside, lit, roofs);
      continue;
    }
    addHouse(h, b, glass, roofs);
    if (h.kind === "cafe") addCafe(h, b, panes, inside, lit, cloth);
    if (h.kind === "fish") addFish(h, b, cloth);
    if (h.kind === "surf") addSurf(h, b);
  }
  addRailway(b, roofs, marks);
  addTemple(b, roofs);
  // The bench at the top of the street, looking out over the crossing to the sea.
  const vy = floorHeightAt(VIEW_BENCH.x, VIEW_BENCH.z);
  b.box([0.42, 0.06, 1.7], [VIEW_BENCH.x, vy + 0.45, VIEW_BENCH.z], WOOD);
  b.box([0.06, 0.38, 1.7], [VIEW_BENCH.x - 0.2, vy + 0.68, VIEW_BENCH.z], WOOD);
  for (const dz of [-0.7, 0.7]) b.box([0.38, 0.44, 0.06], [VIEW_BENCH.x, vy + 0.22, VIEW_BENCH.z + dz], "#4d5054");
  bicycle(b, 9.4, LANE.z1 - 0.45, 0.04, "#c8402f");
  bicycle(b, 8.9, LANE.z0 - 0.0 + 0.45, -0.02, "#e8e8e4");

  // The café's bench and its A-frame board.
  b.box([1.8, 0.06, 0.4], [CAFE_BENCH.x, Y + 0.45, CAFE_BENCH.z], WOOD);
  for (const dx of [-0.75, 0.75]) b.box([0.06, 0.44, 0.36], [CAFE_BENCH.x + dx, Y + 0.22, CAFE_BENCH.z], WOOD_DARK);
  for (const s of [-1, 1]) b.box([0.55, 0.9, 0.04], [CAFE_BOARD.x, Y + 0.45, CAFE_BOARD.z + s * 0.12], "#3b3330", [s * -0.18, 0, 0]);

  // --- the street, the road, and the wires over them -------------------------------------
  // Edge lines down the street, and a green strip for walking on its south side.
  marks.plane(LANE.x1 - LANE.x0, 0.12, [(LANE.x0 + LANE.x1) / 2, Y + 0.045, LANE.z0 + 0.95], "#ffffff", [-Math.PI / 2, 0, 0]);
  marks.plane(LANE.x1 - LANE.x0, 0.12, [(LANE.x0 + LANE.x1) / 2, Y + 0.045, LANE.z1 - 0.25], "#ffffff", [-Math.PI / 2, 0, 0]);
  marks.plane(LANE.x1 - LANE.x0, 0.8, [(LANE.x0 + LANE.x1) / 2, Y + 0.043, LANE.z0 + 0.48], "#3f8a55", [-Math.PI / 2, 0, 0]);
  // The coast road's lines: its edges, a dashed centre, a crossing where the street meets it.
  const roadMid = (ROAD.x0 + ROAD.x1) / 2;
  for (const x of [ROAD.x0 + 0.15, ROAD.x1 - 0.15]) marks.plane(0.12, ROAD.z1 - ROAD.z0, [x, G + 0.045, (ROAD.z0 + ROAD.z1) / 2], "#ffffff", [-Math.PI / 2, 0, 0]);
  for (let z = ROAD.z0 + 1; z < ROAD.z1 - 1; z += 4) if (Math.abs(z - (LANE.z0 + LANE.z1) / 2) > 2.5) marks.plane(0.12, 2, [roadMid, G + 0.045, z], "#ffffff", [-Math.PI / 2, 0, 0]);
  for (let i = 0; i < 7; i++) marks.plane(0.45, 3, [ROAD.x0 + 0.45 + i * 0.6, G + 0.046, (LANE.z0 + LANE.z1) / 2], "#f4f4f0", [-Math.PI / 2, 0, 0]);
  // Poles, lamps on some, their wires sagging from one to the next.
  const tops: Vec3[] = POLES.map(([x, z], i) => pole(b, x, z, floorHeightAt(x, z), i < 3 ? [0, 1] : [-1, 0]));
  for (let i = 0; i + 1 < tops.length; i++) {
    if (i === 2) continue;
    for (const dx of [-0.55, 0.55]) wires.sag([tops[i][0] + dx, tops[i][1], tops[i][2]], [tops[i + 1][0] + dx, tops[i + 1][1], tops[i + 1][2]], 0.35, 0.012, "#222");
  }
  // From the street's last pole to the road's first, across the corner, and down to the houses.
  wires.sag(tops[2], tops[4], 0.6, 0.012, "#222");
  for (const h of BUILDINGS) {
    if (h.side !== "north") continue;
    const { front } = frontOf(h);
    const near = tops.reduce((a, t) => (Math.abs(t[0] - h.x0) < Math.abs(a[0] - h.x0) ? t : a), tops[0]);
    wires.sag([near[0], near[1] - 0.6, near[2]], [h.x0 + 0.3, Y + STOREY + UPPER - 0.4, front], 0.4, 0.008, "#222");
  }
  // The curved mirror at the corner: an orange pole, a round mirror turned to the road.
  const mBase = floorHeightAt(...MIRROR_AT);
  b.cylinder(0.05, 0.05, 2.7, [MIRROR_AT[0], mBase + 1.35, MIRROR_AT[1]], "#f08a24", undefined, 8);
  b.cylinder(0.36, 0.36, 0.06, [MIRROR_AT[0], mBase + 2.75, MIRROR_AT[1]], "#f08a24", [Math.PI / 2, 0.8, 0], 20);
  glass.cylinder(0.31, 0.31, 0.02, [MIRROR_AT[0] - 0.03, mBase + 2.75, MIRROR_AT[1] - 0.03], "#ffffff", [Math.PI / 2, 0.8, 0], 20);

  // --- the sea side: the promenade, the wall, the bus stop, benches, boats ---------------
  for (let z = ROAD.z0; z < ROAD.z1; z += 2) b.box([PROMENADE.x1 - PROMENADE.x0, 0.06, 1.96], [(PROMENADE.x0 + PROMENADE.x1) / 2, G + 0.03, z + 1], (z / 2) % 2 ? "#cfcac0" : "#c6c1b6");
  const cuts = [ROAD.z0, ...SEAWALL.gaps.flatMap((g) => [g - SEAWALL.gap / 2, g + SEAWALL.gap / 2]), ROAD.z1];
  for (let i = 0; i < cuts.length; i += 2) {
    const z0 = cuts[i];
    const z1 = cuts[i + 1];
    b.box([SEAWALL.thick, SEAWALL.height, z1 - z0], [SEAWALL.x, G + SEAWALL.height / 2, (z0 + z1) / 2], CONCRETE);
    b.box([SEAWALL.thick + 0.08, 0.06, z1 - z0], [SEAWALL.x, G + SEAWALL.height + 0.03, (z0 + z1) / 2], "#cfccc4");
  }
  // The bus stop: its pole and round sign, the timetable, a bench facing the road.
  b.cylinder(0.04, 0.04, 2.5, [BUS_STOP.x, G + 1.25, BUS_STOP.z], "#d8d8d4", undefined, 8);
  b.box([0.3, 0.42, 0.04], [BUS_STOP.x, G + 1.35, BUS_STOP.z - 0.03], "#f4f4f0");
  b.box([0.42, 0.06, 1.7], [BUS_STOP.x + 0.33, G + 0.45, BUS_STOP.z + 1.3], WOOD);
  for (const dz of [-0.7, 0.7]) b.box([0.38, 0.44, 0.06], [BUS_STOP.x + 0.33, G + 0.22, BUS_STOP.z + 1.3 + dz], "#7d7f82");
  for (const [x, z] of PROMENADE_BENCHES) {
    b.box([0.42, 0.06, 1.7], [x, G + 0.45, z], WOOD);
    b.box([0.06, 0.35, 1.7], [x - 0.2, G + 0.68, z], WOOD);
    for (const dz of [-0.7, 0.7]) b.box([0.38, 0.44, 0.06], [x, G + 0.22, z + dz], "#4d5054");
  }
  for (const boat of BOATS) {
    const q = new THREE.Euler(0, boat.yaw, 0);
    const base = SAND(boat.x, boat.z);
    const p = (dx: number, dy: number, dz: number): Vec3 => {
      const v = new THREE.Vector3(dx, dy, dz).applyEuler(q);
      return [boat.x + v.x, base + v.y, boat.z + v.z];
    };
    b.box([1.5, 0.55, 4.2], p(0, 0.42, 0), boat.color, [0, boat.yaw, 0]);
    b.box([1.0, 0.4, 0.9], p(0, 0.2, 2.35), boat.color, [0.5, boat.yaw, 0]);
    b.box([1.52, 0.1, 4.22], p(0, 0.62, 0), boat.trim, [0, boat.yaw, 0]);
    b.box([0.9, 0.7, 1.1], p(0, 1.05, -0.6), "#e8ecef", [0, boat.yaw, 0]);
    b.box([0.25, 0.55, 0.3], p(0, 0.75, -2.2), "#2b2d30", [0, boat.yaw, 0]);
    b.cylinder(0.25, 0.3, 0.12, p(0.95, 0.06, 0.4), "#c9a86a", undefined, 12);
  }

  // --- the shrine, by the campsite -----------------------------------------------------------
  const tz = SHRINE.toriiZ;
  for (const dx of [-1.25, 1.25]) torii.cylinder(0.14, 0.16, 3.1, [SHRINE.x + dx, Y + 1.55, tz], TORII_RED, undefined, 12);
  torii.box([3.3, 0.18, 0.24], [SHRINE.x, Y + 2.55, tz], TORII_RED);
  torii.box([3.9, 0.24, 0.36], [SHRINE.x, Y + 3.18, tz], TORII_RED);
  torii.box([4.1, 0.12, 0.42], [SHRINE.x, Y + 3.36, tz], "#232323");
  torii.box([0.16, 0.5, 0.16], [SHRINE.x, Y + 2.88, tz], TORII_RED);
  // The shimenawa: a straw rope across, paper zigzags hung from it.
  b.bar([SHRINE.x - 1.1, Y + 2.3, tz], [SHRINE.x + 1.1, Y + 2.3, tz], 0.06, "#d8c58a", 8);
  for (const dx of [-0.6, 0, 0.6]) cloth.plane(0.12, 0.32, [SHRINE.x + dx, Y + 2.08, tz + 0.02], "#ffffff");
  // A stone path to the shrine, stone lanterns, the small shrine on its base.
  const hz = SHRINE.hokoraZ;
  for (let z = tz + 0.6; z < hz - 1.0; z += 0.75) b.box([0.9, 0.06, 0.6], [SHRINE.x, Y + 0.03, z], "#a8a49b");
  for (const dx of [-1.7, 1.7]) {
    const lz = hz - 1.45;
    b.box([0.45, 0.12, 0.45], [SHRINE.x + dx, Y + 0.06, lz], "#9d9a92");
    b.cylinder(0.08, 0.1, 0.7, [SHRINE.x + dx, Y + 0.47, lz], "#9d9a92", undefined, 8);
    b.box([0.38, 0.3, 0.38], [SHRINE.x + dx, Y + 0.97, lz], "#a5a29a");
    b.cylinder(0.0, 0.32, 0.25, [SHRINE.x + dx, Y + 1.25, lz], "#8e8b84", undefined, 4);
  }
  b.box([2.2, 0.5, 1.9], [SHRINE.x, Y + 0.25, hz + 0.05], "#9d9a92");
  b.box([1.4, 1.2, 1.2], [SHRINE.x, Y + 1.1, hz + 0.1], "#9b6b42");
  roof(roofs, SHRINE.x - 0.85, SHRINE.x + 0.85, hz - 0.65, hz + 0.85, Y + 1.7, "#3c3a38", "#9b6b42");
  cloth.box([0.05, 0.95, 0.05], [SHRINE.x, Y + 1.25, hz - 0.62], "#c8302b");
  cloth.box([0.05, 0.95, 0.05], [SHRINE.x + 0.04, Y + 1.25, hz - 0.62], "#f4f2ec");
  b.cylinder(0.11, 0.13, 0.18, [SHRINE.x, Y + 1.78, hz - 0.62], "#c9a54a", undefined, 12);
  // The fortune box's stand, and the rope where people tie their fortunes.
  b.box([0.08, 0.9, 0.08], [OMIKUJI_AT[0], Y + 0.45, OMIKUJI_AT[1]], "#5a3c26");
  b.bar([OMIKUJI_AT[0] - 0.9, Y + 1.25, OMIKUJI_AT[1] - 0.6], [OMIKUJI_AT[0] + 0.1, Y + 1.25, OMIKUJI_AT[1] - 0.6], 0.015, "#d8c58a");
  for (let i = 0; i < 6; i++) cloth.plane(0.05, 0.16, [OMIKUJI_AT[0] - 0.8 + i * 0.15, Y + 1.15, OMIKUJI_AT[1] - 0.6], "#ffffff");
  for (const dx of [-0.9, 0.1]) b.box([0.06, 1.3, 0.06], [OMIKUJI_AT[0] + dx, Y + 0.65, OMIKUJI_AT[1] - 0.6], "#5a3c26");
  // Pines round it, low and wide as the coast's black pines grow.
  for (const [dx, dz, s] of [
    [-3.2, 1.2, 1],
    [3.0, 0.4, 0.85],
    [-2.6, -3.4, 0.75],
  ] as [number, number, number][]) {
    const x = SHRINE.x + dx;
    const z = hz + dz;
    b.bar([x, Y, z], [x + 0.35 * s, Y + 2.6 * s, z], 0.13 * s, "#5b4433", 6);
    for (const [h, r] of [
      [2.3, 1.3],
      [3.0, 1.0],
      [3.6, 0.7],
    ])
      b.cylinder(r * 0.6 * s, r * s, 0.45 * s, [x + 0.35 * s, Y + h * s, z], "#2f4f35", undefined, 9);
  }
  // The shrine's bench.
  b.box([0.42, 0.06, 1.7], [SHRINE_BENCH.x, Y + 0.45, SHRINE_BENCH.z], WOOD);
  for (const dz of [-0.7, 0.7]) b.box([0.38, 0.44, 0.06], [SHRINE_BENCH.x, Y + 0.22, SHRINE_BENCH.z + dz], WOOD_DARK);

  return {
    painted: b.build(),
    roofs: roofs.build(),
    glass: glass.build(),
    cloth: cloth.build(),
    wires: wires.build(),
    inside: inside.build(),
    lit: lit.build(),
    panes: panes.build(),
    marks: marks.build(),
    torii: torii.build(),
  };
}

/** The paving: a grid laid over the ground's own heights (the street, up
 *  the meadow's bank to the road, the road), so it never floats or sinks. */
function drape(x0: number, x1: number, z0: number, z1: number, nx: number, nz: number, lift: number) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, floorHeightAt(p.getX(i), p.getZ(i)) + lift);
  g.computeVertexNormals();
  return g;
}

function asphalt(repeatX: number, repeatY: number) {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#4a4c50";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const v = 60 + Math.random() * 40;
        ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
    },
    [repeatX, repeatY]
  );
}

// --- signs -------------------------------------------------------------------------------------

function sign(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  return canvasTexture(w, h, (ctx, cw, ch) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    draw(ctx, cw, ch);
  });
}
const konbiniSign = () =>
  sign(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2bb3a3";
    ctx.fillRect(0, 0, w, 34);
    ctx.fillStyle = "#f39a35";
    ctx.fillRect(0, h - 26, w, 26);
    ctx.fillStyle = "#1c6f86";
    ctx.font = `800 58px ${FONT}`;
    ctx.fillText("うみマート  UMI MART", w / 2, 68);
  });
const cafeSign = () =>
  sign(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#3b3330";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f3e7d3";
    ctx.font = `700 54px ${FONT}`;
    ctx.fillText("潮騒  SHIOSAI", w / 2, 52);
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText("café · coffee · しらす丼", w / 2, 100);
  });
const fishSign = () =>
  sign(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1f3f7a";
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText("鮮魚  うおや", w / 2, 56);
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText("FRESH FISH · 生しらす", w / 2, 106);
  });
const shokudoSign = () =>
  sign(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#6b4a2e";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff4e0";
    ctx.font = `800 62px ${FONT}`;
    ctx.fillText("はまや食堂", w / 2, 56);
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText("HAMAYA · set meals · 定食", w / 2, 106);
  });
const surfSign = () =>
  sign(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#1f2a30";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#7fd3e6";
    ctx.font = `800 60px ${FONT}`;
    ctx.fillText("KAZE SURF  風", w / 2, 64);
  });
const chalkboard = () =>
  sign(256, 384, (ctx, w, h) => {
    ctx.fillStyle = "#2c3a33";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f4f1e8";
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText("本日の", w / 2, 60);
    ctx.fillText("おすすめ", w / 2, 102);
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText("しらす丼", w / 2, 170);
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText("Today's special:", w / 2, 230);
    ctx.fillText("whitebait on rice", w / 2, 258);
    ctx.fillStyle = "#f2c14e";
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText("☕ ¥450", w / 2, 320);
  });
const busSign = () =>
  sign(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#f4f4f0";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 124, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1f6f3f";
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.fillStyle = "#1f6f3f";
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText("海岸通り", w / 2, 104);
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText("Kaigan-dōri", w / 2, 146);
    ctx.fillText("バス停 · Bus", w / 2, 180);
  });
const vendingFront = (color: string, accent: string) =>
  sign(256, 512, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1d2230";
    ctx.fillRect(14, 20, w - 28, 300);
    const drinks = ["#e94f3d", "#f2c14e", "#3d8fd9", "#57b36a", "#ffffff", "#f08a3c", "#7a4b2a", "#9fd3ff"];
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 6; i++) {
        const x = 28 + i * 36;
        const y = 36 + row * 96;
        ctx.fillStyle = drinks[(i + row * 2) % drinks.length];
        ctx.fillRect(x, y, 24, 58);
        ctx.fillStyle = row === 0 ? "#2f6fd0" : row === 1 ? "#d23b31" : "#2f6fd0";
        ctx.fillRect(x, y + 64, 24, 10);
      }
    ctx.fillStyle = accent;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText("つめた〜い / あったか〜い", w / 2, 350);
    ctx.fillStyle = "#1d2230";
    ctx.fillRect(40, 400, w - 80, 60);
    ctx.fillStyle = "#cfd6e0";
    ctx.fillRect(w - 70, 380, 36, 20);
  });

// --- the scene ------------------------------------------------------------------------------

/** Wind chimes under some eaves, swaying in the wind. */
function Furin({ at }: { at: Vec3[] }) {
  const group = useRef<THREE.Group>(null);
  const m = useMemo(
    () => ({
      glass: new THREE.MeshLambertMaterial({ color: "#d8f0ff", transparent: true, opacity: 0.55, depthWrite: false }),
      paper: new THREE.MeshLambertMaterial({ color: "#f2c14e", side: THREE.DoubleSide }),
      bell: new THREE.CylinderGeometry(0.05, 0.075, 0.085, 14, 1, true),
      strip: new THREE.PlaneGeometry(0.06, 0.22),
    }),
    []
  );
  useEffect(
    () => () => {
      m.glass.dispose();
      m.paper.dispose();
      m.bell.dispose();
      m.strip.dispose();
    },
    [m]
  );
  useFrame(({ clock }) => {
    const wind = Math.min(1, (skyState.weatherState?.windSpeed() ?? 4) / 12);
    group.current?.children.forEach((c, i) => {
      const t = clock.elapsedTime + i * 1.7;
      c.rotation.z = (0.08 + 0.25 * wind) * Math.sin(t * 2.1) * (0.6 + 0.4 * Math.sin(t * 0.37));
      c.rotation.x = (0.05 + 0.15 * wind) * Math.sin(t * 1.3 + 1);
    });
  });
  return (
    <group ref={group}>
      {at.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={m.bell} material={m.glass} raycast={noRaycast} userData={{ navIgnore: true }} />
          <mesh geometry={m.strip} material={m.paper} position={[0, -0.2, 0]} raycast={noRaycast} userData={{ navIgnore: true }} />
        </group>
      ))}
    </group>
  );
}

/** Where the wind chimes hang: under the upstairs eave of the houses that have them. */
export const FURIN_AT: Vec3[] = BUILDINGS.filter((b) => b.furin).map((b) => {
  const { front, out } = frontOf(b);
  return [b.x0 + 0.9, Y + STOREY + UPPER - 0.25, front + out * 0.3];
});

export interface TownActions {
  onVending: () => void;
  /** At the shrine's offering box: a coin, two bows, two claps, a prayer, a bow. */
  onShrine: () => void;
  /** At the temple's: a coin, hands together, a bow. */
  onTemple: () => void;
  /** The shrine's fortune box: shake it, draw a fortune. */
  onOmikuji: () => void;
}

const famiresuSign = () =>
  sign(1024, 160, (ctx, w, h) => {
    ctx.fillStyle = "#c2523d";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff7ea";
    ctx.font = `800 74px ${FONT}`;
    ctx.fillText("はまキッチン", w * 0.33, 70);
    ctx.font = `700 48px ${FONT}`;
    ctx.fillText("HAMA KITCHEN", w * 0.75, 66);
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText("ファミリーレストラン · family restaurant · 24h", w / 2, 132);
  });
const stationSign = (i: number) =>
  sign(512, 256, (ctx, w, h) => {
    const st = STATIONS[i];
    const other = STATIONS[1 - i];
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1c6f86";
    ctx.fillRect(0, 150, w, 14);
    ctx.fillStyle = "#1d2230";
    ctx.font = `800 74px ${FONT}`;
    ctx.fillText(st.nameJa, w / 2, 70);
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(st.name, w / 2, 126);
    ctx.font = `500 24px ${FONT}`;
    ctx.textAlign = i === 0 ? "right" : "left";
    ctx.fillText(`${other.nameJa} ${other.name}`, i === 0 ? w - 20 : 20, 200);
    ctx.textAlign = "center";
    ctx.fillStyle = "#4a5266";
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText("しおかぜ線 · Shiokaze Line", w / 2, 238);
  });
const templeSign = () =>
  sign(512, 160, (ctx, w, h) => {
    ctx.fillStyle = "#2a1d15";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e9d7a8";
    ctx.font = `800 72px ${FONT}`;
    ctx.fillText("星海寺", w / 2, 70);
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText("Seikai-ji · temple of the sea and stars", w / 2, 130);
  });

export function Town({ onVending, onShrine, onTemple, onOmikuji }: TownActions) {
  const area = useRef<THREE.Group>(null);
  useDrawDistance(area, [12, 55], 90);
  const geometry = useMemo(buildTown, []);
  const paving = useMemo(
    () => ({
      lane: drape(LANE.x0, LANE.x1 + 4.2, LANE.z0, LANE.z1, 56, 6, 0.03),
      road: drape(ROAD.x0, ROAD.x1, ROAD.z0, ROAD.z1, 4, 52, 0.03),
    }),
    []
  );
  useEffect(
    () => () => {
      for (const g of [...Object.values(geometry), ...Object.values(paving)]) g.dispose();
    },
    [geometry, paving]
  );
  const m = useMemo(() => {
    return {
      painted: paint(),
      roofs: paint(),
      cloth: paint({ side: THREE.DoubleSide }),
      wires: paint(),
      torii: paint(),
      marks: paint({ ...ON_TOP }),
      inside: new THREE.MeshBasicMaterial({ vertexColors: true }),
      lit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      panes: new THREE.MeshLambertMaterial({ color: "#cfe6ee", transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
      glass: new THREE.MeshLambertMaterial({ color: "#2e3a44", emissive: new THREE.Color("#000") }),
      lane: new THREE.MeshLambertMaterial({ map: asphalt(28, 3), ...ON_TOP }),
      road: new THREE.MeshLambertMaterial({ map: asphalt(4, 52), ...ON_TOP }),
      konbini: washed(konbiniSign()),
      cafe: washed(cafeSign()),
      fish: washed(fishSign()),
      famiresu: washed(famiresuSign()),
      stations: STATIONS.map((_, i) => washed(stationSign(i))),
      temple: washed(templeSign()),
      wood: new THREE.MeshLambertMaterial({ color: "#5a3c26" }),
      surf: washed(surfSign()),
      board: washed(chalkboard()),
      bus: washed(busSign()),
      vending: VENDING.map((v) => new THREE.MeshBasicMaterial({ map: vendingFront(v.color, v.accent), toneMapped: false })),
      vendingBody: VENDING.map((v) => new THREE.MeshLambertMaterial({ color: v.color })),
    };
  }, []);
  useEffect(
    () => () => {
      for (const material of Object.values(m).flat()) {
        (material as THREE.MeshLambertMaterial).map?.dispose();
        (material as THREE.Material).dispose();
      }
    },
    [m]
  );
  const glows = useMemo(() => [{ material: m.glass, color: new THREE.Color("#ffcf8a") }], [m]);
  useNight([m.konbini, m.cafe, m.fish, m.famiresu, m.surf, m.board, m.bus, m.temple, ...m.stations], glows);
  // The street lamps: Seiza's pooled lights, on at dusk with the garden switch.
  const lamp = useRef(0);
  useFrame((_, delta) => {
    const target = roomLights.pond ? 7 * lampNeed() : 0;
    lamp.current += (target - lamp.current) * (1 - Math.exp(-delta / 0.2));
  });
  // The konbini's own light, always on: it never closes.
  const konbiniLight = useRef(5);

  const sign = (b: { x0: number; x1: number }, frontZ: number, out: number, y: number, w: number, h: number, material: THREE.Material) => (
    <mesh position={[(b.x0 + b.x1) / 2, y, frontZ + out * 0.07]} rotation={[0, out > 0 ? 0 : Math.PI, 0]} material={material} userData={{ navIgnore: true }}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
  const shop = (id: string) => BUILDINGS.find((b) => b.id === id)!;
  const fish = shop("fish");
  const surf = shop("surf");
  const kFront = frontOf(KONBINI).front;

  return (
    <group ref={area}>
      <mesh geometry={geometry.painted} material={m.painted} castShadow receiveShadow />
      <mesh geometry={geometry.roofs} material={m.roofs} castShadow />
      <mesh geometry={geometry.torii} material={m.torii} castShadow />
      <mesh geometry={geometry.glass} material={m.glass} raycast={noRaycast} />
      <mesh geometry={geometry.cloth} material={m.cloth} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.wires} material={m.wires} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.inside} material={m.inside} />
      <mesh geometry={geometry.lit} material={m.lit} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.panes} material={m.panes} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.marks} material={m.marks} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={paving.lane} material={m.lane} receiveShadow userData={{ navIgnore: true }} />
      <mesh geometry={paving.road} material={m.road} receiveShadow userData={{ navIgnore: true }} />
      {/* Signs over the shops. */}
      {sign(KONBINI, kFront, 1, Y + KONBINI_HEIGHT - 0.3, KONBINI.x1 - KONBINI.x0 - 0.2, 0.55, m.konbini)}
      {/* And on its side, for the coast road to see. */}
      <mesh position={[KONBINI.x1 + 0.02, Y + KONBINI_HEIGHT - 0.3, (frontOf(KONBINI).back + kFront) / 2]} rotation={[0, Math.PI / 2, 0]} material={m.konbini} userData={{ navIgnore: true }}>
        <planeGeometry args={[KONBINI.depth - 0.4, 0.55]} />
      </mesh>
      {sign(CAFE, LANE.z0, 1, Y + STOREY + 0.45, 3.2, 0.8, m.cafe)}
      {sign(fish, LANE.z0, 1, Y + STOREY + 0.45, 3.0, 0.75, m.fish)}
      {sign(FAMIRESU, LANE.z1, -1, Y + ROOM_HEIGHT + 0.25, 5.6, 0.48, m.famiresu)}
      {/* The stations' signs, facing the platform; the temple's over its gate. */}
      {STATIONS.map((st, i) => (
        <mesh key={st.id} position={[PLATFORM.x0 + 0.29, G + 1.55, (st.z0 + st.z1) / 2 - 2.5]} rotation={[0, Math.PI / 2, 0]} material={m.stations[i]} userData={{ navIgnore: true }}>
          <planeGeometry args={[1.6, 0.8]} />
        </mesh>
      ))}
      <mesh position={[TEMPLE.gateX + 0.22, floorHeightAt(TEMPLE.gateX, TEMPLE.z) + 2.65, TEMPLE.z]} rotation={[0, Math.PI / 2, 0]} material={m.temple} userData={{ navIgnore: true }}>
        <planeGeometry args={[1.5, 0.47]} />
      </mesh>
      {/* The offering boxes: click to pray. The fortune box: click to draw one. */}
      <Clickable onClick={onShrine}>
        <mesh position={[OFFERING_AT[0], Y + 0.7, OFFERING_AT[1]]} material={m.wood}>
          <boxGeometry args={[0.72, 0.42, 0.42]} />
        </mesh>
      </Clickable>
      <Clickable onClick={onTemple}>
        <mesh position={[TEMPLE_OFFERING[0], floorHeightAt(...TEMPLE_OFFERING) + 0.5, TEMPLE_OFFERING[1]]} material={m.wood}>
          <boxGeometry args={[0.72, 0.12, 0.52]} />
        </mesh>
      </Clickable>
      <Clickable onClick={onOmikuji}>
        <mesh position={[OMIKUJI_AT[0], Y + 1.05, OMIKUJI_AT[1]]} material={m.wood}>
          <boxGeometry args={[0.3, 0.38, 0.3]} />
        </mesh>
      </Clickable>
      {sign(surf, LANE.z1, -1, Y + STOREY - 0.25, 3.2, 0.8, m.surf)}
      <mesh position={[CAFE_BOARD.x, Y + 0.52, CAFE_BOARD.z + 0.15]} rotation={[-0.18, 0, 0]} material={m.board} userData={{ navIgnore: true }}>
        <planeGeometry args={[0.48, 0.72]} />
      </mesh>
      <mesh position={[BUS_STOP.x - 0.03, OUTER_GROUND_Y + 2.25, BUS_STOP.z]} rotation={[0, -Math.PI / 2, 0]} material={m.bus} userData={{ navIgnore: true }}>
        <circleGeometry args={[0.32, 24]} />
      </mesh>
      {/* Vending machines: click one for a drink (heat reactions' water). */}
      {VENDING.map((v, i) => (
        <Clickable key={i} onClick={onVending}>
          <group position={[v.x, Y, v.z + 0.37]}>
            <mesh position={[0, 0.92, 0]} material={m.vendingBody[i]} castShadow>
              <boxGeometry args={[0.92, 1.84, 0.72]} />
            </mesh>
            <mesh position={[0, 0.98, -0.365]} rotation={[0, Math.PI, 0]} material={m.vending[i]}>
              <planeGeometry args={[0.82, 1.64]} />
            </mesh>
          </group>
        </Clickable>
      ))}
      <Furin at={FURIN_AT} />
      {/* Lights: the street's lamps, the konbini's, the lantern's. */}
      {POLES.map(([x, z], i) => (
        <PooledLight key={i} position={i < 3 ? [x, Y + 5.2, z + 1.1] : [x - 1.1, G + 5.2, z]} color="#fff1d8" intensityRef={lamp} distance={12} />
      ))}
      <PooledLight position={[(KONBINI.x0 + KONBINI.x1) / 2, Y + 2.6, kFront - 2.5]} color="#f4fbff" intensityRef={konbiniLight} distance={10} />
    </group>
  );
}
