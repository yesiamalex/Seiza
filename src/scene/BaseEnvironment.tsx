import { memo, useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { getWorldMaterials, type WorldMaterials } from "./materials";
import {
  BENCHES,
  BENCH_LENGTH,
  CLASSROOM,
  CLASSROOM_WALL_HEIGHT,
  CORRIDOR,
  DESKS,
  DOOR_HALF_WIDTH,
  HALL,
  HALL_CENTRE,
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

/**
 * Plaster wall with a wood wainscot along the bottom and a trim band at
 * the top — the thing that stops a procedural room reading as grey boxes.
 */
function DressedWall(props: {
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  height: number;
  gaps?: Gap[];
  m: WorldMaterials;
}) {
  const { m, ...run } = props;
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
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh material={m.trim}>
        <boxGeometry args={[width, height, 0.1]} />
      </mesh>
      <mesh position={[0, 0, 0.04]} material={m.glass}>
        <boxGeometry args={[width - 0.18, height - 0.18, 0.04]} />
      </mesh>
      {/* Muntin bars, so the glass reads as a window and not a blue slab. */}
      <mesh position={[0, 0, 0.06]} material={m.trim}>
        <boxGeometry args={[0.05, height - 0.18, 0.05]} />
      </mesh>
      <mesh position={[0, 0, 0.06]} material={m.trim}>
        <boxGeometry args={[width - 0.18, 0.05, 0.05]} />
      </mesh>
      <mesh position={[0, -height / 2 - 0.04, 0.08]} material={m.furnitureTop}>
        <boxGeometry args={[width + 0.1, 0.08, 0.26]} />
      </mesh>
    </group>
  );
}

function HallShell({ m }: { m: WorldMaterials }) {
  return (
    <group>
      {/* North wall is the entrance; south opens into the corridor. */}
      <DressedWall axis="x" at={HALL.maxZ} from={HALL.minX} to={HALL.maxX} height={WALL_HEIGHT} m={m} />
      <DressedWall
        axis="x"
        at={HALL.minZ}
        from={HALL.minX}
        to={HALL.maxX}
        height={WALL_HEIGHT}
        gaps={[{ from: -DOOR_HALF_WIDTH, to: DOOR_HALF_WIDTH }]}
        m={m}
      />
      <DressedWall axis="z" at={HALL.minX} from={HALL.minZ} to={HALL.maxZ} height={WALL_HEIGHT} m={m} />
      <DressedWall axis="z" at={HALL.maxX} from={HALL.minZ} to={HALL.maxZ} height={WALL_HEIGHT} m={m} />

      {/* Daylight on both long walls. */}
      {[1.5, 5.5, 9.5, 13.5].map((z) => (
        <Window key={`w-${z}`} position={[HALL.minX + 0.2, 2.3, z]} rotationY={Math.PI / 2} m={m} />
      ))}
      {[1.5, 5.5, 9.5, 13.5].map((z) => (
        <Window key={`e-${z}`} position={[HALL.maxX - 0.2, 2.3, z]} rotationY={-Math.PI / 2} m={m} />
      ))}

      {/* Entrance doors (decorative — the walls are the real boundary). */}
      {[-0.62, 0.62].map((x) => (
        <group key={x} position={[x, 1.2, HALL.maxZ - 0.22]}>
          <mesh material={m.trim} castShadow>
            <boxGeometry args={[1.18, 2.4, 0.08]} />
          </mesh>
          <mesh position={[x > 0 ? -0.45 : 0.45, 0, -0.07]} material={m.metal}>
            <boxGeometry args={[0.05, 0.5, 0.05]} />
          </mesh>
          <mesh position={[0, 0.55, -0.05]} material={m.glass}>
            <boxGeometry args={[0.8, 0.9, 0.04]} />
          </mesh>
        </group>
      ))}

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
      <DressedWall axis="x" at={CLASSROOM.minZ} from={CLASSROOM.minX} to={CLASSROOM.maxX} height={CLASSROOM_WALL_HEIGHT} m={m} />
      <DressedWall axis="z" at={CLASSROOM.minX} from={CLASSROOM.minZ} to={CLASSROOM.maxZ} height={CLASSROOM_WALL_HEIGHT} m={m} />
      <DressedWall axis="z" at={CLASSROOM.maxX} from={CLASSROOM.minZ} to={CLASSROOM.maxZ} height={CLASSROOM_WALL_HEIGHT} m={m} />
      <mesh
        position={[0, CLASSROOM_WALL_HEIGHT - 0.02, (CLASSROOM.minZ + CLASSROOM.maxZ) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        material={m.ceiling}
      >
        <planeGeometry args={[CLASSROOM.maxX - CLASSROOM.minX, CLASSROOM.maxZ - CLASSROOM.minZ]} />
      </mesh>

      {/* Window wall, the way a Japanese classroom is usually laid out. */}
      {[-20.5, -17.5, -14.5, -11.6].map((z) => (
        <Window key={z} position={[CLASSROOM.minX + 0.2, 2, z]} rotationY={Math.PI / 2} width={2.2} height={1.7} m={m} />
      ))}

      {/* Ceiling lamps: two fixtures, one light between them. */}
      {[-20, -14.5].map((z) => (
        <group key={z} position={[0, CLASSROOM_WALL_HEIGHT - 0.25, z]}>
          <mesh material={m.lantern}>
            <cylinderGeometry args={[0.7, 0.7, 0.12, 20]} />
          </mesh>
        </group>
      ))}
      <pointLight position={[0, CLASSROOM_WALL_HEIGHT - 0.4, -17.2]} intensity={15} distance={22} decay={2} color="#ffeccd" />
      {/* The glow of a low sun coming through the window wall. */}
      <pointLight position={[CLASSROOM.minX + 1.2, 2, -17]} intensity={12} distance={16} decay={2} color="#ffb877" />
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
            {/* An open notebook, for a bit of colour on the desktop. */}
            <mesh position={[0.08, 0.76, -0.04]} rotation={[-Math.PI / 2, 0, 0.08]} material={m.paper}>
              <planeGeometry args={[0.42, 0.3]} />
            </mesh>
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

function Chair({ position, rotationY, m }: { position: [number, number, number]; rotationY: number; m: WorldMaterials }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, SEAT_HEIGHT, 0]} material={m.furnitureLight} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.07, 0.46]} />
      </mesh>
      {/* Behind the sitter, who faces -Z in local space. */}
      <mesh position={[0, SEAT_HEIGHT + 0.3, 0.2]} rotation={[0.1, 0, 0]} material={m.furnitureLight} castShadow>
        <boxGeometry args={[0.44, 0.42, 0.06]} />
      </mesh>
      {[
        [-0.19, -0.19],
        [0.19, -0.19],
        [-0.19, 0.19],
        [0.19, 0.19],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, SEAT_HEIGHT / 2, z]} material={m.metal}>
          <boxGeometry args={[0.05, SEAT_HEIGHT, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Click target floating just above a seat. Invisible until hovered, so the
 * room isn't covered in markers, and flagged `navIgnore` so the navmesh
 * doesn't treat these discs as little platforms (see useNavMesh.ts).
 */
function SeatPad({ seat, onSit, occupied }: { seat: Seat; onSit: (seat: Seat) => void; occupied: boolean }) {
  const [hovered, setHovered] = useState(false);
  // Looking around is a drag with the same button, so a press that travels
  // is a look, not a request to sit.
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <mesh
      position={[seat.position[0], SEAT_HEIGHT + 0.06, seat.position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ navIgnore: true }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onPointerDown={(event) => {
        pressRef.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
      }}
      onPointerUp={(event) => {
        const press = pressRef.current;
        pressRef.current = null;
        if (!press) return;
        const travelled = Math.hypot(event.nativeEvent.clientX - press.x, event.nativeEvent.clientY - press.y);
        if (travelled > 8) return;
        event.stopPropagation();
        onSit(seat);
      }}
    >
      <circleGeometry args={[0.28, 24]} />
      <meshBasicMaterial
        color={occupied ? "#7CFF9E" : "#ffd9a0"}
        transparent
        opacity={hovered ? 0.55 : occupied ? 0.3 : 0}
        depthWrite={false}
      />
    </mesh>
  );
}
