// Generates Seizora's 3D models as .glb files, in code, so nothing needs
// licensing and nothing is downloaded: a solar array with a perovskite pilot
// row, two wind turbines, a battery energy storage container, and an
// exploded perovskite solar cell for the lab.
//
//   node worlds/seizora/models/build-models.mjs <outDir>
//
// Units are metres. Seiza's axes: +X east, +Y up, -Z north, so panels face
// south (+Z) and tilt up toward the sun's path at Philippine latitudes.
// Each placed object needs its own file (a world renders a model's scene
// directly, and a scene can only be in one place), hence one file per
// cluster rather than one file per panel.
import { Document, NodeIO } from "@gltf-transform/core";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// --- tiny geometry kit -------------------------------------------------------

function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return ([x, y, z]) => [x, y * c - z * s, y * s + z * c];
}
function rotY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return ([x, y, z]) => [x * c + z * s, y, -x * s + z * c];
}
function rotZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return ([x, y, z]) => [x * c - y * s, x * s + y * c, z];
}
const compose = (...fs) => (v) => fs.reduce((acc, f) => f(acc), v);

/** A mesh under construction: one primitive per material. */
class Builder {
  constructor() {
    this.parts = new Map(); // material key -> { pos, nor, idx }
  }
  part(mat) {
    if (!this.parts.has(mat)) this.parts.set(mat, { pos: [], nor: [], idx: [] });
    return this.parts.get(mat);
  }
  /** Axis-aligned box of size [w, h, d] centred at `at`, then rotated by
   *  `rot` (a vector function) about its own centre. */
  box(mat, size, at, rot = (v) => v) {
    const p = this.part(mat);
    const [w, h, d] = size.map((v) => v / 2);
    const faces = [
      [[1, 0, 0], [[w, -h, -d], [w, h, -d], [w, h, d], [w, -h, d]]],
      [[-1, 0, 0], [[-w, -h, d], [-w, h, d], [-w, h, -d], [-w, -h, -d]]],
      [[0, 1, 0], [[-w, h, -d], [-w, h, d], [w, h, d], [w, h, -d]]],
      [[0, -1, 0], [[-w, -h, d], [-w, -h, -d], [w, -h, -d], [w, -h, d]]],
      [[0, 0, 1], [[w, -h, d], [w, h, d], [-w, h, d], [-w, -h, d]]],
      [[0, 0, -1], [[-w, -h, -d], [-w, h, -d], [w, h, -d], [w, -h, -d]]],
    ];
    for (const [n, quad] of faces) {
      const base = p.pos.length / 3;
      const rn = rot(n);
      for (const v of quad) {
        const r = rot(v);
        p.pos.push(r[0] + at[0], r[1] + at[1], r[2] + at[2]);
        p.nor.push(...rn);
      }
      p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  /** Vertical cylinder (or truncated cone) from y0 to y1, rotated by `rot`
   *  about `at`. */
  cylinder(mat, r0, r1, y0, y1, at, segments = 16, rot = (v) => v) {
    const p = this.part(mat);
    const slope = (r0 - r1) / (y1 - y0);
    const base = p.pos.length / 3;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      const n = rot([cx, slope, cz]);
      const len = Math.hypot(...n);
      for (const [r, y] of [[r0, y0], [r1, y1]]) {
        const v = rot([cx * r, y, cz * r]);
        p.pos.push(v[0] + at[0], v[1] + at[1], v[2] + at[2]);
        p.nor.push(n[0] / len, n[1] / len, n[2] / len);
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      p.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    // Caps.
    for (const [r, y, up] of [[r0, y0, -1], [r1, y1, 1]]) {
      const c = p.pos.length / 3;
      const cn = rot([0, up, 0]);
      const cv = rot([0, y, 0]);
      p.pos.push(cv[0] + at[0], cv[1] + at[1], cv[2] + at[2]);
      p.nor.push(...cn);
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const v = rot([Math.cos(a) * r, y, Math.sin(a) * r]);
        p.pos.push(v[0] + at[0], v[1] + at[1], v[2] + at[2]);
        p.nor.push(...cn);
      }
      for (let i = 0; i < segments; i++) {
        if (up > 0) p.idx.push(c, c + i + 2, c + i + 1);
        else p.idx.push(c, c + i + 1, c + i + 2);
      }
    }
  }
}

const MATERIALS = {
  silicon: { color: [0.05, 0.09, 0.22, 1], metal: 0.3, rough: 0.25 },
  perovskite: { color: [0.24, 0.1, 0.06, 1], metal: 0.25, rough: 0.3 },
  aluminium: { color: [0.72, 0.74, 0.76, 1], metal: 0.8, rough: 0.4 },
  steel: { color: [0.45, 0.47, 0.5, 1], metal: 0.7, rough: 0.5 },
  concrete: { color: [0.62, 0.61, 0.58, 1], metal: 0, rough: 0.95 },
  turbine: { color: [0.92, 0.93, 0.94, 1], metal: 0.05, rough: 0.5 },
  container: { color: [0.86, 0.88, 0.86, 1], metal: 0.2, rough: 0.6 },
  green: { color: [0.1, 0.55, 0.32, 1], metal: 0.1, rough: 0.6 },
  dark: { color: [0.12, 0.13, 0.15, 1], metal: 0.2, rough: 0.6 },
  warning: { color: [0.95, 0.72, 0.1, 1], metal: 0.1, rough: 0.5 },
  glass: { color: [0.75, 0.9, 0.95, 0.35], metal: 0, rough: 0.05, blend: true },
  tco: { color: [0.55, 0.8, 0.95, 0.75], metal: 0.1, rough: 0.2, blend: true },
  etl: { color: [0.92, 0.92, 0.95, 1], metal: 0, rough: 0.6 },
  absorber: { color: [0.2, 0.08, 0.05, 1], metal: 0.2, rough: 0.35 },
  htl: { color: [0.55, 0.35, 0.75, 1], metal: 0, rough: 0.5 },
  gold: { color: [0.9, 0.72, 0.3, 1], metal: 1, rough: 0.25 },
  wood: { color: [0.45, 0.3, 0.18, 1], metal: 0, rough: 0.8 },
};

function writeGlb(builder, path, name) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(name);
  for (const [key, { pos, nor, idx }] of builder.parts) {
    const m = MATERIALS[key];
    const mat = doc
      .createMaterial(key)
      .setBaseColorFactor(m.color)
      .setMetallicFactor(m.metal)
      .setRoughnessFactor(m.rough);
    if (m.blend) mat.setAlphaMode("BLEND").setDoubleSided(true);
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(nor)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(idx)).setBuffer(buffer))
      .setMaterial(mat);
    mesh.addPrimitive(prim);
  }
  const node = doc.createNode(name).setMesh(mesh);
  doc.createScene(name).addChild(node);
  return new NodeIO().write(path, doc);
}

// --- the models --------------------------------------------------------------

const TILT = (15 * Math.PI) / 180; // a typical fixed tilt at 10° N

/** Three rows of six panels; the back row is the perovskite pilot. */
function solarArray() {
  const b = new Builder();
  const panelW = 1.05, panelL = 1.75, rows = 3, perRow = 6;
  for (let r = 0; r < rows; r++) {
    const z = r * 2.6;
    const cell = r === rows - 1 ? "perovskite" : "silicon";
    const rowWidth = perRow * (panelW + 0.04);
    for (let i = 0; i < perRow; i++) {
      const x = -rowWidth / 2 + i * (panelW + 0.04) + panelW / 2;
      const tilt = rotX(-TILT); // lower edge toward +Z (south), raised to the north
      const centre = [x, 1.0, z];
      b.box(cell, [panelW, 0.035, panelL], centre, tilt);
      b.box("aluminium", [panelW + 0.03, 0.03, 0.04], [x, 1.0 + Math.sin(TILT) * (panelL / 2), z - Math.cos(TILT) * (panelL / 2)], tilt);
      b.box("aluminium", [panelW + 0.03, 0.03, 0.04], [x, 1.0 - Math.sin(TILT) * (panelL / 2), z + Math.cos(TILT) * (panelL / 2)], tilt);
    }
    // Racking: a rail under each row and posts at each end and the middle.
    b.box("steel", [rowWidth, 0.06, 0.08], [0, 0.93, z], rotX(-TILT));
    for (const x of [-rowWidth / 2 + 0.2, 0, rowWidth / 2 - 0.2]) {
      b.box("steel", [0.08, 1.15, 0.08], [x, 0.55, z - 0.6]);
      b.box("steel", [0.08, 0.75, 0.08], [x, 0.35, z + 0.6]);
      b.box("concrete", [0.3, 0.12, 0.3], [x, 0.06, z - 0.6]);
      b.box("concrete", [0.3, 0.12, 0.3], [x, 0.06, z + 0.6]);
    }
  }
  // A combiner box at the end of the rows.
  b.box("steel", [0.5, 0.7, 0.25], [4.1, 0.6, 2.6]);
  b.box("warning", [0.18, 0.18, 0.01], [4.1, 0.75, 2.73]);
  return b;
}

/** A wind turbine: hub height 14 m, rotor 12 m across. The rotor is fixed
 *  at an angle; the turbine stands as a landmark, the panel shows its power. */
function windTurbine(phase) {
  const b = new Builder();
  b.cylinder("concrete", 1.3, 1.3, 0, 0.3, [0, 0, 0], 20);
  b.cylinder("turbine", 0.42, 0.22, 0.3, 14, [0, 0, 0], 20);
  b.box("turbine", [0.8, 0.8, 2.2], [0, 14.2, 0.2]);
  b.cylinder("turbine", 0.32, 0.12, 0, 0.6, [0, 14.2, -1.0], 16, rotX(-Math.PI / 2));
  for (let k = 0; k < 3; k++) {
    const a = phase + (k * 2 * Math.PI) / 3;
    const spin = rotZ(a);
    // Blade: tapered by stacking two boxes, pitched slightly.
    const root = spin([0, 1.9, 0]);
    const tip = spin([0, 4.6, 0]);
    b.box("turbine", [0.5, 2.6, 0.08], [root[0], 14.2 + root[1], -1.05], compose(rotY(0.15), spin));
    b.box("turbine", [0.28, 2.9, 0.06], [tip[0], 14.2 + tip[1], -1.05], compose(rotY(0.15), spin));
  }
  b.box("warning", [0.1, 0.1, 0.1], [0, 14.65, 1.25]); // aviation light
  return b;
}

/** Battery energy storage: a 6 m container, its cooling unit, and a
 *  pad-mounted transformer. */
function batteryBank() {
  const b = new Builder();
  b.box("concrete", [8, 0.2, 3.6], [0.8, 0.1, 0]);
  b.box("container", [6, 2.6, 2.44], [0, 1.5, 0]);
  for (let i = 0; i < 5; i++) b.box("aluminium", [0.04, 2.3, 0.02], [-2.4 + i * 1.2, 1.5, 1.23]);
  b.box("green", [5.6, 0.25, 0.02], [0, 2.55, 1.23]);
  b.box("warning", [0.5, 0.35, 0.02], [2.3, 1.9, 1.235]);
  b.box("dark", [0.9, 1.0, 0.7], [3.55, 1.5, 0.6]); // cooling unit
  b.box("aluminium", [0.7, 0.7, 0.04], [3.55, 1.6, 0.97]);
  b.box("green", [1.3, 1.5, 1.2], [4.6, 0.95, -0.5]); // transformer
  b.box("warning", [0.3, 0.3, 0.02], [4.6, 1.3, 0.11]);
  return b;
}

/** An exploded perovskite cell on a pedestal: each layer pulled apart so
 *  the stack can be read from the side, light-facing glass on top. */
function perovskiteCell() {
  const b = new Builder();
  b.cylinder("wood", 0.55, 0.6, 0, 0.9, [0, 0, 0], 24);
  const layers = [
    ["gold", 0.04], // back contact
    ["htl", 0.05], // hole-transport layer
    ["absorber", 0.09], // perovskite absorber
    ["etl", 0.05], // electron-transport layer
    ["tco", 0.04], // transparent conducting oxide
    ["glass", 0.08], // glass, facing the sun
  ];
  let y = 1.05;
  for (const [mat, t] of layers) {
    b.box(mat, [0.9, t, 0.9], [0, y + t / 2, 0]);
    y += t + 0.14;
  }
  // Thin posts holding the stack, so it reads as a model, not floating.
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    b.box("aluminium", [0.02, y - 0.9, 0.02], [x, 0.9 + (y - 0.9) / 2, z]);
  }
  return b;
}

/**
 * A standing info board: a frame on two posts with the PNG (from
 * worlds/seizora/boards/) on its face. The picture is part of the model,
 * which is how a world's starting objects can carry an image at all:
 * world.json objects copy a model link but not an image link.
 */
async function writeBoard(pngPath, path, name) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(name);
  const w = 2.4, h = 1.5, bottom = 0.85;

  // Frame and posts from the box kit.
  const frame = new Builder();
  frame.box("wood", [w + 0.12, h + 0.12, 0.06], [0, bottom + h / 2, -0.04]);
  frame.box("wood", [0.09, bottom + 0.2, 0.09], [-w / 2 + 0.2, (bottom + 0.2) / 2, -0.06]);
  frame.box("wood", [0.09, bottom + 0.2, 0.09], [w / 2 - 0.2, (bottom + 0.2) / 2, -0.06]);
  for (const [key, { pos, nor, idx }] of frame.parts) {
    const m = MATERIALS[key];
    const mat = doc.createMaterial(key).setBaseColorFactor(m.color).setMetallicFactor(m.metal).setRoughnessFactor(m.rough);
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buffer))
        .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(nor)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(idx)).setBuffer(buffer))
        .setMaterial(mat)
    );
  }

  // The face: one textured quad just in front of the frame, facing +Z.
  const texture = doc.createTexture(name).setImage(readFileSync(pngPath)).setMimeType("image/png");
  const face = doc.createMaterial(`${name}-face`).setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(0.85);
  const x0 = -w / 2, x1 = w / 2, y0 = bottom, y1 = bottom + h, z = 0;
  mesh.addPrimitive(
    doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z])).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])).setBuffer(buffer))
      .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array([0, 1, 2, 0, 2, 3])).setBuffer(buffer))
      .setMaterial(face)
  );
  doc.createScene(name).addChild(doc.createNode(name).setMesh(mesh));
  await new NodeIO().write(path, doc);
}

const out = process.argv[2] ?? "dist/worlds/seizora/models";
mkdirSync(out, { recursive: true });
const models = [
  ["solar-array.glb", solarArray()],
  ["wind-turbine-west.glb", windTurbine(0.2)],
  ["wind-turbine-east.glb", windTurbine(0.9)],
  ["battery-bank.glb", batteryBank()],
  ["perovskite-cell.glb", perovskiteCell()],
];
for (const [file, builder] of models) {
  await writeGlb(builder, join(out, file), file.replace(".glb", ""));
}
const boardsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "boards");
const boards = ["welcome", "solar", "wind", "battery", "perovskite"];
for (const name of boards) {
  await writeBoard(join(boardsDir, `${name}.png`), join(out, `board-${name}.glb`), `board-${name}`);
}
console.log(`[seizora] wrote ${models.length} models and ${boards.length} info boards to ${out}`);
