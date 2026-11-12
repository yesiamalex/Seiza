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
import { checkReach, dropBuriedIslands, findFloors, overhead, worldTriangles } from "./nav-tools.mjs";

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
// "door" as a word: "Indoor Floor Tiles" is a floor.
const NOT_SOLID_MATERIAL = /\bdoor\b|elevator glass/i;
/** Floors, by material. Some are modelled facing down (the Academic
 *  Residences' upper storeys), which the navmesh would take for a ceiling;
 *  these are turned to face up first. */
const FLOOR_MATERIAL = /floor/i;

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
const { positions, indices } = worldTriangles(doc, (node, material) => NOT_SOLID.test(node) || NOT_SOLID_MATERIAL.test(material), (material) => FLOOR_MATERIAL.test(material));
log(`Baking the navmesh from ${(indices.length / 3).toLocaleString("en")} triangles…`);
const started = Date.now();
const nav = generateTiledNavMesh(positions, indices, NAV);
if (!nav.success) throw new Error(`Navmesh failed: ${nav.error}`);
mkdirSync(OUT, { recursive: true });
log(`Navmesh baked in ${((Date.now() - started) / 1000).toFixed(0)} s`);

// Pockets under floors, which nobody could stand in, are turned off.
const above = overhead(positions, indices);
const { dropped, total } = dropBuriedIslands(nav.navMesh, above, log);
log(`Turned off ${dropped} of ${total} polygons under floors.`);
const navBytes = exportNavMesh(nav.navMesh);
writeFileSync(join(OUT, "campus.navmesh"), navBytes);
log(`Navmesh: ${mb(navBytes.length)}`);

// Worth a look after every build: can you walk from the Oblation into
// each building? And each building's floors, for the lifts.
const query = new NavMeshQuery(nav.navMesh);
checkReach(query, log);
const floors = findFloors(query, above, log);
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
