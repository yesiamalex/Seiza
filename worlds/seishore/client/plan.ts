// Where Seishore's places are, on Seiza's meadow and down its coast (FIELD
// in src/scene/layout.ts: x −24 to 24, z 38 to 72, its floor at FIELD_Y;
// the beach beyond its east side, the sand from about x 35).
//
// A small Japanese seaside town, after Yuigahama in Kamakura, on the
// Shonan coast: one shopping street (the shōtengai) running east from the
// meadow to a little coastal railway, the coast road, the sea wall, and the
// beach; a shrine up by the campsite, and a temple at the mountain's foot
// by the line's second station. Visitors arrive at the street's west end,
// facing the sea:
//
//      z 108                                   Yamanomae station · temple
//      z 66  shrine ⛩    north row: houses, family restaurant, surf shop
//      z 56.5 ═══════════ the street ════════ ║rail║ coast road ║ wall ║ beach
//      z 53.5            south row: houses, café, fish shop, konbini
//           x −7                            x 21  x 24 x 25–29  x 31  x 35+
import * as THREE from "three";
import { FIELD_Y, floorHeightAt, OUTER_GROUND_Y, SEAT_HEIGHT, type Obstacle, type Rect, type Seat, type WorldFloor } from "../../../src/scene/layout";

export const Y = FIELD_Y;
export const G = OUTER_GROUND_Y;

/** The shōtengai: the town's one street of shops, east to the sea. */
export const LANE = { x0: -7, x1: 21, z0: 53.5, z1: 56.5 };
export const LANE_Z = (LANE.z0 + LANE.z1) / 2;
/** The coast road, along the top of the beach, and the promenade on its sea side. */
export const ROAD = { x0: 25.2, x1: 29.4, z0: 20, z1: 140 };
export const PROMENADE = { x0: 29.4, x1: 31.2 };
/** The sea wall: low, concrete, gaps down to the sand. */
export const SEAWALL = { x: 31.4, thick: 0.35, height: 0.62, gaps: [42, LANE_Z, 68, 96], gap: 2.6 };

// --- the railway -----------------------------------------------------------------------------

/** A single track along the coast, on a flat bed at the top of the
 *  meadow's bank, between the town and the road. */
export const TRACK = { x: 23.9, bed0: 22.8, bed1: 25.0, z0: -30, z1: 150, gauge: 1.067 };
/** The strip kept level for it: the bed, and the platforms on its west side. */
export const STRIP = { x0: 21.8, x1: 25.2 };
export const PLATFORM = { x0: 21.8, x1: 22.75 };
export interface Station {
  id: string;
  name: string;
  nameJa: string;
  /** Its platform, along z; the train stops centred on it. */
  z0: number;
  z1: number;
}
export const STATIONS: Station[] = [
  { id: "kaigan", name: "Seishore-Kaigan", nameJa: "星ショア海岸", z0: 57.4, z1: 82 },
  { id: "yamanomae", name: "Yamanomae", nameJa: "山の前", z0: 96, z1: 120.6 },
];
/** The fence along the track's west side, open at the street and the stations' ways in. */
export const FENCE = { x: 21.72, gaps: [[LANE.z0, 57.4] as [number, number], [107, 109.4] as [number, number]] };
/** Where the street crosses the line: the level crossing. */
export const CROSSING = { z0: LANE.z0, z1: LANE.z1 };

// --- the town ----------------------------------------------------------------------------

export type Kind = "house" | "cafe" | "fish" | "konbini" | "famiresu" | "surf";

export interface Building {
  id: string;
  kind: Kind;
  x0: number;
  x1: number;
  /** Which side of the street: south (front faces +z) or north (front faces −z). */
  side: "south" | "north";
  depth: number;
  floors: 1 | 2;
  /** Wall colour (upstairs, and downstairs unless it's wood), roof tiles. */
  wall: string;
  roof: string;
  /** Wood boards downstairs (yakisugi, dark), rather than the wall colour. */
  wood?: boolean;
  /** A wind chime hangs under its eaves. */
  furin?: boolean;
  /** You can walk in: its door, along its front. */
  door?: [number, number];
}

export const BUILDINGS: Building[] = [
  { id: "s-house-1", kind: "house", x0: -6.4, x1: -1.0, side: "south", depth: 5.2, floors: 2, wall: "#e8e2d4", roof: "#4b5462", wood: true, furin: true },
  { id: "cafe", kind: "cafe", x0: -0.6, x1: 5.2, side: "south", depth: 5.4, floors: 2, wall: "#f1ece2", roof: "#5a4c43", door: [3.85, 4.75] },
  { id: "s-house-2", kind: "house", x0: 5.6, x1: 10.2, side: "south", depth: 5, floors: 2, wall: "#c9cdc8", roof: "#3f4652" },
  { id: "fish", kind: "fish", x0: 10.6, x1: 14.4, side: "south", depth: 5, floors: 2, wall: "#dfd6c4", roof: "#4b5462" },
  { id: "konbini", kind: "konbini", x0: 14.8, x1: 20.8, side: "south", depth: 7, floors: 1, wall: "#f4f5f2", roof: "#d6d8d6", door: [18.7, 20.1] },
  { id: "n-house-1", kind: "house", x0: -6.4, x1: -1.6, side: "north", depth: 5, floors: 2, wall: "#d8cdb8", roof: "#4b5462", furin: true },
  { id: "famiresu", kind: "famiresu", x0: -1.2, x1: 8.6, side: "north", depth: 5.6, floors: 1, wall: "#f6efe2", roof: "#c2523d", door: [-0.6, 0.6] },
  { id: "surf", kind: "surf", x0: 9.0, x1: 13.4, side: "north", depth: 5, floors: 1, wall: "#7fb7c9", roof: "#e9ecee" },
  { id: "n-house-3", kind: "house", x0: 13.8, x1: 18.4, side: "north", depth: 5, floors: 2, wall: "#cfd5d8", roof: "#4b5462", wood: true },
];
const byId = (id: string) => BUILDINGS.find((b) => b.id === id)!;

/** A building's front (on the street) and back, and which way its front faces (+1: +z). */
export function frontOf(b: Building) {
  const out = b.side === "south" ? 1 : -1;
  const front = b.side === "south" ? LANE.z0 : LANE.z1;
  return { front, back: front - out * b.depth, out };
}

export const KONBINI = byId("konbini");
export const CAFE = byId("cafe");
export const FAMIRESU = byId("famiresu");
/** The konbini's sliding door, and how tall the rooms you walk into are inside. */
export const KONBINI_DOOR = { x0: KONBINI.door![0], x1: KONBINI.door![1] };
export const KONBINI_HEIGHT = 3.2;
export const ROOM_HEIGHT = 2.7;
/** The konbini: its counter along the east wall, the clerk behind it, two
 *  shelves down the middle, fridges along the back, magazines by the window. */
export const COUNTER = { x0: 19.35, x1: 19.95, z0: 48.8, z1: 51.9 };
export const CLERK_AT: [number, number] = [20.35, 50.4];
export const GONDOLAS = [
  { x0: 16.1, x1: 16.7, z0: 48.4, z1: 51.6 },
  { x0: 17.5, x1: 18.1, z0: 48.4, z1: 51.6 },
];
export const FRIDGES = { x0: 15.0, x1: 19.2, z0: 46.65, z1: 47.35 };
export const MAGAZINES = { x0: 15.0, x1: 17.6, z0: 52.95, z1: 53.3 };
/** The konbini's ATM, in the back corner by the end of the fridges. */
export const ATM = { x0: 19.4, x1: 19.95, z0: 46.6, z1: 47.15 };

/** The café: its counter along the back, Mio behind it, two round tables for four. */
export const CAFE_COUNTER = { x0: 0.1, x1: 3.6, z0: 49.15, z1: 49.75 };
export const BARISTA_AT: [number, number] = [1.6, 48.7];
export const CAFE_TABLES: [number, number][] = [
  [1.0, 51.7],
  [3.1, 51.7],
];
/** The family restaurant: tables for four by the window, the kitchen's
 *  pass along the back, the chef behind it, the drink bar by the door. */
export const DINER_TABLES: [number, number][] = [
  [2.2, 58.15],
  [4.6, 58.15],
  [7.0, 58.15],
];
export const PASS = { x0: 1.4, x1: 8.2, z0: 59.9, z1: 60.4 };
export const CHEF_AT: [number, number] = [4.8, 61.15];
export const DRINK_BAR = { x0: -1.0, x1: -0.5, z0: 59.4, z1: 61.3 };

/** The vending corner at the street's east end, north side. */
export const VENDING = [
  { x: 19.35, z: 56.95, color: "#e8edf2", accent: "#2f6fd0" },
  { x: 20.35, z: 56.95, color: "#d23b31", accent: "#ffffff" },
];

/** Concrete utility poles along the street's south edge and the promenade. */
export const POLES: [number, number][] = [
  [-4.2, 53.75],
  [2.6, 53.75],
  [9.4, 53.75],
  [29.6, 44],
  [29.6, 58.6],
  [29.6, 72],
];
/** The curved traffic mirror at the street's corner by the crossing. */
export const MIRROR_AT: [number, number] = [21.1, 57.15];
/** The coast bus stop's pole, by where the bus's front door opens (z 50.8), off the promenade's walking line. */
export const BUS_STOP = { x: 30.2, z: 49.5 };
/** Its bench, back to the sea wall, a metre past the door, so the way on board is clear. */
export const BUS_BENCH = { x: 30.9, z: BUS_STOP.z + 3.2 };
/** Benches on the promenade, facing the sea. */
export const PROMENADE_BENCHES: [number, number][] = [
  [30.5, 62.5],
  [30.5, 46.2],
];
/** Fishing boats pulled up on the sand. */
export const BOATS = [
  { x: 38.6, z: 48.4, yaw: 0.12, color: "#f2f2ee", trim: "#2f6fd0" },
  { x: 41.6, z: 49.6, yaw: -0.08, color: "#f2f2ee", trim: "#c8402f" },
];
/** The shrine, up the meadow by the campsite: its torii, the shrine, its
 *  offering box (where you pray), and the fortune box beside it. */
export const SHRINE = { x: -14.5, toriiZ: 62.6, hokoraZ: 67.6 };
/** The offering box stands on the ground before the shrine's stone base (its front at hokoraZ − 0.9). */
export const OFFERING_AT: [number, number] = [SHRINE.x, SHRINE.hokoraZ - 1.3];
export const PRAY_AT: [number, number] = [SHRINE.x, SHRINE.hokoraZ - 2.15];
export const OMIKUJI_AT: [number, number] = [SHRINE.x - 1.05, SHRINE.hokoraZ - 2.45];
export const SHRINE_BENCH = { x: -12.2, z: 65.4 };
/** The temple, Seikai-ji, at the mountain's foot west of the second station:
 *  its gate, the incense burner, the main hall, and its offering box. */
/** The temple along x: the gate (east), the incense burner on the path, the
 *  hall's steps (out from its stone base, which ends at hallX + 2.15), the hall. */
export const TEMPLE = { gateX: 17.2, hallX: 9.8, z: 108.2, burnerX: 13.7, burnerZ: 108.2 + 1.9 };
/**
 * The ground falls nearly two metres from the hall to the gate, so the hall
 * stands on a level stone terrace, as a temple on a hillside does, with a
 * stone stair from the gate up to it. Its level is the ground's at the hall.
 */
export const TEMPLE_YARD = { x0: 7.0, x1: 14.6, z0: TEMPLE.z - 3.2, z1: TEMPLE.z + 3.2, y: floorHeightAt(TEMPLE.hallX, TEMPLE.z) };
/** The stair, down from the terrace's edge to the gate. */
export const TEMPLE_STAIR = { x0: TEMPLE_YARD.x1, x1: 16.9, z0: TEMPLE.z - 0.8, z1: TEMPLE.z + 0.8, foot: floorHeightAt(16.9, TEMPLE.z) };
/** The bench on the terrace, by its south edge, looking across the yard. */
export const TEMPLE_BENCH = { x: 13.2, z: TEMPLE.z - 2.6 };
/** Where the hall's steps start and end (from the stone base out), each step's top. */
export const TEMPLE_STEPS = { x0: TEMPLE.hallX + 2.15, x1: TEMPLE.hallX + 3.05, tops: [0.45, 0.3, 0.15] };
/** The offering box up on the verandah, before the open doors. */
export const TEMPLE_OFFERING: [number, number] = [TEMPLE.hallX + 1.6, TEMPLE.z];
/** Where you stand to pray: at the foot of the steps. */
export const TEMPLE_PRAY: [number, number] = [TEMPLE_STEPS.x1 + 0.5, TEMPLE.z];
/** The café's bench in front of it, the A-frame board beside. */
export const CAFE_BENCH = { x: (CAFE.x0 + CAFE.x1) / 2 - 1.0, z: LANE.z0 + 0.32 };
export const CAFE_BOARD = { x: CAFE.x0 + 0.6, z: LANE.z0 + 0.55 };
/**
 * Each station's shelter and its bench: at the end of the platform away
 * from where you come onto it, past the last door. The platform is under a
 * metre wide, so a bench anywhere you walk would stand between you and the
 * train's doors (Kaigan is reached from the crossing, at its south end;
 * Yamanomae from the temple's side, near its middle).
 */
export const SHELTER_Z = STATIONS.map((s) => (s.id === "kaigan" ? s.z1 - 1.5 : s.z0 + 1.5));
/** Where visitors arrive (world.json's spawnPoint): the street's west end, facing the sea. */
export const ARRIVE: [number, number] = [-5.6, LANE_Z];

// --- the ground the line needs -----------------------------------------------------------

/** The level strip for the line and its platforms, and the street's ramp
 *  up the meadow's bank to the crossing. */
export function seishoreFloors(meadowAt: (x: number, z: number) => number): WorldFloor[] {
  // From just past the konbini, so its doorstep stays level.
  const ramp0 = 20.9;
  return [
    { rect: { minX: STRIP.x0, maxX: STRIP.x1, minZ: TRACK.z0, maxZ: TRACK.z1 }, height: G },
    // The temple's terrace, and its stair down to the gate.
    { rect: { minX: TEMPLE_YARD.x0, maxX: TEMPLE_YARD.x1, minZ: TEMPLE_YARD.z0, maxZ: TEMPLE_YARD.z1 }, height: TEMPLE_YARD.y },
    {
      rect: { minX: TEMPLE_STAIR.x0, maxX: TEMPLE_STAIR.x1, minZ: TEMPLE_STAIR.z0, maxZ: TEMPLE_STAIR.z1 },
      height: (x) => TEMPLE_YARD.y + (TEMPLE_STAIR.foot - TEMPLE_YARD.y) * Math.max(0, Math.min(1, (x - TEMPLE_STAIR.x0) / (TEMPLE_STAIR.x1 - TEMPLE_STAIR.x0))),
    },
    {
      rect: { minX: ramp0, maxX: STRIP.x0, minZ: LANE.z0, maxZ: LANE.z1 },
      height: (x, z) => {
        const t = (x - ramp0) / (STRIP.x0 - ramp0);
        return meadowAt(ramp0 - 0.01, z) * (1 - t) + G * t;
      },
    },
  ];
}

// --- seats ------------------------------------------------------------------------------

const BENCH_SEAT = 0.45;
/** An avatar at yaw y faces (−sin y, −cos y): facing +z is π, −z is 0, +x is −π/2, −x is π/2. */
const FACING = { pz: Math.PI, nz: 0, px: -Math.PI / 2, nx: Math.PI / 2 };

/** Where the townspeople sit, so visitors' seats leave them out. */
export const CUSTOMER_SEATS = new Set(["seishore-cafe-0-w", "seishore-diner-0-n", "seishore-diner-1-s", "seishore-diner-1-n", "seishore-diner-2-s"]);

/** Every seat in town, the townspeople's included (they're in CUSTOMER_SEATS). */
export function allSeats(): Seat[] {
  const seats: Seat[] = [];
  const pair = (id: string, label: string, x: number, z: number, along: "x" | "z", yaw: number, height = BENCH_SEAT) => {
    for (const side of [-1, 1]) {
      const dx = along === "x" ? side * 0.45 : 0;
      const dz = along === "z" ? side * 0.45 : 0;
      seats.push({ id: `seishore-${id}-${side > 0 ? "r" : "l"}`, position: [x + dx, Y + height - SEAT_HEIGHT, z + dz], rotationY: yaw, label });
    }
  };
  pair("cafe-bench", "Café bench", CAFE_BENCH.x, CAFE_BENCH.z + 0.06, "x", FACING.pz);
  // Up on the outer ground, 0.54 above the meadow.
  const up = G - Y;
  pair("bus", "Bus stop", BUS_BENCH.x, BUS_BENCH.z, "z", FACING.nx, BENCH_SEAT + up);
  PROMENADE_BENCHES.forEach(([x, z], i) => pair(`prom-${i}`, "Bench by the sea", x + 0.08, z, "z", FACING.px, BENCH_SEAT + up));
  pair("shrine", "Shrine bench", SHRINE_BENCH.x, SHRINE_BENCH.z, "z", FACING.px);
  // The café's tables: a chair on every side, facing in.
  CAFE_TABLES.forEach(([x, z], i) => {
    const chair = (id: string, dx: number, dz: number, yaw: number) => seats.push({ id: `seishore-cafe-${i}-${id}`, position: [x + dx, Y + BENCH_SEAT - SEAT_HEIGHT, z + dz], rotationY: yaw, label: "Café table" });
    chair("w", -0.58, 0, FACING.px);
    chair("e", 0.58, 0, FACING.nx);
    chair("s", 0, -0.58, FACING.pz);
    chair("n", 0, 0.58, FACING.nz);
  });
  // The family restaurant's tables for four: two to each bench.
  DINER_TABLES.forEach(([x, z], i) => {
    for (const [k, dx] of [["", -0.3], ["2", 0.3]] as [string, number][]) {
      seats.push({ id: `seishore-diner-${i}-s${k}`, position: [x + dx, Y + BENCH_SEAT - SEAT_HEIGHT, z - 0.62], rotationY: FACING.pz, label: "Table" });
      seats.push({ id: `seishore-diner-${i}-n${k}`, position: [x + dx, Y + BENCH_SEAT - SEAT_HEIGHT, z + 0.62], rotationY: FACING.nz, label: "Table" });
    }
  });
  // The stations' benches, under their shelters, facing the track.
  STATIONS.forEach((s, i) => pair(`station-${s.id}`, `${s.name} station`, PLATFORM.x0 + 0.3, SHELTER_Z[i], "z", FACING.px, BENCH_SEAT + up));
  pair("temple", "Temple bench", TEMPLE_BENCH.x, TEMPLE_BENCH.z, "x", FACING.pz, BENCH_SEAT + TEMPLE_YARD.y - Y);
  return seats;
}
/** The seats visitors can take. */
export const seishoreSeats = (): Seat[] => allSeats().filter((s) => !CUSTOMER_SEATS.has(s.id));

// --- collision ---------------------------------------------------------------------------

const o = (x0: number, x1: number, z0: number, z1: number): Obstacle => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, halfX: (x1 - x0) / 2, halfZ: (z1 - z0) / 2, rotationY: 0 });
export const WALL = 0.2;

/** A room you walk into: its four walls, the front split round its door. */
function walls(b: Building, list: Obstacle[]) {
  const { front, back } = frontOf(b);
  const z0 = Math.min(front, back);
  const z1 = Math.max(front, back);
  const fz0 = b.side === "south" ? z1 - WALL : z0;
  const fz1 = fz0 + WALL;
  const bz0 = b.side === "south" ? z0 : z1 - WALL;
  list.push(o(b.x0, b.x0 + WALL, z0, z1), o(b.x1 - WALL, b.x1, z0, z1), o(b.x0, b.x1, bz0, bz0 + WALL));
  list.push(o(b.x0, b.door![0], fz0, fz1), o(b.door![1], b.x1, fz0, fz1));
}

/** Everything solid in town, for Seiza's collision (setWorldObstacles). The
 *  rooms you walk into are walls; every other building its whole footprint. */
export function seishoreObstacles(): Obstacle[] {
  const list: Obstacle[] = [];
  for (const b of BUILDINGS) {
    const { front, back } = frontOf(b);
    if (!b.door) {
      list.push(o(b.x0, b.x1, Math.min(front, back), Math.max(front, back)));
      continue;
    }
    walls(b, list);
  }
  // Inside the konbini.
  list.push(o(COUNTER.x0, COUNTER.x1, COUNTER.z0, COUNTER.z1));
  for (const g of GONDOLAS) list.push(o(g.x0, g.x1, g.z0, g.z1));
  list.push(o(FRIDGES.x0, FRIDGES.x1, FRIDGES.z0, FRIDGES.z1), o(MAGAZINES.x0, MAGAZINES.x1, MAGAZINES.z0, MAGAZINES.z1));
  list.push(o(ATM.x0, ATM.x1, ATM.z0, ATM.z1));
  // Inside the café and the family restaurant.
  list.push(o(CAFE_COUNTER.x0, CAFE_COUNTER.x1, CAFE_COUNTER.z0, CAFE_COUNTER.z1));
  for (const [x, z] of CAFE_TABLES) list.push(o(x - 0.36, x + 0.36, z - 0.36, z + 0.36));
  for (const [x, z] of DINER_TABLES) list.push(o(x - 0.55, x + 0.55, z - 0.32, z + 0.32));
  list.push(o(PASS.x0, PASS.x1, PASS.z0, PASS.z1), o(DRINK_BAR.x0, DRINK_BAR.x1, DRINK_BAR.z0, DRINK_BAR.z1));
  // The street.
  for (const v of VENDING) list.push(o(v.x - 0.47, v.x + 0.47, v.z - 0.05, v.z + 0.75));
  for (const [x, z] of POLES) list.push(o(x - 0.16, x + 0.16, z - 0.16, z + 0.16));
  list.push(o(MIRROR_AT[0] - 0.08, MIRROR_AT[0] + 0.08, MIRROR_AT[1] - 0.08, MIRROR_AT[1] + 0.08));
  list.push(o(CAFE_BENCH.x - 0.9, CAFE_BENCH.x + 0.9, LANE.z0, CAFE_BENCH.z + 0.2));
  list.push(o(CAFE_BOARD.x - 0.3, CAFE_BOARD.x + 0.3, CAFE_BOARD.z - 0.25, CAFE_BOARD.z + 0.25));
  // The sea wall, in its pieces between the gaps, and the promenade's things.
  const cuts = [ROAD.z0, ...SEAWALL.gaps.flatMap((g) => [g - SEAWALL.gap / 2, g + SEAWALL.gap / 2]), ROAD.z1];
  for (let i = 0; i < cuts.length; i += 2) list.push(o(SEAWALL.x - SEAWALL.thick / 2, SEAWALL.x + SEAWALL.thick / 2, cuts[i], cuts[i + 1]));
  list.push(o(BUS_STOP.x - 0.08, BUS_STOP.x + 0.08, BUS_STOP.z - 0.08, BUS_STOP.z + 0.08));
  list.push(o(BUS_BENCH.x - 0.22, BUS_BENCH.x + 0.22, BUS_BENCH.z - 0.9, BUS_BENCH.z + 0.9));
  for (const [x, z] of PROMENADE_BENCHES) list.push(o(x - 0.2, x + 0.25, z - 0.9, z + 0.9));
  for (const b of BOATS) list.push({ x: b.x, z: b.z, halfX: 0.85, halfZ: 2.4, rotationY: b.yaw });
  // The railway's fence, and the stations' benches.
  const fenceCuts = [TRACK.z0, ...FENCE.gaps.flat(), TRACK.z1];
  for (let i = 0; i < fenceCuts.length; i += 2) list.push(o(FENCE.x - 0.05, FENCE.x + 0.05, fenceCuts[i], fenceCuts[i + 1]));
  for (const z of SHELTER_Z) list.push(o(PLATFORM.x0 + 0.1, PLATFORM.x0 + 0.5, z - 0.85, z + 0.85));
  // The shrine.
  for (const dx of [-1.25, 1.25]) list.push(o(SHRINE.x + dx - 0.18, SHRINE.x + dx + 0.18, SHRINE.toriiZ - 0.18, SHRINE.toriiZ + 0.18));
  list.push(o(SHRINE.x - 1.1, SHRINE.x + 1.1, SHRINE.hokoraZ - 0.9, SHRINE.hokoraZ + 1.0));
  for (const dx of [-1.7, 1.7]) list.push(o(SHRINE.x + dx - 0.25, SHRINE.x + dx + 0.25, SHRINE.hokoraZ - 1.7, SHRINE.hokoraZ - 1.2));
  list.push(o(OMIKUJI_AT[0] - 0.25, OMIKUJI_AT[0] + 0.25, OMIKUJI_AT[1] - 0.2, OMIKUJI_AT[1] + 0.2));
  list.push(o(SHRINE_BENCH.x - 0.2, SHRINE_BENCH.x + 0.2, SHRINE_BENCH.z - 0.9, SHRINE_BENCH.z + 0.9));
  // The temple.
  for (const dz of [-1.5, 1.5]) list.push(o(TEMPLE.gateX - 0.2, TEMPLE.gateX + 0.2, TEMPLE.z + dz - 0.2, TEMPLE.z + dz + 0.2));
  list.push(o(TEMPLE.hallX - 2.6, TEMPLE.hallX + 2.15, TEMPLE.z - 2.6, TEMPLE.z + 2.6));
  // The steps up to the verandah (looked at, not climbed: you pray at their foot).
  list.push(o(TEMPLE_STEPS.x0, TEMPLE_STEPS.x1, TEMPLE.z - 0.8, TEMPLE.z + 0.8));
  list.push(o(TEMPLE.burnerX - 0.45, TEMPLE.burnerX + 0.45, TEMPLE.burnerZ - 0.45, TEMPLE.burnerZ + 0.45));
  list.push(o(TEMPLE_BENCH.x - 0.9, TEMPLE_BENCH.x + 0.9, TEMPLE_BENCH.z - 0.22, TEMPLE_BENCH.z + 0.22));
  // The terrace's edges, where it stands above the slope: the way up is the stair.
  const Y0 = TEMPLE_YARD;
  list.push(o(Y0.x1 - 0.1, Y0.x1 + 0.1, Y0.z0, TEMPLE_STAIR.z0), o(Y0.x1 - 0.1, Y0.x1 + 0.1, TEMPLE_STAIR.z1, Y0.z1));
  list.push(o(TEMPLE.hallX + 2.15, Y0.x1 + 0.1, Y0.z0 - 0.1, Y0.z0 + 0.1), o(TEMPLE.hallX + 2.15, Y0.x1 + 0.1, Y0.z1 - 0.1, Y0.z1 + 0.1));
  return list;
}

/** Ground the treeline and the mountain's forest keep off: the coast road
 *  and the railway, end to end, and the temple's grounds. */
export function seishoreClearings(): Rect[] {
  return [
    { minX: 20.5, maxX: 33, minZ: TRACK.z0 - 5, maxZ: TRACK.z1 + 2 },
    { minX: TEMPLE.hallX - 6, maxX: STRIP.x0, minZ: TEMPLE.z - 7, maxZ: TEMPLE.z + 7 },
  ];
}

/** The rooms you walk into, under their roofs: the camera's ceiling, and shade. */
export function seishoreCeilings(): { rect: Rect; height: number }[] {
  return BUILDINGS.filter((b) => b.door).map((b) => {
    const { front, back } = frontOf(b);
    return {
      rect: { minX: b.x0 + WALL, maxX: b.x1 - WALL, minZ: Math.min(front, back) + 0.02, maxZ: Math.max(front, back) - 0.02 },
      height: Y + (b.kind === "konbini" ? KONBINI_HEIGHT : ROOM_HEIGHT) - 0.3,
    };
  });
}

/** Inside a building you can walk into, by kind (for its sounds and greeting). */
export function roomAt(x: number, z: number): Kind | null {
  for (const b of BUILDINGS) {
    if (!b.door) continue;
    const { front, back } = frontOf(b);
    if (x > b.x0 && x < b.x1 && z > Math.min(front, back) && z < Math.max(front, back)) return b.kind;
  }
  return null;
}

// --- walking: the town's paths -------------------------------------------------------------

const stationMid = (i: number) => (STATIONS[i].z0 + STATIONS[i].z1) / 2;

/** Points on open ground, joined where you can walk straight between them:
 *  how the townspeople get about (the meadow has no navmesh). */
export const NODES = {
  arrive: ARRIVE,
  laneWest: [-6.9, LANE_Z],
  camp: [-8.4, 60.6],
  torii: [SHRINE.x, SHRINE.toriiZ - 1.2],
  shrine: PRAY_AT,
  cafe: [CAFE.door![0] - 0.9, LANE_Z],
  cafeDoor: [(CAFE.door![0] + CAFE.door![1]) / 2, LANE_Z],
  cafeIn: [(CAFE.door![0] + CAFE.door![1]) / 2, 52.4],
  cafeBack: [4.3, 49.0],
  barista: BARISTA_AT,
  dinerDoor: [(FAMIRESU.door![0] + FAMIRESU.door![1]) / 2, LANE_Z],
  dinerIn: [(FAMIRESU.door![0] + FAMIRESU.door![1]) / 2, 57.4],
  dinerAisle: [0.0, 59.3],
  kitchen: [0.8, 61.15],
  chef: CHEF_AT,
  laneMid: [7.6, LANE_Z],
  fish: [12.5, LANE_Z],
  surf: [11.2, LANE_Z + 0.4],
  konbiniDoor: [(KONBINI_DOOR.x0 + KONBINI_DOOR.x1) / 2, LANE_Z],
  konbiniIn: [(KONBINI_DOOR.x0 + KONBINI_DOOR.x1) / 2, 52.4],
  aisle: [18.8, 50.2],
  counterEnd: [20.35, 52.45],
  clerk: CLERK_AT,
  laneEast: [21.0, LANE_Z],
  rail: [TRACK.x, LANE_Z],
  platform: [22.3, 59.5],
  platformMid: [22.3, stationMid(0)],
  crossing: [27.3, LANE_Z],
  roadSouth: [27.3, 47.5],
  roadNorth: [27.3, 63],
  busStop: [29.4, BUS_STOP.z + 1.3],
  promenadeSouth: [29.85, 47.5],
  promenadeNorth: [29.85, 63],
  gapLand: [29.85, LANE_Z],
  wallGap: [SEAWALL.x, LANE_Z],
  beach: [37.5, LANE_Z],
  boats: [36.5, 49.0],
  /** Down by the water, where Genji-san looks out to sea (apart from where Kaito waits). */
  shoreline: [40.2, LANE_Z + 1.8],
  platform2: [22.3, stationMid(1)],
  platform2Exit: [22.3, (FENCE.gaps[1][0] + FENCE.gaps[1][1]) / 2],
  templeGate: [TEMPLE.gateX + 1.0, TEMPLE.z],
  templeStair: [(TEMPLE_STAIR.x0 + TEMPLE_STAIR.x1) / 2, TEMPLE.z],
  templeYard: [TEMPLE_YARD.x1 - 0.6, TEMPLE.z - 0.9],
  templeSide: [TEMPLE_PRAY[0], TEMPLE.z - 1.3],
  templePray: TEMPLE_PRAY,
} satisfies Record<string, readonly [number, number]>;
export type Node = keyof typeof NODES;

export const EDGES: [Node, Node][] = [
  ["arrive", "laneWest"],
  ["laneWest", "camp"],
  ["camp", "torii"],
  ["torii", "shrine"],
  ["arrive", "dinerDoor"],
  ["dinerDoor", "dinerIn"],
  ["dinerIn", "dinerAisle"],
  ["dinerAisle", "kitchen"],
  ["kitchen", "chef"],
  ["dinerDoor", "cafe"],
  ["cafe", "cafeDoor"],
  ["cafeDoor", "cafeIn"],
  ["cafeIn", "cafeBack"],
  ["cafeBack", "barista"],
  ["cafeDoor", "laneMid"],
  ["laneMid", "fish"],
  ["fish", "surf"],
  ["surf", "laneEast"],
  ["fish", "konbiniDoor"],
  ["konbiniDoor", "konbiniIn"],
  ["konbiniIn", "aisle"],
  ["konbiniIn", "counterEnd"],
  ["counterEnd", "clerk"],
  ["konbiniDoor", "laneEast"],
  ["laneEast", "rail"],
  ["rail", "platform"],
  ["platform", "platformMid"],
  ["rail", "crossing"],
  ["crossing", "roadSouth"],
  ["crossing", "roadNorth"],
  ["crossing", "gapLand"],
  ["gapLand", "wallGap"],
  ["roadSouth", "busStop"],
  ["busStop", "promenadeSouth"],
  ["roadNorth", "promenadeNorth"],
  ["gapLand", "promenadeSouth"],
  ["gapLand", "promenadeNorth"],
  ["wallGap", "beach"],
  ["beach", "boats"],
  ["boats", "shoreline"],
  ["beach", "shoreline"],
  ["platform2", "platform2Exit"],
  ["platform2Exit", "templeGate"],
  ["templeGate", "templeStair"],
  ["templeStair", "templeYard"],
  ["templeYard", "templeSide"],
  ["templeSide", "templePray"],
];

const nearest = (x: number, z: number): Node => {
  let best: Node = "arrive";
  let bestD = Infinity;
  for (const [name, [nx, nz]] of Object.entries(NODES) as [Node, [number, number]][]) {
    const d = (nx - x) ** 2 + (nz - z) ** 2;
    if (d < bestD) [best, bestD] = [name, d];
  }
  return best;
};

/** The way between two points in town, along the paths: to the nearest
 *  point, along them, then on. Null outside town (the hall, the
 *  classroom), or between places the paths don't join (ride the train). */
export function findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
  if (from.z < 38 || to.z < 38) return null;
  const start = nearest(from.x, from.z);
  const goal = nearest(to.x, to.z);
  const dist = new Map<Node, number>([[start, 0]]);
  const prev = new Map<Node, Node>();
  const open = new Set<Node>([start]);
  while (open.size) {
    const at = [...open].reduce((a, b) => ((dist.get(a) ?? Infinity) <= (dist.get(b) ?? Infinity) ? a : b));
    open.delete(at);
    if (at === goal) break;
    for (const [a, b] of EDGES) {
      const next = a === at ? b : b === at ? a : null;
      if (!next) continue;
      const d = (dist.get(at) ?? 0) + Math.hypot(NODES[at][0] - NODES[next][0], NODES[at][1] - NODES[next][1]);
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, at);
        open.add(next);
      }
    }
  }
  const nodes: Node[] = [goal];
  while (nodes[0] !== start) {
    const back = prev.get(nodes[0]);
    if (!back) return null;
    nodes.unshift(back);
  }
  return [from.clone(), ...nodes.map((n) => new THREE.Vector3(NODES[n][0], Y, NODES[n][1])), to.clone()];
}

/** A point on the paths, as a guide's stop or a place to lead to. */
export const at = (node: Node): [number, number, number] => [NODES[node][0], Y, NODES[node][1]];
