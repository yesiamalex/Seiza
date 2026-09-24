import { memo, useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { getWorldMaterials, type WorldMaterials } from "./materials";
import { Chair } from "./Chair";
import { SeatPad } from "./SeatPad";
import {
  BENCHES,
  BENCH_LENGTH,
  CLASSROOM,
  CLASSROOM_DOOR_OBSTACLE,
  CLASSROOM_WALL_HEIGHT,
  CORRIDOR,
  DESKS,
  DOOR_HALF_WIDTH,
  GARDEN_DOOR_OBSTACLE,
  HALL,
  HALL_CENTRE,
  OUTDOOR,
  OUTDOOR_BENCHES,
  SEATS,
  SEAT_HEIGHT,
  TEACHER_DESK,
  WALL_HEIGHT,
  WALL_THICKNESS,
  type BenchPlacement,
  type Rect,
  type Seat,
} from "./layout";

/**
 * The world a fresh deploy actually gets: a warm daylit social hall with
 * benches around a tatami platform, a corridor of shoe lockers, and a
 * classroom with desks facing a chalkboard. Every seat can be sat on.
 *
 * All of it is generated from code — no bundled 3D assets, so there is
 * nothing to track in THIRD_PARTY_ASSETS.md — with the floor plan in
 * layout.ts (shared with the movement bounds) and the materials, including
 * canvas-drawn wood and tatami, in materials.ts. A deployer-supplied
 * scene.glb renders on top of this; see Scene.tsx.
 */

interface BaseEnvironmentProps {
  /** Double-click/tap a floor to walk there. */
  onFloorDoubleClick?: (point: THREE.Vector3) => void;
  /** Click a chair or bench to sit. Omitted (e.g. in Edit Mode) disables
   *  the seat pads entirely. */
  onSit?: (seat: Seat) => void;
  /** The seat the local player currently occupies. */
  occupiedSeatId?: string | null;
}

export const BaseEnvironment = memo(function BaseEnvironment({
  onFloorDoubleClick,
  onSit,
  occupiedSeatId,
}: BaseEnvironmentProps) {
  const m = getWorldMaterials();
  return (
    <group>
      <Floors m={m} onFloorDoubleClick={onFloorDoubleClick} />
      <HallShell m={m} />
      <HallFurniture m={m} />
      <OutdoorGarden m={m} />
      <CorridorShell m={m} />
      <ClassroomShell m={m} />
      <ClassroomFurniture m={m} />
      {onSit &&
        SEATS.map((seat) => <SeatPad key={seat.id} seat={seat} onSit={onSit} occupied={occupiedSeatId === seat.id} />)}
    </group>
  );
});

// --- shells ----------------------------------------------------------------

function Floors({ m, onFloorDoubleClick }: { m: WorldMaterials; onFloorDoubleClick?: (point: THREE.Vector3) => void }) {
  const handleDoubleClick = onFloorDoubleClick
    ? (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onFloorDoubleClick(event.point);
      }
    : undefined;
  return (
    <group>
      <FloorPlane rect={HALL} material={m.hallFloor} onDoubleClick={handleDoubleClick} />
      <FloorPlane rect={OUTDOOR} material={m.classroomFloor} onDoubleClick={handleDoubleClick} />
      <FloorPlane rect={CORRIDOR} material={m.corridorFloor} onDoubleClick={handleDoubleClick} />
      <FloorPlane rect={CLASSROOM} material={m.classroomFloor} onDoubleClick={handleDoubleClick} />
    </group>
  );
}

function FloorPlane({
  rect,
  material,
  onDoubleClick,
}: {
  rect: Rect;
  material: THREE.Material;
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[(rect.minX + rect.maxX) / 2, 0, (rect.minZ + rect.maxZ) / 2]}
      receiveShadow
      material={material}
      onDoubleClick={onDoubleClick}
    >
      <planeGeometry args={[rect.maxX - rect.minX, rect.maxZ - rect.minZ]} />
    </mesh>
  );
}

interface Gap {
  from: number;
  to: number;
}

/** A straight wall along X or Z, split around any doorway gaps. */
function WallRun({
  axis,
  at,
  from,
  to,
  height,
  gaps = [],
  material,
  thickness = WALL_THICKNESS,
  centerY,
}: {
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  height: number;
  gaps?: Gap[];
  material: THREE.Material;
  thickness?: number;
  centerY?: number;
}) {
  const segments: [number, number][] = [];
  let cursor = from;
  for (const gap of [...gaps].sort((a, b) => a.from - b.from)) {
    if (gap.from > cursor) segments.push([cursor, gap.from]);
    cursor = Math.max(cursor, gap.to);
  }
  if (cursor < to) segments.push([cursor, to]);

  const y = centerY ?? height / 2;
  return (
    <group>
      {segments.map(([a, b], i) => {
        const length = b - a;
        const middle = (a + b) / 2;
        return (
          <mesh
            key={i}
            material={material}
            castShadow
            receiveShadow
            position={axis === "x" ? [middle, y, at] : [at, y, middle]}
          >
            <boxGeometry args={axis === "x" ? [length, height, thickness] : [thickness, height, length]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** A window opening in a wall run: centred at `center` along the wall's
 *  length, `width` wide, cut between `sillY` and `headerY`. */
interface WindowOpening {
  center: number;
  width: number;
  sillY: number;
  headerY: number;
}

/**
 * Plaster wall with a wood wainscot along the bottom and a trim band at
 * the top — the thing that stops a procedural room reading as grey boxes.
 *
 * `windows`, when given, cuts real openings into the plaster rather than
 * just mounting a decorative pane in front of solid wall: the plaster layer
 * splits into three stacked bands (below the sill, the window band itself,
 * above the header), and the window band gets an extra length-wise gap per
 * window — the same mechanism `WallRun`'s `gaps` already uses for doorways,
 * just applied to a height slice instead of the wall's full height. The
 * wainscot and trim bands don't need splitting: at this room's proportions
 * neither one's height range overlaps where windows sit.
 */
function DressedWall(props: {
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  height: number;
  gaps?: Gap[];
  m: WorldMaterials;
  windows?: WindowOpening[];
}) {
  const { m, windows, ...run } = props;
  const doorGaps = run.gaps ?? [];

  if (windows && windows.length > 0) {
    // All the openings here are assumed to share one sill/header band —
    // true for every wall this is used on — so the surrounding wall only
    // needs three bands total, not one pair per window.
    const sillY = Math.min(...windows.map((w) => w.sillY));
    const headerY = Math.max(...windows.map((w) => w.headerY));
    const windowGaps = windows.map((w) => ({ from: w.center - w.width / 2, to: w.center + w.width / 2 }));
    return (
      <group>
        <WallRun {...run} height={sillY} centerY={sillY / 2} gaps={doorGaps} material={m.wall} />
        <WallRun {...run} height={headerY - sillY} centerY={(sillY + headerY) / 2} gaps={[...doorGaps, ...windowGaps]} material={m.wall} />
        <WallRun {...run} height={run.height - headerY} centerY={(headerY + run.height) / 2} gaps={doorGaps} material={m.wall} />
        <WallRun {...run} height={0.95} centerY={0.475} material={m.wainscot} thickness={WALL_THICKNESS + 0.08} />
        <WallRun {...run} height={0.16} centerY={run.height - 0.12} material={m.trim} thickness={WALL_THICKNESS + 0.2} />
      </group>
    );
  }

  return (
    <group>
      {/* The wainscot and trim stand proud of the wall by clearly different
          amounts. Nearly-equal offsets put two parallel faces a hair apart,
          which is what makes surfaces flicker as the camera turns. */}
      <WallRun {...run} material={m.wall} />
      <WallRun {...run} height={0.95} centerY={0.475} material={m.wainscot} thickness={WALL_THICKNESS + 0.08} />
      <WallRun {...run} height={0.16} centerY={run.height - 0.12} material={m.trim} thickness={WALL_THICKNESS + 0.2} />
    </group>
  );
}

/** Framed window pane, mounted flat against a wall. */
function Window({
  position,
  rotationY = 0,
  width = 2,
  height = 1.5,
  m,
}: {
  position: [number, number, number];
  rotationY?: number;
  width?: number;
  height?: number;
  m: WorldMaterials;
}) {
  // Four bars around an open pane. This used to be a single solid box
  // spanning the whole opening, which is why cutting a real hole in the wall
  // behind it changed nothing you could see: the "frame" itself was still a
  // solid slab plugging the gap.
  const bar = 0.11;
  const depth = 0.14;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, height / 2 - bar / 2, 0]} material={m.trim} castShadow>
        <boxGeometry args={[width, bar, depth]} />
      </mesh>
      <mesh position={[0, -height / 2 + bar / 2, 0]} material={m.trim} castShadow>
        <boxGeometry args={[width, bar, depth]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 - bar / 2), 0, 0]} material={m.trim} castShadow>
          <boxGeometry args={[bar, height - bar * 2, depth]} />
        </mesh>
      ))}
      {/* The pane itself: mostly clear, so the sky outside comes through. */}
      <mesh material={m.glass}>
        <planeGeometry args={[width - bar * 2, height - bar * 2]} />
      </mesh>
      {/* Muntin bars, so the opening still reads as a window. */}
      <mesh material={m.trim}>
        <boxGeometry args={[0.05, height - bar * 2, 0.05]} />
      </mesh>
      <mesh material={m.trim}>
        <boxGeometry args={[width - bar * 2, 0.05, 0.05]} />
      </mesh>
      <mesh position={[0, -height / 2 - 0.02, 0.08]} material={m.furnitureTop} castShadow>
        <boxGeometry args={[width + 0.1, 0.07, 0.24]} />
      </mesh>
    </group>
  );
}

const HALL_WINDOW_Z = [1.5, 5.5, 9.5, 13.5];
const HALL_WINDOW_WIDTH = 2;
const HALL_WINDOW_CENTER_Y = 2.3;
const HALL_WINDOW_SILL = 1.5;
const HALL_WINDOW_HEADER = 3.12;

function HallShell({ m }: { m: WorldMaterials }) {
  return (
    <group>
      {/* North wall is the entrance; south opens into the corridor. */}
      <DressedWall axis="x" at={HALL.maxZ} from={HALL.minX} to={HALL.maxX} height={WALL_HEIGHT} gaps={[{ from: -DOOR_HALF_WIDTH, to: DOOR_HALF_WIDTH }]} m={m} />
      <DressedWall
        axis="x"
        at={HALL.minZ}
        from={HALL.minX}
        to={HALL.maxX}
        height={WALL_HEIGHT}
        gaps={[{ from: -DOOR_HALF_WIDTH, to: DOOR_HALF_WIDTH }]}
        m={m}
      />
      <DressedWall
        axis="z"
        at={HALL.minX}
        from={HALL.minZ}
        to={HALL.maxZ}
        height={WALL_HEIGHT}
        m={m}
        windows={HALL_WINDOW_Z.map((center) => ({ center, width: HALL_WINDOW_WIDTH, sillY: HALL_WINDOW_SILL, headerY: HALL_WINDOW_HEADER }))}
      />
      <DressedWall
        axis="z"
        at={HALL.maxX}
        from={HALL.minZ}
        to={HALL.maxZ}
        height={WALL_HEIGHT}
        m={m}
        windows={HALL_WINDOW_Z.map((center) => ({ center, width: HALL_WINDOW_WIDTH, sillY: HALL_WINDOW_SILL, headerY: HALL_WINDOW_HEADER }))}
      />

      {/* Real openings now (see DressedWall's `windows` prop), not a pane
          mounted on solid plaster — the sunset sky and low sun show
          through, on both long walls. */}
      {HALL_WINDOW_Z.map((z) => (
        <Window key={`w-${z}`} position={[HALL.minX + 0.2, HALL_WINDOW_CENTER_Y, z]} rotationY={Math.PI / 2} width={HALL_WINDOW_WIDTH} m={m} />
      ))}
      {HALL_WINDOW_Z.map((z) => (
        <Window key={`e-${z}`} position={[HALL.maxX - 0.2, HALL_WINDOW_CENTER_Y, z]} rotationY={-Math.PI / 2} width={HALL_WINDOW_WIDTH} m={m} />
      ))}

      {/* Open entrance into the bounded garden beyond the hall. */}
      <mesh position={[0, 2.5, HALL.maxZ]} material={m.trim} castShadow>
        <boxGeometry args={[DOOR_HALF_WIDTH * 2, 0.28, 0.35]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (DOOR_HALF_WIDTH - 0.16), 1.25, HALL.maxZ]} material={m.trim} castShadow>
          <boxGeometry args={[0.28, 2.5, 0.35]} />
        </mesh>
      ))}
      <GardenDoor m={m} />

      {/* Open beam ceiling: keeps the hall bright while giving it a top. */}
      {[-1.5, 2, 5.5, 9, 12.5, 15.5].map((z) => (
        <mesh key={z} position={[0, WALL_HEIGHT - 0.2, z]} material={m.beam} castShadow>
          <boxGeometry args={[HALL.maxX - HALL.minX, 0.3, 0.28]} />
        </mesh>
      ))}
      <mesh position={[0, WALL_HEIGHT - 0.52, (HALL.minZ + HALL.maxZ) / 2]} material={m.beam} castShadow>
        <boxGeometry args={[0.32, 0.32, HALL.maxZ - HALL.minZ]} />
      </mesh>
    </group>
  );
}

function GardenDoor({ m }: { m: WorldMaterials }) {
  const [open, setOpen] = useState(false);
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  // Defends against a remount (e.g. an editor environment swap) landing
  // on a GARDEN_DOOR_OBSTACLE left disabled by a previous instance that
  // was open when it unmounted — this component's own `open` state
  // always restarts closed, so the shared obstacle should too.
  useEffect(() => {
    GARDEN_DOOR_OBSTACLE.disabled = false;
  }, []);
  useFrame((_, delta) => {
    const amount = 1 - Math.exp(-7 * Math.min(delta, 0.05));
    const target = open ? Math.PI * 0.52 : 0;
    if (leftRef.current) leftRef.current.rotation.y += (target - leftRef.current.rotation.y) * amount;
    if (rightRef.current) rightRef.current.rotation.y += (-target - rightRef.current.rotation.y) * amount;
  });
  const toggle = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    setOpen((value) => {
      const next = !value;
      // Collision follows the click immediately rather than waiting for
      // the swing animation above to finish — the leaves take ~0.3s to
      // visually settle, but nothing is actually standing in the
      // doorway's footprint the instant you've told the door to open, so
      // there's nothing to wait for. See resolveObstacles in layout.ts,
      // which skips any obstacle with `disabled: true`.
      GARDEN_DOOR_OBSTACLE.disabled = next;
      return next;
    });
  };
  return (
    <group>
      <group ref={leftRef} position={[-DOOR_HALF_WIDTH + 0.16, 0, HALL.maxZ - 0.18]}>
        <mesh position={[1.22, 1.2, 0]} material={m.trim} castShadow onClick={toggle}>
          <boxGeometry args={[2.44, 2.4, 0.08]} />
        </mesh>
        <mesh position={[0.82, 1.75, -0.05]} material={m.glass} onClick={toggle}>
          <boxGeometry args={[1.45, 0.86, 0.04]} />
        </mesh>
      </group>
      <group ref={rightRef} position={[DOOR_HALF_WIDTH - 0.16, 0, HALL.maxZ - 0.18]}>
        <mesh position={[-1.22, 1.2, 0]} material={m.trim} castShadow onClick={toggle}>
          <boxGeometry args={[2.44, 2.4, 0.08]} />
        </mesh>
        <mesh position={[-0.82, 1.75, -0.05]} material={m.glass} onClick={toggle}>
          <boxGeometry args={[1.45, 0.86, 0.04]} />
        </mesh>
      </group>
    </group>
  );
}

/** Panel width/height shared between ClassroomDoor's two sliding leaves
 *  and its fixed transom above them. */
const SHOJI_PANEL_WIDTH = DOOR_HALF_WIDTH - 0.05;
const SHOJI_PANEL_HEIGHT = 2.4;

/**
 * A two-panel shoji-style sliding door at the corridor→classroom
 * threshold (see the matching gap cut into ClassroomShell's south wall).
 * Structurally the same idea as GardenDoor — click to toggle, a lerped
 * transform each frame, and a shared Obstacle disabled while open — but
 * sliding along X instead of swinging on rotation.y, and with a lattice
 * ("kumiko") look built from a handful of thin boxes over a paper pane
 * rather than a loaded model, consistent with how the rest of this
 * procedural environment is built.
 */
function ClassroomDoor({ m }: { m: WorldMaterials }) {
  const [open, setOpen] = useState(false);
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const doorZ = CLASSROOM.maxZ;
  // Each panel's resting (closed) offset from center, and how far it
  // slides outward — tucked just past the doorway's outer edge, as if
  // into a wall pocket either side of the frame.
  const closedOffset = SHOJI_PANEL_WIDTH / 2 - 0.05;
  const openOffset = DOOR_HALF_WIDTH + SHOJI_PANEL_WIDTH / 2 + 0.04;

  // See the identical effect on GardenDoor above for why this exists: a
  // remounted door (e.g. after an editor environment swap) should never
  // inherit a stale `disabled: true` from a previous instance that
  // happened to be open when it unmounted.
  useEffect(() => {
    CLASSROOM_DOOR_OBSTACLE.disabled = false;
  }, []);

  useFrame((_, delta) => {
    const amount = 1 - Math.exp(-7 * Math.min(delta, 0.05));
    const target = open ? openOffset - closedOffset : 0;
    if (leftRef.current) leftRef.current.position.x += (-target - leftRef.current.position.x) * amount;
    if (rightRef.current) rightRef.current.position.x += (target - rightRef.current.position.x) * amount;
  });

  const toggle = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    setOpen((value) => {
      const next = !value;
      // Immediate, same reasoning as GardenDoor: nothing is standing in
      // a doorway's footprint the instant you've told it to open, so
      // collision doesn't need to wait for the ~0.3s slide to finish.
      CLASSROOM_DOOR_OBSTACLE.disabled = next;
      return next;
    });
  };

  return (
    <group>
      {/* Floor track and header rail — grounds the panels visually and
          reads as "these slide" rather than "these are stuck on". */}
      <mesh position={[0, 0.02, doorZ]} material={m.trim} receiveShadow>
        <boxGeometry args={[DOOR_HALF_WIDTH * 2 + 0.3, 0.04, 0.14]} />
      </mesh>
      <mesh position={[0, SHOJI_PANEL_HEIGHT + 0.06, doorZ]} material={m.trim} castShadow>
        <boxGeometry args={[DOOR_HALF_WIDTH * 2 + 0.3, 0.12, 0.16]} />
      </mesh>
      {/* Fixed transom filling the rest of the wall opening above the
          panels, so the doorway isn't an empty hole up to the ceiling. */}
      <mesh position={[0, (SHOJI_PANEL_HEIGHT + 0.12 + CLASSROOM_WALL_HEIGHT) / 2, doorZ]} material={m.paper}>
        <planeGeometry args={[DOOR_HALF_WIDTH * 2 - 0.1, Math.max(0.2, CLASSROOM_WALL_HEIGHT - SHOJI_PANEL_HEIGHT - 0.16)]} />
      </mesh>

      {[
        { groupRef: leftRef, baseX: -closedOffset },
        { groupRef: rightRef, baseX: closedOffset },
      ].map(({ groupRef, baseX }, i) => (
        <group key={i} ref={groupRef} position={[baseX, 0, doorZ]}>
          {/* Outer frame (kamachi) — also the click target, same as GardenDoor's leaves. */}
          <mesh position={[0, SHOJI_PANEL_HEIGHT / 2, 0]} material={m.trim} castShadow onClick={toggle}>
            <boxGeometry args={[SHOJI_PANEL_WIDTH, SHOJI_PANEL_HEIGHT, 0.06]} />
          </mesh>
          {/* Washi paper inset. */}
          <mesh position={[0, SHOJI_PANEL_HEIGHT / 2, 0.032]} material={m.paper} onClick={toggle}>
            <planeGeometry args={[SHOJI_PANEL_WIDTH - 0.1, SHOJI_PANEL_HEIGHT - 0.1]} />
          </mesh>
          {/* Kumiko lattice: a few thin wood strips over the paper — enough
              to read as shoji at a glance without modeling every muntin. */}
          {[0.32, 0.56, 0.8].map((t) => (
            <mesh key={`h-${t}`} position={[0, SHOJI_PANEL_HEIGHT * t, 0.045]} material={m.trim}>
              <boxGeometry args={[SHOJI_PANEL_WIDTH - 0.1, 0.025, 0.014]} />
            </mesh>
          ))}
          {[-0.26, 0, 0.26].map((x) => (
            <mesh key={`v-${x}`} position={[x, SHOJI_PANEL_HEIGHT / 2, 0.045]} material={m.trim}>
              <boxGeometry args={[0.025, SHOJI_PANEL_HEIGHT - 0.1, 0.014]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}


function OutdoorGarden({ m }: { m: WorldMaterials }) {
  return (
    <group>
      {OUTDOOR_BENCHES.map((bench, i) => <Bench key={`outdoor-bench-${i}`} placement={bench} m={m} />)}
      <mesh position={[0, 0.04, 27]} material={m.trim} receiveShadow>
        <cylinderGeometry args={[2.85, 2.95, 0.12, 32]} />
      </mesh>
      <mesh position={[0, 0.12, 27]} material={m.glass} receiveShadow>
        <cylinderGeometry args={[2.55, 2.55, 0.05, 32]} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh key={`pond-stone-${i}`} position={[Math.cos(angle) * 2.72, 0.16, 27 + Math.sin(angle) * 2.72]} material={m.tatamiBorder} castShadow>
            <sphereGeometry args={[0.28, 10, 6]} />
          </mesh>
        );
      })}
      {[[-0.7, 26.7], [0.85, 27.5], [0.25, 26.3]].map(([x, z], i) => (
        <mesh key={`lily-${i}`} position={[x, 0.17, z]} rotation={[-Math.PI / 2, 0, i * 0.7]} material={m.foliage}>
          <circleGeometry args={[0.32, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function HallFurniture({ m }: { m: WorldMaterials }) {
  return (
    <group>
      {/* Tatami platform the benches face — where seiza practice happens. */}
      <group position={[HALL_CENTRE[0], 0, HALL_CENTRE[1]]}>
        {/* Sunk a hair so its underside isn't coplanar with the floor. */}
        <mesh position={[0, 0.06, 0]} receiveShadow material={m.tatami}>
          <boxGeometry args={[9, 0.14, 7]} />
        </mesh>
        {[
          { position: [0, 0.08, 3.54] as [number, number, number], size: [9.16, 0.17, 0.16] as [number, number, number] },
          { position: [0, 0.08, -3.54] as [number, number, number], size: [9.16, 0.17, 0.16] as [number, number, number] },
          { position: [4.58, 0.08, 0] as [number, number, number], size: [0.16, 0.17, 7.16] as [number, number, number] },
          { position: [-4.58, 0.08, 0] as [number, number, number], size: [0.16, 0.17, 7.16] as [number, number, number] },
        ].map((edge, i) => (
          <mesh key={i} position={edge.position} material={m.tatamiBorder}>
            <boxGeometry args={edge.size} />
          </mesh>
        ))}
      </group>

      {BENCHES.map((bench, i) => (
        <Bench key={i} placement={bench} m={m} />
      ))}

      {/* Reception desk by the entrance. */}
      <group position={[-7, 0, 13.4]}>
        <mesh position={[0, 0.5, 0]} material={m.furnitureWarm} castShadow receiveShadow>
          <boxGeometry args={[3.4, 1, 0.7]} />
        </mesh>
        <mesh position={[0, 1.04, 0.05]} material={m.furnitureTop} castShadow>
          <boxGeometry args={[3.6, 0.09, 0.9]} />
        </mesh>
        <mesh position={[0, 1.12, -0.1]} rotation={[-0.35, 0, 0]} material={m.paper}>
          <planeGeometry args={[0.5, 0.36]} />
        </mesh>
      </group>

      {/* Posts with paper lanterns. Only two of the four carry an actual
          light: every extra point light is paid for by every material in
          the scene, avatars included, and the lanterns read as lit from
          their emissive glow either way. */}
      {[
        { x: -8.6, z: 0.8, light: true },
        { x: 8.6, z: 0.8, light: false },
        { x: -8.6, z: 12.2, light: false },
        { x: 8.6, z: 12.2, light: true },
      ].map((post) => (
        <group key={`${post.x}-${post.z}`} position={[post.x, 0, post.z]}>
          <mesh position={[0, WALL_HEIGHT / 2, 0]} material={m.trim} castShadow>
            <boxGeometry args={[0.34, WALL_HEIGHT, 0.34]} />
          </mesh>
          <mesh position={[0, 2.75, 0]} material={m.lantern}>
            <sphereGeometry args={[0.26, 20, 14]} />
          </mesh>
          {post.light && <pointLight position={[0, 2.75, 0]} intensity={13} distance={20} decay={2} color="#ffd2a0" />}
        </group>
      ))}

      {[
        [-10.6, 15],
        [10.6, 15],
        [-10.6, -2.4],
        [10.6, -2.4],
      ].map(([x, z]) => (
        <Planter key={`${x}-${z}`} position={[x, 0, z]} m={m} />
      ))}
    </group>
  );
}

function Bench({ placement, m }: { placement: BenchPlacement; m: WorldMaterials }) {
  return (
    <group position={placement.position} rotation={[0, placement.rotationY, 0]}>
      <mesh position={[0, SEAT_HEIGHT, 0]} material={m.furnitureWarm} castShadow receiveShadow>
        <boxGeometry args={[BENCH_LENGTH, 0.11, 0.54]} />
      </mesh>
      {/* Backrest sits behind a seated avatar, which faces -Z locally. */}
      <mesh position={[0, SEAT_HEIGHT + 0.32, 0.24]} rotation={[0.12, 0, 0]} material={m.furnitureWarm} castShadow>
        <boxGeometry args={[BENCH_LENGTH, 0.46, 0.09]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (BENCH_LENGTH / 2 - 0.18), SEAT_HEIGHT / 2, 0]} material={m.trim} castShadow>
          <boxGeometry args={[0.13, SEAT_HEIGHT, 0.5]} />
        </mesh>
      ))}
    </group>
  );
}

function Planter({ position, m }: { position: [number, number, number]; m: WorldMaterials }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} material={m.planter} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.34, 0.6, 18]} />
      </mesh>
      <mesh position={[0, 0.95, 0]} material={m.foliage} castShadow>
        <sphereGeometry args={[0.5, 18, 14]} />
      </mesh>
      <mesh position={[0.28, 1.35, 0.1]} material={m.foliageDark} castShadow>
        <sphereGeometry args={[0.34, 16, 12]} />
      </mesh>
      <mesh position={[-0.26, 1.28, -0.12]} material={m.foliage} castShadow>
        <sphereGeometry args={[0.3, 16, 12]} />
      </mesh>
    </group>
  );
}

function CorridorShell({ m }: { m: WorldMaterials }) {
  return (
    <group>
      <DressedWall axis="z" at={CORRIDOR.minX} from={CORRIDOR.minZ} to={CORRIDOR.maxZ} height={3.2} m={m} />
      <DressedWall axis="z" at={CORRIDOR.maxX} from={CORRIDOR.minZ} to={CORRIDOR.maxZ} height={3.2} m={m} />
      {/* Just under the wall tops: level with them, the ceiling and the wall
          caps would be coplanar and flicker along every edge. */}
      <mesh position={[0, 3.18, (CORRIDOR.minZ + CORRIDOR.maxZ) / 2]} rotation={[Math.PI / 2, 0, 0]} material={m.ceiling}>
        <planeGeometry args={[CORRIDOR.maxX - CORRIDOR.minX, CORRIDOR.maxZ - CORRIDOR.minZ]} />
      </mesh>
      {/* Doorway frames, sized to stand inside the opening rather than
          straddling the wall's edge. Sharing a face with the wall there put
          two coplanar surfaces at identical depth, which is exactly the
          flicker that showed up when looking at a doorway from an angle. */}
      {[CORRIDOR.minZ, CORRIDOR.maxZ].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 2.45, 0]} material={m.trim} castShadow>
            <boxGeometry args={[DOOR_HALF_WIDTH * 2 - 0.2, 0.3, 0.5]} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (DOOR_HALF_WIDTH - 0.18), 1.2, 0]} material={m.trim} castShadow>
              <boxGeometry args={[0.22, 2.6, 0.5]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Getabako — the shoe lockers you'd pass on the way in. */}
      {Array.from({ length: 12 }, (_, i) => {
        const row = Math.floor(i / 4);
        const column = i % 4;
        return (
          <mesh
            key={i}
            position={[CORRIDOR.minX + 0.36, 0.42 + row * 0.5, CORRIDOR.minZ + 1 + column * 1.15]}
            material={column % 2 === 0 ? m.furnitureLight : m.furnitureWarm}
            castShadow
          >
            <boxGeometry args={[0.4, 0.46, 1.05]} />
          </mesh>
        );
      })}
    </group>
  );
}

const CLASSROOM_WINDOW_Z = [-20.5, -17.5, -14.5, -11.6];
const CLASSROOM_WINDOW_WIDTH = 2.2;
const CLASSROOM_WINDOW_HEIGHT = 1.7;
const CLASSROOM_WINDOW_CENTER_Y = 2;
const CLASSROOM_WINDOW_SILL = 1.08;
const CLASSROOM_WINDOW_HEADER = 2.92;

function ClassroomShell({ m }: { m: WorldMaterials }) {
  return (
    <group>
      <DressedWall
        axis="x"
        at={CLASSROOM.maxZ}
        from={CLASSROOM.minX}
        to={CLASSROOM.maxX}
        height={CLASSROOM_WALL_HEIGHT}
        gaps={[{ from: -DOOR_HALF_WIDTH, to: DOOR_HALF_WIDTH }]}
        m={m}
      />
      <ClassroomDoor m={m} />
      <DressedWall axis="x" at={CLASSROOM.minZ} from={CLASSROOM.minX} to={CLASSROOM.maxX} height={CLASSROOM_WALL_HEIGHT} m={m} />
      <DressedWall
        axis="z"
        at={CLASSROOM.minX}
        from={CLASSROOM.minZ}
        to={CLASSROOM.maxZ}
        height={CLASSROOM_WALL_HEIGHT}
        m={m}
        windows={CLASSROOM_WINDOW_Z.map((center) => ({
          center,
          width: CLASSROOM_WINDOW_WIDTH,
          sillY: CLASSROOM_WINDOW_SILL,
          headerY: CLASSROOM_WINDOW_HEADER,
        }))}
      />
      <DressedWall axis="z" at={CLASSROOM.maxX} from={CLASSROOM.minZ} to={CLASSROOM.maxZ} height={CLASSROOM_WALL_HEIGHT} m={m} />
      <mesh
        position={[0, CLASSROOM_WALL_HEIGHT - 0.02, (CLASSROOM.minZ + CLASSROOM.maxZ) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        material={m.ceiling}
      >
        <planeGeometry args={[CLASSROOM.maxX - CLASSROOM.minX, CLASSROOM.maxZ - CLASSROOM.minZ]} />
      </mesh>

      {/* Window wall, the way a Japanese classroom is usually laid out —
          real openings (see DressedWall's `windows` prop), so the sunset
          outside and its low light actually come through. */}
      {CLASSROOM_WINDOW_Z.map((z) => (
        <Window
          key={z}
          position={[CLASSROOM.minX + 0.2, CLASSROOM_WINDOW_CENTER_Y, z]}
          rotationY={Math.PI / 2}
          width={CLASSROOM_WINDOW_WIDTH}
          height={CLASSROOM_WINDOW_HEIGHT}
          m={m}
        />
      ))}

      {/* Ceiling lamps. One light per fixture rather than a single bright
          one between them: a lone lamp at twice the intensity put a hot
          spot in the middle of the room and left the corners dim, which is
          exactly what "too bright" looked like from inside. */}
      {[-20, -14.5].map((z) => (
        <group key={z} position={[0, CLASSROOM_WALL_HEIGHT - 0.25, z]}>
          <mesh material={m.lantern}>
            <cylinderGeometry args={[0.7, 0.7, 0.12, 20]} />
          </mesh>
          <pointLight position={[0, -0.2, 0]} intensity={5.5} distance={17} decay={2} color="#ffeccd" />
        </group>
      ))}
      {/* The glow of a low sun coming through the window wall. It used to
          sit 1.2m off that wall, so with inverse-square falloff the plaster
          beside it took the full brightness and blew out to white. Moved
          into the room and dimmed: the windows still wash the floor warm,
          but nothing near them clips. */}
      <pointLight position={[CLASSROOM.minX + 4.2, 2.1, -17]} intensity={5} distance={19} decay={2} color="#ffbe86" />
    </group>
  );
}

function ClassroomFurniture({ m }: { m: WorldMaterials }) {
  const boardZ = CLASSROOM.minZ + WALL_THICKNESS / 2 + 0.12;
  return (
    <group>
      {/* Chalkboard and chalk tray. */}
      <group position={[0, 1.8, boardZ]}>
        <mesh material={m.trim} castShadow>
          <boxGeometry args={[6.6, 1.95, 0.12]} />
        </mesh>
        <mesh position={[0, 0, 0.08]} material={m.board}>
          <boxGeometry args={[6.3, 1.65, 0.04]} />
        </mesh>
        <mesh position={[0, -1.06, 0.12]} material={m.furnitureLight} castShadow>
          <boxGeometry args={[6.6, 0.1, 0.24]} />
        </mesh>
      </group>

      {/* Teacher's desk, facing the class. */}
      <group position={TEACHER_DESK}>
        <mesh position={[0, 0.74, 0]} material={m.furnitureTop} castShadow receiveShadow>
          <boxGeometry args={[1.9, 0.08, 0.85]} />
        </mesh>
        <mesh position={[0, 0.38, 0.36]} material={m.furnitureWarm} castShadow>
          <boxGeometry args={[1.9, 0.72, 0.1]} />
        </mesh>
        {[
          [-0.88, -0.36],
          [0.88, -0.36],
          [-0.88, 0.3],
          [0.88, 0.3],
        ].map(([x, z]) => (
          <mesh key={`${x}-${z}`} position={[x, 0.36, z]} material={m.metal}>
            <boxGeometry args={[0.07, 0.72, 0.07]} />
          </mesh>
        ))}
      </group>
      <Chair position={[TEACHER_DESK[0], 0, TEACHER_DESK[2] - 0.78]} rotationY={Math.PI} m={m} />

      {/* Student desks, each with a chair behind it. */}
      {DESKS.map((desk) => (
        <group key={`${desk.row}-${desk.column}`}>
          <group position={desk.position}>
            <mesh position={[0, 0.72, 0]} material={m.furnitureTop} castShadow receiveShadow>
              <boxGeometry args={[1.15, 0.07, 0.62]} />
            </mesh>
            <mesh position={[0, 0.5, 0.26]} material={m.furnitureLight} castShadow>
              <boxGeometry args={[1.05, 0.34, 0.06]} />
            </mesh>
            {[
              [-0.5, -0.24],
              [0.5, -0.24],
              [-0.5, 0.24],
              [0.5, 0.24],
            ].map(([x, z]) => (
              <mesh key={`${x}-${z}`} position={[x, 0.35, z]} material={m.metal}>
                <boxGeometry args={[0.06, 0.7, 0.06]} />
              </mesh>
            ))}
            {/* No paper drawn here on purpose: the notes on these desks are
                real objects that can be written on and moved, placed from
                world.json's defaultObjects. */}
          </group>
          <Chair position={[desk.position[0], 0, desk.position[2] + 0.78]} rotationY={0} m={m} />
        </group>
      ))}

      {/* Notice board on the wall opposite the windows. */}
      <group position={[CLASSROOM.maxX - 0.2, 1.9, -17]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh material={m.trim} castShadow>
          <boxGeometry args={[3, 1.6, 0.1] } />
        </mesh>
        <mesh position={[0, 0, 0.06]} material={m.paper}>
          <boxGeometry args={[2.8, 1.4, 0.03]} />
        </mesh>
        {[
          { x: -0.85, y: 0.3, material: m.accentBlue },
          { x: 0.1, y: 0.34, material: m.accentRed },
          { x: 0.95, y: 0.2, material: m.foliage },
          { x: -0.5, y: -0.38, material: m.accentRed },
          { x: 0.6, y: -0.42, material: m.accentBlue },
        ].map((note, i) => (
          <mesh key={i} position={[note.x, note.y, 0.09]} material={note.material}>
            <boxGeometry args={[0.6, 0.44, 0.02]} />
          </mesh>
        ))}
      </group>

      {/* Wall clock, off to the side of the doorway so it has wall behind it. */}
      <group position={[4.6, 2.7, CLASSROOM.maxZ - 0.22]} rotation={[0, Math.PI, 0]}>
        <mesh material={m.trim}>
          <cylinderGeometry args={[0.28, 0.28, 0.07, 24]} />
        </mesh>
        <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={m.paper}>
          <circleGeometry args={[0.24, 24]} />
        </mesh>
      </group>
    </group>
  );
}
