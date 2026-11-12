// Turns the campus model in worlds/seiou/media-src/ (about 100 MB, not
// committed) into what SeiOU serves, in worlds/seiou/world/models/:
//
//   campus.glb      The campus, light enough for a phone and a standalone
//                   headset, and under Cloudflare's 25 MiB per-file limit.
//   campus.navmesh  Where people can walk: the ground, paths, floors,
//                   stairs, and ramps, baked here once rather than in each
//                   visitor's browser (it takes seconds to minutes).
//
//   node worlds/seiou/scripts/build-campus.mjs [path/to/campus.glb]
//
// What it does to the model, in order:
//   1. Merges identical materials, textures, and meshes, and drops unused
//      data (the export carried 50 million vertex slots for a million
//      triangles).
//   2. Simplifies the few meshes that cost most for what they show: the
//      Oblation alone was 437,000 triangles.
//   3. Bakes the navmesh from the simplified geometry, leaving doors out so
//      every doorway is open.
//   4. Shrinks textures to at most 1024 px WebP (from up to 4096 px PNG and
//      JPEG), which is what a phone can hold in memory for a whole campus.
//   5. Joins meshes that share a material, so the campus draws in a few
//      dozen calls instead of hundreds.
//   6. Quantizes and meshopt-compresses the geometry. three.js decodes it
//      with a decoder bundled in the app: nothing is fetched from a CDN.
//
// Needs @gltf-transform, meshoptimizer, sharp, and recast-navigation, all
// already in node_modules. The build never runs it: its outputs are
// committed, so a deploy needs neither the tools nor the original.
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, flatten, join as joinMeshes, meshopt, prune, quantize, simplifyPrimitive, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { exportNavMesh, init, NavMeshQuery } from "recast-navigation";
import { generateTiledNavMesh } from "recast-navigation/generators";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(process.argv[2] ?? join(HERE, "..", "media-src", "UPOU_Campus_Layout.glb"));
const OUT = join(HERE, "..", "world", "models");

/** Meshes simplified harder than the rest: [name pattern, share of
 *  triangles kept, plain, error]. A plain mesh loses its texture coordinates and
 *  normals first (its texture becomes its average colour): seams in them
 *  are what stop the simplifier, and at campus scale nobody sees the
 *  texture on these. */
const HEAVY = [
  [/^Mesh_0$/, 0.12, true], // the Oblation: 437k triangles for an 8 m figure; the campus centrepiece, so kept fairly detailed
  [/^Cube\.047$/, 0.06, true, 0.004], // 170k triangles of plain grey, kept in shape
  [/^AR_Bldg$/, 0.6, false, 0.01], // gently: harder left gaps in its walls
];
/** Left out of the walkable surface, so they stand open: doors (whole
 *  objects, or parts of one, like the AR building's, by material), and
 *  the lettering on the Main Building. */
const NOT_SOLID = /^(Door|Text)/;
const NOT_SOLID_MATERIAL = /door|elevator glass/i;

/** Where people can walk, for a 1.6 to 1.8 m person (src/player/PlayerRig.tsx). */
const NAV = {
  cs: 0.25,
  ch: 0.1,
  tileSize: 64,
  // Stairs modelled as ramps are steep, and some steps are tall: generous,
  // so every floor connects. Players can't climb walls either way: walls
  // are vertical.
  walkableSlopeAngle: 60,
  // Low enough for the headroom under a stair's landing.
  walkableHeight: Math.ceil(1.4 / 0.1),
  walkableClimb: Math.floor(0.6 / 0.1),
  walkableRadius: 1,
  maxEdgeLen: 24,
  maxSimplificationError: 1.2,
  minRegionArea: 6,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 3,
  detailSampleMaxError: 0.4,
};

const log = (...a) => console.log("[seiou]", ...a);
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

function stats(doc, label) {
  const root = doc.getRoot();
  let tris = 0;
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : prim.getAttribute("POSITION").getCount()) / 3;
    }
  log(`${label}: ${root.listMeshes().length} meshes, ${root.listMaterials().length} materials, ${root.listTextures().length} textures, ${Math.round(tris).toLocaleString("en")} triangles`);
}

/** All triangles in world space, for the navmesh. */
function worldTriangles(doc) {
  const positions = [];
  const indices = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || NOT_SOLID.test(node.getName())) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // triangles only
      if (NOT_SOLID_MATERIAL.test(prim.getMaterial()?.getName() ?? "")) continue;
      const pos = prim.getAttribute("POSITION");
      const base = positions.length / 3;
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        positions.push(m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]);
      }
      const idx = prim.getIndices();
      if (idx) for (let i = 0; i < idx.getCount(); i++) indices.push(base + idx.getScalar(i));
      else for (let i = 0; i < pos.getCount(); i++) indices.push(base + i);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
log(`Reading ${SRC} (${mb(statSync(SRC).size)})`);
const doc = await io.read(SRC);
stats(doc, "As exported");

// 1. Shared data, and nothing unused.
await doc.transform(dedup(), prune(), weld());
stats(doc, "Deduplicated and welded");

// 2. The heavy meshes: plain ones first lose what stops simplifying.
const averaged = new Set();
for (const node of doc.getRoot().listNodes()) {
  const rule = HEAVY.find(([pattern]) => pattern.test(node.getName()));
  if (!rule?.[2] || !node.getMesh()) continue;
  for (const prim of node.getMesh().listPrimitives()) {
    for (const semantic of ["TEXCOORD_0", "TEXCOORD_1", "NORMAL", "TANGENT"]) prim.setAttribute(semantic, null);
    const material = prim.getMaterial();
    const texture = material?.getBaseColorTexture();
    if (material && texture && !averaged.has(material)) {
      averaged.add(material);
      const { channels } = await sharp(Buffer.from(texture.getImage())).stats();
      const srgb = channels.slice(0, 3).map((c) => c.mean / 255);
      const linear = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      material.setBaseColorTexture(null).setBaseColorFactor([...linear, 1]);
    }
  }
}
await doc.transform(weld(), prune());
for (const node of doc.getRoot().listNodes()) {
  const rule = HEAVY.find(([pattern]) => pattern.test(node.getName()));
  const mesh = node.getMesh();
  if (!rule || !mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    const before = prim.getIndices().getCount();
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: rule[1], error: rule[3] ?? 0.05, lockBorder: false });
    if (prim.getIndices().getCount() > before * rule[1] * 3) log(`  ${node.getName()}: simplified only to ${prim.getIndices().getCount() / 3} triangles`);
    compactPrimitive(prim);
  }
}
await doc.transform(prune());
stats(doc, "Simplified");

// 3. The navmesh, from the geometry as it now stands (before quantizing).
await init();
const { positions, indices } = worldTriangles(doc);
log(`Baking the navmesh from ${(indices.length / 3).toLocaleString("en")} triangles…`);
const started = Date.now();
const nav = generateTiledNavMesh(positions, indices, NAV);
if (!nav.success) throw new Error(`Navmesh failed: ${nav.error}`);
mkdirSync(OUT, { recursive: true });
const navBytes = exportNavMesh(nav.navMesh);
writeFileSync(join(OUT, "campus.navmesh"), navBytes);
log(`Navmesh: ${mb(navBytes.length)} in ${((Date.now() - started) / 1000).toFixed(0)} s`);

// A check worth failing loudly on: can you walk from the Oblation into
// each building? (The same spots as client/campus.ts's PLACES.)
const query = new NavMeshQuery(nav.navMesh);
const CHECKS = {
  "Main Building": [118, 0.2, 10],
  "Teaching and Learning Hub": [132, 0.2, 63],
  "TLH pod": [124, 0.5, 70],
  "CCDL auditorium": [277, 1, -96],
  "CCDL stage": [281, 5, -103],
  "WCMPB ground floor": [226, 1, 154],
  "WCMPB second floor": [226, 8.5, 150],
  "WCMPB roof deck": [226, 14.5, 150],
  "Academic Residences": [336, 0.2, -98],
};
const plaza = query.findClosestPoint({ x: 0, y: 0, z: 12 }, { halfExtents: { x: 4, y: 4, z: 4 } }).point;
for (const [name, [x, y, z]] of Object.entries(CHECKS)) {
  const goal = query.findClosestPoint({ x, y, z }, { halfExtents: { x: 2, y: 1.5, z: 2 } }).point;
  const path = query.computePath(plaza, goal, { halfExtents: { x: 4, y: 4, z: 4 } });
  const end = path.path?.[path.path.length - 1];
  const short = end ? Math.hypot(end.x - goal.x, end.y - goal.y, end.z - goal.z) : Infinity;
  log(`  plaza → ${name}: ${short < 0.5 ? `reached (y ${goal.y.toFixed(1)})` : `not reached (${short.toFixed(1)} m short)`}`);
}

// Each building's floors, for the lifts (client/Lifts.tsx) and the guides:
// the levels the navmesh has inside its footprint, where to stand on each,
// and whether you can walk there from the plaza.
const BUILDINGS = {
  main: { name: "Main Building", box: [104, 126, -23, 23] },
  tlh: { name: "Teaching and Learning Hub", box: [116, 148, 44, 82] },
  ccdl: { name: "CCDL", box: [263, 291, -113, -79] },
  ar: { name: "Academic Residences", box: [308, 364, -125, -71] },
  wcmpb: { name: "World-Class Multi-Purpose Building", box: [192, 258, 120, 184] },
};
const floors = {};
for (const [id, { name, box: [x0, x1, z0, z1] }] of Object.entries(BUILDINGS)) {
  const points = [];
  for (let x = x0 + 1; x < x1; x += 1.5)
    for (let z = z0 + 1; z < z1; z += 1.5)
      for (let y = -0.5; y < 25; y += 0.5) {
        const r = query.findClosestPoint({ x, y, z }, { halfExtents: { x: 0.3, y: 0.25, z: 0.3 } });
        if (r.success && r.polyRef && Math.abs(r.point.x - x) < 0.05 && Math.abs(r.point.z - z) < 0.05) points.push(r.point);
      }
  // Levels: heights shared by enough floor, merged when closer than a
  // storey (2.4 m): a stair landing or a step is part of its floor.
  const bins = new Map();
  for (const p of points) {
    const k = Math.round(p.y * 2) / 2;
    bins.set(k, [...(bins.get(k) ?? []), p]);
  }
  const levels = [];
  for (const [y, pts] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
    const last = levels[levels.length - 1];
    if (last && y - last.y < 2.4) {
      last.points.push(...pts);
      if (pts.length > last.top) Object.assign(last, { y, top: pts.length });
    } else levels.push({ y, top: pts.length, points: [...pts] });
  }
  const unique = new Set();
  floors[id] = {
    name,
    floors: levels
      // A floor, not a landing or a ledge: at least about 110 m².
      .filter((l) => l.points.length >= 50)
      .map((l) => {
        // Where to stand: near the middle of the level, and somewhere you
        // can walk to from the plaza if anywhere on this level is.
        const cx = l.points.reduce((a, p) => a + p.x, 0) / l.points.length;
        const cz = l.points.reduce((a, p) => a + p.z, 0) / l.points.length;
        const byMiddle = [...l.points].sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
        const reaches = (p) => {
          const path = query.computePath(plaza, p, { halfExtents: { x: 1, y: 1, z: 1 } });
          const end = path.path?.[path.path.length - 1];
          return !!end && Math.hypot(end.x - p.x, end.y - p.y, end.z - p.z) < 0.6;
        };
        const step = Math.max(1, Math.floor(byMiddle.length / 24));
        let at = byMiddle[0];
        let walk = false;
        for (let i = 0; i < byMiddle.length; i += step) {
          if (reaches(byMiddle[i])) {
            at = byMiddle[i];
            walk = true;
            break;
          }
        }
        return { at: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)], walk };
      })
      .filter((f) => !unique.has(Math.round(f.at[1])) && unique.add(Math.round(f.at[1]))),
  };
  log(`  ${name}: ${floors[id].floors.map((f, i) => `${i === 0 ? "G" : i + 1} y${f.at[1].toFixed(1)}${f.walk ? "" : " (lift)"}`).join(", ")}`);
}
writeFileSync(join(OUT, "floors.json"), JSON.stringify(floors, null, 1));

// 4–6. Textures, draw calls, and compression.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }),
  flatten(),
  joinMeshes({ keepNamed: false }),
  weld(),
  prune(),
  quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 12 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" })
);
stats(doc, "Joined and compressed");
const glb = await io.writeBinary(doc);
writeFileSync(join(OUT, "campus.glb"), glb);
const bounds = getBounds(doc.getRoot().listScenes()[0]);
log(`campus.glb: ${mb(glb.length)}; bounds ${bounds.min.map((v) => v.toFixed(0))} to ${bounds.max.map((v) => v.toFixed(0))}`);
if (glb.length > 25 * 1048576) throw new Error("campus.glb is over Cloudflare's 25 MiB per-file limit.");
