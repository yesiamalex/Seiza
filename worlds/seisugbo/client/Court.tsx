// The covered court: a barangay's basketball court under a galvanized roof,
// given over to the exhibition. Each group's art hangs on its own sampayan
// (clothesline) with wooden pins, a label under each piece with the words
// its makers chose; Group A's collage posters fill a cork board at the far
// end. One mesh per material for the structure, one for every label, one
// for every pin, and a picture per piece.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PooledLight } from "../../../src/scene/LightPool";
import { nightNeed, roomLights } from "../../../src/scene/roomLights";
import type { Obstacle } from "../../../src/scene/layout";
import { addBacking, dims, Labels, Picture, Pins, type LabelPlacement, type Placement } from "./art";
import { GROUP_COLORS, PIECE_BY_ID, PIECES, type Group } from "./collection";
import { GROUP_BLURB, TITLE } from "./info";
import { Builder, canvasTexture, Clickable, FONT, noRaycast, paint, useDrawDistance, useNight, washed, type Vec3 } from "./kit";
import { COURT, COURT_CENTRE, Y } from "./plan";
import { openPiece } from "./viewer";

const EAVE = 5.4;
const RIDGE = 7.0;
const POST_X = [6.2, 10.8, 15.4, 19.8];
const POST_Z = [COURT.z0 + 0.25, COURT.z1 - 0.25];

/** The lines, nearest the lane first. */
const LINE_X = { from: 8.0, to: 18.4 };
const LINE_Y = Y + 2.15;
const LINES: { group: Group; z: number; size: number }[] = [
  { group: "A", z: 51.0, size: 0.72 },
  { group: "B", z: 48.6, size: 1.35 },
  { group: "C", z: 46.2, size: 0.78 },
  { group: "D", z: 43.8, size: 0.86 },
];
const SIGN_X = 7.25;

const POSTER_BOARD = { x: 19.6, z: 47.5, w: 5.8, h: 2.1, y: Y + 1.78 };

function lineSequence(group: Group) {
  return PIECES.filter((p) => p.group === group && (p.kind === "art" || p.kind === "dance") && !p.cutout).map((p) => p.id);
}

const POSTERS = PIECES.filter((p) => p.kind === "poster").map((p) => p.id);

interface Hung {
  place: Placement;
  sequence: string[];
}

/** Spreads each group's pieces evenly along its line, hanging from it. */
function hangLines(): Hung[] {
  const hung: Hung[] = [];
  for (const line of LINES) {
    const ids = lineSequence(line.group);
    const widths = ids.map((id) => dims(PIECE_BY_ID[id], line.size)[0]);
    const total = widths.reduce((a, b) => a + b, 0);
    const gap = (LINE_X.to - LINE_X.from - total) / (ids.length + 1);
    let x = LINE_X.from + gap;
    ids.forEach((id, i) => {
      const [w, h] = dims(PIECE_BY_ID[id], line.size);
      hung.push({ place: { id, at: [x + w / 2, LINE_Y - 0.03 - h / 2, line.z], rotationY: 0, size: line.size }, sequence: ids });
      x += w + gap;
      void i;
    });
  }
  return hung;
}

function pinPosters(): Hung[] {
  const cols = 4;
  const spacing = (POSTER_BOARD.w - 0.4) / cols;
  return POSTERS.map((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const z = POSTER_BOARD.z + POSTER_BOARD.w / 2 - 0.2 - spacing * (col + 0.5);
    return {
      place: { id, at: [POSTER_BOARD.x - 0.05, POSTER_BOARD.y + (row === 0 ? 0.5 : -0.42), z] as Vec3, rotationY: -Math.PI / 2, size: 1.22 },
      sequence: POSTERS,
    };
  });
}

// --- geometry ---------------------------------------------------------------------------------

function buildCourt(hung: Hung[], posters: Hung[]) {
  const b = new Builder();
  const roof = new Builder();
  const lamps = new Builder();
  const lines = new Builder();
  const blue = "#2f5f8f";
  // Posts on footings, and a truss over each pair.
  const midZ = (POST_Z[0] + POST_Z[1]) / 2;
  for (const x of POST_X) {
    for (const z of POST_Z) {
      b.box([0.24, EAVE, 0.24], [x, Y + EAVE / 2, z], blue);
      b.box([0.5, 0.3, 0.5], [x, Y + 0.15, z], "#b9b3a6");
    }
    lines.bar([x, Y + EAVE, POST_Z[0]], [x, Y + EAVE, POST_Z[1]], 0.06, blue);
    lines.bar([x, Y + EAVE, POST_Z[0]], [x, Y + RIDGE, midZ], 0.07, blue);
    lines.bar([x, Y + EAVE, POST_Z[1]], [x, Y + RIDGE, midZ], 0.07, blue);
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const z = POST_Z[0] + (POST_Z[1] - POST_Z[0]) * t;
      const top = Y + EAVE + (RIDGE - EAVE) * (1 - Math.abs(2 * t - 1));
      lines.bar([x, Y + EAVE, z], [x, top, z], 0.03, blue);
    }
    // A tube lamp under each tie, either side of the middle.
    for (const z of [midZ - 2.4, midZ + 2.4]) lamps.box([0.1, 0.06, 1.3], [x, Y + EAVE - 0.08, z], "#ffffff");
  }
  // Purlins, and the roof sheets on them.
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    for (const side of [0, 1]) {
      const z = side ? midZ + (POST_Z[1] - midZ) * t : midZ - (midZ - POST_Z[0]) * t;
      const y = Y + RIDGE - (RIDGE - EAVE) * t + 0.06;
      lines.bar([COURT.x0 - 0.2, y, z], [COURT.x1 + 0.2, y, z], 0.035, "#6b7780");
    }
  }
  const half = POST_Z[1] - midZ + 0.5;
  const slope = Math.atan2(RIDGE - EAVE, POST_Z[1] - midZ);
  const span = Math.hypot(RIDGE - EAVE, half);
  roof.box([COURT.x1 - COURT.x0 + 0.9, 0.05, span], [(COURT.x0 + COURT.x1) / 2, Y + (RIDGE + EAVE) / 2 + 0.14 - 0.08, midZ + half / 2], "#5f8aa6", [slope, 0, 0]);
  roof.box([COURT.x1 - COURT.x0 + 0.9, 0.05, span], [(COURT.x0 + COURT.x1) / 2, Y + (RIDGE + EAVE) / 2 + 0.14 - 0.08, midZ - half / 2], "#5f8aa6", [-slope, 0, 0]);
  // The hoop at the west end.
  b.box([0.16, 3.9, 0.16], [5.35, Y + 1.95, midZ], "#c8402f");
  b.box([1.0, 0.1, 0.1], [5.85, Y + 3.7, midZ], "#c8402f");
  b.box([0.05, 1.05, 1.8], [6.38, Y + 3.45, midZ], "#f4f1ea");
  b.box([0.06, 0.45, 0.6], [6.4, Y + 3.25, midZ], "#c8402f");
  b.box([0.07, 0.4, 0.52], [6.41, Y + 3.25, midZ], "#f4f1ea");
  b.raw(new THREE.TorusGeometry(0.23, 0.018, 6, 20).rotateX(Math.PI / 2).translate(6.66, Y + 3.05, midZ), "#e0702a");
  // Sampayan: bamboo poles and a line for each group, and a sign.
  for (const line of LINES) {
    for (const x of [LINE_X.from - 0.1, LINE_X.to + 0.1]) b.cylinder(0.045, 0.055, LINE_Y - Y + 0.25, [x, Y + (LINE_Y - Y + 0.25) / 2, line.z], "#b9a56a", undefined, 6);
    lines.sag([LINE_X.from - 0.1, LINE_Y + 0.02, line.z], [LINE_X.to + 0.1, LINE_Y + 0.02, line.z], 0.04, 0.006, "#e8e2d0", 8);
    b.box([0.07, 1.6, 0.07], [SIGN_X, Y + 0.8, line.z - 0.04], "#4a3a2c");
  }
  for (const h of hung) addBacking(b, h.place, "clip");
  // The cork board for the posters, on two legs.
  const pb = POSTER_BOARD;
  b.box([0.06, pb.h, pb.w], [pb.x + 0.02, pb.y, pb.z], "#b98d5c");
  b.box([0.09, pb.h + 0.12, 0.08], [pb.x + 0.03, pb.y, pb.z - pb.w / 2 - 0.04], "#4a3a2c");
  b.box([0.09, pb.h + 0.12, 0.08], [pb.x + 0.03, pb.y, pb.z + pb.w / 2 + 0.04], "#4a3a2c");
  b.box([0.09, 0.08, pb.w + 0.16], [pb.x + 0.03, pb.y + pb.h / 2 + 0.02, pb.z], "#4a3a2c");
  b.box([0.09, 0.08, pb.w + 0.16], [pb.x + 0.03, pb.y - pb.h / 2 - 0.02, pb.z], "#4a3a2c");
  for (const z of [pb.z - pb.w / 2 + 0.3, pb.z + pb.w / 2 - 0.3]) b.box([0.08, pb.y - pb.h / 2 - Y, 0.08], [pb.x + 0.03, Y + (pb.y - pb.h / 2 - Y) / 2, z], "#4a3a2c");
  for (const h of posters) addBacking(b, h.place, "board");
  // A long concrete bench along the south side, for the audience.
  b.box([9.5, 0.45, 0.5], [13, Y + 0.225, COURT.z0 + 0.7], "#b9b3a6");
  return { painted: b.build(), roof: roof.build(), lamps: lamps.build(), lines: lines.build() };
}

function courtTexture() {
  const W = 1024;
  const H = Math.round((W * (COURT.z1 - COURT.z0 + 0.6)) / (COURT.x1 - COURT.x0 + 0.6));
  return canvasTexture(W, H, (ctx, w, h) => {
    ctx.fillStyle = "#3d7a58";
    ctx.fillRect(0, 0, w, h);
    const m = 70;
    ctx.fillStyle = "#b4553a";
    ctx.fillRect(m, m, w - 2 * m, h - 2 * m);
    ctx.strokeStyle = "#f4f1ea";
    ctx.lineWidth = 6;
    ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
    ctx.beginPath();
    ctx.moveTo(w / 2, m);
    ctx.lineTo(w / 2, h - m);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.12, 0, Math.PI * 2);
    ctx.stroke();
    for (const side of [0, 1]) {
      const x = side ? w - m : m;
      const dir = side ? -1 : 1;
      ctx.fillStyle = "rgba(47,95,143,0.85)";
      ctx.fillRect(Math.min(x, x + dir * 200), h / 2 - 90, 200, 180);
      ctx.strokeRect(Math.min(x, x + dir * 200), h / 2 - 90, 200, 180);
      ctx.beginPath();
      ctx.arc(x + dir * 200, h / 2, 90, side ? Math.PI / 2 : -Math.PI / 2, side ? (3 * Math.PI) / 2 : Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + dir * 20, h / 2, h * 0.36, side ? Math.PI / 2 + 0.25 : -Math.PI / 2 + 0.25, side ? (3 * Math.PI) / 2 - 0.25 : Math.PI / 2 - 0.25);
      ctx.stroke();
    }
    // Scuffs.
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 14, 2);
    }
  });
}

function fasciaTexture() {
  return canvasTexture(1024, 96, (ctx, w, h) => {
    ctx.fillStyle = "#2f5f8f";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f6c624";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 50px ${FONT}`;
    ctx.fillText(`BARANGAY ${TITLE.toUpperCase()} COVERED COURT`, w / 2, h / 2 + 2);
  });
}

function signsTexture() {
  return canvasTexture(1024, 256, (ctx) => {
    LINES.forEach((line, i) => {
      const x = i * 256;
      ctx.fillStyle = "#fbf8f1";
      ctx.fillRect(x + 4, 4, 248, 248);
      ctx.fillStyle = GROUP_COLORS[line.group];
      ctx.fillRect(x + 4, 4, 248, 96);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 40px ${FONT}`;
      ctx.fillText(`GROUP ${line.group}`, x + 128, 54);
      ctx.fillStyle = "#2a2f3a";
      ctx.font = `500 22px ${FONT}`;
      const words = GROUP_BLURB[line.group].split(" ");
      let row = "";
      let y = 136;
      for (const word of words) {
        if (ctx.measureText(`${row} ${word}`).width > 210 && row) {
          ctx.fillText(row, x + 128, y);
          y += 30;
          row = word;
        } else row = row ? `${row} ${word}` : word;
      }
      ctx.fillText(row, x + 128, y);
    });
  });
}

/** One sign per line, each mapping its quarter of the shared texture. */
function signsGeometry() {
  return LINES.map((_, i) => {
    const g = new THREE.PlaneGeometry(0.72, 0.72);
    const uv = g.attributes.uv;
    for (let v = 0; v < uv.count; v++) uv.setX(v, (i + uv.getX(v)) / 4);
    return g;
  });
}

function postersHeaderTexture() {
  return canvasTexture(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = "#fbf8f1";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = GROUP_COLORS.A;
    ctx.fillRect(0, 0, 18, h);
    ctx.fillStyle = "#1d2230";
    ctx.textBaseline = "middle";
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText("The collage wall", 44, h / 2 - 4);
    ctx.fillStyle = GROUP_COLORS.A;
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText("GROUP A", w - 30, h / 2);
  });
}

// --- the scene ----------------------------------------------------------------------------------

export function Court() {
  const area = useRef<THREE.Group>(null);
  useDrawDistance(area, COURT_CENTRE, 55);
  const hung = useMemo(hangLines, []);
  const posters = useMemo(pinPosters, []);
  const geometry = useMemo(() => buildCourt(hung, posters), [hung, posters]);
  const signs = useMemo(signsGeometry, []);
  useEffect(
    () => () => {
      for (const g of Object.values(geometry)) g.dispose();
      for (const g of signs) g.dispose();
    },
    [geometry, signs]
  );
  const m = useMemo(
    () => ({
      painted: paint(),
      roof: paint({ side: THREE.DoubleSide, map: canvasTexture(64, 64, (ctx, w, h) => {
        for (let x = 0; x < w; x++) {
          const v = 205 + Math.round(50 * Math.cos((x / w) * Math.PI * 8));
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x, 0, 1, h);
        }
      }, [10, 1]) }),
      lines: paint(),
      lamps: new THREE.MeshBasicMaterial({ color: "#222", toneMapped: false }),
      slab: new THREE.MeshLambertMaterial({ map: courtTexture() }),
      fascia: washed(fasciaTexture()),
      signs: washed(signsTexture()),
      postersHeader: washed(postersHeaderTexture()),
    }),
    []
  );
  useEffect(
    () => () => {
      for (const material of Object.values(m)) {
        (material as THREE.MeshLambertMaterial).map?.dispose();
        material.dispose();
      }
    },
    [m]
  );
  const glow = useMemo(() => [{ material: m.lamps, color: new THREE.Color("#fff6e2") }], [m]);
  useNight([m.fascia, m.signs, m.postersHeader], glow);

  // Two of the world's pooled lights (Seiza's LightPool), on the garden's
  // switch, so the court is lit at night without adding lights.
  const light = useRef(0);
  useFrame((_, delta) => {
    const target = roomLights.pond ? 7 * nightNeed() : 0;
    light.current += (target - light.current) * (1 - Math.exp(-delta / 0.2));
  });

  const labels = useMemo<LabelPlacement[]>(
    () =>
      hung.map(({ place }) => {
        const [w, h] = dims(PIECE_BY_ID[place.id], place.size);
        const width = Math.min(0.66, Math.max(0.5, w));
        return { id: place.id, at: [place.at[0], place.at[1] - h / 2 - 0.03 - (width * 0.25) / 2, place.at[2] + 0.001] as Vec3, rotationY: 0, width };
      }),
    [hung]
  );
  const pins = useMemo(
    () =>
      hung.flatMap(({ place }) => {
        const [w] = dims(PIECE_BY_ID[place.id], place.size);
        return [-1, 1].map((s) => ({ p: [place.at[0] + s * w * 0.36, LINE_Y - 0.02, place.at[2]] as Vec3, rotationY: 0 }));
      }),
    [hung]
  );
  const midZ = (POST_Z[0] + POST_Z[1]) / 2;

  return (
    <group ref={area}>
      <mesh geometry={geometry.painted} material={m.painted} castShadow receiveShadow />
      <mesh geometry={geometry.roof} material={m.roof} castShadow raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.lines} material={m.lines} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.lamps} material={m.lamps} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh position={[COURT_CENTRE[0], Y - 0.035, COURT_CENTRE[1]]} material={m.slab} receiveShadow userData={{ navIgnore: true }}>
        <boxGeometry args={[COURT.x1 - COURT.x0 + 0.6, 0.1, COURT.z1 - COURT.z0 + 0.6]} />
      </mesh>
      <mesh position={[COURT_CENTRE[0], Y + EAVE + 0.2, POST_Z[1] + 0.55]} material={m.fascia} userData={{ navIgnore: true }}>
        <planeGeometry args={[8, 0.75]} />
      </mesh>
      {LINES.map((line, i) => (
        <Clickable key={line.group} onClick={() => openPiece(lineSequence(line.group)[0], lineSequence(line.group))}>
          <mesh geometry={signs[i]} position={[SIGN_X, Y + 1.85, line.z]} material={m.signs} userData={{ navIgnore: true }} />
        </Clickable>
      ))}
      {hung.map((h) => (
        <Picture key={h.place.id} place={h.place} sequence={h.sequence} />
      ))}
      {posters.map((h) => (
        <Picture key={h.place.id} place={h.place} sequence={h.sequence} />
      ))}
      <Clickable onClick={() => openPiece("board:posters")}>
        <mesh position={[POSTER_BOARD.x - 0.02, POSTER_BOARD.y + POSTER_BOARD.h / 2 + 0.3, POSTER_BOARD.z]} rotation={[0, -Math.PI / 2, 0]} material={m.postersHeader} userData={{ navIgnore: true }}>
          <planeGeometry args={[2.4, 0.3]} />
        </mesh>
      </Clickable>
      <Labels labels={labels} />
      <Pins at={pins} />
      <PooledLight position={[10.8, Y + 4.8, midZ]} color="#fff1d8" intensityRef={light} distance={13} />
      <PooledLight position={[17.0, Y + 4.8, midZ]} color="#fff1d8" intensityRef={light} distance={13} />
    </group>
  );
}

export function courtObstacles(): Obstacle[] {
  const o = (x: number, z: number, hx: number, hz: number): Obstacle => ({ x, z, halfX: hx, halfZ: hz, rotationY: 0 });
  const list: Obstacle[] = [];
  for (const x of POST_X) for (const z of POST_Z) list.push(o(x, z, 0.25, 0.25));
  list.push(o(5.35, (POST_Z[0] + POST_Z[1]) / 2, 0.15, 0.15));
  // The lines themselves: walk round the ends, not through the art.
  for (const line of LINES) {
    list.push(o((LINE_X.from + LINE_X.to) / 2, line.z, (LINE_X.to - LINE_X.from) / 2 + 0.12, 0.06));
    list.push(o(SIGN_X, line.z, 0.06, 0.06));
  }
  list.push(o(POSTER_BOARD.x + 0.03, POSTER_BOARD.z, 0.08, POSTER_BOARD.w / 2 + 0.08));
  list.push(o(13, COURT.z0 + 0.7, 4.75, 0.25));
  return list;
}
