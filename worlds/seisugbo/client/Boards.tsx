// Seisugbo's text boards (welcome, the court, how the work was made, the
// talk prompts), standing on two legs like Seiza's other worlds' stations,
// and the dance photos framed in the classroom. Each board opens its full
// text when clicked.
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Obstacle } from "../../../src/scene/layout";
import { CLASSROOM } from "../../../src/scene/layout";
import { addBacking, Labels, Picture, type LabelPlacement, type Placement } from "./art";
import { BOARDS, TITLE, type BoardKey, type BoardText } from "./info";
import { Builder, Clickable, FONT, noRaycast, paint, useCanvasTexture, useDrawDistance, useNight, washed, wrapText, type Vec3 } from "./kit";
import { Y } from "./plan";
import { openPiece } from "./viewer";

const ACCENT = "#2f6fd0";

interface BoardSpec {
  key: BoardKey;
  /** Floor point under the board's middle. */
  at: [number, number, number];
  rotationY: number;
  w: number;
  h: number;
  bottom: number;
}

/** The rotation that turns a board's face (+z at rotation 0) from `from`
 *  toward `to`. */
const facing = (from: [number, number], to: [number, number]) => Math.atan2(to[0] - from[0], to[1] - from[1]);

export const BOARD_SPECS: BoardSpec[] = [
  // Ahead of you as you wake at the tent, beside the arch.
  { key: "welcome", at: [-7.7, Y, 55.4], rotationY: facing([-7.7, 55.4], [-13, 58.4]), w: 2.5, h: 1.6, bottom: 0.75 },
  // Where the path from the garden meets the lane, facing the court.
  { key: "court", at: [4.9, Y, 53.0], rotationY: facing([4.9, 53.0], [9, 50]) + Math.PI, w: 2.3, h: 1.45, bottom: 0.8 },
  // In the hall, by the garden door, for whoever comes in that way.
  { key: "process", at: [6.2, 0, 14.0], rotationY: -2.3, w: 2.4, h: 1.6, bottom: 0.8 },
  // The classroom: the talkback room.
  { key: "talk", at: [-7.45, 0, -16.2], rotationY: Math.PI / 2, w: 3.3, h: 2.15, bottom: 0.55 },
];

const PX_PER_M = 520;

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, text: BoardText) {
  ctx.fillStyle = "#fbf8f2";
  ctx.fillRect(0, 0, w, h);
  const band = Math.round(h * 0.16);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, w, band);
  ctx.fillStyle = "#f6c624";
  ctx.fillRect(0, band, w, 8);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  let size = Math.round(band * 0.48);
  ctx.font = `800 ${size}px ${FONT}`;
  while (ctx.measureText(text.title).width > w - 280 && size > 20) ctx.font = `800 ${(size -= 2)}px ${FONT}`;
  ctx.fillText(text.title, 36, band / 2 + 2);
  ctx.font = `700 24px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(TITLE.toUpperCase(), w - 30, band / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // The body, at the largest size that fits.
  const top = band + 30;
  const bottom = h - 56;
  const draw = (s: number, dry: boolean) => {
    const save = ctx.fillText.bind(ctx);
    if (dry) ctx.fillText = () => {};
    let y = top + s;
    if (text.subtitle) {
      ctx.fillStyle = ACCENT;
      ctx.font = `600 ${Math.round(s * 1.05)}px ${FONT}`;
      y = wrapText(ctx, text.subtitle, 36, y, w - 72, s * 1.35) + s * 0.25;
    }
    ctx.fillStyle = "#1f2430";
    ctx.font = `400 ${s}px ${FONT}`;
    for (const p of text.paragraphs) y = wrapText(ctx, p, 36, y, w - 72, s * 1.32) + s * 0.35;
    for (const list of text.list ?? []) {
      if (list.heading) {
        ctx.fillStyle = ACCENT;
        ctx.font = `700 ${s}px ${FONT}`;
        y = wrapText(ctx, list.heading, 36, y + s * 0.2, w - 72, s * 1.3);
      }
      ctx.font = `400 ${s}px ${FONT}`;
      list.items.forEach((item, i) => {
        ctx.fillStyle = ACCENT;
        ctx.fillText(list.numbered ? `${i + 1}.` : "•", 40, y);
        ctx.fillStyle = "#1f2430";
        y = wrapText(ctx, item, 40 + s * 1.6, y, w - 76 - s * 1.6, s * 1.28) + s * 0.12;
      });
    }
    ctx.fillText = save;
    return y;
  };
  let s = 34;
  while (s > 13 && draw(s, true) > bottom) s -= 1;
  draw(s, false);
  ctx.fillStyle = "#6a7080";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText("Click to read it close up", 36, h - 22);
}

function Board({ spec }: { spec: BoardSpec }) {
  const texture = useCanvasTexture(Math.round(spec.w * PX_PER_M), Math.round(spec.h * PX_PER_M), (ctx, w, h) => drawBoard(ctx, w, h, BOARDS[spec.key]));
  const face = useMemo(() => washed(texture), [texture]);
  useEffect(() => () => face.dispose(), [face]);
  useNight([face]);
  return (
    <group position={spec.at} rotation={[0, spec.rotationY, 0]}>
      <Clickable onClick={() => openPiece(`board:${spec.key}`)}>
        <mesh position={[0, spec.bottom + spec.h / 2, 0.001]} material={face} userData={{ navIgnore: true }}>
          <planeGeometry args={[spec.w, spec.h]} />
        </mesh>
      </Clickable>
    </group>
  );
}

/** The dance photos, framed on the classroom's back wall either side of
 *  the door, past where its shoji slide open (to x ±5.4), under the clocks
 *  on the right. */
const WALL_Z = CLASSROOM.maxZ - 0.15 - 0.06; // the wall's inner face, and the frame's depth
export const DANCE: Placement[] = [
  { id: "d4", at: [-7.3, 1.7, WALL_Z], rotationY: Math.PI, size: 1.45 },
  { id: "d6", at: [7.3, 1.62, WALL_Z], rotationY: Math.PI, size: 1.25 },
];

export function Boards() {
  const outdoor = useRef<THREE.Group>(null);
  useDrawDistance(outdoor, [-2, 54], 60);
  const geometry = useMemo(() => {
    const b = new Builder();
    for (const spec of BOARD_SPECS) {
      const q = new THREE.Euler(0, spec.rotationY, 0);
      const at = (dx: number, dy: number, dz: number): Vec3 => {
        const v = new THREE.Vector3(dx, dy, dz).applyEuler(q);
        return [spec.at[0] + v.x, spec.at[1] + v.y, spec.at[2] + v.z];
      };
      b.box([spec.w + 0.12, spec.h + 0.12, 0.06], at(0, spec.bottom + spec.h / 2, -0.035), "#5b3f28", [0, spec.rotationY, 0]);
      for (const side of [-1, 1]) b.box([0.09, spec.bottom + 0.25, 0.09], at(side * (spec.w / 2 - 0.25), (spec.bottom + 0.25) / 2, -0.06), "#4a3423", [0, spec.rotationY, 0]);
    }
    for (const p of DANCE) addBacking(b, p, "frame");
    return b.build();
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => paint(), []);
  const labels = useMemo<LabelPlacement[]>(
    () => DANCE.map((p) => ({ id: p.id, at: [p.at[0], p.at[1] - 0.62, p.at[2] - 0.002] as Vec3, rotationY: p.rotationY, width: 0.8 })),
    []
  );
  const outside = BOARD_SPECS.filter((s) => s.at[2] > 38);
  const inside = BOARD_SPECS.filter((s) => s.at[2] <= 38);
  return (
    <>
      <mesh geometry={geometry} material={material} castShadow raycast={noRaycast} />
      <group ref={outdoor}>
        {outside.map((spec) => (
          <Board key={spec.key} spec={spec} />
        ))}
      </group>
      {inside.map((spec) => (
        <Board key={spec.key} spec={spec} />
      ))}
      {DANCE.map((p) => (
        <Picture key={p.id} place={p} sequence={DANCE.map((d) => d.id)} />
      ))}
      <Labels labels={labels} />
    </>
  );
}

export function boardObstacles(): Obstacle[] {
  return BOARD_SPECS.map((s) => ({ x: s.at[0], z: s.at[2], halfX: s.w / 2 + 0.06, halfZ: 0.15, rotationY: s.rotationY }));
}
