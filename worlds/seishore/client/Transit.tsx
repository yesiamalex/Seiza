// Seishore's bus and train, drawn where the timetable (vehicles.ts) puts
// them, and the level crossing's lights, bell, and barriers. Both are
// hollow, as the real ones are: walls with open windows between their
// pillars, doors that slide open at a stop, an aisle down the middle, and a
// gangway between the train's cars (cabins.ts has where everything is).
// Walk in, sit, or stand: their walls, seats, and floors move with them
// every frame, and anyone standing inside is carried along (layout.ts's
// platform carry), turning with the bus as it turns.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWorldFloors, getWorldObstacles, SEAT_HEIGHT, setPlatformCarry, setWorldFloors, setWorldObstacles, type Obstacle, type Seat, type WorldFloor } from "../../../src/scene/layout";
import { speak } from "../../../src/guides/speech";
import { Builder, canvasTexture, FONT, noRaycast, paint } from "../../seisugbo/client/kit";
import { CROSSING, G, STATIONS, TRACK } from "./plan";
import { DRIVER, PASSENGERS } from "./people";
import { busAt, BUS, CAR, clock, timeline, trainAt, TRAIN_LENGTH, type Pose } from "./vehicles";
import { LOOP_STOPS, loopLegs } from "./nishi";
import { BENCHES, BUS_DOORS, BUS_DRIVER, BUS_WHEELS, busCabin, CAB, CARS, GANGWAY, TRAIN_DOOR_WIDTH, TRAIN_DOORS, trainCabin, WALL, type Block, type Cabin, type CabinSeat } from "./cabins";
import { busDoors, crossingBell, railJoint, startDiesel, startMotor, trainDoors, type Loop } from "./sounds";
import { Sitter } from "./Extras";

const LINE = "#1c6f86";
const STRIPE = "#ff9e7a";
const SHELL = "#f4f4f0";
const TEAL = "#2bb3a3";
const DARK = "#2b2d30";
const STEEL = "#c9ccd0";
const FRAME = "#9da3a8";

// --- walls with holes in them ------------------------------------------------------------------

/** Colours up a wall: each up to its height (the last to the top). */
type Band = [upTo: number, colour: string];
/** An opening: along the wall from `a` to `b`, from `y0` up to `y1`. */
interface Hole {
  a: number;
  b: number;
  y0: number;
  y1: number;
  /** A window: an aluminium sill and head. */
  frame?: boolean;
}
interface WallSpec {
  /** Which axis the wall faces along, where it stands on it, and which way is in. */
  normal: "x" | "z";
  at: number;
  inward: number;
  from: number;
  to: number;
  bottom: number;
  top: number;
  holes: Hole[];
  bands: Band[];
  /** The inside's panelling, from `liningFrom` (the floor) up. */
  lining?: string;
  liningFrom?: number;
}

/** A wall as solid pieces around its openings, so a window is a real hole you can see and lean out of. */
function wall(b: Builder, w: WallSpec) {
  const thick = WALL * 2;
  const box = (a: number, c: number, y0: number, y1: number, t: number, at: number, colour: string) => {
    const len = c - a;
    const mid = (a + c) / 2;
    if (w.normal === "x") b.box([t, y1 - y0, len], [at, (y0 + y1) / 2, mid], colour);
    else b.box([len, y1 - y0, t], [mid, (y0 + y1) / 2, at], colour);
  };
  const piece = (a: number, c: number, y0: number, y1: number) => {
    if (y1 - y0 < 1e-3 || c - a < 1e-3) return;
    let y = y0;
    for (const [upTo, colour] of w.bands) {
      const top = Math.min(y1, upTo);
      if (top > y + 1e-4) {
        box(a, c, y, top, thick, w.at, colour);
        y = top;
      }
      if (y >= y1 - 1e-4) break;
    }
    if (w.lining) {
      const from = Math.max(y0, w.liningFrom ?? -Infinity);
      if (y1 > from + 1e-3) box(a, c, from, y1, 0.012, w.at + w.inward * (WALL + 0.007), w.lining);
    }
  };
  const cuts = [...new Set([w.from, w.to, ...w.holes.flatMap((h) => [h.a, h.b])])].filter((c) => c >= w.from && c <= w.to).sort((p, q) => p - q);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i];
    const c = cuts[i + 1];
    const over = w.holes.filter((h) => h.a <= a + 1e-6 && h.b >= c - 1e-6).sort((p, q) => p.y0 - q.y0);
    let y = w.bottom;
    for (const h of over) {
      if (h.y0 > y) piece(a, c, y, h.y0);
      y = Math.max(y, h.y1);
    }
    if (y < w.top) piece(a, c, y, w.top);
  }
  for (const h of w.holes) if (h.frame) for (const y of [h.y0, h.y1]) box(h.a, h.b, y - 0.02, y + 0.02, thick + 0.03, w.at, FRAME);
}

/** A door leaf, its bottom at y0 and middle at zc, in a wall facing x: stainless, a window in its top half. */
function addLeaf(b: Builder, x: number, y0: number, zc: number, width: number, height: number, colour = STEEL) {
  b.box([0.03, height * 0.46, width], [x, y0 + height * 0.23, zc], colour);
  b.box([0.03, height * 0.08, width], [x, y0 + height * 0.96, zc], colour);
  for (const s of [-1, 1]) b.box([0.03, height * 0.46, 0.07], [x, y0 + height * 0.69, zc + s * (width / 2 - 0.035)], colour);
  b.box([0.035, 0.03, width - 0.14], [x, y0 + height * 0.46, zc], DARK);
}

function leafGeometry(width: number, height: number) {
  const b = new Builder();
  addLeaf(b, 0, 0, 0, width, height);
  return b.build();
}

function destination(text: string, sub: string) {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffb347";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(text, w / 2, 22);
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText(sub, w / 2, 48);
  });
}

/** A strap to hold, hanging from a rail. */
function strap(b: Builder, x: number, y: number, z: number) {
  b.box([0.012, 0.2, 0.03], [x, y - 0.1, z], "#e8e2d2");
  b.cylinder(0.05, 0.05, 0.02, [x, y - 0.25, z], "#f2efe6", [0, 0, Math.PI / 2], 10);
}

// --- seats inside --------------------------------------------------------------------------

interface RideSeat {
  seat: Seat;
  cabin: CabinSeat;
}

function rideSeats(cabin: Cabin, label: string): RideSeat[] {
  return cabin.seats.map((c) => ({ seat: { id: c.id, position: [0, 0, 0], rotationY: 0, label, moving: true }, cabin: c }));
}

/** A vehicle's frame now: from its own (x across, z along) to the world's. */
function frame(pose: Pose, turns: boolean) {
  const h = turns ? pose.heading : 0;
  const c = Math.cos(h);
  const s = Math.sin(h);
  return {
    h,
    // Its +x is to its left as it goes (three.js's rotation.y of h).
    world: (x: number, z: number): [number, number] => [pose.x + x * c + z * s, pose.z - x * s + z * c],
    local: (x: number, z: number): [number, number] => {
      const dx = x - pose.x;
      const dz = z - pose.z;
      return [dx * c - dz * s, dx * s + dz * c];
    },
  };
}

/** Puts each seat where its vehicle has it now. */
function placeSeats(seats: RideSeat[], pose: Pose, turns: boolean) {
  const f = frame(pose, turns);
  for (const { seat, cabin } of seats) {
    const [wx, wz] = f.world(cabin.x, cabin.z);
    seat.position[0] = wx;
    seat.position[1] = G + cabin.y;
    seat.position[2] = wz;
    // An avatar at yaw y faces (−sin y, −cos y); forward in the vehicle is (sin h, cos h).
    seat.rotationY = f.h + cabin.facing + Math.PI;
    seat.exit = f.world(cabin.exit[0], cabin.exit[1]);
  }
}

/** Moves a vehicle's collision with it: each block where it is now, its doors gone while they're open. */
function placeBlocks(slots: { block: Block; o: Obstacle }[], pose: Pose, turns: boolean) {
  const f = frame(pose, turns);
  const open = pose.doors > 0.6;
  for (const { block, o } of slots) {
    [o.x, o.z] = f.world(block.x, block.z);
    o.rotationY = f.h;
    o.disabled = !!block.door && open;
  }
}

const slotsOf = (cabin: Cabin) => cabin.blocks.map((block) => ({ block, o: { x: 0, z: 0, halfX: block.hx, halfZ: block.hz, rotationY: 0 } as Obstacle }));

/** A click target on a seat, inside its vehicle. */
function SeatSpot({ ride, sit }: { ride: RideSeat; sit?: (seat: Seat) => void }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);
  if (!sit) return null;
  return (
    <group position={[ride.cabin.x, ride.cabin.y, ride.cabin.z]}>
      {/* The click target: a box round the seat, easy to hit from any side, never drawn. */}
      <mesh
        position={[0, 0.6, 0]}
        visible={false}
        userData={{ navIgnore: true }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          sit(ride.seat);
        }}
      >
        <boxGeometry args={[0.5, 0.75, 0.5]} />
        <meshBasicMaterial />
      </mesh>
      {/* What shows: the round pad every seat in Seiza has (SeatPad.tsx), on the cushion. */}
      <mesh position={[0, 0.45 + 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={hover} raycast={noRaycast} userData={{ navIgnore: true }}>
        <circleGeometry args={[0.28, 24]} />
        <meshBasicMaterial color="#ffd9a0" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Who's riding along, sat in their seats, and the click targets on the rest. */
function Riders({ seats, sit }: { seats: RideSeat[]; sit?: (seat: Seat) => void }) {
  return (
    <>
      {seats.map((r) =>
        r.cabin.rider !== undefined ? (
          <Sitter key={r.seat.id} avatar={PASSENGERS[r.cabin.rider]} position={[r.cabin.x, r.cabin.y + 0.45 - SEAT_HEIGHT, r.cabin.z]} rotationY={r.cabin.facing + Math.PI} />
        ) : (
          <SeatSpot key={r.seat.id} ride={r} sit={sit} />
        )
      )}
    </>
  );
}

function useMaterials(board: () => THREE.Texture) {
  const m = useMemo(
    () => ({
      body: paint(),
      inside: paint(),
      door: paint(),
      glass: new THREE.MeshLambertMaterial({ color: "#a9c4cf", transparent: true, opacity: 0.22, depthWrite: false }),
      lit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      board: new THREE.MeshBasicMaterial({ map: board(), toneMapped: false }),
    }),
    []
  );
  useEffect(
    () => () => {
      for (const mat of Object.values(m)) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    },
    [m]
  );
  return m;
}

// --- the train -------------------------------------------------------------------------------

const TRAIN_TOP = 2.85;
const LINING = "#ece7da";

function buildTrain() {
  const body = new Builder();
  const glass = new Builder();
  const lit = new Builder();
  const inside = new Builder();
  const F = CAR.floor;
  const W = CAR.width;
  const side = W / 2 - WALL;
  const half = CAR.length / 2;
  const SILL = F + 0.85;
  const HEAD = F + 1.75;
  const DOOR_TOP = F + 1.95;
  const bands: Band[] = [
    [SILL - 0.14, LINE],
    [SILL - 0.05, STRIPE],
    [Infinity, SHELL],
  ];
  // Clear of where the doors slide into the wall (to 1.3 m either side of each).
  const windows: [number, number][] = [
    [-5.6, -4.4],
    [-1.62, -0.6],
    [-0.45, 0.45],
    [0.6, 1.62],
    [4.9, 5.75],
  ];
  for (const { cz, end } of CARS) {
    const zs = (a: number, b: number): [number, number] => {
      const p = cz + end * a;
      const q = cz + end * b;
      return [Math.min(p, q), Math.max(p, q)];
    };
    // Its sides: open windows down both, the doors' openings.
    for (const s of [-1, 1]) {
      const holes: Hole[] = [
        ...windows.map(([a, b]): Hole => {
          const [p, q] = zs(a, b);
          return { a: p, b: q, y0: SILL, y1: HEAD, frame: true };
        }),
        ...TRAIN_DOORS.map((dz): Hole => ({ a: cz + dz - TRAIN_DOOR_WIDTH / 2, b: cz + dz + TRAIN_DOOR_WIDTH / 2, y0: F, y1: DOOR_TOP })),
      ];
      wall(body, { normal: "x", at: s * side, inward: -s, from: cz - half, to: cz + half, bottom: 0.18, top: TRAIN_TOP, holes, bands, lining: LINING, liningFrom: F });
      // The sea side's doors stay shut (the platforms are all on the west).
      if (s > 0) for (const dz of TRAIN_DOORS) for (const l of [-1, 1]) addLeaf(body, side, F, cz + dz + (l * TRAIN_DOOR_WIDTH) / 4, TRAIN_DOOR_WIDTH / 2, DOOR_TOP - F);
      for (const dz of TRAIN_DOORS) inside.box([0.3, 0.006, TRAIN_DOOR_WIDTH], [s * (side - 0.17), F + 0.003, cz + dz], "#f2c42e");
    }
    // The cab's end: its windscreen, lights, a coupler.
    const ez = cz + end * (half - WALL);
    wall(body, { normal: "z", at: ez, inward: -end, from: -W / 2, to: W / 2, bottom: 0.18, top: TRAIN_TOP, holes: [{ a: -0.95, b: 0.95, y0: F + 0.95, y1: F + 1.9, frame: true }], bands });
    glass.box([1.9, 0.95, 0.02], [0, F + 1.425, ez + end * 0.01], "#ffffff");
    for (const x of [-0.75, 0.75]) lit.box([0.28, 0.12, 0.03], [x, F + 0.62, ez + end * 0.035], "#fff3d6");
    for (const x of [-0.95, 0.95]) lit.box([0.12, 0.1, 0.03], [x, F + 0.62, ez + end * 0.035], "#ff3b30");
    body.box([0.5, 0.18, 0.4], [0, 0.42, ez + end * 0.2], DARK);
    // The cab: a partition you can look over the driver's shoulder through.
    const pz = cz + end * CAB;
    wall(inside, { normal: "z", at: pz, inward: -end, from: -side, to: side, bottom: F, top: TRAIN_TOP, holes: [{ a: -0.75, b: 0.75, y0: F + 1.0, y1: F + 1.8, frame: true }], bands: [[Infinity, "#d9d4c8"]] });
    glass.box([1.5, 0.8, 0.015], [0, F + 1.4, pz], "#ffffff");
    inside.box([W - 0.3, 0.9, 0.45], [0, F + 0.45, ez - end * 0.3], "#3a3d42");
    inside.box([0.5, 0.45, 0.5], [-0.45, F + 0.225, ez - end * 1.05], "#3a3d42");
    // The gangway end: a way through to the other car.
    const gz = cz - end * (half - WALL);
    wall(body, { normal: "z", at: gz, inward: end, from: -W / 2, to: W / 2, bottom: 0.18, top: TRAIN_TOP, holes: [{ a: -GANGWAY, b: GANGWAY, y0: F, y1: F + 1.95 }], bands, lining: LINING, liningFrom: F });
    // Floor, roof, ceiling, the underframe and its two bogies.
    body.box([W, 0.17, CAR.length], [0, F - 0.105, cz], DARK);
    inside.box([W - 0.1, 0.03, CAR.length - 0.08], [0, F - 0.015, cz], "#9c8f7e");
    body.box([W + 0.04, 0.12, CAR.length + 0.02], [0, TRAIN_TOP + 0.06, cz], "#d6d8d6");
    body.box([W - 0.6, 0.12, CAR.length - 1.2], [0, TRAIN_TOP + 0.18, cz], "#c4c7c9");
    lit.box([W - 0.12, 0.02, CAR.length - 0.1], [0, TRAIN_TOP - 0.022, cz], "#d8d4c8");
    body.box([W - 0.4, 0.14, 6], [0, 0.26, cz], DARK);
    for (const bz of [-4.3, 4.3]) {
      for (const s of [-1, 1]) body.box([0.08, 0.16, 2.3], [s * 0.68, 0.28, cz + bz], "#3a3d42");
      body.box([1.3, 0.1, 0.3], [0, 0.3, cz + bz], "#3a3d42");
      for (const az of [-0.85, 0.85]) {
        for (const x of [-0.53, 0.53]) body.cylinder(0.24, 0.24, 0.1, [x, 0.24, cz + bz + az], "#1f2023", [0, 0, Math.PI / 2], 14);
        body.bar([-0.53, 0.24, cz + bz + az], [0.53, 0.24, cz + bz + az], 0.04, "#3a3d42");
      }
    }
    // The long seats, their backs, the poles by the doors, racks and straps, the lights, ads.
    for (const s of [-1, 1]) {
      BENCHES.forEach(([a, b], i) => {
        const [p, q] = zs(a, b);
        const len = q - p;
        const zc = (p + q) / 2;
        const colour = i === 2 ? "#8a5a9c" : "#2f6fd0";
        inside.box([0.38, 0.35, len], [s * 0.9, F + 0.175, zc], "#5f6670");
        inside.box([0.46, 0.1, len], [s * 0.87, F + 0.4, zc], colour);
        inside.box([0.08, 0.45, len], [s * 1.04, F + 0.7, zc], colour);
        for (const z of [p, q]) inside.bar([s * 0.62, F, z], [s * 0.62, TRAIN_TOP, z], 0.018, STEEL);
        inside.box([0.3, 0.02, len], [s * 0.93, F + 1.85, zc], STEEL);
      });
      inside.bar([s * 0.5, F + 2.0, cz - half + 0.6], [s * 0.5, F + 2.0, cz + half - 1.4], 0.015, STEEL);
      for (let z = cz - half + 0.9; z < cz + half - 1.5; z += 0.55) strap(inside, s * 0.5, F + 2.0, z);
      for (let i = 0; i < 4; i++) lit.box([0.14, 0.03, 2.1], [s * 0.42, TRAIN_TOP - 0.04, cz - half + 1.5 + i * 2.6], "#ffffff");
      for (let i = 0; i < 8; i++) inside.box([0.012, 0.22, 0.42], [s * (side - 0.03), F + 2.03, cz - half + 1.0 + i * 1.3], ["#ffe2a8", "#bfe3f5", "#f7c6c6", "#d6f0c2"][i % 4]);
    }
    // Ads hung over the aisle, as every Japanese train has.
    for (const dz of [-4.4, -1.4, 1.4]) inside.box([0.55, 0.36, 0.006], [0, F + 2.0, cz + end * dz], ["#fff4d6", "#e4f1fb", "#fde3e3"][Math.abs(Math.round(dz)) % 3]);
  }
  // The gangway between the cars: a walkway with bellows round it.
  for (const s of [-1, 1]) body.box([0.04, 2.0, CAR.gap + 0.1], [s * (GANGWAY + 0.04), F + 1.0, 0], DARK);
  body.box([GANGWAY * 2 + 0.12, 0.06, CAR.gap + 0.1], [0, F + 2.0, 0], DARK);
  inside.box([GANGWAY * 2, 0.03, CAR.gap + 0.12], [0, F - 0.015, 0], "#6b6f78");
  // A pantograph on the first car's roof, up to the wire.
  const pz = CARS[0].cz - 2;
  body.box([1.2, 0.08, 0.8], [0, TRAIN_TOP + 0.28, pz], "#3a3d42");
  body.bar([-0.4, TRAIN_TOP + 0.32, pz], [0, TRAIN_TOP + 0.8, pz + 0.2], 0.02, "#3a3d42");
  body.bar([0.4, TRAIN_TOP + 0.32, pz], [0, TRAIN_TOP + 0.8, pz + 0.2], 0.02, "#3a3d42");
  body.box([1.1, 0.04, 0.08], [0, TRAIN_TOP + 0.82, pz + 0.2], "#3a3d42");
  return { body: body.build(), glass: glass.build(), lit: lit.build(), inside: inside.build() };
}

function Train({ sit, seats }: { sit?: (seat: Seat) => void; seats: RideSeat[] }) {
  const group = useRef<THREE.Group>(null);
  const doorsW = useRef<THREE.Group>(null);
  const geometry = useMemo(buildTrain, []);
  const m = useMaterials(() => destination("しおかぜ線", "Shiokaze Line"));
  const doorGeometry = useMemo(() => leafGeometry(TRAIN_DOOR_WIDTH / 2, 1.95), []);
  useEffect(
    () => () => {
      for (const g of [...Object.values(geometry), doorGeometry]) g.dispose();
    },
    [geometry, doorGeometry]
  );
  // The doors on the platforms' side, each a pair of leaves that slide apart into the wall.
  const doors = useMemo(() => {
    const list: [number, number][] = [];
    for (const { cz } of CARS) for (const dz of TRAIN_DOORS) for (const leaf of [-1, 1]) list.push([cz + dz, leaf]);
    return list;
  }, []);
  useFrame(() => {
    const pose = trainAt(clock());
    if (group.current) group.current.position.set(pose.x, G, pose.z);
    doorsW.current?.children.forEach((d, i) => {
      const [z, leaf] = doors[i];
      d.position.z = z + leaf * (TRAIN_DOOR_WIDTH / 4 + 0.64 * pose.doors);
    });
  });
  return (
    <group ref={group}>
      <mesh geometry={geometry.body} material={m.body} castShadow />
      <mesh geometry={geometry.inside} material={m.inside} />
      <mesh geometry={geometry.glass} material={m.glass} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.lit} material={m.lit} raycast={noRaycast} userData={{ navIgnore: true }} />
      <group ref={doorsW}>
        {doors.map(([z], i) => (
          <mesh key={i} geometry={doorGeometry} material={m.door} position={[-(CAR.width / 2 - WALL), CAR.floor, z]} raycast={noRaycast} />
        ))}
      </group>
      {[1, -1].map((end) => (
        <mesh key={end} position={[0, TRAIN_TOP - 0.2, end * (TRAIN_LENGTH / 2 + 0.01)]} rotation={[0, end > 0 ? 0 : Math.PI, 0]} material={m.board} raycast={noRaycast} userData={{ navIgnore: true }}>
          <planeGeometry args={[0.8, 0.2]} />
        </mesh>
      ))}
      {/* The drivers, one in each cab, facing their way. */}
      {CARS.map(({ cz, end }) => (
        <Sitter key={end} avatar={DRIVER} position={[-0.45, CAR.floor + 0.45 - SEAT_HEIGHT, cz + end * (CAR.length / 2 - 1.05)]} rotationY={end > 0 ? Math.PI : 0} />
      ))}
      <Riders seats={seats} sit={sit} />
    </group>
  );
}

// --- the buses ---------------------------------------------------------------------------------

/** A bus line: where its bus is (its timetable), its colours and board, its stops' names. */
interface BusLine {
  id: string;
  poseAt: (seconds: number) => Pose;
  livery: string;
  board: [string, string];
  stopName: (id: string) => [string, string] | null;
}

/** The coast bus, up and down the coast road; and the community bus, round Nishi-machi's ring. */
const BUS_LINES: BusLine[] = [
  { id: "bus", poseAt: busAt, livery: TEAL, board: ["海岸通り経由 山の前", "Kaigan-dōri · Yamanomae"], stopName: (id) => (id === "kaigan-dori" ? ["海岸通り", "Kaigan-dori"] : null) },
  {
    id: "loopbus",
    poseAt: timeline(loopLegs()),
    livery: "#f2994a",
    board: ["西町循環", "Nishi-machi loop"],
    stopName: (id) => {
      const stop = LOOP_STOPS.find((x) => x.id === id);
      return stop ? [stop.ja, stop.en] : null;
    },
  },
];

const BUS_TOP = 2.85;

function buildBus(seats: RideSeat[], livery: string) {
  const body = new Builder();
  const glass = new Builder();
  const lit = new Builder();
  const inside = new Builder();
  const F = BUS.floor;
  const W = BUS.width;
  const L = BUS.length;
  const half = L / 2;
  const side = W / 2 - WALL;
  const SILL = 1.15;
  const HEAD = 2.3;
  const bands: Band[] = [
    [0.98, livery],
    [1.06, STRIPE],
    [Infinity, SHELL],
  ];
  const arches = BUS_WHEELS.map((wz): Hole => ({ a: wz - 0.55, b: wz + 0.55, y0: 0, y1: 0.92 }));
  // The driver's side: windows the length of it, the driver's own at the front.
  const right: [number, number][] = [
    [2.6, 4.1],
    [1.55, 2.45],
    [0.45, 1.4],
    [-0.65, 0.3],
    [-1.75, -0.8],
    [-2.85, -1.9],
    [-4.1, -3.0],
  ];
  // The kerb's: its two doors, windows between and behind.
  const left: [number, number][] = [
    [2.0, 2.75],
    [1.15, 1.9],
    [-1.25, -0.32],
    [-2.35, -1.37],
    [-3.45, -2.47],
    [-4.15, -3.57],
  ];
  const win = ([a, b]: [number, number]): Hole => ({ a, b, y0: SILL, y1: HEAD, frame: true });
  wall(body, { normal: "x", at: -side, inward: 1, from: -half, to: half, bottom: 0.22, top: BUS_TOP, holes: [...right.map(win), ...arches], bands, lining: "#e9ebe6", liningFrom: F });
  wall(body, {
    normal: "x",
    at: side,
    inward: -1,
    from: -half,
    to: half,
    bottom: 0.22,
    top: BUS_TOP,
    holes: [...left.map(win), ...arches, ...BUS_DOORS.map(([a, b]): Hole => ({ a, b, y0: 0.22, y1: 2.35 }))],
    bands,
    lining: "#e9ebe6",
    liningFrom: F,
  });
  // Front: the big windscreen, headlights, the bumper, mirrors. Back: a window, tail lights.
  wall(body, { normal: "z", at: half - WALL, inward: -1, from: -W / 2, to: W / 2, bottom: 0.22, top: BUS_TOP, holes: [{ a: -1.02, b: 1.02, y0: 1.0, y1: 2.45, frame: true }], bands });
  glass.box([2.04, 1.45, 0.02], [0, 1.725, half - WALL + 0.01], "#ffffff");
  wall(body, { normal: "z", at: -(half - WALL), inward: 1, from: -W / 2, to: W / 2, bottom: 0.22, top: BUS_TOP, holes: [{ a: -0.8, b: 0.8, y0: 1.6, y1: 2.3, frame: true }], bands, lining: "#e9ebe6", liningFrom: F });
  glass.box([1.6, 0.7, 0.02], [0, 1.95, -(half - WALL) - 0.01], "#ffffff");
  for (const x of [-0.85, 0.85]) lit.box([0.3, 0.14, 0.03], [x, 0.7, half + 0.01], "#fff3d6");
  for (const x of [-0.95, 0.95]) lit.box([0.2, 0.3, 0.03], [x, 0.85, -half - 0.01], "#ff3b30");
  for (const s of [-1, 1]) body.box([W + 0.04, 0.22, 0.12], [0, 0.36, s * (half + 0.04)], DARK);
  for (const s of [-1, 1]) {
    body.bar([s * (W / 2), 2.4, half - 0.1], [s * (W / 2 + 0.25), 2.3, half + 0.35], 0.02, DARK);
    body.box([0.06, 0.32, 0.2], [s * (W / 2 + 0.25), 2.05, half + 0.35], DARK);
  }
  // Wheels in their arches; inside, each is a hump.
  for (const wz of BUS_WHEELS)
    for (const s of [-1, 1]) {
      body.cylinder(0.42, 0.42, 0.28, [s * 1.0, 0.42, wz], "#1f2023", [0, 0, Math.PI / 2], 18);
      body.cylinder(0.2, 0.2, 0.3, [s * 1.0, 0.42, wz], "#b9bcc0", [0, 0, Math.PI / 2], 12);
      body.box([0.34, 0.04, 1.1], [s * 0.97, 0.92, wz], DARK);
      inside.box([0.6, 0.85 - F, 0.98], [s * 0.82, (0.85 + F) / 2, wz], "#5a5e66");
    }
  // Floor, the step up to the back row, roof and its air conditioner, ceiling.
  body.box([W, 0.13, L], [0, F - 0.08, 0], DARK);
  body.box([W - 0.4, 0.12, L - 1], [0, 0.2, 0], DARK);
  inside.box([W - 0.1, 0.02, L - 0.1], [0, F - 0.01, 0], "#6b6f78");
  inside.box([W - 0.12, 0.1, 0.9], [0, F + 0.05, -3.95], "#6b6f78");
  for (const [a, b] of BUS_DOORS) inside.box([0.28, 0.006, b - a], [side - 0.16, F + 0.003, (a + b) / 2], "#f2c42e");
  body.box([W + 0.04, 0.12, L + 0.02], [0, BUS_TOP + 0.06, 0], "#e7e8e4");
  body.box([W - 0.5, 0.26, 2.6], [0, BUS_TOP + 0.25, -1.0], "#d6d8d6");
  lit.box([W - 0.12, 0.02, L - 0.1], [0, BUS_TOP - 0.022, 0], "#d6d8d2");
  lit.box([0.12, 0.03, L - 1.6], [0.45, BUS_TOP - 0.04, -0.4], "#ffffff");
  lit.box([0.12, 0.03, L - 1.6], [-0.45, BUS_TOP - 0.04, -0.4], "#ffffff");
  // The driver's corner: a seat, the wheel, the dash, the fare box by the front door.
  inside.box([0.06, 1.1, 2 * BUS_DRIVER.hz - 0.1], [BUS_DRIVER.x + BUS_DRIVER.hx, F + 0.55, BUS_DRIVER.z], "#3a3d42");
  inside.box([0.5, 0.45, 0.5], [BUS_DRIVER.x, F + 0.225, 3.3], "#3a3d42");
  inside.box([1.2, 0.55, 0.45], [-0.5, F + 0.75, half - 0.32], "#2b2d30");
  inside.cylinder(0.22, 0.22, 0.04, [BUS_DRIVER.x, F + 1.0, 3.8], "#1f2023", [0.9, 0, 0], 16);
  inside.box([0.28, 1.0, 0.3], [-0.46, F + 0.5, 2.62], "#4a5a6e");
  lit.box([0.18, 0.08, 0.01], [-0.46, F + 0.85, 2.46], "#7fe08a");
  // Seats, a hand-rail on each back, poles with stop buttons, rails overhead.
  for (const { cabin } of seats) {
    const y = cabin.y;
    const colour = cabin.z > 1 ? "#c8572f" : "#3a5fa8";
    if (y <= F + 0.11) inside.box([0.3, 0.35, 0.3], [cabin.x, y + 0.175, cabin.z], "#5f6670");
    inside.box([0.46, 0.1, 0.46], [cabin.x, y + 0.4, cabin.z], colour);
    inside.box([0.46, 0.55, 0.07], [cabin.x, y + 0.72, cabin.z - 0.22], colour);
    inside.bar([cabin.x - 0.16, y + 1.02, cabin.z - 0.2], [cabin.x + 0.16, y + 1.02, cabin.z - 0.2], 0.015, STEEL);
  }
  for (const [x, z] of [
    [0.55, 1.85],
    [-0.55, 1.85],
    [0.55, -0.1],
    [-0.55, -0.85],
    [0.55, -2.1],
    [-0.55, -2.1],
  ]) {
    inside.bar([x, F, z], [x, BUS_TOP, z], 0.018, STEEL);
    inside.box([0.06, 0.08, 0.05], [x, F + 1.3, z], "#e8b04a");
  }
  for (const s of [-1, 1]) {
    inside.bar([s * 0.5, 2.15, -3.4], [s * 0.5, 2.15, 2.4], 0.015, STEEL);
    for (let z = -3.1; z < 2.3; z += 0.6) strap(inside, s * 0.5, 2.15, z);
  }
  // The fare chart up front.
  lit.box([0.9, 0.3, 0.01], [0.2, 2.6, half - 0.08], "#ffcf5a");
  return { body: body.build(), glass: glass.build(), lit: lit.build(), inside: inside.build() };
}

function Bus({ sit, seats, line }: { sit?: (seat: Seat) => void; seats: RideSeat[]; line: BusLine }) {
  const group = useRef<THREE.Group>(null);
  const front = useRef<THREE.Mesh>(null);
  const middle = useRef<(THREE.Mesh | null)[]>([]);
  const geometry = useMemo(() => buildBus(seats, line.livery), [seats, line]);
  const m = useMaterials(() => destination(line.board[0], line.board[1]));
  const [frontDoor, middleDoor] = BUS_DOORS;
  const frontLeaf = useMemo(() => leafGeometry(frontDoor[1] - frontDoor[0], 2.1), [frontDoor]);
  const middleLeaf = useMemo(() => leafGeometry((middleDoor[1] - middleDoor[0]) / 2, 2.1), [middleDoor]);
  useEffect(
    () => () => {
      for (const g of [...Object.values(geometry), frontLeaf, middleLeaf]) g.dispose();
    },
    [geometry, frontLeaf, middleLeaf]
  );
  useFrame(() => {
    const pose = line.poseAt(clock());
    if (group.current) {
      group.current.position.set(pose.x, G, pose.z);
      group.current.rotation.y = pose.heading;
    }
    // The front door slides back along the side; the middle's leaves part.
    if (front.current) front.current.position.z = (frontDoor[0] + frontDoor[1]) / 2 - 1.15 * pose.doors;
    const mz = (middleDoor[0] + middleDoor[1]) / 2;
    const w = (middleDoor[1] - middleDoor[0]) / 2;
    middle.current.forEach((d, i) => d && (d.position.z = mz + (i ? 1 : -1) * (w / 2 + 0.6 * pose.doors)));
  });
  const x = BUS.width / 2 - WALL;
  return (
    <group ref={group}>
      <mesh geometry={geometry.body} material={m.body} castShadow />
      <mesh geometry={geometry.inside} material={m.inside} />
      <mesh geometry={geometry.glass} material={m.glass} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.lit} material={m.lit} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh ref={front} geometry={frontLeaf} material={m.door} position={[x, 0.25, 0]} raycast={noRaycast} />
      {[0, 1].map((i) => (
        <mesh key={i} ref={(d) => void (middle.current[i] = d)} geometry={middleLeaf} material={m.door} position={[x, 0.25, 0]} raycast={noRaycast} />
      ))}
      <mesh position={[0, 2.62, BUS.length / 2 + 0.015]} material={m.board} raycast={noRaycast} userData={{ navIgnore: true }}>
        <planeGeometry args={[1.5, 0.32]} />
      </mesh>
      <Sitter avatar={DRIVER} position={[BUS_DRIVER.x, BUS.floor + 0.45 - SEAT_HEIGHT, 3.3]} rotationY={Math.PI} />
      <Riders seats={seats} sit={sit} />
    </group>
  );
}

// --- the level crossing -------------------------------------------------------------------------

/** On while a train is over the crossing, or will be within a few seconds. */
export function crossingOn(now: number) {
  const span = (p: Pose) => [p.z - TRAIN_LENGTH / 2, p.z + TRAIN_LENGTH / 2];
  const near = (p: Pose) => {
    const [a, b] = span(p);
    return b > CROSSING.z0 - 3 && a < CROSSING.z1 + 3;
  };
  return near(trainAt(now)) || near(trainAt(now + 6));
}

/** Its two signals, on opposite corners: the crossbuck, two red lamps that
 *  flash by turns, the bell, and a barrier arm that comes down across the street. */
function Crossing() {
  const arms = useRef<(THREE.Group | null)[]>([]);
  const lamps = useMemo(() => [0, 1].map(() => new THREE.MeshBasicMaterial({ color: "#3a0b0b", toneMapped: false })), []);
  const geometry = useMemo(() => {
    const b = new Builder();
    for (const [x, z] of [
      [TRACK.bed0 - 0.25, CROSSING.z0 - 0.3],
      [TRACK.bed1 + 0.12, CROSSING.z1 + 0.3],
    ] as [number, number][]) {
      for (let i = 0; i < 6; i++) b.box([0.1, 0.5, 0.1], [x, G + 0.25 + i * 0.5, z], i % 2 ? "#f2c42e" : "#1f1f1f");
      for (const r of [0.7, -0.7]) b.box([0.04, 0.12, 0.9], [x, G + 3.2, z], "#f2c42e", [r, 0, 0]);
      b.box([0.08, 0.32, 0.7], [x, G + 2.65, z], "#1f1f1f");
      b.box([0.2, 0.3, 0.2], [x, G + 3.55, z], "#3a3d42");
    }
    return b.build();
  }, []);
  const body = useMemo(() => paint(), []);
  const armMaterial = useMemo(() => new THREE.MeshLambertMaterial({ color: "#f2c42e" }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      body.dispose();
      armMaterial.dispose();
      for (const l of lamps) l.dispose();
    },
    [geometry, body, armMaterial, lamps]
  );
  const down = useRef(0);
  const ring = useRef({ next: 0, high: false, was: false });
  useFrame(({ camera }, delta) => {
    const now = clock();
    const on = crossingOn(now);
    down.current += ((on ? 1 : 0) - down.current) * (1 - Math.exp(-2.2 * delta));
    // Raised, the arm stands up from its pivot; lowered, it lies across the street.
    arms.current.forEach((a) => a && (a.rotation.x = -(Math.PI / 2) * (1 - down.current) * (a.userData.dir as number)));
    const flash = on && Math.floor(now * 2.4) % 2 === 0;
    lamps[0].color.set(on && flash ? "#ff2a1a" : "#3a0b0b");
    lamps[1].color.set(on && !flash ? "#ff2a1a" : "#3a0b0b");
    const r = ring.current;
    if (on && performance.now() > r.next) {
      r.next = performance.now() + 420;
      r.high = !r.high;
      const at = new THREE.Vector3(TRACK.x, G + 2, (CROSSING.z0 + CROSSING.z1) / 2);
      crossingBell(camera.getWorldPosition(new THREE.Vector3()).distanceTo(at), r.high);
    }
  });
  return (
    <group>
      <mesh geometry={geometry} material={body} castShadow />
      {[
        [TRACK.bed0 - 0.25, CROSSING.z0 - 0.3, 1],
        [TRACK.bed1 + 0.12, CROSSING.z1 + 0.3, -1],
      ].map(([x, z, s], i) => (
        <group key={i}>
          {[-0.2, 0.2].map((dz, k) => (
            <mesh key={k} position={[x - s * 0.06, G + 2.65, z + dz]} rotation={[0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0]} material={lamps[k]} raycast={noRaycast}>
              <circleGeometry args={[0.11, 14]} />
            </mesh>
          ))}
          {/* The arm, pivoting at the signal: up, or across the street. */}
          <group
            ref={(g) => {
              arms.current[i] = g;
              if (g) g.userData.dir = s;
            }}
            position={[x + (s > 0 ? 0.15 : -0.15), G + 1.0, z]}
          >
            <mesh position={[0, 0, (s * 3.2) / 2]} material={armMaterial} raycast={noRaycast} userData={{ navIgnore: true }}>
              <boxGeometry args={[0.06, 0.08, 3.2]} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// --- all of it, and what it does ---------------------------------------------------------------

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The bus, the train, and the crossing; their sounds from where you are;
 * the announcements when they stop; their collision and floors, merged
 * with the town's own (handed in as `fixed` and `floors`); and carrying
 * whoever stands inside.
 */
export function Transit({ sit, fixed, floors }: { sit?: (seat: Seat) => void; fixed: Obstacle[]; floors: WorldFloor[] }) {
  const trainRoom = useMemo(trainCabin, []);
  const train = useMemo(() => rideSeats(trainRoom, "Train seat"), [trainRoom]);
  // Each bus its own seats (the coast bus's ids as they always were).
  const buses = useMemo(
    () =>
      BUS_LINES.map((line) => {
        const room = busCabin();
        const seats = rideSeats(room, "Bus seat");
        if (line.id !== "bus") for (const r of seats) r.seat.id = r.seat.id.replace("seishore-bus", `seishore-${line.id}`);
        return { line, room, seats };
      }),
    []
  );
  const state = useRef({
    trainStop: null as string | null,
    busStops: new Map<string, string | null>(),
    busClosing: new Set<string>(),
    trainClosing: false,
    joints: new Map<number, number>(),
    diesel: null as Loop | null,
    motor: null as Loop | null,
  });

  // Everything that moves with them, made once and moved in place each frame.
  const live = useMemo(() => {
    const trainSlots = slotsOf(trainRoom);
    const rideBuses = buses.map((b) => ({ ...b, slots: slotsOf(b.room), pose: b.line.poseAt(clock()), before: b.line.poseAt(clock()) }));
    const barriers: Obstacle[] = [TRACK.bed0 - 0.1, TRACK.bed1 - 0.03].map((x) => ({ x, z: (CROSSING.z0 + CROSSING.z1) / 2, halfX: 0.08, halfZ: (CROSSING.z1 - CROSSING.z0) / 2 + 0.1, rotationY: 0, disabled: true }));
    const obstacles = [...fixed, ...trainSlots.map((s) => s.o), ...rideBuses.flatMap((b) => b.slots.map((s) => s.o)), ...barriers];
    const trainFloor: WorldFloor = { rect: { minX: TRACK.x - CAR.width / 2, maxX: TRACK.x + CAR.width / 2, minZ: 0, maxZ: 0 }, height: G + CAR.floor };
    const now = { at: -1, t: trainAt(clock()) };
    const insideBus = (x: number, z: number, pose: Pose) => {
      const [lx, lz] = frame(pose, true).local(x, z);
      return Math.abs(lx) <= BUS.width / 2 && Math.abs(lz) <= BUS.length / 2;
    };
    const busFloors: WorldFloor[] = rideBuses.map((b) => ({ rect: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, height: G + BUS.floor, holds: (x: number, z: number) => insideBus(x, z, b.pose) }));
    const allFloors = [...busFloors, trainFloor, ...floors];
    /** Brings it all to this moment (once a moment, however many ask). */
    const sync = (at: number) => {
      if (at === now.at) return;
      now.at = at;
      now.t = trainAt(at);
      placeBlocks(trainSlots, now.t, false);
      const r = Math.hypot(BUS.width, BUS.length) / 2;
      rideBuses.forEach((b, i) => {
        b.pose = b.line.poseAt(at);
        placeBlocks(b.slots, b.pose, true);
        Object.assign(busFloors[i].rect, { minX: b.pose.x - r, maxX: b.pose.x + r, minZ: b.pose.z - r, maxZ: b.pose.z + r });
        placeSeats(b.seats, b.pose, true);
      });
      const down = crossingOn(at);
      for (const o of barriers) o.disabled = !down;
      trainFloor.rect.minZ = now.t.z - TRAIN_LENGTH / 2;
      trainFloor.rect.maxZ = now.t.z + TRAIN_LENGTH / 2;
      placeSeats(train, now.t, false);
    };
    // Carrying: where a point standing in one was when last asked, to where
    // that same spot in it is now.
    let lastTrain = now.t;
    let asked = false;
    const remember = () => {
      lastTrain = now.t;
      for (const b of rideBuses) b.before = b.pose;
    };
    const carry = (x: number, z: number) => {
      sync(clock());
      const rides: [Pose, Pose, number, number, boolean][] = [
        ...rideBuses.map((b): [Pose, Pose, number, number, boolean] => [b.before, b.pose, BUS.width, BUS.length, true]),
        [lastTrain, now.t, CAR.width, TRAIN_LENGTH, false],
      ];
      remember();
      asked = true;
      for (const [p0, p1, width, length, turns] of rides) {
        const f0 = frame(p0, turns);
        const [lx, lz] = f0.local(x, z);
        if (Math.abs(lx) > width / 2 + 0.02 || Math.abs(lz) > length / 2 + 0.02) continue;
        const f1 = frame(p1, turns);
        const [wx, wz] = f1.world(lx, lz);
        return { x: wx, z: wz, turn: wrap(f1.h - f0.h) };
      }
      return null;
    };
    /** Each frame: if no one asked to be carried, start from here next time. */
    const settle = () => {
      if (!asked) remember();
      asked = false;
    };
    return { obstacles, allFloors, sync, carry, settle, now, rideBuses };
  }, [fixed, floors, trainRoom, train, buses]);

  useEffect(() => {
    live.sync(clock());
    setWorldObstacles(live.obstacles);
    setWorldFloors(live.allFloors);
    return () => {
      state.current.diesel?.stop();
      state.current.motor?.stop();
      setPlatformCarry(null);
      // Only hand back what's still ours: leaving the world clears it first.
      if (getWorldObstacles() === live.obstacles) setWorldObstacles(fixed);
      if (getWorldFloors() === live.allFloors) setWorldFloors(floors);
    };
  }, [live, fixed, floors]);

  const ear = useMemo(() => new THREE.Vector3(), []);
  const stamp = useRef(0);
  useFrame(({ camera }) => {
    const now = clock();
    live.sync(now);
    live.settle();
    setPlatformCarry(live.carry, ++stamp.current);
    const s = state.current;
    const t = live.now.t;
    camera.getWorldPosition(ear);
    const toTrain = Math.hypot(ear.x - t.x, Math.max(0, Math.abs(ear.z - t.z) - TRAIN_LENGTH / 2));
    // The nearer bus's engine (one engine sound for whichever it is).
    let b = live.rideBuses[0].pose;
    let toBus = Infinity;
    for (const ride of live.rideBuses) {
      const d = Math.hypot(ear.x - ride.pose.x, ear.z - ride.pose.z);
      if (d < toBus) {
        toBus = d;
        b = ride.pose;
      }
    }
    // Their engines, near enough to hear.
    if (toBus < 45) {
      s.diesel ??= startDiesel();
      s.diesel?.set(1 - toBus / 45, Math.min(1, b.speed / 9));
    } else if (s.diesel) {
      s.diesel.stop();
      s.diesel = null;
    }
    if (toTrain < 60 && t.speed > 0.3) {
      s.motor ??= startMotor();
      s.motor?.set(1 - toTrain / 60, Math.min(1, t.speed / 10));
    } else if (s.motor) {
      s.motor.set(0);
      if (t.speed <= 0.3) {
        s.motor.stop();
        s.motor = null;
      }
    }
    // Its wheels over the rail joints, every 20 m: eight axles each.
    if (t.speed > 0.5 && toTrain < 60) {
      const axles = [-9.35, -7.25, -2.95, -0.85, 0.85, 2.95, 7.25, 9.35].map((a) => t.z + a * (CAR.length / 12));
      axles.forEach((z, i) => {
        const joint = Math.floor(z / 20);
        if (s.joints.get(i) !== joint) {
          if (s.joints.has(i)) railJoint(Math.hypot(ear.x - TRACK.x, ear.z - z), t.speed);
          s.joints.set(i, joint);
        }
      });
    }
    // Arriving: the doors' chime and the announcement, in both languages.
    if (t.stop !== s.trainStop) {
      if (t.stop && toTrain < 40) {
        const st = STATIONS.find((x) => x.id === t.stop)!;
        trainDoors(toTrain, true);
        const v = 1 - toTrain / 45;
        speak(`${st.nameJa}、${st.nameJa}です。お降りの際は、足元にご注意ください。`, "ja-JP", { volume: v, rate: 1.05 });
        speak(`${st.name}. ${st.name}. Please mind your step.`, "en-US", { volume: v });
      }
      s.trainStop = t.stop;
      s.trainClosing = false;
    }
    if (t.stop && t.departsIn < 4.5 && !s.trainClosing) {
      s.trainClosing = true;
      if (toTrain < 40) {
        trainDoors(toTrain, false);
        speak("ドアが閉まります。ご注意ください。", "ja-JP", { volume: 1 - toTrain / 45, rate: 1.1 });
        speak("The doors are closing. Please stand clear.", "en-US", { volume: 1 - toTrain / 45 });
      }
    }
    for (const ride of live.rideBuses) {
      const stop = ride.pose.stop;
      // Pulling out: "the bus is leaving, please hold on", as Japanese buses say.
      if (stop && ride.pose.departsIn < 3.5 && !s.busClosing.has(ride.line.id)) {
        s.busClosing.add(ride.line.id);
        const d = Math.hypot(ear.x - ride.pose.x, ear.z - ride.pose.z);
        if (d < 30) {
          speak("発車します。ご注意ください。", "ja-JP", { volume: 1 - d / 35, rate: 1.08 });
          speak("The bus is leaving. Please hold on.", "en-US", { volume: 1 - d / 35 });
        }
      }
      if (stop === (s.busStops.get(ride.line.id) ?? null)) continue;
      s.busClosing.delete(ride.line.id);
      const d = Math.hypot(ear.x - ride.pose.x, ear.z - ride.pose.z);
      const name = stop ? ride.line.stopName(stop) : null;
      if (name && d < 40) {
        busDoors(d);
        const v = 1 - d / 45;
        speak(`お待たせいたしました。${name[0]}です。お降りの際は、足元にご注意ください。`, "ja-JP", { volume: v, rate: 1.05 });
        speak(`${name[1]}. Thank you for waiting. Please mind your step.`, "en-US", { volume: v });
      }
      s.busStops.set(ride.line.id, stop);
    }
  });
  return (
    <>
      <Train sit={sit} seats={train} />
      {buses.map((b) => (
        <Bus key={b.line.id} sit={sit} seats={b.seats} line={b.line} />
      ))}
      <Crossing />
    </>
  );
}
