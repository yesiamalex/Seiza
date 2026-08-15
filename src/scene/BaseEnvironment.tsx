import * as THREE from "three";

// Original, procedurally-generated geometry only — no bundled 3D assets,
// so there's nothing to track in THIRD_PARTY_ASSETS.md. This is what a
// fresh deploy actually looks like with no scene.glb supplied: a real,
// walkable room (floor + perimeter walls with doorways + a few pillars
// and a semicircle of benches facing the spawn point), not a blank
// wireframe plane. A deployer-supplied scene.glb (see Scene.tsx) renders
// alongside/instead of this.
const ROOM_HALF_SIZE = 20;
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.3;
const DOOR_WIDTH = 4;

const FLOOR_COLOR = "#7a6a53";
const WALL_COLOR = "#c9bfa8";
const ACCENT_COLOR = "#8f7a5c";

export function BaseEnvironment() {
  return (
    <group>
      <Floor />
      <PerimeterWalls />
      <Pillars />
      <BenchSemicircle />
    </group>
  );
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[ROOM_HALF_SIZE - 0.5, 48]} />
      <meshStandardMaterial color={FLOOR_COLOR} roughness={0.9} />
    </mesh>
  );
}

interface WallSegmentProps {
  position: [number, number, number];
  size: [number, number, number];
}

function WallSegment({ position, size }: WallSegmentProps) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.8} />
    </mesh>
  );
}

/** One wall with a centered doorway gap, along either the X or Z axis. */
function WallWithDoor({ axis, offset }: { axis: "x" | "z"; offset: number }) {
  const length = ROOM_HALF_SIZE * 2;
  const segmentLength = (length - DOOR_WIDTH) / 2;
  const segmentCenter = DOOR_WIDTH / 2 + segmentLength / 2;

  if (axis === "z") {
    return (
      <>
        <WallSegment position={[offset, WALL_HEIGHT / 2, -segmentCenter]} size={[WALL_THICKNESS, WALL_HEIGHT, segmentLength]} />
        <WallSegment position={[offset, WALL_HEIGHT / 2, segmentCenter]} size={[WALL_THICKNESS, WALL_HEIGHT, segmentLength]} />
      </>
    );
  }
  return (
    <>
      <WallSegment position={[-segmentCenter, WALL_HEIGHT / 2, offset]} size={[segmentLength, WALL_HEIGHT, WALL_THICKNESS]} />
      <WallSegment position={[segmentCenter, WALL_HEIGHT / 2, offset]} size={[segmentLength, WALL_HEIGHT, WALL_THICKNESS]} />
    </>
  );
}

function PerimeterWalls() {
  return (
    <group>
      <WallWithDoor axis="z" offset={-ROOM_HALF_SIZE} />
      <WallWithDoor axis="z" offset={ROOM_HALF_SIZE} />
      <WallWithDoor axis="x" offset={-ROOM_HALF_SIZE} />
      <WallWithDoor axis="x" offset={ROOM_HALF_SIZE} />
    </group>
  );
}

const PILLAR_POSITIONS: [number, number][] = [
  [-17, -17],
  [17, -17],
  [-17, 17],
  [17, 17],
];

function Pillars() {
  return (
    <group>
      {PILLAR_POSITIONS.map(([x, z], i) => (
        <mesh key={i} position={[x, WALL_HEIGHT / 2 + 0.25, z]} castShadow>
          <cylinderGeometry args={[0.5, 0.55, WALL_HEIGHT + 0.5, 16]} />
          <meshStandardMaterial color={ACCENT_COLOR} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

const BENCH_COUNT = 6;
const BENCH_RADIUS = 6;

/** Seating facing the room's center — this is where gesture-practice
 *  interactions (see src/interactions/) are meant to happen. */
function BenchSemicircle() {
  const benches = Array.from({ length: BENCH_COUNT }, (_, i) => {
    const angle = Math.PI + (i / (BENCH_COUNT - 1)) * Math.PI;
    const x = Math.cos(angle) * BENCH_RADIUS;
    const z = Math.sin(angle) * BENCH_RADIUS;
    const facing = new THREE.Vector3(-x, 0, -z);
    const rotationY = Math.atan2(facing.x, facing.z);
    return { position: [x, 0.25, z] as [number, number, number], rotationY };
  });

  return (
    <group>
      {benches.map((bench, i) => (
        <mesh key={i} position={bench.position} rotation={[0, bench.rotationY, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.5, 0.5]} />
          <meshStandardMaterial color={ACCENT_COLOR} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}
