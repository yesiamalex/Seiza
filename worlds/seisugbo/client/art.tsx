// A piece on show: its picture (loaded only when someone comes near), a
// clip, frame, or nothing to hang it by, and a click (or, in a phone
// viewer, a look) that opens it close up. Plus the labels under the
// pieces, all drawn into one shared texture and merged into one mesh per
// area, so forty labels cost one draw call.
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { registerGazeTarget } from "../../../src/xr/hud/gaze";
import { aspectOf, GROUP_COLORS, PIECES, PIECE_BY_ID, texUrl, type Piece } from "./collection";
import { Builder, Clickable, FONT, noRaycast, paint, useNearbyPicture, useNight, washed, type Vec3 } from "./kit";
import { openPiece } from "./viewer";

const PAPER = new THREE.Color("#f3eee4");

export interface Placement {
  id: string;
  /** Centre of the picture. */
  at: Vec3;
  rotationY: number;
  /** The picture's longest side, in metres. */
  size: number;
}

/** Width and height in metres of a piece shown with its long side `size`. */
export function dims(piece: Piece, size: number): [number, number] {
  const a = aspectOf(piece);
  return a >= 1 ? [size, size / a] : [size * a, size];
}

/**
 * One piece's picture. `sequence` is what Previous and Next step through
 * once it's open. Its frame or backing is part of the area's merged
 * geometry (addBacking).
 */
export function Picture({ place, sequence }: { place: Placement; sequence: string[] }) {
  const piece = PIECE_BY_ID[place.id];
  const [w, h] = dims(piece, place.size);
  const anchor = useRef<THREE.Group>(null);
  const face = useRef<THREE.Mesh>(null);
  const texture = useNearbyPicture(texUrl(piece.id), anchor);
  const material = useMemo(
    () =>
      washed(null, {
        color: PAPER,
        side: piece.cutout ? THREE.DoubleSide : THREE.FrontSide,
        alphaTest: piece.cutout ? 0.5 : 0,
        transparent: false,
      }),
    [piece.cutout]
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    if (!texture) return;
    material.map = texture;
    material.color.set("#ffffff");
    material.needsUpdate = true;
  }, [texture, material]);
  useNight([material]);

  const open = () => openPiece(piece.id, sequence);
  useEffect(() => {
    const m = face.current;
    if (!m) return;
    return registerGazeTarget(m, { keyAt: () => piece.id, select: open });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group ref={anchor} position={place.at} rotation={[0, place.rotationY, 0]}>
      <Clickable onClick={open}>
        <mesh ref={face} material={material} userData={{ navIgnore: true }}>
          <planeGeometry args={[w, h]} />
        </mesh>
      </Clickable>
    </group>
  );
}

/**
 * The back of a piece's paper, or its frame: added to the area's own
 * merged geometry (a Builder) rather than drawn piece by piece, so forty
 * pieces don't cost forty more draw calls.
 */
export function addBacking(b: Builder, place: Placement, mount: "clip" | "frame" | "board") {
  const piece = PIECE_BY_ID[place.id];
  if (piece.cutout) return;
  const [w, h] = dims(piece, place.size);
  const back = new THREE.Vector3(0, 0, mount === "frame" ? -0.026 : -0.004).applyAxisAngle(UP, place.rotationY);
  const at: Vec3 = [place.at[0] + back.x, place.at[1] + back.y, place.at[2] + back.z];
  if (mount === "frame") b.box([w + 0.09, h + 0.09, 0.045], at, "#3b2a1e", [0, place.rotationY, 0]);
  else b.box([w, h, 0.004], at, "#e9e2d4", [0, place.rotationY, 0]);
}

const UP = new THREE.Vector3(0, 1, 0);

// --- labels --------------------------------------------------------------------------------

const CELL_W = 512;
const CELL_H = 128;
const COLUMNS = 4;

interface Atlas {
  texture: THREE.CanvasTexture;
  /** uv rectangle [u0, v0, u1, v1] for each piece's label. */
  cells: Map<string, [number, number, number, number]>;
}

let atlas: Atlas | null = null;

/** Every piece's label, drawn once into one texture. */
function labelAtlas(): Atlas {
  if (atlas) return atlas;
  const rows = Math.ceil(PIECES.length / COLUMNS);
  const canvas = document.createElement("canvas");
  canvas.width = CELL_W * COLUMNS;
  canvas.height = CELL_H * rows;
  const ctx = canvas.getContext("2d")!;
  const cells = new Map<string, [number, number, number, number]>();
  PIECES.forEach((piece, i) => {
    const x = (i % COLUMNS) * CELL_W;
    const y = Math.floor(i / COLUMNS) * CELL_H;
    drawLabel(ctx, piece, x, y);
    cells.set(piece.id, [x / canvas.width, 1 - (y + CELL_H) / canvas.height, (x + CELL_W) / canvas.width, 1 - y / canvas.height]);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  atlas = { texture, cells };
  return atlas;
}

/** Shrinks the font until `text` fits `width`, then draws it. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, weight: number) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 11 && ctx.measureText(text).width > width) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  ctx.fillText(text, x, y);
}

function drawLabel(ctx: CanvasRenderingContext2D, piece: Piece, x: number, y: number) {
  ctx.fillStyle = "#fbf8f1";
  ctx.fillRect(x + 2, y + 2, CELL_W - 4, CELL_H - 4);
  ctx.fillStyle = GROUP_COLORS[piece.group];
  ctx.fillRect(x + 2, y + 2, 12, CELL_H - 4);
  ctx.textBaseline = "alphabetic";
  const left = x + 26;
  const width = CELL_W - 40;
  ctx.fillStyle = "#1d2230";
  fitText(ctx, piece.title, left, y + 36, width - 90, 28, 700);
  ctx.fillStyle = GROUP_COLORS[piece.group];
  ctx.font = `700 18px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`GROUP ${piece.group}`, x + CELL_W - 14, y + 32);
  ctx.textAlign = "left";
  ctx.fillStyle = "#3a4050";
  const lines = piece.words ?? (piece.caption ? [piece.caption] : []);
  lines.slice(0, 3).forEach((line, i) => fitText(ctx, line.replace(/ \/ /g, " "), left, y + 66 + i * 26, width, 21, 400));
}

export interface LabelPlacement {
  id: string;
  /** Centre of the label. */
  at: Vec3;
  rotationY: number;
  width: number;
}

/** Labels for many pieces, as one mesh. */
export function Labels({ labels }: { labels: LabelPlacement[] }) {
  const { texture, cells } = labelAtlas();
  const geometry = useMemo(() => {
    const b = new Builder();
    for (const l of labels) {
      const cell = cells.get(l.id);
      if (!cell) continue;
      const h = (l.width * CELL_H) / CELL_W;
      const g = new THREE.PlaneGeometry(l.width, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? cell[2] : cell[0], uv.getY(i) ? cell[3] : cell[1]);
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...l.at), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, l.rotationY, 0)), new THREE.Vector3(1, 1, 1)));
      b.raw(g, "#ffffff");
    }
    return b.build();
    // The placements are fixed for the area's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => washed(texture), [texture]);
  useNight([material]);
  return <mesh geometry={geometry} material={material} raycast={noRaycast} userData={{ navIgnore: true }} />;
}

/** Wooden clothespins, one draw call for a whole area. */
export function Pins({ at }: { at: { p: Vec3; rotationY: number }[] }) {
  const geometry = useMemo(() => {
    const b = new Builder();
    for (const { p, rotationY } of at) {
      const off = new THREE.Vector3(0, 0, 0.012).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
      b.box([0.02, 0.075, 0.03], [p[0] + off.x, p[1], p[2] + off.z], "#c9a26a", [0, rotationY, 0]);
    }
    return b.build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => paint(), []);
  return <mesh geometry={geometry} material={material} raycast={noRaycast} userData={{ navIgnore: true }} />;
}
