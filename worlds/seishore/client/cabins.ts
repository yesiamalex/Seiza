// Inside Seishore's train and bus: where their walls, doorways, seats, and
// aisles are, in each vehicle's own frame (x across, z along, the floor at
// y 0 being the ground under it). Transit.tsx draws them from this, and
// moves this collision with them each frame, so you can walk in through an
// open door, down the aisle, between the cars, and sit or stand where you
// like while it carries you along.
import { BUS, CAR, TRAIN_LENGTH } from "./vehicles";

/** A box people can't walk through, in the vehicle's frame. */
export interface Block {
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** A door: not there while the doors are open. */
  door?: boolean;
}

export interface CabinSeat {
  id: string;
  /** Where you sit (y: how high above the vehicle's ground). */
  x: number;
  y: number;
  z: number;
  /** Which way it faces: 0 the way the vehicle goes, ±π/2 across it. */
  facing: number;
  /** Where getting up leaves you: in the aisle beside it. */
  exit: [number, number];
  /** One of the town's passengers sits here (people.ts's PASSENGERS). */
  rider?: number;
}

export interface Cabin {
  width: number;
  length: number;
  floor: number;
  blocks: Block[];
  seats: CabinSeat[];
}

/** Half a wall's thickness, and where a side wall's middle is. */
export const WALL = 0.03;

// --- the train ---------------------------------------------------------------------------

/** Its two cars (`end`: which way the cab at its outer end faces). */
export const CARS = [
  { cz: CAR.length / 2 + CAR.gap / 2, end: 1 as const },
  { cz: -(CAR.length / 2 + CAR.gap / 2), end: -1 as const },
];
/** In a car's own frame: its doors (both sides, the platforms' side opens), the cab's partition. */
export const TRAIN_DOORS = [-3, 3];
export const TRAIN_DOOR_WIDTH = 1.3;
export const CAB = 4.7;
/** Half the gangway's width, between the cars. */
export const GANGWAY = 0.6;
/** The long seats down each wall, from the cab's end (car frame, for a car whose cab is at +z). */
export const BENCHES: [number, number][] = [
  [-5.85, -3.75],
  [-2.25, 2.25],
  [3.75, 4.6],
];
const TRAIN_SEATS = [-5.4, -4.3, -1.7, -0.6, 0.6, 1.7, 4.15];

export function trainCabin(): Cabin {
  const side = CAR.width / 2 - WALL;
  const blocks: Block[] = [];
  const seats: CabinSeat[] = [];
  const span = (a: number, b: number) => ({ z: (a + b) / 2, hz: Math.abs(b - a) / 2 });
  const half = CAR.length / 2;
  const door = TRAIN_DOOR_WIDTH / 2;
  CARS.forEach(({ cz, end }, k) => {
    for (const s of [-1, 1]) {
      const x = s * side;
      // The wall between its doors, and its doors (the west's open at a platform).
      for (const [a, b] of [
        [-half, TRAIN_DOORS[0] - door],
        [TRAIN_DOORS[0] + door, TRAIN_DOORS[1] - door],
        [TRAIN_DOORS[1] + door, half],
      ])
        blocks.push({ x, hx: WALL, ...span(cz + a, cz + b) });
      for (const dz of TRAIN_DOORS) blocks.push({ x, hx: WALL, z: cz + dz, hz: door, door: s < 0 });
      // The long seats: their fronts a little in, so the aisle walks easily.
      for (const [a, b] of BENCHES) blocks.push({ x: s * 0.95, hx: 0.15, ...span(cz + end * a, cz + end * b) });
      for (const dz of TRAIN_SEATS) {
        const z = cz + end * dz;
        seats.push({
          id: `seishore-train-${k}-${s < 0 ? "w" : "e"}-${dz}`,
          x: s * 0.85,
          y: CAR.floor,
          z,
          // Across the car, toward the other wall.
          facing: s < 0 ? Math.PI / 2 : -Math.PI / 2,
          exit: [0, z],
          rider: k === 0 && s < 0 && dz === 0.6 ? 0 : k === 1 && s > 0 && dz === 1.7 ? 1 : undefined,
        });
      }
    }
    // The cab's partition, its end, and the end by the gangway (open in the middle).
    blocks.push({ x: 0, hx: side, z: cz + end * CAB, hz: WALL });
    blocks.push({ x: 0, hx: CAR.width / 2, z: cz + end * (half - WALL), hz: WALL });
    for (const s of [-1, 1]) blocks.push({ x: s * (GANGWAY + (side - GANGWAY) / 2), hx: (side - GANGWAY) / 2, z: cz - end * (half - WALL), hz: WALL });
  });
  // The gangway's sides.
  for (const s of [-1, 1]) blocks.push({ x: s * (GANGWAY + 0.02), hx: 0.02, z: 0, hz: CAR.gap / 2 + 0.05 });
  return { width: CAR.width, length: TRAIN_LENGTH, floor: CAR.floor, blocks, seats };
}

// --- the bus -----------------------------------------------------------------------------

/** Its doors, on the kerb's side (+x), front and middle: [from, to] along it. */
export const BUS_DOORS: [number, number][] = [
  [2.9, 4.0],
  [-0.2, 1.0],
];
/** Its wheels, along it: inside, each is a hump under the floor's edge. */
export const BUS_WHEELS = [2.2, -2.6];
/** The driver's corner, front right. */
export const BUS_DRIVER = { x: -0.72, hx: 0.4, z: 3.4, hz: 0.95 };
/** Seats: [x, z, raised] (the rear's are up on the wheel humps, and the back row's on a step). */
const BUS_SEATS: [number, number, number][] = [
  [-0.78, 1.3, 0],
  [-0.78, 0.45, 0],
  [-0.78, -0.4, 0],
  [-0.78, -1.25, 0],
  [-0.78, -2.6, 0.15],
  [0.78, 1.4, 0],
  [0.78, -0.75, 0],
  [0.78, -1.6, 0],
  [0.78, -2.6, 0.15],
  [-0.8, -3.85, 0.1],
  [0, -3.85, 0.1],
  [0.8, -3.85, 0.1],
];

export function busCabin(): Cabin {
  const side = BUS.width / 2 - WALL;
  const half = BUS.length / 2;
  const blocks: Block[] = [];
  const span = (a: number, b: number) => ({ z: (a + b) / 2, hz: Math.abs(b - a) / 2 });
  // The driver's side: solid. The kerb's: the wall either side of its doors.
  blocks.push({ x: -side, hx: WALL, z: 0, hz: half });
  const [front, middle] = BUS_DOORS;
  for (const [a, b] of [
    [-half, middle[0]],
    [middle[1], front[0]],
    [front[1], half],
  ])
    blocks.push({ x: side, hx: WALL, ...span(a, b) });
  for (const [a, b] of BUS_DOORS) blocks.push({ x: side, hx: WALL, ...span(a, b), door: true });
  for (const s of [-1, 1]) blocks.push({ x: 0, hx: BUS.width / 2, z: s * (half - WALL), hz: WALL });
  blocks.push({ ...BUS_DRIVER });
  const seats: CabinSeat[] = BUS_SEATS.map(([x, z, raised]) => {
    blocks.push({ x: x === 0 ? 0 : Math.sign(x) * 0.85, hx: 0.2, z, hz: 0.22 });
    return {
      id: `seishore-bus-${x < 0 ? "r" : x > 0 ? "l" : "m"}-${z}`,
      x,
      y: BUS.floor + raised,
      z,
      facing: 0,
      exit: [0, z < -3.5 ? -3.15 : z] as [number, number],
      rider: x < 0 && z === -1.25 ? 2 : undefined,
    };
  });
  return { width: BUS.width, length: BUS.length, floor: BUS.floor, blocks, seats };
}

/** Whether a walker this wide, here, is clear of every block (doors open or not). */
export function clearAt(cabin: Cabin, x: number, z: number, radius: number, doorsOpen: boolean): boolean {
  return cabin.blocks.every((b) => (b.door && doorsOpen) || Math.abs(x - b.x) >= b.hx + radius || Math.abs(z - b.z) >= b.hz + radius);
}
