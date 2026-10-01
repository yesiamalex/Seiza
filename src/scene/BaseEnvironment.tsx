import { memo, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import * as THREE_RUNTIME from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { getWorldMaterials, type WorldMaterials } from "./materials";
import { Chair } from "./Chair";
import { SeatPad } from "./SeatPad";
import { Pond } from "./Pond";
import { DateCalendar, WallClock } from "./ClassroomClock";
import { LightSwitch } from "./LightSwitch";
import type { LightZone } from "../multiplayer/types";
import { playDoorSlide, playDoorSwing } from "../audio/sfx";
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
  POND_CENTER,
  POND_WATER_RADIUS,
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
  /** Light-switch state per zone; everything is lit when omitted. */
  lights?: Record<LightZone, boolean>;
  /** Flip a zone's lights. Omitted, the switches are shown but inert. */
  onToggleLight?: (zone: LightZone, on: boolean) => void;
}

const ALL_LIGHTS_ON: Record<LightZone, boolean> = { hall: true, classroom: true };

/**
 * A lamp material for one zone: a clone of the shared lantern material, so
 * switching one room off doesn't darken the other room's fittings. Off,
 * the shade keeps a faint glow, as paper over a cooling bulb does.
 */
function useZoneLampMaterial(m: WorldMaterials, on: boolean) {
  const material = useMemo(() => (m.lantern as THREE.MeshStandardMaterial).clone(), [m]);
  useEffect(() => () => material.dispose(), [material]);
  material.emissiveIntensity = on ? (m.lantern as THREE.MeshStandardMaterial).emissiveIntensity : 0.06;
  return material;
}

export const BaseEnvironment = memo(function BaseEnvironment({
  onFloorDoubleClick,
  onSit,
  occupiedSeatId,
  lights = ALL_LIGHTS_ON,
  onToggleLight,
}: BaseEnvironmentProps) {
  const m = getWorldMaterials();
  return (
    <group>
      <Floors m={m} onFloorDoubleClick={onFloorDoubleClick} />
      <HallShell m={m} />
      <HallFurniture m={m} lit={lights.hall} onToggleLight={onToggleLight} />
      <OutdoorGarden m={m} />
      <CorridorShell m={m} />
      <ClassroomShell m={m} lit={lights.classroom} onToggleLight={onToggleLight} />
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
      {/* With a hole where the pond's basin sinks below ground (Pond.tsx). */}
      <FloorPlane
        rect={OUTDOOR}
        material={m.classroomFloor}
        onDoubleClick={handleDoubleClick}
        hole={{ x: POND_CENTER[0], z: POND_CENTER[1], radius: POND_WATER_RADIUS + 0.04 }}
      />
      <FloorPlane rect={CORRIDOR} material={m.corridorFloor} onDoubleClick={handleDoubleClick} />
      <FloorPlane rect={CLASSROOM} material={m.classroomFloor} onDoubleClick={handleDoubleClick} />
    </group>
  );
}

function FloorPlane({
  rect,
  material,
  onDoubleClick,
  hole,
}: {
  rect: Rect;
  material: THREE.Material;
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
  /** A round opening in the floor (world x/z), e.g. for the pond. */
  hole?: { x: number; z: number; radius: number };
}) {
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;
  const holed = useMemo(() => {
    if (!hole) return null;
    // Built in the plane's own space (x right, y = -z once laid flat).
    const shape = new THREE_RUNTIME.Shape();
    shape.moveTo(-width / 2, -depth / 2);
    shape.lineTo(width / 2, -depth / 2);
    shape.lineTo(width / 2, depth / 2);
    shape.lineTo(-width / 2, depth / 2);
    shape.closePath();
    const opening = new THREE_RUNTIME.Path();
    opening.absarc(hole.x - cx, -(hole.z - cz), hole.radius, 0, Math.PI * 2, true);
    shape.holes.push(opening);
    const geometry = new THREE_RUNTIME.ShapeGeometry(shape, 48);
    // ShapeGeometry's UVs are in metres; the floor materials expect 0-1
    // across the plane, like the PlaneGeometry they replace here.
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, position.getX(i) / width + 0.5, position.getY(i) / depth + 0.5);
    }
    return geometry;
  }, [hole?.x, hole?.z, hole?.radius, width, depth, cx, cz]);
  useEffect(() => () => holed?.dispose(), [holed]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow material={material} onDoubleClick={onDoubleClick}>
      {holed ? <primitive object={holed} attach="geometry" /> : <planeGeometry args={[width, depth]} />}
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

      {/* The hall's two doorway gaps are cut the full height of the wall,
          so above each door header there was a hole straight through to
          the sky, and the corridor's wall caps stuck out into it. These
          fill the wall back in above the doors. */}
      <DoorLintel z={HALL.minZ} bottom={2.6} m={m} />
      <DoorLintel z={HALL.maxZ} bottom={2.64} m={m} />

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

/** Wall above a hall doorway, from the door header to the top of the wall,
 *  with the wall's top trim carried across it. */
function DoorLintel({ z, bottom, m }: { z: number; bottom: number; m: WorldMaterials }) {
  const width = DOOR_HALF_WIDTH * 2;
  return (
    <group>
      <mesh position={[0, (bottom + WALL_HEIGHT) / 2, z]} material={m.wall} castShadow receiveShadow>
        <boxGeometry args={[width, WALL_HEIGHT - bottom, WALL_THICKNESS]} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT - 0.12, z]} material={m.trim}>
        <boxGeometry args={[width, 0.16, WALL_THICKNESS + 0.2]} />
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
      playDoorSwing();
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

/**
 * Geometry for ClassroomDoor's two sliding leaves.
 *
 * A pocket door: the leaves run on two tracks inside the wall's own
 * thickness and slide *into* the wall to open, the way fusuma and many
 * shoji do. Earlier versions hung them in front of the wall, which needed
 * a header rail running metres along the wall face for them to travel
 * on; that rail, and a transom panel standing proud of the wall, are what
 * read as beams clipping through it.
 *
 * Each leaf is a little wider than half the opening: they overlap at the
 * centre on separate tracks, and each tucks into the wall on its own side,
 * so a closed door leaves no light gaps anywhere.
 */
const SHOJI_HALF_OPENING = DOOR_HALF_WIDTH;
const SHOJI_EDGE_TUCK = 0.06;
const SHOJI_CENTER_OVERLAP = 0.04;
const SHOJI_PANEL_WIDTH = SHOJI_HALF_OPENING + SHOJI_EDGE_TUCK + SHOJI_CENTER_OVERLAP;
const SHOJI_PANEL_HEIGHT = 2.4;
const SHOJI_PANEL_DEPTH = 0.04;
/** Distance between the two tracks, so the overlapping leaves never z-fight. */
const SHOJI_TRACK_SPACING = 0.06;
/** The door runs down the middle of the wall. */
const SHOJI_DOOR_Z = CLASSROOM.maxZ;
/** Top of the head jamb (kamoi) the leaves slide under. */
const SHOJI_HEAD_TOP = SHOJI_PANEL_HEIGHT + 0.14;

/**
 * A two-panel shoji-style sliding door at the corridor->classroom
 * threshold (see the matching gap cut into ClassroomShell's south wall).
 * Structurally the same idea as GardenDoor: click to toggle, a lerped
 * transform each frame, and a shared Obstacle disabled while open, but
 * sliding along X instead of swinging on rotation.y, and with a lattice
 * ("kumiko") look built from a handful of thin boxes over a paper pane
 * rather than a loaded model, consistent with how the rest of this
 * procedural environment is built.
 */
function ClassroomDoor({ m }: { m: WorldMaterials }) {
  const [open, setOpen] = useState(false);
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  // Each leaf's centre (absolute x, mirrored for the left leaf). Closed:
  // outer edge tucked into the wall, inner edge past the centre line.
  // Open: slid into the wall until its inner edge is just inside the
  // jamb, so the doorway is clear and the leaf is hidden in the wall.
  const closedX = SHOJI_HALF_OPENING + SHOJI_EDGE_TUCK - SHOJI_PANEL_WIDTH / 2;
  const openX = SHOJI_HALF_OPENING + 0.02 + SHOJI_PANEL_WIDTH / 2;

  // See the identical effect on GardenDoor above for why this exists: a
  // remounted door (e.g. after an editor environment swap) should never
  // inherit a stale `disabled: true` from a previous instance that
  // happened to be open when it unmounted.
  useEffect(() => {
    CLASSROOM_DOOR_OBSTACLE.disabled = false;
  }, []);

  useFrame((_, delta) => {
    const amount = 1 - Math.exp(-7 * Math.min(delta, 0.05));
    // Absolute targets, mirrored for the left leaf.
    const target = open ? openX : closedX;
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
      // Matches the ~0.35s slide the useFrame lerp above produces.
      playDoorSlide(0.35);
      return next;
    });
  };

  const openingWidth = SHOJI_HALF_OPENING * 2;
  return (
    <group>
      {/* Sill (shikii) and head jamb (kamoi), each exactly as wide as the
          opening and as deep as the wall plus a lip, then plain wall above
          the head jamb up to the top, flush with the wall either side. */}
      <mesh position={[0, 0.015, SHOJI_DOOR_Z]} material={m.trim} receiveShadow>
        <boxGeometry args={[openingWidth, 0.03, WALL_THICKNESS + 0.06]} />
      </mesh>
      <mesh position={[0, SHOJI_HEAD_TOP - 0.07, SHOJI_DOOR_Z]} material={m.trim} castShadow>
        <boxGeometry args={[openingWidth, 0.14, WALL_THICKNESS + 0.06]} />
      </mesh>
      {/* Thin edge liners where the wall is cut for the doorway: wainscot
          material up to the wainscot's height (it stands 4cm proud of the
          wall, and its raw cut end read as clipping beside the closed
          leaves), plain wall above. Only 1.2cm wide, so the leaves still
          visibly slide away into the wall. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (SHOJI_HALF_OPENING - 0.006), 0, SHOJI_DOOR_Z]}>
          <mesh position={[0, 0.475, 0]} material={m.wainscot}>
            <boxGeometry args={[0.012, 0.95, WALL_THICKNESS + 0.08]} />
          </mesh>
          <mesh position={[0, (0.95 + SHOJI_HEAD_TOP) / 2, 0]} material={m.wall}>
            <boxGeometry args={[0.012, SHOJI_HEAD_TOP - 0.95, WALL_THICKNESS]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, (SHOJI_HEAD_TOP + CLASSROOM_WALL_HEIGHT) / 2, SHOJI_DOOR_Z]} material={m.wall} receiveShadow>
        <boxGeometry args={[openingWidth, CLASSROOM_WALL_HEIGHT - SHOJI_HEAD_TOP, WALL_THICKNESS]} />
      </mesh>
      {/* The wall's top trim, carried across the doorway like the rest. */}
      <mesh position={[0, CLASSROOM_WALL_HEIGHT - 0.12, SHOJI_DOOR_Z]} material={m.trim}>
        <boxGeometry args={[openingWidth, 0.16, WALL_THICKNESS + 0.2]} />
      </mesh>

      {/* Sill (shikii) and head jamb (kamoi): the grooved timbers the
          leaves actually run in. A previous version dropped them because
          the rail it used ran metres along the wall face and read as a
          beam clipping through it. These don't: each spans the opening
          and nothing more, and sits only a little proud of the wall on
          both faces, which is what a real tracked door looks like. Both
          are comfortably inside |x| < DOOR_HALF_WIDTH, so neither can
          reach the clocks or the light switch further along this wall. */}
      <mesh position={[0, 0.025, SHOJI_DOOR_Z]} material={m.trim} receiveShadow>
        <boxGeometry args={[openingWidth, 0.05, WALL_THICKNESS + 0.05]} />
      </mesh>
      {/* Two shallow grooves, one per track, so the sill reads as carrying
          two leaves rather than being a plain plinth. */}
      {[SHOJI_TRACK_SPACING / 2, -SHOJI_TRACK_SPACING / 2].map((offset) => (
        <mesh key={offset} position={[0, 0.052, SHOJI_DOOR_Z + offset]} material={m.wall}>
          <boxGeometry args={[openingWidth - 0.04, 0.008, 0.022]} />
        </mesh>
      ))}
      <mesh position={[0, SHOJI_HEAD_TOP - 0.05, SHOJI_DOOR_Z]} material={m.trim} castShadow receiveShadow>
        <boxGeometry args={[openingWidth, 0.1, WALL_THICKNESS + 0.05]} />
      </mesh>

      {[
        { groupRef: leftRef, x: -closedX, z: SHOJI_DOOR_Z + SHOJI_TRACK_SPACING / 2 },
        { groupRef: rightRef, x: closedX, z: SHOJI_DOOR_Z - SHOJI_TRACK_SPACING / 2 },
      ].map(({ groupRef, x, z }, i) => (
        <group key={i} ref={groupRef} position={[x, 0.03, z]}>
          {/* Outer frame (kamachi), also the click target, same as GardenDoor's leaves. */}
          <mesh position={[0, SHOJI_PANEL_HEIGHT / 2, 0]} material={m.trim} castShadow onClick={toggle}>
            <boxGeometry args={[SHOJI_PANEL_WIDTH, SHOJI_PANEL_HEIGHT, SHOJI_PANEL_DEPTH]} />
          </mesh>
          {/* Washi paper inset, on both faces so it reads from either room. */}
          {[1, -1].map((face) => (
            <mesh
              key={`paper-${face}`}
              position={[0, SHOJI_PANEL_HEIGHT / 2, face * (SHOJI_PANEL_DEPTH / 2 + 0.002)]}
              rotation={[0, face > 0 ? 0 : Math.PI, 0]}
              material={m.paper}
              onClick={toggle}
            >
              <planeGeometry args={[SHOJI_PANEL_WIDTH - 0.1, SHOJI_PANEL_HEIGHT - 0.1]} />
            </mesh>
          ))}
          {/* Kumiko lattice: a few thin wood strips over the paper, enough
              to read as shoji at a glance without modeling every muntin. */}
          {[0.32, 0.56, 0.8].map((t) => (
            <mesh key={`h-${t}`} position={[0, SHOJI_PANEL_HEIGHT * t, 0]} material={m.trim}>
              <boxGeometry args={[SHOJI_PANEL_WIDTH - 0.1, 0.025, SHOJI_PANEL_DEPTH + 0.012]} />
            </mesh>
          ))}
          {[-1 / 3, 0, 1 / 3].map((t) => (
            <mesh key={`v-${t}`} position={[t * (SHOJI_PANEL_WIDTH - 0.1) * 0.75, SHOJI_PANEL_HEIGHT / 2, 0]} material={m.trim}>
              <boxGeometry args={[0.025, SHOJI_PANEL_HEIGHT - 0.1, SHOJI_PANEL_DEPTH + 0.012]} />
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
      <Pond />
    </group>
  );
}

function HallFurniture({ m, lit, onToggleLight }: { m: WorldMaterials; lit: boolean; onToggleLight?: (zone: LightZone, on: boolean) => void }) {
  const lamp = useZoneLampMaterial(m, lit);
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

      {/* Light switch for the lanterns, on the wall beside the corridor
          doorway. */}
      <group position={[DOOR_HALF_WIDTH + 0.95, 1.2, HALL.minZ + WALL_THICKNESS / 2 + 0.008]}>
        <LightSwitch on={lit} onToggle={onToggleLight && ((on) => onToggleLight("hall", on))} />
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
          <mesh position={[0, 2.75, 0]} material={lamp}>
            <sphereGeometry args={[0.26, 20, 14]} />
          </mesh>
          {/* Dimmed to zero rather than unmounted when switched off: removing
              a light changes the light count, which recompiles every
              material's shader; an intensity of 0 costs nothing. */}
          {post.light && <pointLight position={[0, 2.75, 0]} intensity={lit ? 13 : 0} distance={20} decay={2} color="#ffd2a0" />}
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

function ClassroomShell({ m, lit, onToggleLight }: { m: WorldMaterials; lit: boolean; onToggleLight?: (zone: LightZone, on: boolean) => void }) {
  const lamp = useZoneLampMaterial(m, lit);
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
      {/* Light switch on the classroom side, a step clear of the doorway
          so it doesn't crowd the door's edge. */}
      <group position={[-(DOOR_HALF_WIDTH + 0.95), 1.2, CLASSROOM.maxZ - WALL_THICKNESS / 2 - 0.008]} rotation={[0, Math.PI, 0]}>
        <LightSwitch on={lit} onToggle={onToggleLight && ((on) => onToggleLight("classroom", on))} />
      </group>
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
          <mesh material={lamp}>
            <cylinderGeometry args={[0.7, 0.7, 0.12, 20]} />
          </mesh>
          <pointLight position={[0, -0.2, 0]} intensity={lit ? 5.5 : 0} distance={17} decay={2} color="#ffeccd" />
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
      {/* Faces into the classroom (-Z), with a tear-off date calendar
          beside it. Both show the viewer's own local time. */}
      {/* Two time-zone clocks, hotel-lobby style. Facing into the room,
          the Philippines clock is on the left. */}
      <group position={[4.85, 2.78, CLASSROOM.maxZ - WALL_THICKNESS / 2 - 0.035]} rotation={[0, Math.PI, 0]}>
        <WallClock m={m} timeZone="Asia/Manila" label="PHILIPPINES" />
      </group>
      <group position={[4.05, 2.78, CLASSROOM.maxZ - WALL_THICKNESS / 2 - 0.035]} rotation={[0, Math.PI, 0]}>
        <WallClock m={m} timeZone="Asia/Tokyo" label="JAPAN" />
      </group>
      <group position={[5.75, 2.66, CLASSROOM.maxZ - WALL_THICKNESS / 2 - 0.012]} rotation={[0, Math.PI, 0]}>
        <DateCalendar m={m} />
      </group>
    </group>
  );
}
