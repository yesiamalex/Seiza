// The lab under construction: a barrier round it of posts, caution tape,
// and striped barricades with amber lamps that blink (brighter after
// dark), open at the main door so people can still go in, traffic cones
// at the corners and the way in, scaffolding up part of its front, and a
// sign that sends people to the kubo. Each material one merged mesh,
// and the textures drawn once on canvases: a few draw calls, no files.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { skyState } from "../../../src/sky/skyState";
import { box, mergeParts } from "../../tulay/client/geometry";
import { BARRIER, BARRIER_HEIGHT, BARRIER_OPENING, BARRIER_RUNS, BARRIER_SPACING, SCAFFOLD, SIGN } from "./plan";

/** A canvas texture, drawn once. */
function canvasTexture(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Diagonal stripes, `a` and `b`, as on a barricade or round a post. */
const stripes = (a: string, b: string) =>
  canvasTexture(128, 32, (c) => {
    c.fillStyle = a;
    c.fillRect(0, 0, 128, 32);
    c.fillStyle = b;
    for (let x = -32; x < 160; x += 32) {
      c.beginPath();
      c.moveTo(x, 32);
      c.lineTo(x + 16, 32);
      c.lineTo(x + 32, 0);
      c.lineTo(x + 16, 0);
      c.fill();
    }
  });

/** Caution tape: black-edged yellow, the warning in three languages. */
const tape = () =>
  canvasTexture(512, 32, (c) => {
    c.fillStyle = "#f6c90e";
    c.fillRect(0, 0, 512, 32);
    c.fillStyle = "#111";
    c.fillRect(0, 0, 512, 3);
    c.fillRect(0, 29, 512, 3);
    c.font = "bold 17px system-ui, sans-serif";
    c.textBaseline = "middle";
    c.fillText("CAUTION · INGAT · 立入禁止 · CAUTION", 14, 17);
  });

/** The sign: what's happening, and where the sessions went. */
const signFace = () =>
  canvasTexture(640, 440, (c) => {
    c.fillStyle = "#f6c90e";
    c.fillRect(0, 0, 640, 440);
    c.strokeStyle = "#111";
    c.lineWidth = 18;
    c.strokeRect(9, 9, 622, 422);
    c.fillStyle = "#111";
    c.textAlign = "center";
    // Each line as large as fits inside the border.
    const fit = (text: string, weight: string, size: number, y: number) => {
      c.font = `${weight} ${size}px system-ui, sans-serif`;
      while (size > 12 && c.measureText(text).width > 560) c.font = `${weight} ${(size -= 2)}px system-ui, sans-serif`;
      c.fillText(text, 320, y);
    };
    fit("UNDER CONSTRUCTION", "900", 56, 92);
    fit("工事中 · GINAGAWA PA", "bold", 40, 150);
    c.fillRect(60, 180, 520, 4);
    fit("The lab is being fixed. Sessions are in", "500", 27, 232);
    fit("the kubo, across the meadow.", "500", 27, 268);
    fit("ラボは改修中です。セッションは草原の先のクボで。", "500", 24, 322);
    fit("Inaayos pa ang lab. Nasa kubo ang mga sesyon.", "500", 24, 360);
  });

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A box along a run from `a` to `b` (on x or z), its texture repeating
 *  every `tile` metres along it. */
function run(a: [number, number], b: [number, number], y: number, height: number, thick: number, tile: number) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const g = new THREE.BoxGeometry(length, height, thick);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (length / tile));
  g.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0]));
  return g.translate((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
}

/** A tube between two points, for scaffolding. */
function tube(from: THREE.Vector3, to: THREE.Vector3, radius = 0.024) {
  const g = new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 6, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), to.clone().sub(from).normalize()));
  return g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
}

/** Every third gap between posts is a barricade; the rest are tape. */
const BARRICADE_EVERY = 3;

function build() {
  const posts: THREE.BufferGeometry[] = [];
  const feet: THREE.BufferGeometry[] = [];
  const boards: THREE.BufferGeometry[] = [];
  const tapes: THREE.BufferGeometry[] = [];
  const lampsA: THREE.BufferGeometry[] = [];
  const lampsB: THREE.BufferGeometry[] = [];
  const cones: THREE.BufferGeometry[] = [];
  const bands: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  const planks: THREE.BufferGeometry[] = [];

  // The barrier, run by run round the lab, the way in left open.
  const corners: [number, number][] = [
    [BARRIER.x0, BARRIER.z0],
    [BARRIER.x1, BARRIER.z0],
    [BARRIER.x1, BARRIER.z1],
    [BARRIER.x0, BARRIER.z1],
  ];
  let gap = 0;
  for (const [a, b] of BARRIER_RUNS) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.max(1, Math.round(length / BARRIER_SPACING));
    // The run's last post (each segment below puts up its first).
    posts.push(new THREE.CylinderGeometry(0.045, 0.05, BARRIER_HEIGHT, 8).translate(b[0], BARRIER_HEIGHT / 2, b[1]));
    feet.push(box(b[0], 0.03, b[1], 0.34, 0.06, 0.34));
    for (let i = 0; i < count; i++) {
      const p = (t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const from = p(i / count);
      const to = p((i + 1) / count);
      posts.push(new THREE.CylinderGeometry(0.045, 0.05, BARRIER_HEIGHT, 8).translate(from[0], BARRIER_HEIGHT / 2, from[1]));
      feet.push(box(from[0], 0.03, from[1], 0.34, 0.06, 0.34));
      if (gap++ % BARRICADE_EVERY === 0) {
        // Two striped boards, and a lamp on each end's post.
        for (const y of [0.55, 0.92]) boards.push(run(from, to, y, 0.2, 0.035, 0.9));
        (gap % 2 ? lampsA : lampsB).push(new THREE.SphereGeometry(0.07, 10, 8).translate(from[0], BARRIER_HEIGHT + 0.07, from[1]));
        (gap % 2 ? lampsB : lampsA).push(new THREE.SphereGeometry(0.07, 10, 8).translate(to[0], BARRIER_HEIGHT + 0.07, to[1]));
      } else {
        for (const y of [0.62, 0.98]) tapes.push(run(from, to, y, 0.075, 0.006, 1.7));
      }
    }
  }

  // Cones at the corners, out on the meadow side, and two by the sign.
  const conesAt: [number, number][] = [
    ...corners.map(([x, z]): [number, number] => [x + Math.sign(x) * 0.7, z + Math.sign(z) * 0.7]),
    [SIGN.x + 0.4, SIGN.z - 1.4],
    [SIGN.x + 0.4, SIGN.z + 1.4],
    // Either side of the way in.
    [BARRIER_OPENING.x - BARRIER_OPENING.half - 0.1, BARRIER.z1 + 0.6],
    [BARRIER_OPENING.x + BARRIER_OPENING.half + 0.1, BARRIER.z1 + 0.6],
  ];
  for (const [x, z] of conesAt) {
    feet.push(box(x, 0.02, z, 0.42, 0.04, 0.42));
    cones.push(new THREE.ConeGeometry(0.15, 0.7, 16, 1, true).translate(x, 0.39, z));
    bands.push(new THREE.CylinderGeometry(0.075, 0.098, 0.12, 16, 1, true).translate(x, 0.5, z));
  }

  // Scaffolding up part of the lab's front: standards every bay, ledgers
  // along each level, transoms across, planks on the lower two levels, and
  // a brace across the outer face.
  const s = SCAFFOLD;
  const top = s.levels[s.levels.length - 1] + 0.6;
  for (let x = s.x0; x <= s.x1 + 1e-6; x += s.bay) {
    for (const z of [s.z0, s.z1]) steel.push(tube(v(x, 0, z), v(x, top, z), 0.03));
    for (const y of s.levels) steel.push(tube(v(x, y, s.z0), v(x, y, s.z1)));
  }
  for (const y of [...s.levels, top - 0.05]) for (const z of [s.z0, s.z1]) steel.push(tube(v(s.x0, y, z), v(s.x1, y, z)));
  for (let x = s.x0; x + s.bay * 2 <= s.x1 + 1e-6; x += s.bay * 2) steel.push(tube(v(x, 0.1, s.z1), v(x + s.bay * 2, s.levels[2], s.z1)));
  for (const y of s.levels.slice(0, 2)) planks.push(box((s.x0 + s.x1) / 2, y + 0.04, (s.z0 + s.z1) / 2, s.x1 - s.x0, 0.05, s.z1 - s.z0 - 0.08));

  // The sign's legs, behind its face (which looks +x).
  for (const dz of [-0.75, 0.75]) posts.push(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8).translate(SIGN.x - 0.07, 1.1, SIGN.z + dz));
  return {
    posts: mergeParts(posts),
    feet: mergeParts(feet),
    boards: mergeParts(boards),
    tapes: mergeParts(tapes),
    lampsA: mergeParts(lampsA),
    lampsB: mergeParts(lampsB),
    cones: mergeParts(cones),
    bands: mergeParts(bands),
    steel: mergeParts(steel),
    planks: mergeParts(planks),
  };
}

function materials() {
  const lamp = () => new THREE.MeshStandardMaterial({ color: "#ffb02e", emissive: new THREE.Color("#ff9a1f"), emissiveIntensity: 0.4, roughness: 0.4 });
  return {
    post: new THREE.MeshStandardMaterial({ color: "#ffffff", map: stripes("#f2f2ee", "#d8342b"), roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.9 }),
    board: new THREE.MeshStandardMaterial({ color: "#ffffff", map: stripes("#f4f3ee", "#ef6a12"), roughness: 0.5 }),
    tape: new THREE.MeshStandardMaterial({ color: "#ffffff", map: tape(), roughness: 0.6, side: THREE.DoubleSide }),
    lampA: lamp(),
    lampB: lamp(),
    cone: new THREE.MeshStandardMaterial({ color: "#f26a1b", roughness: 0.55, side: THREE.DoubleSide }),
    band: new THREE.MeshStandardMaterial({ color: "#f5f5f0", roughness: 0.3, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.08, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ color: "#9aa1a8", metalness: 0.35, roughness: 0.45 }),
    plank: new THREE.MeshStandardMaterial({ color: "#a77b4a", roughness: 0.85 }),
    sign: new THREE.MeshStandardMaterial({ color: "#ffffff", map: signFace(), roughness: 0.6 }),
    signBack: new THREE.MeshStandardMaterial({ color: "#5c6168", roughness: 0.6 }),
  };
}

export function Barrier() {
  const parts = useMemo(build, []);
  const m = useMemo(materials, []);
  useEffect(
    () => () => {
      for (const g of Object.values(parts)) g.dispose();
      for (const mat of Object.values(m)) {
        mat.map?.dispose();
        mat.dispose();
      }
    },
    [parts, m]
  );
  // The lamps take turns, a beat each; faint by day, bright after dusk.
  useFrame(({ clock }) => {
    const dark = THREE.MathUtils.clamp(1 - skyState.dayness * 1.8, 0, 1);
    const on = Math.floor(clock.elapsedTime * 1.4) % 2 === 0;
    const bright = 0.35 + dark * 2.6;
    m.lampA.emissiveIntensity = on ? bright : 0.05;
    m.lampB.emissiveIntensity = on ? 0.05 : bright;
  });
  return (
    <group>
      <mesh geometry={parts.posts} material={m.post} castShadow />
      <mesh geometry={parts.feet} material={m.rubber} receiveShadow />
      <mesh geometry={parts.boards} material={m.board} castShadow />
      <mesh geometry={parts.tapes} material={m.tape} />
      <mesh geometry={parts.lampsA} material={m.lampA} />
      <mesh geometry={parts.lampsB} material={m.lampB} />
      <mesh geometry={parts.cones} material={m.cone} castShadow />
      <mesh geometry={parts.bands} material={m.band} />
      <mesh geometry={parts.steel} material={m.steel} castShadow />
      <mesh geometry={parts.planks} material={m.plank} castShadow receiveShadow />
      <group position={[SIGN.x, 1.55, SIGN.z]} rotation={[0, SIGN.rotationY, 0]}>
        <mesh material={m.sign} position={[0, 0, 0.026]}>
          <planeGeometry args={[1.75, 1.2]} />
        </mesh>
        <mesh material={m.signBack}>
          <boxGeometry args={[1.79, 1.24, 0.05]} />
        </mesh>
      </group>
    </group>
  );
}

