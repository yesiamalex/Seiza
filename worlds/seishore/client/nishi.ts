// Nishi-machi (西町), Seishore's west quarter: past the meadow's west bank,
// on the outer ground (G), a second shopping street on the same line as the
// shōtengai, Nishi-dōri, with a ring road round the quarter and the
// community bus going round it, four stops on the way.
//
//        z 77 ═══════════ north road (the bus westbound) ══════════════
//        z 66  yokochō: a lantern alley of little stalls
//        z 63  dojo · yose café · kissaten          (north side)
//        z 55  ════ Nishi-dōri ════════════ ║east road║ meadow ⇢ town
//        z 47  bookshop · burger · music shop       (south side)
//        z 42  Nishi park: paths, benches, a dog walked round it
//        z 33 ═══════════ south road (the bus eastbound) ══════════════
//            x −69 west road                       x −26 east road
import type { Obstacle, Rect, Seat, WorldFloor } from "../../../src/scene/layout";
import { SEAT_HEIGHT } from "../../../src/scene/layout";
import { G, LANE } from "./plan";
import { BUS } from "./vehicles";
import type { Leg } from "./vehicles";

/** The quarter's ground (walkable, outer ground's level), all of it. */
export const NISHI: Rect = { minX: -72, maxX: -24.2, minZ: 30, maxZ: 79 };
/** The ring road's middle lines, and half its width (a lane each way). */
export const RING = { east: -29, west: -66, north: 74, south: 36, half: 3 };
/** Nishi-dōri: the shōtengai's line, on west from the meadow to the west road. */
export const NISHI_STREET = { x0: RING.west + RING.half, x1: -24.2, z0: LANE.z0, z1: LANE.z1 };
/** The path across the meadow from the shōtengai's end to Nishi-dōri. */
/** The shopping street's arch over its way in, just off the ring road (its posts either side of the street). */
export const ARCH = { x: RING.east - RING.half - 0.6, z0: LANE.z0 - 0.35, z1: LANE.z1 + 0.35 };
export const MEADOW_PATH = { x0: -24.2, x1: -7, z0: LANE.z0 + 0.6, z1: LANE.z1 - 0.6 };

export type NishiKind = "music" | "burger" | "books" | "kissa" | "yose" | "dojo";
export interface NishiShop {
  id: string;
  kind: NishiKind;
  x0: number;
  x1: number;
  side: "south" | "north";
  depth: number;
  door: [number, number];
  wall: string;
  roof: string;
  /** Its sign: Japanese and English. */
  sign: [string, string];
}

export const NISHI_SHOPS: NishiShop[] = [
  { id: "music", kind: "music", x0: -40.6, x1: -34, side: "south", depth: 6.5, door: [-37.9, -36.5], wall: "#2b2f38", roof: "#1d2433", sign: ["音楽堂", "Ongakudō music"] },
  { id: "burger", kind: "burger", x0: -49.4, x1: -42.2, side: "south", depth: 8, door: [-44.6, -43.2], wall: "#c8402f", roof: "#f2c94c", sign: ["シーバーガー", "SeaBurger"] },
  { id: "books", kind: "books", x0: -60.4, x1: -51, side: "south", depth: 8, door: [-53.4, -52], wall: "#f2e3c4", roof: "#2f6f4a", sign: ["本の森", "Hon-no-Mori books"] },
  { id: "kissa", kind: "kissa", x0: -40.6, x1: -34, side: "north", depth: 6.5, door: [-37.9, -36.5], wall: "#6b3b2a", roof: "#3a2c22", sign: ["喫茶 波音", "Kissa Namioto"] },
  { id: "yose", kind: "yose", x0: -49.4, x1: -42.2, side: "north", depth: 7.5, door: [-44.6, -43.2], wall: "#f4efe2", roof: "#2b2d30", sign: ["寄席カフェ 笑福", "Shōfuku rakugo café"] },
  { id: "dojo", kind: "dojo", x0: -60.4, x1: -51, side: "north", depth: 8, door: [-53.8, -52.4], wall: "#e8dcc4", roof: "#3c3a38", sign: ["星道場", "Hoshi dōjō"] },
];
export const shopById = (id: string) => NISHI_SHOPS.find((s) => s.id === id)!;
export const ROOM_H = 3.0;
const WALL = 0.2;

/** A shop's front and back along z, as plan.ts's frontOf does for the shōtengai. */
export function shopFront(s: NishiShop) {
  const out = s.side === "south" ? 1 : -1;
  const front = s.side === "south" ? LANE.z0 : LANE.z1;
  return { front, back: front - out * s.depth, out, z0: Math.min(front, front - out * s.depth), z1: Math.max(front, front - out * s.depth) };
}

// --- inside each -----------------------------------------------------------------------------

const music = shopById("music");
const burger = shopById("burger");
const books = shopById("books");
const kissa = shopById("kissa");
const yose = shopById("yose");
const dojo = shopById("dojo");

/** The music shop: instruments on the walls to try, a drum kit on the floor, the counter. */
/** Out from the back wall, so the clerk has room behind it. */
export const MUSIC_COUNTER = { x0: music.x0 + 0.5, x1: music.x0 + 2.6, z0: shopFront(music).z0 + 1.0, z1: shopFront(music).z0 + 1.6 };
/** The instruments on show, each where it hangs (x, z, which wall it faces out from). */
export const MUSIC_WALL: { instrument: "guitar" | "ukulele" | "electric" | "bass" | "violin"; x: number; z: number; facing: number }[] = [
  { instrument: "guitar", x: music.x1 - WALL - 0.08, z: shopFront(music).z0 + 1.6, facing: -Math.PI / 2 },
  { instrument: "ukulele", x: music.x1 - WALL - 0.08, z: shopFront(music).z0 + 2.7, facing: -Math.PI / 2 },
  { instrument: "electric", x: music.x1 - WALL - 0.08, z: shopFront(music).z0 + 3.8, facing: -Math.PI / 2 },
  { instrument: "bass", x: music.x1 - WALL - 0.08, z: shopFront(music).z0 + 4.9, facing: -Math.PI / 2 },
  { instrument: "violin", x: music.x0 + WALL + 0.08, z: shopFront(music).z0 + 4.4, facing: Math.PI / 2 },
];
export const MUSIC_KIT: [number, number] = [(music.x0 + music.x1) / 2 - 0.5, shopFront(music).z0 + 3.6];
export const MUSIC_KEYS: [number, number] = [music.x0 + 1.2, shopFront(music).z0 + 2.6];

/** The burger shop: the counter and menus in front; at the back, the stairs up
 *  to a mezzanine over the kitchen, with tables by its window. */
export const BURGER = (() => {
  const f = shopFront(burger);
  const up = G + 2.4;
  return {
    // Short of the stairs up the east side (it ran across their foot).
    counter: { x0: burger.x0 + 0.6, x1: burger.x1 - 1.9, z0: f.z1 - 3.4, z1: f.z1 - 2.8 },
    /** The kitchen behind the counter, under the mezzanine. */
    kitchen: { x0: burger.x0 + WALL, x1: burger.x1 - 2.0, z0: f.z0 + WALL, z1: f.z1 - 3.4 },
    /** The stairs, up the east side from the front to the mezzanine. */
    stairs: { x0: burger.x1 - 1.6, x1: burger.x1 - WALL, z0: f.z0 + 2.6, z1: f.z1 - 1.0 },
    mezzanine: { x0: burger.x0 + WALL, x1: burger.x1 - WALL, z0: f.z0 + WALL, z1: f.z0 + 2.6 },
    up,
    tables: [
      [burger.x0 + 1.4, f.z0 + 1.2],
      [burger.x0 + 3.2, f.z0 + 1.2],
    ] as [number, number][],
  };
})();

/** The bookshop: long shelves in rows, the counter by the door, a reading bench. */
export const BOOK_SHELVES: Rect[] = (() => {
  const f = shopFront(books);
  return [0, 1, 2].map((i) => ({ minX: books.x0 + 1.4 + i * 2.5, maxX: books.x0 + 1.9 + i * 2.5, minZ: f.z0 + 1.0, maxZ: f.z1 - 2.0 }));
})();
export const BOOK_COUNTER = { x0: books.x1 - 2.4, x1: books.x1 - 0.6, z0: shopFront(books).z1 - 2.0, z1: shopFront(books).z1 - 1.4 };

/** The kissaten: a long counter with stools, two little tables. */
export const KISSA = (() => {
  const f = shopFront(kissa);
  return {
    // Out from the back wall, the master behind it.
    counter: { x0: kissa.x0 + 0.6, x1: kissa.x1 - 0.6, z0: f.z1 - 1.5, z1: f.z1 - 0.95 },
    tables: [
      [kissa.x0 + 1.6, f.z0 + 2.0],
      [kissa.x0 + 4.2, f.z0 + 2.0],
    ] as [number, number][],
  };
})();

/** Who works where: behind each counter, facing the customers. */
export const STAFF = {
  music: { at: [MUSIC_COUNTER.x0 + 1.5, shopFront(music).z0 + 0.55] as [number, number], face: [MUSIC_COUNTER.x0 + 1.5, shopFront(music).z1] as [number, number] },
  burger: { at: [(burger.x0 + 0.6 + burger.x1 - 1.9) / 2 - 1.0, shopFront(burger).z1 - 3.9] as [number, number], face: [(burger.x0 + burger.x1) / 2, shopFront(burger).z1] as [number, number] },
  books: { at: [books.x1 - 1.5, shopFront(books).z1 - 2.45] as [number, number], face: [books.x1 - 1.5, shopFront(books).z1] as [number, number] },
  kissa: { at: [kissa.x1 - 1.6, shopFront(kissa).z1 - 0.55] as [number, number], face: [kissa.x1 - 1.6, shopFront(kissa).z0] as [number, number] },
};

/** The rakugo café: a raised kōza at the back, the teller on his cushion,
 *  rows of zabuton on the tatami before it. */
export const YOSE = (() => {
  const f = shopFront(yose);
  return {
    stage: { x0: yose.x0 + 1.6, x1: yose.x1 - 1.6, z0: f.z1 - 1.7, z1: f.z1 - WALL },
    teller: [(yose.x0 + yose.x1) / 2, f.z1 - 1.0] as [number, number],
    rows: [f.z0 + 2.4, f.z0 + 3.6],
    cols: [yose.x0 + 1.6, yose.x0 + 2.8, yose.x0 + 4.0, yose.x0 + 5.2],
  };
})();

/** The dojo: tatami, makiwara posts, the rack of practice swords, the shrine shelf. */
export const DOJO = (() => {
  const f = shopFront(dojo);
  return {
    rack: { x0: dojo.x0 + 0.5, x1: dojo.x0 + 2.5, z0: f.z1 - 0.7, z1: f.z1 - WALL },
    posts: [
      [dojo.x0 + 2.6, f.z0 + 3.2],
      [dojo.x0 + 5.0, f.z0 + 3.2],
      [dojo.x0 + 7.4, f.z0 + 3.2],
    ] as [number, number][],
  };
})();

/** The lantern alley behind the north side: its stalls along the north. */
export const YOKOCHO = { x0: -60.4, x1: -34, z0: 64.6, z1: 67.4, stallDepth: 2.6 };
export const STALLS: { x0: number; x1: number; ja: string; en: string; color: string }[] = [
  { x0: -60.4, x1: -56.0, ja: "やきとり", en: "Yakitori", color: "#c8402f" },
  { x0: -55.6, x1: -51.2, ja: "ガチャ", en: "Capsule toys", color: "#2f6fd0" },
  { x0: -50.8, x1: -46.4, ja: "たこ焼き", en: "Takoyaki", color: "#e8742a" },
  { x0: -46.0, x1: -41.6, ja: "カラオケ", en: "Karaoke", color: "#8a5a9c" },
  { x0: -41.2, x1: -36.8, ja: "甘味処", en: "Sweets", color: "#2f8f6a" },
];

/** Nishi park, south of the street: its benches. */
export const PARK = { x0: -62, x1: -33, z0: 39.5, z1: 44.6 };
export const PARK_BENCHES: [number, number][] = [
  [-56, 44.0],
  [-47, 44.0],
  [-38, 44.0],
];

/** The bikes, in their rack by the east road, free to ride (ride mode). */
export const BIKE_RACK = { x: -25.1, zs: [49.6, 50.6, 51.6] };

// --- collision, floors, ceilings, rooms ----------------------------------------------------

const o = (x0: number, x1: number, z0: number, z1: number): Obstacle => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, halfX: (x1 - x0) / 2, halfZ: (z1 - z0) / 2, rotationY: 0 });
const r = (x0: number, x1: number, z0: number, z1: number): Rect => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });

export function nishiObstacles(): Obstacle[] {
  const list: Obstacle[] = [];
  for (const s of NISHI_SHOPS) {
    const f = shopFront(s);
    const fz0 = s.side === "south" ? f.z1 - WALL : f.z0;
    const bz0 = s.side === "south" ? f.z0 : f.z1 - WALL;
    list.push(o(s.x0, s.x0 + WALL, f.z0, f.z1), o(s.x1 - WALL, s.x1, f.z0, f.z1), o(s.x0, s.x1, bz0, bz0 + WALL));
    list.push(o(s.x0, s.door[0], fz0, fz0 + WALL), o(s.door[1], s.x1, fz0, fz0 + WALL));
  }
  const c = (x: { x0: number; x1: number; z0: number; z1: number }) => o(x.x0, x.x1, x.z0, x.z1);
  for (const [x, z] of MUSIC_STANDS) list.push(o(x - 0.2, x + 0.2, z - 0.2, z + 0.2));
  list.push(c(MUSIC_COUNTER), o(MUSIC_KIT[0] - 0.7, MUSIC_KIT[0] + 0.7, MUSIC_KIT[1] - 0.6, MUSIC_KIT[1] + 0.6), o(MUSIC_KEYS[0] - 0.55, MUSIC_KEYS[0] + 0.55, MUSIC_KEYS[1] - 0.25, MUSIC_KEYS[1] + 0.25));
  list.push(c(BURGER.counter), c(BURGER.kitchen));
  // The stairs' open side, and the mezzanine's edge rail beside them.
  list.push(o(BURGER.stairs.x0 - 0.06, BURGER.stairs.x0, BURGER.stairs.z0, BURGER.stairs.z1 - 0.6));
  for (const s of BOOK_SHELVES) list.push(o(s.minX, s.maxX, s.minZ, s.maxZ));
  list.push(c(BOOK_COUNTER));
  list.push(c(KISSA.counter));
  for (const [x, z] of KISSA.tables) list.push(o(x - 0.38, x + 0.38, z - 0.38, z + 0.38));
  list.push(c(YOSE.stage));
  list.push(c(DOJO.rack));
  for (const [x, z] of DOJO.posts) list.push(o(x - 0.14, x + 0.14, z - 0.14, z + 0.14));
  // The yokochō's stalls, and the park's benches.
  for (const s of STALLS) list.push(o(s.x0, s.x1, YOKOCHO.z1, YOKOCHO.z1 + YOKOCHO.stallDepth));
  for (const [x, z] of PARK_BENCHES) list.push(o(x - 0.9, x + 0.9, z - 0.2, z + 0.25));
  list.push(o(BIKE_RACK.x - 0.5, BIKE_RACK.x + 0.5, BIKE_RACK.zs[0] - 0.3, BIKE_RACK.zs[2] + 0.3));
  // The arch's posts.
  for (const zz of [ARCH.z0, ARCH.z1]) list.push(o(ARCH.x - 0.2, ARCH.x + 0.2, zz - 0.2, zz + 0.2));
  // The bus stops' poles.
  for (const s of LOOP_STOPS) list.push(o(s.pole[0] - 0.08, s.pole[0] + 0.08, s.pole[1] - 0.08, s.pole[1] + 0.08));
  return list;
}

/** The burger shop's stairs and mezzanine (the only upstairs), and the rakugo stage. */
export function nishiFloors(): WorldFloor[] {
  const s = BURGER.stairs;
  const m = BURGER.mezzanine;
  return [
    { rect: r(m.x0, m.x1, m.z0, m.z1), height: BURGER.up },
    // The rakugo stage (the teller kneels on it; it's fenced off as an obstacle too).
    { rect: r(YOSE.stage.x0, YOSE.stage.x1, YOSE.stage.z0, YOSE.stage.z1), height: G + 0.6 },
    // Up from the front (z1) toward the mezzanine (z0).
    { rect: r(s.x0, s.x1, s.z0, s.z1), height: (_x, z) => G + (BURGER.up - G) * Math.max(0, Math.min(1, (s.z1 - z) / (s.z1 - s.z0))) },
  ];
}

export function nishiCeilings(): { rect: Rect; height: number }[] {
  return NISHI_SHOPS.map((s) => {
    const f = shopFront(s);
    return { rect: r(s.x0 + WALL, s.x1 - WALL, f.z0 + 0.02, f.z1 - 0.02), height: G + (s.kind === "burger" ? 5.4 : ROOM_H) - 0.3 };
  });
}

/** Inside a shop here, by kind (for its sounds, and the walls between voices). */
export function nishiRoomAt(x: number, z: number): NishiKind | null {
  for (const s of NISHI_SHOPS) {
    const f = shopFront(s);
    if (x > s.x0 && x < s.x1 && z > f.z0 && z < f.z1) return s.kind;
  }
  return null;
}

/** Seats: the park's benches, the kissaten's stools, the burger shop's tables
 *  upstairs, and the low benches before the rakugo stage. */
export function nishiSeats(): Seat[] {
  const seats: Seat[] = [];
  const bench = 0.45;
  PARK_BENCHES.forEach(([x, z], i) => {
    for (const s of [-1, 1]) seats.push({ id: `seishore-nishi-park-${i}-${s > 0 ? "r" : "l"}`, position: [x + s * 0.45, G + bench - SEAT_HEIGHT, z - 0.02], rotationY: 0, label: "Park bench" });
  });
  const kf = shopFront(kissa);
  for (let i = 0; i < 4; i++) seats.push({ id: `seishore-nishi-kissa-stool-${i}`, position: [kissa.x0 + 1.2 + i * 1.2, G + 0.62 - SEAT_HEIGHT, KISSA.counter.z0 - 0.45], rotationY: Math.PI, label: "Counter stool" });
  // Four to every table, each facing in (an avatar at yaw y faces (−sin y, −cos y)).
  const around: [string, number, number, number][] = [
    ["e", 1, 0, Math.PI / 2],
    ["w", -1, 0, -Math.PI / 2],
    ["n", 0, 1, 0],
    ["s", 0, -1, Math.PI],
  ];
  KISSA.tables.forEach(([x, z], i) => {
    for (const [k, ax, az, yaw] of around) seats.push({ id: `seishore-nishi-kissa-${i}-${k}`, position: [x + ax * 0.62, G + bench - SEAT_HEIGHT, z + az * 0.62], rotationY: yaw, label: "Kissaten seat" });
  });
  BURGER.tables.forEach(([x, z], i) => {
    for (const [k, ax, az, yaw] of around) seats.push({ id: `seishore-nishi-burger-${i}-${k}`, position: [x + ax * 0.6, BURGER.up + bench - SEAT_HEIGHT, z + az * 0.6], rotationY: yaw, label: "Table upstairs" });
  });
  // Low benches in rows before the stage, facing it (north, +z).
  YOSE.rows.forEach((z, row) =>
    YOSE.cols.forEach((x, col) => seats.push({ id: `seishore-nishi-yose-${row}-${col}`, position: [x, G + 0.4 - SEAT_HEIGHT, z], rotationY: Math.PI, label: "Rakugo café seat" }))
  );
  return seats;
}

export const nishiClearings = (): Rect[] => [NISHI, { minX: MEADOW_PATH.x0 - 1, maxX: MEADOW_PATH.x0 + 1, minZ: LANE.z0 - 2, maxZ: LANE.z1 + 2 }];

// --- the community bus, round the ring --------------------------------------------------------

/** Keeping left (as Japan does), it goes round anticlockwise in the outer lane. */
const LANE_OFF = 1.5;
const E = RING.east + LANE_OFF;
const W = RING.west - LANE_OFF;
const N = RING.north + LANE_OFF;
const S = RING.south - LANE_OFF;
const R = 4;
/** The stops: where its front door stops, the stop's pole on the kerb, and its names. */
export const LOOP_STOPS = [
  { id: "nishi-iriguchi", ja: "西通り入口", en: "Nishi-dōri", door: [E, 46] as [number, number], heading: 0, pole: [E + 2.2, 46.4] as [number, number] },
  { id: "yokocho-mae", ja: "横丁前", en: "Yokochō", door: [-46, N] as [number, number], heading: -Math.PI / 2, pole: [-46.4, N + 2.2] as [number, number] },
  { id: "nishi-machi", ja: "西町", en: "Nishi-machi", door: [W, 58] as [number, number], heading: Math.PI, pole: [W - 2.2, 57.6] as [number, number] },
  { id: "nishi-koen", ja: "西公園", en: "Nishi Park", door: [-46, S] as [number, number], heading: Math.PI / 2, pole: [-45.6, S - 2.2] as [number, number] },
];
/** Cruising speed between stops and round the corners, m/s. */
const CRUISE = 6.5;

/** The loop's legs: out of each corner at speed, slowing into the stop, the doors, speeding up into the next corner. */
export function loopLegs(): Leg[] {
  const front = BUS.length / 2 - 0.95;
  const legs: Leg[] = [];
  const straight = (from: [number, number], stop: (typeof LOOP_STOPS)[number], to: [number, number]) => {
    const dir = [Math.sin(stop.heading), Math.cos(stop.heading)];
    const at: [number, number] = [stop.door[0] - dir[0] * front, stop.door[1] - dir[1] * front];
    const d1 = Math.hypot(at[0] - from[0], at[1] - from[1]);
    const d2 = Math.hypot(to[0] - at[0], to[1] - at[1]);
    legs.push({ kind: "move", seconds: (2 * d1) / CRUISE, from, to: at, heading: stop.heading, ease: "out" });
    legs.push({ kind: "wait", seconds: 14, x: at[0], z: at[1], heading: stop.heading, stop: stop.id });
    legs.push({ kind: "move", seconds: (2 * d2) / CRUISE, from: at, to, heading: stop.heading, ease: "in" });
  };
  const corner = (cx: number, cz: number, phi0: number) => legs.push({ kind: "turn", seconds: ((Math.PI / 2) * R) / CRUISE, x: cx, z: cz, across: R, ahead: R, phi0, phi1: phi0 + Math.PI / 2 });
  // North up the east road, round to the west along the north road, south down the west, east along the south.
  straight([E, S + R], LOOP_STOPS[0], [E, N - R]);
  corner(E - R, N - R, 0);
  straight([E - R, N], LOOP_STOPS[1], [W + R, N]);
  corner(W + R, N - R, Math.PI / 2);
  straight([W, N - R], LOOP_STOPS[2], [W, S + R]);
  corner(W + R, S + R, Math.PI);
  straight([W + R, S], LOOP_STOPS[3], [E - R, S]);
  corner(E - R, S + R, (3 * Math.PI) / 2);
  return legs;
}

/** Guitars on stands on the music shop's floor, before the wall ones: [x, z], with what's on each. */
export const MUSIC_STANDS: [number, number, "guitar" | "electric" | "bass"][] = [
  [music.x0 + 3.1, shopFront(music).z0 + 2.3, "electric"],
  [music.x0 + 3.7, shopFront(music).z0 + 2.3, "guitar"],
  [music.x0 + 4.3, shopFront(music).z0 + 2.3, "bass"],
];
