// Turns the ISCOLab model in worlds/iscolab/media-src/ (not committed) into
// what the ISCOLab world serves, in worlds/iscolab/world/models/:
//
//   lab.glb      The lab, with a lawn round it, compressed.
//   lab.navmesh  Where people can walk: the lab's floor and the lawn, with
//                the walls in the way. Baked here once, not in each
//                visitor's browser.
//
//   node worlds/iscolab/scripts/build-lab.mjs [path/to/ISCOLab.glb]
//
// Without the original model there, it rebuilds from the committed lab.glb
// instead (taking its old lawn off first), so the grounds can change
// without it. Where things stand comes from client/plan.ts, the file the
// world's own code builds from: the lawn, and while the lab is being fixed
// (UNDER_CONSTRUCTION), the barrier round it, which the navmesh treats as
// a wall but for its opening at the main door, so people walk round it
// and in that way.
//
// The model is a floor-plan blockout: a floor and wall boxes, exported at
// ten times scale, so its walls stand 20 m high. This script:
//   1. Bakes every node's transform into its mesh.
//   2. Puts the floor at y = 0 and the plan's centre at the origin, and
//      brings the walls down to WALL_HEIGHT (the plan itself keeps its
//      size: about 32 by 17 m).
//   3. Adds a lawn round the lab, so it stands somewhere rather than in
//      the sky, and people can walk round it.
//   4. Bakes the navmesh, then checks which rooms can be walked to from
//      the spawn point, and prints any that can't.
//   5. Joins meshes by material and meshopt-compresses the geometry.
//
// Needs @gltf-transform, meshoptimizer, and recast-navigation, all already
// in node_modules. The deploy never runs it: its outputs are committed.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Accessor, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, dequantize, join as joinMeshes, meshopt, normals, prune, quantize, transformMesh, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { exportNavMesh, init, NavMeshQuery } from "recast-navigation";
import { generateTiledNavMesh } from "recast-navigation/generators";
// Node runs the plan's TypeScript as it is (it has no imports of its own).
import { BARRIER, BARRIER_HEIGHT, BARRIER_RUNS, BARRIER_THICKNESS, KUBO, LAWN, SPAWN, UNDER_CONSTRUCTION } from "../client/plan.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGINAL = resolve(process.argv[2] ?? join(HERE, "..", "media-src", "ISCOLab.glb"));
const OUT = join(HERE, "..", "world", "models");
/** The original model, or failing that, the lab as last built. */
const REBUILD = !existsSync(ORIGINAL);
const SRC = REBUILD ? join(OUT, "lab.glb") : ORIGINAL;

/** Wall height after scaling, in metres: an ordinary storey. */
const WALL_HEIGHT = 3.2;
const LAWN_COLOR = [0.24, 0.42, 0.17, 1];
/** The floor and the columns, which the model leaves without a material. */
const CONCRETE_COLOR = [0.62, 0.6, 0.56, 1];

/** Where people can walk, for a 1.6 to 1.8 m person, with cells small
 *  enough for an ordinary doorway (0.8 m and up) to stay open. */
const NAV = {
  cs: 0.1,
  ch: 0.05,
  tileSize: 96,
  walkableSlopeAngle: 45,
  walkableHeight: Math.ceil(1.8 / 0.05),
  walkableClimb: Math.floor(0.3 / 0.05),
  walkableRadius: 2,
  maxEdgeLen: 40,
  maxSimplificationError: 1.0,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 4,
  detailSampleMaxError: 0.2,
};

const log = (...a) => console.log("[iscolab]", ...a);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
log(`Reading ${SRC} (${kb(statSync(SRC).size)})${REBUILD ? ": no original model, so rebuilding from the last build" : ""}`);
// Read from bytes: the committed lab.glb is about to be written over.
const doc = await io.readBinary(new Uint8Array(readFileSync(SRC)));
const root = doc.getRoot();
const scene = root.listScenes()[0];
if (REBUILD) {
  // Back to plain floats, and the old lawn off: a new one goes down below.
  await doc.transform(dequantize());
  for (const node of root.listNodes()) {
    if (node.getMesh()?.listPrimitives().some((p) => p.getMaterial()?.getName() === "Lawn")) node.dispose();
  }
  await doc.transform(prune());
}

// 1. Each node's transform into its mesh (every mesh here has one node).
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  transformMesh(mesh, node.getWorldMatrix());
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}
for (const node of root.listNodes()) {
  if (node.getMesh()) {
    node.getParentNode()?.removeChild(node);
    scene.addChild(node);
  } else node.dispose(); // empties: nothing to draw
}

// 2. The floor at 0, the plan centred, the walls brought down.
const before = getBounds(scene);
const [cx, cz] = [(before.min[0] + before.max[0]) / 2, (before.min[2] + before.max[2]) / 2];
const floorY = before.min[1];
const k = WALL_HEIGHT / (before.max[1] - floorY);
// Column-major: scale y by k, after moving the floor to 0 and the centre
// to the origin.
const fit = [1, 0, 0, 0, 0, k, 0, 0, 0, 0, 1, 0, -cx, -floorY * k, -cz, 1];
for (const mesh of root.listMeshes()) transformMesh(mesh, fit);
const lab = getBounds(scene);
log(`Plan ${(lab.max[0] - lab.min[0]).toFixed(1)} × ${(lab.max[2] - lab.min[2]).toFixed(1)} m; walls scaled ×${k.toFixed(3)} to ${WALL_HEIGHT} m`);
// Some of the model's faces are wound the wrong way round, so they came
// out black (lit from behind). Normals from the winding, and two-sided
// walls, light them either way.
await doc.transform(weld(), normals({ overwrite: true }));
for (const material of root.listMaterials()) material.setDoubleSided(true);
// The floor and the columns have no material in the model, and glTF's
// default is fully metallic, which renders near-black without an
// environment map. Plain concrete instead, and nothing metallic anywhere.
{
  const concrete = doc.createMaterial("Concrete").setBaseColorFactor(CONCRETE_COLOR).setRoughnessFactor(0.9).setMetallicFactor(0).setDoubleSided(true);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) if (!prim.getMaterial()) prim.setMaterial(concrete);
  for (const material of root.listMaterials()) material.setMetallicFactor(0);
}

// 3. The meadow (client/plan.ts's LAWN), a centimetre under the lab's floor.
{
  const { x0, x1, z0, z1 } = LAWN;
  const y = -0.01;
  const position = doc.createAccessor().setType(Accessor.Type.VEC3).setArray(new Float32Array([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]));
  const normal = doc.createAccessor().setType(Accessor.Type.VEC3).setArray(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]));
  const indices = doc.createAccessor().setType(Accessor.Type.SCALAR).setArray(new Uint16Array([0, 2, 1, 0, 3, 2]));
  const material = doc.createMaterial("Lawn").setBaseColorFactor(LAWN_COLOR).setRoughnessFactor(1).setMetallicFactor(0);
  const prim = doc.createPrimitive().setAttribute("POSITION", position).setAttribute("NORMAL", normal).setIndices(indices).setMaterial(material);
  scene.addChild(doc.createNode("Lawn").setMesh(doc.createMesh("Lawn").addPrimitive(prim)));
}

// 4. The navmesh.
await init();
const positions = [];
const indices = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== 4) continue;
    const pos = prim.getAttribute("POSITION");
    const base = positions.length / 3;
    const v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) positions.push(...pos.getElement(i, v));
    const idx = prim.getIndices();
    if (idx) for (let i = 0; i < idx.getCount(); i++) indices.push(base + idx.getScalar(i));
    else for (let i = 0; i < pos.getCount(); i++) indices.push(base + i);
  }
}
// While the lab is being fixed, the barrier round it is a wall to walk
// along, not through, but for its opening at the main door: in the
// navmesh only (the barrier itself is drawn by the world's own code,
// client/Barrier.tsx).
if (UNDER_CONSTRUCTION) {
  const half = BARRIER_THICKNESS / 2;
  // Run by run, the way in at the main door left open.
  const sides = BARRIER_RUNS.map(([a, b]) => [Math.min(a[0], b[0]) - half, Math.max(a[0], b[0]) + half, Math.min(a[1], b[1]) - half, Math.max(a[1], b[1]) + half]);
  for (const [x0, x1, z0, z1] of sides) {
    const base = positions.length / 3;
    for (const y of [0, BARRIER_HEIGHT]) positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    // The top, and the four sides.
    indices.push(base + 4, base + 6, base + 5, base + 4, base + 7, base + 6);
    for (let i = 0; i < 4; i++) {
      const a = base + i;
      const b = base + ((i + 1) % 4);
      indices.push(a, b, b + 4, a, b + 4, a + 4);
    }
  }
  log(`The lab is under construction: a barrier round it, x ${BARRIER.x0.toFixed(1)}..${BARRIER.x1.toFixed(1)}, z ${BARRIER.z0.toFixed(1)}..${BARRIER.z1.toFixed(1)}`);
}
const nav = generateTiledNavMesh(new Float32Array(positions), new Uint32Array(indices), NAV);
if (!nav.success) throw new Error(`Navmesh failed: ${nav.error}`);
mkdirSync(OUT, { recursive: true });
const navBytes = exportNavMesh(nav.navMesh);
writeFileSync(join(OUT, "lab.navmesh"), navBytes);
log(`Navmesh: ${kb(navBytes.length)}`);

// The doorways in the outer walls: places where a step from just outside
// to just inside is a short walk, not the long way round. The spawn goes
// on the lawn in front of the one nearest the middle of the front (+z)
// wall, facing in.
const query = new NavMeshQuery(nav.navMesh);
const near = (x, z) => query.findClosestPoint({ x, y: 0, z }, { halfExtents: { x: 0.3, y: 0.5, z: 0.3 } }).point;
const walk = (a, b) => {
  const path = query.computePath(a, b, { halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }).path ?? [];
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  const end = path[path.length - 1];
  return end && Math.hypot(end.x - b.x, end.z - b.z) < 0.3 ? length : Infinity;
};
const doors = [];
for (let x = lab.min[0] + 0.5; x < lab.max[0] - 0.5; x += 0.25) {
  if (walk(near(x, lab.max[2] + 1), near(x, lab.max[2] - 1.2)) < 3.2) doors.push(x);
}
// Runs of neighbouring samples are one doorway: its middle.
const doorways = [];
for (const x of doors) {
  const last = doorways[doorways.length - 1];
  if (last && x - last.at[last.at.length - 1] <= 0.3) last.at.push(x);
  else doorways.push({ at: [x] });
}
const middles = doorways.map((d) => (d.at[0] + d.at[d.at.length - 1]) / 2);
log(`Doorways in the front wall at x = ${middles.map((x) => x.toFixed(1)).join(", ") || "none"}`);
const doorX = middles.sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
// The rooms are checked from just outside the middle door (inside the
// barrier, while there is one): every room should be walkable to from it.
const front = near(doorX, lab.max[2] + 0.8);
let inside = 0;
let reached = 0;
const unreached = [];
for (let x = lab.min[0] + 0.5; x < lab.max[0]; x += 0.5)
  for (let z = lab.min[2] + 0.5; z < lab.max[2]; z += 0.5) {
    const r = query.findClosestPoint({ x, y: 0, z }, { halfExtents: { x: 0.05, y: 0.3, z: 0.05 } });
    if (!r.success || !r.polyRef || Math.abs(r.point.x - x) > 0.06 || Math.abs(r.point.z - z) > 0.06) continue;
    inside++;
    const path = query.computePath(front, r.point, { halfExtents: { x: 1, y: 1, z: 1 } });
    const end = path.path?.[path.path.length - 1];
    if (end && Math.hypot(end.x - x, end.z - z) < 0.3) reached++;
    else unreached.push([x, z]);
  }
log(`Floor inside the lab: ${inside} samples, ${reached} reachable from its front door (${((100 * reached) / Math.max(1, inside)).toFixed(0)}%)`);
if (unreached.length) {
  const xs = unreached.map((p) => p[0]);
  const zs = unreached.map((p) => p[1]);
  log(`  Unreached floor spans x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}, z ${Math.min(...zs).toFixed(1)}..${Math.max(...zs).toFixed(1)}: rooms with no doorway?`);
}
// Arrival is on the meadow (client/plan.ts's SPAWN), and from there the
// kubo should be a walk away, and the lab too, through the barrier's way in.
// A point's own copy (the query hands back the same object each time, and
// the last one again when it finds nothing), and an error if it found
// nothing: a check against the wrong point passes or fails for nothing.
const at = (x, z) => {
  const r = query.findClosestPoint({ x, y: 0, z }, { halfExtents: { x: 1, y: 1, z: 1 } });
  if (!r.success || !r.polyRef) throw new Error(`No walkable ground near ${x}, ${z}.`);
  return { ...r.point };
};
const spawn = at(SPAWN.x, SPAWN.z);
const reaches = (x, z) => walk(spawn, at(x, z)) < Infinity;
const kubo = reaches((KUBO.x0 + KUBO.x1) / 2, (KUBO.z0 + KUBO.z1) / 2);
const lab_ = reaches(doorX, lab.max[2] - 1.2);
log(`Spawn: ${spawn.x.toFixed(2)}, ${spawn.y.toFixed(2)}, ${spawn.z.toFixed(2)}; the kubo ${kubo ? "reachable" : "NOT reachable"}; the lab ${lab_ ? "reachable" : "NOT reachable"}`);
if (!kubo) throw new Error("The kubo can't be walked to from the spawn.");
// The barrier is for the look: the lab stays open through its way in.
if (!lab_) throw new Error("The lab can't be walked to from the spawn (is the barrier's opening at a door?).");

// 5. Draw calls and compression.
await doc.transform(dedup(), joinMeshes({ keepNamed: false }), weld(), prune(), quantize({ quantizePosition: 16, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
const glb = await io.writeBinary(doc);
writeFileSync(join(OUT, "lab.glb"), glb);
log(`lab.glb: ${kb(glb.length)}, ${root.listMeshes().length} meshes, ${root.listMaterials().length} materials`);
