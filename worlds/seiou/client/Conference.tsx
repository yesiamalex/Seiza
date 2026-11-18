// Conference seating in UPOU's halls: rows of tables, two chairs each,
// facing the front, in the CCDL's second-floor hall and the ground-floor
// hall of the World-Class Multimedia Production Building (WCMPB).
//
// Built into the world rather than placed as room objects. world.json's
// defaultObjects only seed a room that an editor enters first while it's
// empty, so a live room that started without them never got any. Here
// every visitor sees the same furniture, every seat can be sat on, and the
// tables are solid on their own floor. Seinag, on the same campus, uses
// this too.
//
// The tables and chairs are Seiza's own (src/scene/Table.tsx, Chair.tsx),
// merged per material into a few meshes for all the halls together.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getWorldMaterials } from "../../../src/scene/materials";
import { makeObstacle, placedChairSeat, SEAT_HEIGHT, type Obstacle, type Seat } from "../../../src/scene/layout";
import { SeatPad } from "../../../src/scene/SeatPad";
import { TABLE } from "../../../src/scene/Table";

/**
 * A block of tables in a hall. `front` is the middle of the front row's
 * tables; `facing` the yaw the audience faces (avatars face −Z at yaw 0);
 * rows run back from the front.
 */
export interface Hall {
  id: string;
  front: [number, number];
  floorY: number;
  facing: number;
  rows: number;
  columns: number;
}

/** Yaw that faces along a direction on the floor. */
const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export const HALLS: Hall[] = [
  {
    // The CCDL's second-floor conference hall, turned 45°, its stage at the
    // north-east end; the front row a little over 2 m back from the screen.
    id: "ccdl",
    front: [277.46, -99.81],
    floorY: 4.7,
    facing: yawToward(1, -1),
    rows: 4,
    columns: 4,
  },
  {
    // The WCMPB's ground-floor hall (where WILLS 2026 held its exhibits),
    // south-east of where visitors arrive, facing down the hall.
    id: "wcmpb",
    front: [235.5, 161],
    floorY: 1.6,
    facing: yawToward(0.783, 0.623),
    rows: 4,
    columns: 4,
  },
];

const ROW_GAP = 2.1;
const COLUMN_GAP = 2.3;
/** How far behind its table's middle each chair stands. */
const CHAIR_BACK = 0.62;
/** Each chair's offset along the table from its middle. */
const CHAIR_SIDE = 0.4;

interface Placement {
  hall: Hall;
  row: number;
  column: number;
  /** The table's middle. */
  table: [number, number];
  chairs: [number, number][];
}

/** Where each table and chair of a hall goes. */
export function placements(hall: Hall): Placement[] {
  const forward: [number, number] = [-Math.sin(hall.facing), -Math.cos(hall.facing)];
  // Along the table's long side (its local X once turned to `facing`).
  const along: [number, number] = [Math.cos(hall.facing), -Math.sin(hall.facing)];
  const out: Placement[] = [];
  for (let row = 0; row < hall.rows; row++) {
    for (let column = 0; column < hall.columns; column++) {
      const across = (column - (hall.columns - 1) / 2) * COLUMN_GAP;
      const back = row * ROW_GAP;
      const x = hall.front[0] - forward[0] * back + along[0] * across;
      const z = hall.front[1] - forward[1] * back + along[1] * across;
      const behind: [number, number] = [x - forward[0] * CHAIR_BACK, z - forward[1] * CHAIR_BACK];
      out.push({
        hall,
        row,
        column,
        table: [x, z],
        chairs: [-1, 1].map((side) => [behind[0] + along[0] * side * CHAIR_SIDE, behind[1] + along[1] * side * CHAIR_SIDE] as [number, number]),
      });
    }
  }
  return out;
}

/** Every chair's seat, with an id of SeiOU's own. */
export function conferenceSeats(): Seat[] {
  return HALLS.flatMap((hall) =>
    placements(hall).flatMap((p) =>
      p.chairs.map((c, i) => ({
        ...placedChairSeat(`seiou-${hall.id}-${p.row}-${p.column}-${i}`, [c[0], hall.floorY, c[1]], hall.facing),
        label: "Chair",
      }))
    )
  );
}

/** Each table with its two chairs, as one box on its own floor: a desk and
 *  its chair as separate boxes leave a gap narrower than a person. */
export function conferenceObstacles(): Obstacle[] {
  return HALLS.flatMap((hall) => {
    const forward: [number, number] = [-Math.sin(hall.facing), -Math.cos(hall.facing)];
    return placements(hall).map((p) => ({
      ...makeObstacle(p.table[0] - forward[0] * CHAIR_BACK * 0.5, p.table[1] - forward[1] * CHAIR_BACK * 0.5, TABLE.width / 2 + 0.02, TABLE.depth / 2 + CHAIR_BACK * 0.5 + 0.1, hall.facing),
      floorY: hall.floorY,
    }));
  });
}

/** The table and chair shapes, as in Table.tsx and Chair.tsx, by material. */
function buildFurniture() {
  const tops: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];
  const seats: THREE.BufferGeometry[] = [];
  const matrix = new THREE.Matrix4();
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number) =>
    g.applyMatrix4(matrix.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
  const local = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  for (const hall of HALLS) {
    for (const p of placements(hall)) {
      const [tx, tz] = p.table;
      const legH = TABLE.height - TABLE.top;
      tops.push(place(local(new THREE.BoxGeometry(TABLE.width, TABLE.top, TABLE.depth), 0, TABLE.height - TABLE.top / 2, 0), tx, hall.floorY, tz, hall.facing));
      metal.push(place(local(new THREE.BoxGeometry(TABLE.width - 0.12, 0.06, TABLE.depth - 0.12), 0, TABLE.height - TABLE.top - 0.04, 0), tx, hall.floorY, tz, hall.facing));
      for (const lx of [-1, 1]) {
        for (const lz of [-1, 1]) {
          metal.push(place(local(new THREE.BoxGeometry(0.05, legH, 0.05), lx * (TABLE.width / 2 - 0.08), legH / 2, lz * (TABLE.depth / 2 - 0.08)), tx, hall.floorY, tz, hall.facing));
        }
      }
      for (const [cx, cz] of p.chairs) {
        seats.push(place(local(new THREE.BoxGeometry(0.46, 0.07, 0.46), 0, SEAT_HEIGHT, 0), cx, hall.floorY, cz, hall.facing));
        const back = new THREE.BoxGeometry(0.44, 0.38, 0.06).rotateX(0.08);
        seats.push(place(local(back, 0, SEAT_HEIGHT + 0.28, 0.24), cx, hall.floorY, cz, hall.facing));
        for (const lx of [-1, 1]) {
          for (const lz of [-1, 1]) {
            metal.push(place(local(new THREE.BoxGeometry(0.05, SEAT_HEIGHT, 0.05), lx * 0.19, SEAT_HEIGHT / 2, lz * 0.19), cx, hall.floorY, cz, hall.facing));
          }
        }
      }
    }
  }
  const merge = (parts: THREE.BufferGeometry[]) => {
    const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
    for (const g of parts) g.dispose();
    return merged;
  };
  return { tops: merge(tops), metal: merge(metal), seats: merge(seats) };
}

export function ConferenceHalls({ sit, occupiedSeatId }: { sit?: (seat: Seat) => void; occupiedSeatId: string | null }) {
  const m = getWorldMaterials();
  const furniture = useMemo(buildFurniture, []);
  const seats = useMemo(conferenceSeats, []);
  useEffect(
    () => () => {
      for (const g of Object.values(furniture)) g.dispose();
    },
    [furniture]
  );
  return (
    <group>
      {/* navIgnore: click-to-walk's navmesh is the campus's own. */}
      <mesh geometry={furniture.tops} material={m.furnitureTop} castShadow receiveShadow userData={{ navIgnore: true }} />
      <mesh geometry={furniture.metal} material={m.metal} userData={{ navIgnore: true }} />
      <mesh geometry={furniture.seats} material={m.furnitureLight} castShadow receiveShadow userData={{ navIgnore: true }} />
      {sit && seats.map((seat) => <SeatPad key={seat.id} seat={seat} onSit={sit} occupied={occupiedSeatId === seat.id} />)}
    </group>
  );
}
