// Seishore's bus and train, drawn where the timetable (vehicles.ts) puts
// them: the train's two cars with their drivers and passengers, the bus
// with its, the level crossing's lights, bell, and barriers, and the seats
// inside you can ride in. Each seat moves with its vehicle (a moving Seat,
// as a ride's back seat is), so sitting in one takes you along.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SEAT_HEIGHT, setWorldObstacles, type Obstacle, type Seat } from "../../../src/scene/layout";
import { speak } from "../../../src/guides/speech";
import { Builder, canvasTexture, FONT, noRaycast, paint } from "../../seisugbo/client/kit";
import { CROSSING, G, STATIONS, TRACK } from "./plan";
import { DRIVER, PASSENGERS } from "./people";
import { busAt, BUS, CAR, clock, trainAt, TRAIN_LENGTH, type Pose } from "./vehicles";
import { busDoors, crossingBell, railJoint, startDiesel, startMotor, trainDoors, type Loop } from "./sounds";
import { Sitter } from "./Extras";

const LINE = "#1c6f86";
const STRIPE = "#ff9e7a";
const SHELL = "#f4f4f0";

// --- seats inside --------------------------------------------------------------------------

interface RideSeat {
  seat: Seat;
  /** Where it is in the vehicle (x right, z forward), and which way it faces (0: forward). */
  local: [number, number, number];
  facing: number;
  /** Where getting up leaves you, in the vehicle's frame: by a door, on the platform's side. */
  exit: [number, number];
}

function trainSeats(): RideSeat[] {
  const seats: RideSeat[] = [];
  const y = CAR.floor + 0.45 - SEAT_HEIGHT;
  for (const [car, cz] of [
    [0, CAR.length / 2 + CAR.gap / 2],
    [1, -(CAR.length / 2 + CAR.gap / 2)],
  ] as [number, number][])
    for (const side of [-1, 1])
      for (const dz of [-4.6, -1.2, 0, 1.2, 4.6]) {
        const id = `seishore-train-${car}-${side < 0 ? "w" : "e"}-${dz}`;
        seats.push({
          seat: { id, position: [0, 0, 0], rotationY: 0, label: "Train seat", moving: true },
          local: [side * 0.88, y, cz + dz],
          facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          exit: [-1.75, cz + (dz < 0 ? -3 : 3)],
        });
      }
  return seats;
}

function busSeats(): RideSeat[] {
  const seats: RideSeat[] = [];
  const y = BUS.floor + 0.45 - SEAT_HEIGHT;
  for (const [x, z] of [
    [0.55, 1.4],
    [0.55, 0.1],
    [0.55, -1.2],
    [0.55, -2.5],
    [-0.55, 0.1],
    [-0.55, -1.2],
    [-0.55, -2.5],
  ] as [number, number][])
    seats.push({ seat: { id: `seishore-bus-${x > 0 ? "l" : "r"}-${z}`, position: [0, 0, 0], rotationY: 0, label: "Bus seat", moving: true }, local: [x, y, z], facing: 0, exit: [1.75, 2.9] });
  return seats;
}

/** Puts each seat where its vehicle has it now. */
function placeSeats(seats: RideSeat[], pose: Pose, floor: number, turns: boolean) {
  const h = turns ? pose.heading : 0;
  const c = Math.cos(h);
  const s = Math.sin(h);
  // Local x is to the right of forward (+z), so (x, z) turns to (x c + z s, −x s + z c).
  const world = (x: number, z: number): [number, number] => [pose.x + x * c + z * s, pose.z - x * s + z * c];
  for (const r of seats) {
    const [wx, wz] = world(r.local[0], r.local[2]);
    r.seat.position[0] = wx;
    r.seat.position[1] = floor + r.local[1];
    r.seat.position[2] = wz;
    // An avatar at yaw y faces (−sin y, −cos y); forward in the vehicle is (sin h, cos h).
    r.seat.rotationY = h + r.facing + Math.PI;
    const [ex, ez] = world(r.exit[0], r.exit[1]);
    r.seat.exit = [ex, ez];
  }
}

/** A click target on a seat, inside its vehicle. */
function SeatSpot({ ride, sit, y }: { ride: RideSeat; sit?: (seat: Seat) => void; y: number }) {
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
    <mesh
      position={[ride.local[0], y, ride.local[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={hover}
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
      <circleGeometry args={[0.24, 16]} />
      <meshBasicMaterial color="#7fd3e6" transparent opacity={0.6} depthWrite={false} />
    </mesh>
  );
}

// --- the train -------------------------------------------------------------------------------

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

function buildCar(b: Builder, glass: Builder, lit: Builder, inside: Builder, cz: number, end: 1 | -1) {
  const L = CAR.length;
  const W = CAR.width;
  const z0 = cz - L / 2;
  // Underframe and bogies.
  b.box([W - 0.3, 0.45, L - 1.2], [0, 0.55, cz], "#2b2d30");
  for (const bz of [-4.3, 4.3]) {
    b.box([W - 0.5, 0.35, 2.6], [0, 0.4, cz + bz], "#3a3d42");
    for (const az of [-1.05, 1.05]) for (const x of [-0.6, 0.6]) b.cylinder(0.36, 0.36, 0.12, [x, 0.42, cz + bz + az], "#1f2023", [0, 0, Math.PI / 2], 14);
  }
  // The body: white, the line's blue skirt and coral stripe, a pale roof.
  b.box([W, 0.55, L], [0, 1.05, cz], LINE);
  b.box([W + 0.01, 0.1, L], [0, 1.37, cz], STRIPE);
  b.box([W, 0.95, L], [0, 1.9, cz], SHELL);
  b.box([W, 0.45, L], [0, 2.85, cz], SHELL);
  b.box([W - 0.2, 0.18, L - 0.2], [0, 3.12, cz], "#d6d8d6");
  // Windows down both sides between the doors, the doors' frames.
  for (const side of [-1, 1]) {
    for (const [wz, ww] of [
      [-4.6, 1.6],
      [-1.2, 1.1],
      [0.0, 1.1],
      [1.2, 1.1],
      [4.6, 1.6],
    ] as [number, number][])
      glass.box([0.02, 0.8, ww], [side * (W / 2 + 0.005), 2.0, cz + wz], "#ffffff");
    for (const dz of [-3, 3]) b.box([0.04, 2.0, 1.4], [side * (W / 2 + 0.01), 1.95, cz + dz], "#c9ccd0");
  }
  // The cab at the outer end: a wide windscreen, lights, the destination board.
  const ez = cz + end * (L / 2);
  glass.box([W - 0.4, 0.9, 0.02], [0, 2.15, ez + end * 0.005], "#ffffff");
  for (const x of [-0.75, 0.75]) lit.box([0.28, 0.12, 0.03], [x, 1.2, ez + end * 0.01], "#fff3d6");
  // Inside: the floor, long seats down each wall, handrails, lights.
  inside.box([W - 0.15, 0.04, L - 0.4], [0, CAR.floor, cz], "#9c8f7e");
  for (const side of [-1, 1]) {
    inside.box([0.42, 0.42, L - 3.2], [side * 0.88, CAR.floor + 0.21, cz], "#2f6fd0");
    inside.box([0.1, 0.4, L - 3.2], [side * 1.05, CAR.floor + 0.6, cz], "#2f6fd0");
    inside.bar([side * 0.6, CAR.floor + 1.95, z0 + 1], [side * 0.6, CAR.floor + 1.95, z0 + L - 1], 0.015, "#c9ccd0");
  }
  for (let i = 0; i < 4; i++) lit.box([0.2, 0.03, 2.0], [0, 2.95, z0 + 1.6 + i * 2.95], "#ffffff");
  // The driver's seat and desk in the cab.
  inside.box([0.6, 0.85, 0.5], [-0.55, CAR.floor + 0.42, ez - end * 0.55], "#3a3d42");
}

function Train({ sit, seats }: { sit?: (seat: Seat) => void; seats: RideSeat[] }) {
  const group = useRef<THREE.Group>(null);
  const doorsW = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const b = new Builder();
    const glass = new Builder();
    const lit = new Builder();
    const inside = new Builder();
    buildCar(b, glass, lit, inside, CAR.length / 2 + CAR.gap / 2, 1);
    buildCar(b, glass, lit, inside, -(CAR.length / 2 + CAR.gap / 2), -1);
    // The gangway between the cars.
    b.box([1.2, 2.2, CAR.gap + 0.1], [0, 2.0, 0], "#2b2d30");
    return { body: b.build(), glass: glass.build(), lit: lit.build(), inside: inside.build() };
  }, []);
  const m = useMemo(
    () => ({
      body: paint(),
      glass: new THREE.MeshLambertMaterial({ color: "#a9c4cf", transparent: true, opacity: 0.35, depthWrite: false }),
      lit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      inside: paint(),
      door: new THREE.MeshLambertMaterial({ color: "#c9ccd0" }),
      board: new THREE.MeshBasicMaterial({ map: destination("しおかぜ線", "Shiokaze Line"), toneMapped: false }),
    }),
    []
  );
  const doorGeometry = useMemo(() => new THREE.BoxGeometry(0.04, 1.95, 0.68), []);
  useEffect(
    () => () => {
      for (const g of [...Object.values(geometry), doorGeometry]) g.dispose();
      for (const mat of Object.values(m)) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    },
    [geometry, m, doorGeometry]
  );
  // The doors on the platforms' side, each a pair of leaves that slide apart.
  const doors = useMemo(() => {
    const list: [number, number][] = [];
    for (const cz of [CAR.length / 2 + CAR.gap / 2, -(CAR.length / 2 + CAR.gap / 2)]) for (const dz of [-3, 3]) for (const leaf of [-1, 1]) list.push([cz + dz, leaf]);
    return list;
  }, []);
  useFrame(() => {
    const pose = trainAt(clock());
    if (group.current) group.current.position.set(pose.x, G, pose.z);
    doorsW.current?.children.forEach((d, i) => {
      const [z, leaf] = doors[i];
      d.position.z = z + leaf * (0.34 + 0.62 * pose.doors);
    });
  });
  const seatY = CAR.floor + 0.5;
  return (
    <group ref={group}>
      <mesh geometry={geometry.body} material={m.body} castShadow />
      <mesh geometry={geometry.inside} material={m.inside} />
      <mesh geometry={geometry.glass} material={m.glass} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.lit} material={m.lit} raycast={noRaycast} userData={{ navIgnore: true }} />
      <group ref={doorsW}>
        {doors.map(([z], i) => (
          <mesh key={i} geometry={doorGeometry} material={m.door} position={[-(CAR.width / 2 + 0.03), CAR.floor + 0.98, z]} raycast={noRaycast} />
        ))}
      </group>
      {[1, -1].map((end) => (
        <mesh key={end} position={[0.55, 2.72, end * (TRAIN_LENGTH / 2 + 0.01)]} rotation={[0, end > 0 ? 0 : Math.PI, 0]} material={m.board} raycast={noRaycast} userData={{ navIgnore: true }}>
          <planeGeometry args={[0.8, 0.2]} />
        </mesh>
      ))}
      {/* The drivers, one in each cab; passengers along for the ride. */}
      <Sitter avatar={DRIVER} position={[-0.55, CAR.floor + 0.45 - SEAT_HEIGHT, TRAIN_LENGTH / 2 - 1.1]} rotationY={Math.PI} />
      <Sitter avatar={DRIVER} position={[0.55, CAR.floor - SEAT_HEIGHT + 0.45, -(TRAIN_LENGTH / 2 - 1.1)]} rotationY={0} />
      <Sitter avatar={PASSENGERS[0]} position={[-0.88, CAR.floor + 0.45 - SEAT_HEIGHT, CAR.length / 2 + CAR.gap / 2 + 2.4]} rotationY={-Math.PI / 2} />
      <Sitter avatar={PASSENGERS[1]} position={[0.88, CAR.floor + 0.45 - SEAT_HEIGHT, -(CAR.length / 2 + CAR.gap / 2) - 2.4]} rotationY={Math.PI / 2} />
      {seats.map((r) => (
        <SeatSpot key={r.seat.id} ride={r} sit={sit} y={seatY} />
      ))}
    </group>
  );
}

// --- the bus ---------------------------------------------------------------------------------

function Bus({ sit, seats }: { sit?: (seat: Seat) => void; seats: RideSeat[] }) {
  const group = useRef<THREE.Group>(null);
  const door = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const b = new Builder();
    const glass = new Builder();
    const lit = new Builder();
    const inside = new Builder();
    const L = BUS.length;
    const W = BUS.width;
    // Wheels, the body (white, the town's teal band, a coral line), the roof.
    for (const z of [-2.7, 2.6]) for (const x of [-1.0, 1.0]) b.cylinder(0.45, 0.45, 0.3, [x, 0.45, z], "#1f2023", [0, 0, Math.PI / 2], 16);
    b.box([W, 0.75, L], [0, 0.78, 0], "#2bb3a3");
    b.box([W + 0.01, 0.08, L], [0, 1.2, 0], STRIPE);
    b.box([W, 1.7, L], [0, 2.07, 0], SHELL);
    b.box([W - 0.3, 0.25, L * 0.4], [0, 3.05, -1.0], "#d6d8d6");
    // Windows: big panes down both sides, the windscreen, the back.
    for (const side of [-1, 1]) glass.box([0.02, 1.0, L - 2.4], [side * (W / 2 + 0.005), 2.15, -0.6], "#ffffff");
    glass.box([W - 0.2, 1.3, 0.02], [0, 2.0, L / 2 + 0.005], "#ffffff");
    glass.box([W - 0.6, 0.7, 0.02], [0, 2.3, -L / 2 - 0.005], "#ffffff");
    for (const x of [-0.85, 0.85]) lit.box([0.3, 0.14, 0.03], [x, 0.95, L / 2 + 0.01], "#fff3d6");
    for (const x of [-0.95, 0.95]) lit.box([0.2, 0.25, 0.03], [x, 1.0, -L / 2 - 0.01], "#ff3b30");
    // Inside: the floor, seats in pairs, the driver's wheel, a light strip.
    inside.box([W - 0.15, 0.04, L - 0.4], [0, BUS.floor, 0], "#6b6f78");
    for (const r of seats) {
      inside.box([0.44, 0.4, 0.44], [r.local[0], BUS.floor + 0.2, r.local[2]], "#2f6fd0");
      inside.box([0.44, 0.5, 0.08], [r.local[0], BUS.floor + 0.6, r.local[2] - 0.24], "#2f6fd0");
    }
    inside.cylinder(0.22, 0.22, 0.04, [-0.6, BUS.floor + 1.0, L / 2 - 0.75], "#1f2023", [0.9, 0, 0], 16);
    lit.box([0.15, 0.03, L - 1.5], [0, 2.85, 0], "#ffffff");
    return { body: b.build(), glass: glass.build(), lit: lit.build(), inside: inside.build() };
  }, [seats]);
  const m = useMemo(
    () => ({
      body: paint(),
      glass: new THREE.MeshLambertMaterial({ color: "#a9c4cf", transparent: true, opacity: 0.35, depthWrite: false }),
      lit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      inside: paint(),
      door: new THREE.MeshLambertMaterial({ color: "#a9c4cf", transparent: true, opacity: 0.5 }),
      board: new THREE.MeshBasicMaterial({ map: destination("海岸通り経由 山の前", "Kaigan-dōri · Yamanomae"), toneMapped: false }),
    }),
    []
  );
  useEffect(
    () => () => {
      for (const g of Object.values(geometry)) g.dispose();
      for (const mat of Object.values(m)) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    },
    [geometry, m]
  );
  useFrame(() => {
    const pose = busAt(clock());
    if (group.current) {
      group.current.position.set(pose.x, G, pose.z);
      group.current.rotation.y = pose.heading;
    }
    // The front door folds back along the side as it opens.
    if (door.current) door.current.position.z = BUS.length / 2 - 1.3 - 1.0 * pose.doors;
  });
  const seatY = BUS.floor + 0.5;
  return (
    <group ref={group}>
      <mesh geometry={geometry.body} material={m.body} castShadow />
      <mesh geometry={geometry.inside} material={m.inside} />
      <mesh geometry={geometry.glass} material={m.glass} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.lit} material={m.lit} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh ref={door} position={[BUS.width / 2 + 0.03, 1.6, BUS.length / 2 - 1.3]} material={m.door} raycast={noRaycast}>
        <boxGeometry args={[0.04, 2.1, 0.95]} />
      </mesh>
      <mesh position={[0, 2.8, BUS.length / 2 + 0.015]} material={m.board} raycast={noRaycast} userData={{ navIgnore: true }}>
        <planeGeometry args={[1.5, 0.36]} />
      </mesh>
      <Sitter avatar={DRIVER} position={[-0.6, BUS.floor + 0.45 - SEAT_HEIGHT, BUS.length / 2 - 1.3]} rotationY={Math.PI} />
      <Sitter avatar={PASSENGERS[2]} position={[-0.55, BUS.floor + 0.45 - SEAT_HEIGHT, -2.5]} rotationY={Math.PI} />
      {seats
        .filter((r) => !(r.local[0] < 0 && r.local[2] === -2.5))
        .map((r) => (
          <SeatSpot key={r.seat.id} ride={r} sit={sit} y={seatY} />
        ))}
    </group>
  );
}

// --- the level crossing -------------------------------------------------------------------------

/** On while a train is over the crossing, or will be within a few seconds. */
function crossingOn(now: number) {
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

/**
 * The bus, the train, and the crossing; their sounds from where you are;
 * the announcements when they stop; and their collision, merged with the
 * town's own (which is handed in as `fixed`).
 */
export function Transit({ sit, fixed }: { sit?: (seat: Seat) => void; fixed: Obstacle[] }) {
  const train = useMemo(trainSeats, []);
  const bus = useMemo(busSeats, []);
  const state = useRef({
    obstaclesAt: 0,
    trainStop: null as string | null,
    busStop: null as string | null,
    trainClosing: false,
    joints: new Map<number, number>(),
    diesel: null as Loop | null,
    motor: null as Loop | null,
  });
  useEffect(
    () => () => {
      state.current.diesel?.stop();
      state.current.motor?.stop();
      setWorldObstacles(fixed);
    },
    [fixed]
  );
  const ear = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const now = clock();
    const s = state.current;
    const t = trainAt(now);
    const b = busAt(now);
    placeSeats(train, t, G, false);
    placeSeats(bus, b, G, true);
    camera.getWorldPosition(ear);
    const toTrain = Math.hypot(ear.x - t.x, Math.max(0, Math.abs(ear.z - t.z) - TRAIN_LENGTH / 2));
    const toBus = Math.hypot(ear.x - b.x, ear.z - b.z);
    // Collision: the town's, and where the bus and train are now (ten times a second).
    if (performance.now() - s.obstaclesAt > 100) {
      s.obstaclesAt = performance.now();
      setWorldObstacles([
        ...fixed,
        { x: TRACK.x, z: t.z, halfX: CAR.width / 2, halfZ: TRAIN_LENGTH / 2, rotationY: 0 },
        { x: b.x, z: b.z, halfX: BUS.width / 2, halfZ: BUS.length / 2, rotationY: b.heading },
      ]);
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
        speak(`${st.nameJa}、${st.nameJa}です。`, "ja-JP", { volume: v, rate: 1.05 });
        speak(`${st.name}. ${st.name}.`, "en-US", { volume: v });
      }
      s.trainStop = t.stop;
      s.trainClosing = false;
    }
    if (t.stop && t.departsIn < 4.5 && !s.trainClosing) {
      s.trainClosing = true;
      if (toTrain < 40) {
        trainDoors(toTrain, false);
        speak("ドアが閉まります。ご注意ください。", "ja-JP", { volume: 1 - toTrain / 45, rate: 1.1 });
      }
    }
    if (b.stop !== s.busStop) {
      if (b.stop && toBus < 40) {
        busDoors(toBus);
        const v = 1 - toBus / 45;
        speak("お待たせいたしました。海岸通りです。", "ja-JP", { volume: v, rate: 1.05 });
        speak("Kaigan-dori. Thank you for waiting.", "en-US", { volume: v });
      }
      s.busStop = b.stop;
    }
  });
  return (
    <>
      <Train sit={sit} seats={train} />
      <Bus sit={sit} seats={bus} />
      <Crossing />
    </>
  );
}

