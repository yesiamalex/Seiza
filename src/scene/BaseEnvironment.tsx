import { memo, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import * as THREE_RUNTIME from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getWorldMaterials, type WorldMaterials } from "./materials";
import { Chair } from "./Chair";
import { SeatPad } from "./SeatPad";
import { Pond } from "./Pond";
import { DateCalendar, WallClock } from "./ClassroomClock";
import { LightSwitch } from "./LightSwitch";
import { PooledLight } from "./LightPool";
import { WindowSun } from "./WindowSun";
import { Campsite } from "./Campsite";
import { GardenSteps } from "./GardenSteps";
import { buildMeadowGeometry } from "./meadow";
import { DEFAULT_LIGHTS, type LightZone } from "../multiplayer/types";
import { playDoorSlide, playDoorSwing } from "../audio/sfx";
import {
  BENCHES,
  BENCH_LENGTH,
  CLASSROOM,
  CLASSROOM_DOOR_OBSTACLE,
  CLASSROOM_WALL_HEIGHT,
  CORRIDOR,
  DESKS,
  DOOR_CASING_INNER,
  DOOR_CLEAR_HALF,
  DOOR_HALF_WIDTH,
  GARDEN_DOOR_OBSTACLE,
  GARDEN_DOOR_OPEN_OBSTACLES,
  HALL,
  HALL_CENTRE,
  OUTDOOR,
  GARDEN_LAMPS,
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

const ALL_LIGHTS_ON = DEFAULT_LIGHTS;
/** Each hall lantern's light. Four of them now, where two used to carry
 *  13 each, so each is dimmer and the hall is lit more evenly. */
const LANTERN_INTENSITY = 8;
/** Each garden lamppost's light. */
const GARDEN_LAMP_INTENSITY = 9;

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
      <OutdoorGarden m={m} lit={lights.pond} onToggleLight={onToggleLight} />
      <CorridorShell m={m} />
      <ClassroomShell m={m} lit={lights.classroom} onToggleLight={onToggleLight} />
      <ClassroomFurniture m={m} />
      <Campsite lit={lights.camp} onToggle={onToggleLight} inBed={occupiedSeatId?.startsWith("camp-bed") ?? false} />
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
      {/* The meadow's ground is drawn with the lawn (Outdoors.tsx), which
          the navigation mesh ignores. This invisible copy of it is what
          click-to-walk and the navigation mesh find there. */}
      <mesh geometry={meadowFloor} material={invisibleFloor} onDoubleClick={handleDoubleClick} />
      <GardenSteps />
    </group>
  );
}

const meadowFloor = buildMeadowGeometry();

/** Drawn as nothing, but still there to raycast and to build a navmesh from. */
const invisibleFloor = new THREE_RUNTIME.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

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
  corners,
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
  corners?: Corners;
}) {
  // At a corner, one wall runs through to the outside face and the other
  // stops flush against it, layer by layer. Both stopping at the corner
  // point left a notch the size of the wall's thickness on the outside,
  // with the walls' end faces flickering in it.
  const extend = corners === "through" ? thickness / 2 : corners === "inside" ? -thickness / 2 : 0;
  from -= extend;
  to += extend;
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
/** How a wall meets the walls at its two ends: running through the
 *  corners, or stopping inside them. */
type Corners = "through" | "inside";

function DressedWall(props: {
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  height: number;
  gaps?: Gap[];
  m: WorldMaterials;
  windows?: WindowOpening[];
  corners?: Corners;
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
const HALL_WINDOW_HEIGHT = 1.5;
// Cut to the frame's outer size, like the classroom's: the old hand-set
// values left a slot through the wall above and below each window.
const HALL_WINDOW_SILL = HALL_WINDOW_CENTER_Y - HALL_WINDOW_HEIGHT / 2;
const HALL_WINDOW_HEADER = HALL_WINDOW_CENTER_Y + HALL_WINDOW_HEIGHT / 2;

function HallShell({ m }: { m: WorldMaterials }) {
  return (
    <group>
      {/* North wall is the entrance; south opens into the corridor. */}
      <DressedWall axis="x" at={HALL.maxZ} from={HALL.minX} to={HALL.maxX} height={WALL_HEIGHT} gaps={[{ from: -DOOR_HALF_WIDTH, to: DOOR_HALF_WIDTH }]} m={m} corners="through" />
      <DressedWall
        axis="x"
        at={HALL.minZ}
        corners="through"
        from={HALL.minX}
        to={HALL.maxX}
        height={WALL_HEIGHT}
        gaps={[{ from: -DOOR_HALF_WIDTH, to: DOOR_HALF_WIDTH }]}
        m={m}
      />
      <DressedWall
        axis="z"
        at={HALL.minX}
        corners="inside"
        from={HALL.minZ}
        to={HALL.maxZ}
        height={WALL_HEIGHT}
        m={m}
        windows={HALL_WINDOW_Z.map((center) => ({ center, width: HALL_WINDOW_WIDTH, sillY: HALL_WINDOW_SILL, headerY: HALL_WINDOW_HEADER }))}
      />
      <DressedWall
        axis="z"
        at={HALL.maxX}
        corners="inside"
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
        <Window key={`w-${z}`} position={[HALL.minX + 0.2, HALL_WINDOW_CENTER_Y, z]} rotationY={Math.PI / 2} width={HALL_WINDOW_WIDTH} height={HALL_WINDOW_HEIGHT} m={m} />
      ))}
      {HALL_WINDOW_Z.map((z) => (
        <Window key={`e-${z}`} position={[HALL.maxX - 0.2, HALL_WINDOW_CENTER_Y, z]} rotationY={-Math.PI / 2} width={HALL_WINDOW_WIDTH} height={HALL_WINDOW_HEIGHT} m={m} />
      ))}
      {/* Low sun through those windows, as in the classroom. */}
      <WindowSun west={[HALL.minX + 4.2, 2.1, 7.5]} east={[HALL.maxX - 4.2, 2.1, 7.5]} />

      {/* The hall's two doorway gaps are cut the full height of the wall,
          so above each door header there was a hole straight through to
          the sky, and the corridor's wall caps stuck out into it. These
          fill the wall back in above the doors. */}
      <DoorLintel z={HALL.minZ} bottom={2.6} m={m} />
      <DoorLintel z={HALL.maxZ} bottom={2.64} m={m} />

      {/* Entrance into the bounded garden beyond the hall. The header sits
          just above the leaves' tops: close enough that no slot of sky
          shows over a shut door, clear enough that they swing freely. */}
      <DoorCasing z={HALL.maxZ} headerBottom={GARDEN_LEAF_HEIGHT + 0.005} headerTop={2.64} m={m} />
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

/** How far a door casing's posts reach in from the opening's edge, and
 *  past it over the wall either side. */
const CASING_INNER = DOOR_CASING_INNER;
const CASING_OUTER = 0.06;
/** Deeper than the wainscot (WALL_THICKNESS + 0.08) by a 4cm lip on each
 *  face, so no cut wall or wainscot end shows past it. */
const CASING_DEPTH = WALL_THICKNESS + 0.08 + 0.08;
/** Inner face of a casing's posts: the clear half-width of the doorway. */
const CASING_CLEAR_HALF = DOOR_CLEAR_HALF;

/**
 * Posts and header round a hall doorway.
 *
 * Each post runs from inside the opening to a little past its edge, over
 * the wall's cut end, and is deeper than the wainscot, so it covers every
 * raw end at the opening: the hall wall's, its wainscot's, and the
 * corridor walls' (which are centred on the opening's edges, so half of
 * each stands inside it). The old posts stopped a few centimetres short
 * of the edge and were shallower than the wainscot, which left a slot of
 * mismatched ends at each corner.
 *
 * The posts stop at the header's underside and the header spans their
 * full outer width, so the two meet face to face instead of overlapping
 * with coplanar sides, which flickered.
 */
function DoorCasing({ z, headerBottom, headerTop, m }: { z: number; headerBottom: number; headerTop: number; m: WorldMaterials }) {
  const outer = DOOR_HALF_WIDTH + CASING_OUTER;
  const postWidth = outer - CASING_CLEAR_HALF;
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, (headerBottom + headerTop) / 2, 0]} material={m.trim} castShadow>
        <boxGeometry args={[outer * 2, headerTop - headerBottom, CASING_DEPTH]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (CASING_CLEAR_HALF + postWidth / 2), headerBottom / 2, 0]} material={m.trim} castShadow>
          <boxGeometry args={[postWidth, headerBottom, CASING_DEPTH]} />
        </mesh>
      ))}
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
    for (const leaf of GARDEN_DOOR_OPEN_OBSTACLES) leaf.disabled = true;
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
      for (const leaf of GARDEN_DOOR_OPEN_OBSTACLES) leaf.disabled = !next;
      playDoorSwing();
      return next;
    });
  };
  return (
    <group>
      {/* Hinged at the casing's inner face, on the leaf's hall-side face,
          so a swinging leaf turns away from the post instead of through it. */}
      <group ref={leftRef} position={[-CASING_CLEAR_HALF, 0, GARDEN_HINGE_Z]}>
        <GardenDoorLeaf direction={1} m={m} onClick={toggle} />
      </group>
      <group ref={rightRef} position={[CASING_CLEAR_HALF, 0, GARDEN_HINGE_Z]}>
        <GardenDoorLeaf direction={-1} m={m} onClick={toggle} />
      </group>
    </group>
  );
}

/** Each leaf meets the other at the centre with a hair of clearance. */
const GARDEN_LEAF_WIDTH = CASING_CLEAR_HALF - 0.005;
const GARDEN_LEAF_HEIGHT = 2.4;
const GARDEN_LEAF_DEPTH = 0.08;
const GARDEN_STILE = 0.14;
/** The leaves' hall-side face, where they hinge. They hang just inside
 *  the hall, clear of the wall's thickness, as before. */
const GARDEN_HINGE_Z = HALL.maxZ - 0.22; // matched in layout.ts's GARDEN_DOOR_OPEN_OBSTACLES
/** Solid kick panel at the bottom; glass from here up. */
const GARDEN_KICK = 0.5;

/**
 * One garden door leaf, hinged at its group's origin and extending along
 * `direction` (±X). A frame of stiles and rails round a real glass pane,
 * so the garden shows through a closed door. It used to be a solid slab
 * with a small pane laid over its face, which looked like glass but was
 * opaque wood behind it.
 */
function GardenDoorLeaf({ direction, m, onClick }: { direction: 1 | -1; m: WorldMaterials; onClick: (event: ThreeEvent<MouseEvent>) => void }) {
  const cx = (direction * GARDEN_LEAF_WIDTH) / 2;
  const glassWidth = GARDEN_LEAF_WIDTH - GARDEN_STILE * 2;
  const glassHeight = GARDEN_LEAF_HEIGHT - GARDEN_STILE - GARDEN_KICK;
  return (
    // Offset so the group's origin, the hinge, is on the leaf's face.
    <group position={[0, 0, GARDEN_LEAF_DEPTH / 2]}>
      {/* Kick panel and top rail. */}
      <mesh position={[cx, GARDEN_KICK / 2, 0]} material={m.trim} castShadow onClick={onClick}>
        <boxGeometry args={[GARDEN_LEAF_WIDTH, GARDEN_KICK, GARDEN_LEAF_DEPTH]} />
      </mesh>
      <mesh position={[cx, GARDEN_LEAF_HEIGHT - GARDEN_STILE / 2, 0]} material={m.trim} castShadow onClick={onClick}>
        <boxGeometry args={[GARDEN_LEAF_WIDTH, GARDEN_STILE, GARDEN_LEAF_DEPTH]} />
      </mesh>
      {/* Stiles. */}
      {[GARDEN_STILE / 2, GARDEN_LEAF_WIDTH - GARDEN_STILE / 2].map((x) => (
        <mesh key={x} position={[direction * x, GARDEN_KICK + glassHeight / 2, 0]} material={m.trim} castShadow onClick={onClick}>
          <boxGeometry args={[GARDEN_STILE, glassHeight, GARDEN_LEAF_DEPTH]} />
        </mesh>
      ))}
      {/* A thin glazing bar across the middle, so the pane reads as a
          door rather than a hole. */}
      <mesh position={[cx, GARDEN_KICK + glassHeight * 0.62, 0]} material={m.trim} onClick={onClick}>
        <boxGeometry args={[glassWidth, 0.04, GARDEN_LEAF_DEPTH * 0.6]} />
      </mesh>
      <mesh position={[cx, GARDEN_KICK + glassHeight / 2, 0]} material={m.glass} onClick={onClick}>
        <planeGeometry args={[glassWidth, glassHeight]} />
      </mesh>
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
const SHOJI_TRACK_SPACING = 0.04;
/**
 * How far the near track sits in front of the wall's own face.
 *
 * The leaves used to run down the middle of a 30cm wall, which meant
 * that opening the door slid them inside it and they vanished — there
 * was a wall in front of the door. Running them across the face instead
 * keeps them visible the whole way, which is both what a surface-mounted
 * shoji actually does and what makes it obvious the door is open rather
 * than gone. The sill and head jamb below are deepened to match, so the
 * leaves still read as running in a track rather than floating.
 */
/** How far the wainscot band stands out from the wall on each face
 *  (its runs use thickness = WALL_THICKNESS + 0.08). */
const WAINSCOT_PROUD = 0.04;
// Clear of the wainscot, not just of the wall. The wainscot band stands
// 4cm proud of the wall face, so leaves placed only a few millimetres off
// the wall ran straight through it and the lattice showed inside the
// dado — which is the clipping down the left-hand leaf. Half the panel
// depth plus a millimetre of air keeps the whole leaf in front of it.
const SHOJI_FACE_OFFSET = WALL_THICKNESS / 2 + WAINSCOT_PROUD + SHOJI_PANEL_DEPTH / 2 + 0.012;
/**
 * Depth of the sill and head jamb, derived rather than guessed: exactly
 * enough to reach from the wall's far face to just behind the outer
 * leaf, so the ridge contains both tracks and protrudes no further than
 * it has to. Picking this by hand is how the head jamb ended up looking
 * like a structural beam.
 */
const SHOJI_TRACK_BACK = SHOJI_FACE_OFFSET + SHOJI_TRACK_SPACING + SHOJI_PANEL_DEPTH / 2 + 0.012;
const SHOJI_TRACK_DEPTH = WALL_THICKNESS / 2 + SHOJI_TRACK_BACK;
const SHOJI_TRACK_CENTER = (WALL_THICKNESS / 2 - SHOJI_TRACK_BACK) / 2;
/** The door runs down the middle of the wall. */
const SHOJI_DOOR_Z = CLASSROOM.maxZ;
/** How far the sill runs past each side of the opening: the full travel
 *  of an open leaf plus a lip. */
const SHOJI_SILL_RUN = 0.02 + SHOJI_PANEL_WIDTH + 0.04;
/** The sill's back edge outside the opening, against the wainscot's face. */
const SHOJI_SILL_BACK = WALL_THICKNESS / 2 + WAINSCOT_PROUD;
/** How far the corridor's side wall, and its wainscot, reach into the
 *  opening from each edge (the wall is centred on the edge). */
const SHOJI_REVEAL_WALL = WALL_THICKNESS / 2;
const SHOJI_REVEAL_WAINSCOT = WALL_THICKNESS / 2 + WAINSCOT_PROUD;
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
  // The sill and head rail are in the darker beam wood so they read
  // against both the pale floor and the leaves' own frames. The grooves
  // are one shade deeper than that wood, as a worn, recessed channel
  // would be, rather than near-black lines.
  const grooveMaterial = useMemo(() => new THREE_RUNTIME.MeshStandardMaterial({ color: "#6e472a", roughness: 0.8 }), []);
  useEffect(() => () => grooveMaterial.dispose(), [grooveMaterial]);
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
      // Matched to the motion rather than guessed. The lerp above eases
      // at rate 7, so the leaf is within 1% of its target at ln(100)/7,
      // about 0.66s, and is still visibly moving for most of that. The
      // old 0.35s stopped less than halfway and left the door sliding in
      // silence.
      playDoorSlide(0.8);
      return next;
    });
  };

  const openingWidth = SHOJI_HALF_OPENING * 2;
  return (
    <group>
      {/* Sill (shikii) and head jamb (kamoi), each exactly as wide as the
          opening and as deep as the wall plus a lip, then plain wall above
          the head jamb up to the top, flush with the wall either side. */}
      <mesh position={[0, 0.015, SHOJI_DOOR_Z + SHOJI_TRACK_CENTER]} material={m.beam} receiveShadow>
        <boxGeometry args={[openingWidth, 0.03, SHOJI_TRACK_DEPTH]} />
      </mesh>
      {/* The shikii carried on past the opening along the leaves' whole
          travel, in front of the wall (and its wainscot), so an open leaf
          still rides in a track instead of gliding over bare floor. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`sill-${side}`}
          position={[side * (SHOJI_HALF_OPENING + SHOJI_SILL_RUN / 2), 0.015, SHOJI_DOOR_Z - (SHOJI_TRACK_BACK + SHOJI_SILL_BACK) / 2]}
          material={m.beam}
          receiveShadow
        >
          <boxGeometry args={[SHOJI_SILL_RUN, 0.03, SHOJI_TRACK_BACK - SHOJI_SILL_BACK]} />
        </mesh>
      ))}
      {/* A darker groove under each leaf, end to end, which is what makes
          the sill read as a track rather than a step. */}
      {[SHOJI_FACE_OFFSET, SHOJI_FACE_OFFSET + SHOJI_TRACK_SPACING].map((offset) => (
        <mesh key={`groove-${offset}`} position={[0, 0.0305, SHOJI_DOOR_Z - offset]} material={grooveMaterial}>
          <boxGeometry args={[(SHOJI_HALF_OPENING + SHOJI_SILL_RUN) * 2, 0.002, SHOJI_PANEL_DEPTH + 0.004]} />
        </mesh>
      ))}
      <mesh position={[0, SHOJI_HEAD_TOP - 0.07, SHOJI_DOOR_Z + SHOJI_TRACK_CENTER]} material={m.beam} castShadow>
        <boxGeometry args={[openingWidth, 0.14, SHOJI_TRACK_DEPTH]} />
      </mesh>
      {/* The kamoi likewise runs the leaves' whole travel, against the
          wall face, so an open leaf stays held at the top as well as the
          bottom. The leaves reach 3cm up into it. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`kamoi-${side}`}
          position={[side * (SHOJI_HALF_OPENING + SHOJI_SILL_RUN / 2), SHOJI_HEAD_TOP - 0.07, SHOJI_DOOR_Z - (SHOJI_TRACK_BACK + WALL_THICKNESS / 2) / 2]}
          material={m.beam}
          castShadow
        >
          <boxGeometry args={[SHOJI_SILL_RUN, 0.14, SHOJI_TRACK_BACK - WALL_THICKNESS / 2]} />
        </mesh>
      ))}
      {/* Grooves along its underside, one per leaf, matching the sill's. */}
      {[SHOJI_FACE_OFFSET, SHOJI_FACE_OFFSET + SHOJI_TRACK_SPACING].map((offset) => (
        <mesh key={`kamoi-groove-${offset}`} position={[0, SHOJI_HEAD_TOP - 0.1405, SHOJI_DOOR_Z - offset]} material={grooveMaterial}>
          <boxGeometry args={[(SHOJI_HALF_OPENING + SHOJI_SILL_RUN) * 2, 0.002, SHOJI_PANEL_DEPTH + 0.004]} />
        </mesh>
      ))}
      {/* Jamb reveals. The corridor's side walls are centred on the
          opening's edges, so their inner halves (and wainscot, 4cm proud of
          those) stand inside the doorway and stop halfway through this
          wall's depth — a ragged brown end the old door posts used to hide.
          These fill the classroom half of the reveal flush with the
          corridor's own faces, so the jamb reads as one continuous return.
          They stop at the corridor walls' end (z = SHOJI_DOOR_Z) rather than
          overlapping them, so no two faces share a plane. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[side * (SHOJI_HALF_OPENING - SHOJI_REVEAL_WAINSCOT / 2), 0.475, SHOJI_DOOR_Z - SHOJI_SILL_BACK / 2]}
            material={m.wainscot}
          >
            <boxGeometry args={[SHOJI_REVEAL_WAINSCOT, 0.95, SHOJI_SILL_BACK]} />
          </mesh>
          <mesh
            position={[side * (SHOJI_HALF_OPENING - SHOJI_REVEAL_WALL / 2), (0.95 + SHOJI_HEAD_TOP - 0.14) / 2, SHOJI_DOOR_Z - WALL_THICKNESS / 4]}
            material={m.wall}
          >
            <boxGeometry args={[SHOJI_REVEAL_WALL, SHOJI_HEAD_TOP - 0.14 - 0.95, WALL_THICKNESS / 2]} />
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

      {[
        { groupRef: leftRef, x: -closedX, z: SHOJI_DOOR_Z - SHOJI_FACE_OFFSET },
        { groupRef: rightRef, x: closedX, z: SHOJI_DOOR_Z - SHOJI_FACE_OFFSET - SHOJI_TRACK_SPACING },
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


function OutdoorGarden({
  m,
  lit,
  onToggleLight,
}: {
  m: WorldMaterials;
  lit: boolean;
  onToggleLight?: (zone: LightZone, on: boolean) => void;
}) {
  const lamp = useZoneLampMaterial(m, lit);
  return (
    <group>
      {OUTDOOR_BENCHES.map((bench, i) => <Bench key={`outdoor-bench-${i}`} placement={bench} m={m} />)}
      <Pond lit={lit} />

      <GardenLamps m={m} lamp={lamp} lit={lit} />

      {/* Switch for the pool lights, on the hall's outside wall beside the
          garden doorway, facing the pond. */}
      <group position={[DOOR_HALF_WIDTH + 0.95, 1.2, HALL.maxZ + WALL_THICKNESS / 2 + 0.008]}>
        <LightSwitch on={lit} onToggle={onToggleLight && ((on) => onToggleLight("pond", on))} />
      </group>
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

      {/* Posts with paper lanterns, each a real light. They share the
          world's few lights with every other lamp (see LightPool.tsx), so
          four of them cost no more than two did. */}
      {[
        { x: -8.6, z: 0.8 },
        { x: 8.6, z: 0.8 },
        { x: -8.6, z: 12.2 },
        { x: 8.6, z: 12.2 },
      ].map((post) => (
        <group key={`${post.x}-${post.z}`} position={[post.x, 0, post.z]}>
          <mesh position={[0, WALL_HEIGHT / 2, 0]} material={m.trim} castShadow>
            <boxGeometry args={[0.34, WALL_HEIGHT, 0.34]} />
          </mesh>
          <mesh position={[0, 2.75, 0]} material={lamp}>
            <sphereGeometry args={[0.26, 20, 14]} />
          </mesh>
          <PooledLight position={[0, 2.75, 0]} intensity={lit ? LANTERN_INTENSITY : 0} distance={20} color="#ffd2a0" />
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

/**
 * The garden's lampposts, in its front corners, on the garden switch. Real
 * lights from the shared pool (LightPool.tsx), like the hall's lanterns, so
 * they add no per-pixel lighting cost of their own; and every post's metal
 * is one merged mesh and every lamp another, so both posts are two draw
 * calls.
 */
function GardenLamps({ m, lamp, lit }: { m: WorldMaterials; lamp: THREE.Material; lit: boolean }) {
  const { posts, lamps } = useMemo(() => {
    const posts: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[] = [];
    for (const [x, z] of GARDEN_LAMPS) {
      posts.push(
        new THREE_RUNTIME.BoxGeometry(0.36, 0.24, 0.36).translate(x, 0.12, z),
        new THREE_RUNTIME.CylinderGeometry(0.05, 0.07, 2.96, 10).translate(x, 1.6, z),
        new THREE_RUNTIME.BoxGeometry(0.32, 0.05, 0.32).translate(x, 3.03, z),
        new THREE_RUNTIME.ConeGeometry(0.3, 0.2, 4).rotateY(Math.PI / 4).translate(x, 3.5, z)
      );
      lamps.push(new THREE_RUNTIME.BoxGeometry(0.26, 0.38, 0.26).translate(x, 3.24, z));
    }
    const merge = (parts: THREE.BufferGeometry[]) => {
      // Cones and boxes differ in attributes only by index; drop it so all merge.
      const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
      for (const g of parts) g.dispose();
      return merged ?? new THREE_RUNTIME.BufferGeometry();
    };
    return { posts: merge(posts), lamps: merge(lamps) };
  }, []);
  useEffect(
    () => () => {
      posts.dispose();
      lamps.dispose();
    },
    [posts, lamps]
  );
  return (
    <group>
      <mesh geometry={posts} material={m.metal} castShadow />
      <mesh geometry={lamps} material={lamp} />
      {GARDEN_LAMPS.map(([x, z]) => (
        <PooledLight key={x} position={[x, 3.2, z]} intensity={lit ? GARDEN_LAMP_INTENSITY : 0} distance={16} color="#ffd2a0" />
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
      {/* Only the hall end: the classroom end is the shoji's own wall,
          framed by its sill and head rail (ClassroomDoor), and these
          posts and header stood in the leaves' path there. */}
      <DoorCasing z={CORRIDOR.maxZ} headerBottom={2.3} headerTop={2.6} m={m} />
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
// The hole cut in the wall is exactly the frame's outer size. It used to
// be set by hand 7cm taller than the frame at both top and bottom, which
// left a slot straight through the wall above (and below) every window.
const CLASSROOM_WINDOW_SILL = CLASSROOM_WINDOW_CENTER_Y - CLASSROOM_WINDOW_HEIGHT / 2;
const CLASSROOM_WINDOW_HEADER = CLASSROOM_WINDOW_CENTER_Y + CLASSROOM_WINDOW_HEIGHT / 2;

function ClassroomShell({ m, lit, onToggleLight }: { m: WorldMaterials; lit: boolean; onToggleLight?: (zone: LightZone, on: boolean) => void }) {
  const lamp = useZoneLampMaterial(m, lit);
  return (
    <group>
      <DressedWall
        axis="x"
        at={CLASSROOM.maxZ}
        corners="through"
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
      <DressedWall axis="x" at={CLASSROOM.minZ} from={CLASSROOM.minX} to={CLASSROOM.maxX} height={CLASSROOM_WALL_HEIGHT} m={m} corners="through" />
      <DressedWall
        axis="z"
        at={CLASSROOM.minX}
        corners="inside"
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
      {/* Windows on both long walls, mirrored, so the room is lit from
          either side like the hall. */}
      <DressedWall
        axis="z"
        at={CLASSROOM.maxX}
        corners="inside"
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
      {CLASSROOM_WINDOW_Z.map((z) => (
        <Window
          key={`e-${z}`}
          position={[CLASSROOM.maxX - 0.2, CLASSROOM_WINDOW_CENTER_Y, z]}
          rotationY={-Math.PI / 2}
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
          <PooledLight position={[0, -0.2, 0]} intensity={lit ? 5.5 : 0} distance={17} color="#ffeccd" />
        </group>
      ))}
      <WindowSun west={[CLASSROOM.minX + 4.2, 2.1, -17]} east={[CLASSROOM.maxX - 4.2, 2.1, -17]} />
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
        {/* Modesty panel. Narrower than the 1.9 desktop on purpose: at
            the same width its left and right faces were coplanar with
            the desktop's over the 4cm the two overlapped, and coplanar
            faces z-fight — which is the seam that showed between the
            pale top and the darker board. It also now tucks only 2cm
            under the top instead of 4. */}
        <mesh position={[0, 0.37, 0.36]} material={m.furnitureWarm} castShadow>
          <boxGeometry args={[1.8, 0.7, 0.1]} />
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

      {/* Notice board on the back wall, left of the door as you face it.
          It used to hang on the east wall, which now has windows; here it
          clears the light switch and the shoji's head rail (x ≈ -5.36). */}
      <group position={[-7, 1.9, CLASSROOM.maxZ - 0.2]} rotation={[0, Math.PI, 0]}>
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
      {/* Kept past the end of the shoji's head rail (x ≈ 5.36), which
          would otherwise run straight across their name plates. */}
      <group position={[6.8, 2.78, CLASSROOM.maxZ - WALL_THICKNESS / 2 - 0.035]} rotation={[0, Math.PI, 0]}>
        <WallClock m={m} timeZone="Asia/Manila" label="PHILIPPINES" />
      </group>
      <group position={[6.0, 2.78, CLASSROOM.maxZ - WALL_THICKNESS / 2 - 0.035]} rotation={[0, Math.PI, 0]}>
        <WallClock m={m} timeZone="Asia/Tokyo" label="JAPAN" />
      </group>
      <group position={[7.7, 2.66, CLASSROOM.maxZ - WALL_THICKNESS / 2 - 0.012]} rotation={[0, Math.PI, 0]}>
        <DateCalendar m={m} />
      </group>
    </group>
  );
}
