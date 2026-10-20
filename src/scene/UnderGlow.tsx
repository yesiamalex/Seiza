import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { nightNeed } from "./roomLights";

/** A desk lit from under its top, as in a hotel: where it stands, the size
 *  of its top, the height of the top's underside, which edge the strip runs
 *  under (+1 the +Z edge, -1 the -Z), and how bright (1 is a student's). */
export interface GlowDesk {
  x: number;
  z: number;
  width: number;
  depth: number;
  under: number;
  edge: 1 | -1;
  strength?: number;
  /** Turned about its centre, like the bench or desk it lights. */
  yaw?: number;
}

const COLOR = new THREE.Color("#ffcf8a");
const OFF = 0;
const STRIP = 0.022;

/**
 * Light from under desks, faked: a strip tucked under each top's edge,
 * which you only see if you crouch, and a soft pool of warm light on the
 * floor below, which is the part that reads. No lights; two meshes for every
 * desk in a room (strips, pools), each desk's brightness baked into its
 * vertex colours. On the room's switch; strongest at night, faint by day.
 */
export function UnderGlow({ desks, lit }: { desks: GlowDesk[]; lit: boolean }) {
  // The desks are fixed for the world's lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { strips, pools } = useMemo(() => build(desks), []);
  useEffect(
    () => () => {
      strips.dispose();
      pools.dispose();
    },
    [strips, pools]
  );
  const texture = useMemo(spillTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const stripMaterial = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);
  const poolMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [texture]
  );
  useEffect(
    () => () => {
      stripMaterial.dispose();
      poolMaterial.dispose();
    },
    [stripMaterial, poolMaterial]
  );
  const level = useRef(lit ? 1 : 0);
  useFrame((_, delta) => {
    level.current += ((lit ? 1 : 0) - level.current) * (1 - Math.exp(-delta / 0.15));
    const k = OFF + (1 - OFF) * level.current * (0.3 + 0.7 * nightNeed());
    stripMaterial.color.setScalar(Math.max(0.05, k));
    poolMaterial.color.setScalar(k);
    poolMaterial.visible = k > 0.01;
  });
  return (
    <>
      <mesh geometry={strips} material={stripMaterial} raycast={() => null} />
      <mesh geometry={pools} material={poolMaterial} raycast={() => null} renderOrder={1} />
    </>
  );
}

function build(desks: GlowDesk[]) {
  const strips: THREE.BufferGeometry[] = [];
  const pools: THREE.BufferGeometry[] = [];
  const tint = (g: THREE.BufferGeometry, k: number) => {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([COLOR.r * k, COLOR.g * k, COLOR.b * k], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return g;
  };
  for (const d of desks) {
    const k = d.strength ?? 1;
    // Built round the piece's own centre, then turned and placed.
    const place = (g: THREE.BufferGeometry) => g.rotateY(d.yaw ?? 0).translate(d.x, 0, d.z).toNonIndexed();
    // The strip is the source, kept faint: the pool is what reads.
    strips.push(tint(place(new THREE.BoxGeometry(d.width - 0.1, STRIP, STRIP).translate(0, d.under - STRIP / 2, d.edge * (d.depth / 2 - 0.04))), 0.55 * k));
    // The pool starts under the piece and spills out past the lit edge,
    // fading as it goes (spillTexture: brightest at its -Z end). Turned
    // round for a strip under the +Z edge.
    // From well back under the piece to well out past its lit edge.
    const back = d.depth * 0.8;
    const reach = d.depth * 2.6 + back;
    pools.push(
      tint(
        place(
          new THREE.PlaneGeometry(d.width * 1.5, reach)
            .rotateX(-Math.PI / 2)
            // Laid out spilling toward +Z, brightest just inside the lit
            // edge; turned round when that edge is the -Z one.
            .translate(0, 0.004, reach / 2 - back)
            .rotateY(d.edge > 0 ? 0 : Math.PI)
        ),
        0.5 * k
      )
    );
  }
  return {
    strips: mergeGeometries(strips) ?? new THREE.BufferGeometry(),
    pools: mergeGeometries(pools) ?? new THREE.BufferGeometry(),
  };
}

/** A texture from a brightness function of (u across, v down), 0 to 1. */
function shadedTexture(size: number, shade: (u: number, v: number) => number): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.round(255 * Math.max(0, Math.min(1, shade((x + 0.5) / size, (y + 0.5) / size))));
      image.data.set([255, 255, 255, a], (y * size + x) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
/** Light thrown from a strip: full along its length, softening to nothing
 *  at the ends (no oval, no hard sides), and fading with distance from it. */
const stripFalloff = (u: number, v: number) => smooth((0.5 - Math.abs(u - 0.5)) / 0.3) * Math.pow(1 - v, 2.2);
/** Where along a floor pool the lit edge falls: the light fades from
 *  there both ways, softly back under the piece and further out past it. */
const POOL_PEAK = 0.38;
/** A pool on the floor, starting under the piece (the top of the canvas)
 *  and spilling out past its lit edge. */
export function spillTexture(): THREE.Texture {
  return shadedTexture(64, (u, v) => {
    const along = v < POOL_PEAK ? Math.pow(smooth(v / POOL_PEAK), 1.4) : Math.pow(1 - (v - POOL_PEAK) / (1 - POOL_PEAK), 2.2);
    return smooth((0.5 - Math.abs(u - 0.5)) / 0.3) * along;
  });
}

/** A soft rounded pool: brightest in the middle, gone at the edges. */
export function poolTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A ledge lit from under its front edge, washing the wall below it: a
 *  window sill, a notice board. In the ledge's own frame (the room on +Z,
 *  turned by `yaw` and placed at `x`, `z`): `top` is the ledge's underside,
 *  `wall` how far out the wall's face is, `lip` the ledge's front edge. */
export interface WashLedge {
  x: number;
  z: number;
  yaw: number;
  width: number;
  top: number;
  wall: number;
  lip: number;
  /** How far down the wash reaches. */
  reach?: number;
  strength?: number;
}

/**
 * Under-lit ledges, faked like UnderGlow: a strip tucked under each front
 * edge and a soft wash on the wall below, brightest just under the ledge
 * and fading down and to the sides. Two meshes for any number of ledges;
 * on the room's switch, strongest at night.
 */
export function WallWash({ ledges, lit }: { ledges: WashLedge[]; lit: boolean }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { strips, washes } = useMemo(() => buildWashes(ledges), []);
  useEffect(
    () => () => {
      strips.dispose();
      washes.dispose();
    },
    [strips, washes]
  );
  const texture = useMemo(washTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const stripMaterial = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);
  const washMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [texture]
  );
  useEffect(
    () => () => {
      stripMaterial.dispose();
      washMaterial.dispose();
    },
    [stripMaterial, washMaterial]
  );
  const level = useRef(lit ? 1 : 0);
  useFrame((_, delta) => {
    level.current += ((lit ? 1 : 0) - level.current) * (1 - Math.exp(-delta / 0.15));
    const k = level.current * (0.3 + 0.7 * nightNeed());
    stripMaterial.color.setScalar(Math.max(0.05, k));
    washMaterial.color.setScalar(k);
    washMaterial.visible = k > 0.01;
  });
  return (
    <>
      <mesh geometry={strips} material={stripMaterial} raycast={() => null} />
      <mesh geometry={washes} material={washMaterial} raycast={() => null} renderOrder={1} />
    </>
  );
}

function buildWashes(ledges: WashLedge[]) {
  const strips: THREE.BufferGeometry[] = [];
  const washes: THREE.BufferGeometry[] = [];
  for (const l of ledges) {
    const k = l.strength ?? 1;
    const reach = (l.reach ?? 0.9) * 1.3;
    const place = (g: THREE.BufferGeometry) => g.rotateY(l.yaw).translate(l.x, 0, l.z).toNonIndexed();
    const tint = (g: THREE.BufferGeometry, s: number) => {
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([COLOR.r * s, COLOR.g * s, COLOR.b * s], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      return g;
    };
    strips.push(tint(place(new THREE.BoxGeometry(l.width - 0.1, STRIP, STRIP).translate(0, l.top - STRIP / 2, l.lip - STRIP / 2)), k));
    // Wider than the ledge, so the light fades out on the wall beside it
    // rather than stopping square at its ends.
    washes.push(tint(place(new THREE.PlaneGeometry(l.width * 1.7, reach).translate(0, l.top - reach / 2, l.wall + 0.005)), 0.5 * k));
  }
  return {
    strips: mergeGeometries(strips) ?? new THREE.BufferGeometry(),
    washes: mergeGeometries(washes) ?? new THREE.BufferGeometry(),
  };
}

/** Brightest along the top, under the ledge, fading down the wall and
 *  softly out to both sides. */
function washTexture(): THREE.Texture {
  return shadedTexture(64, (u, v) => smooth((0.5 - Math.abs(u - 0.5)) / 0.32) * Math.pow(1 - v, 1.8));
}
