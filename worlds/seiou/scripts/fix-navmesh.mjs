// Reworks SeiOU's committed navmesh in place, without the 100 MB model it
// was baked from: turns off the walkable pockets under floors (see
// nav-tools.mjs), then works out the lifts' floors again.
//
//   node worlds/seiou/scripts/fix-navmesh.mjs [--dry-run]
//
// build-campus.mjs does the same as part of a full rebuild.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { exportNavMesh, importNavMesh, init, NavMeshQuery } from "recast-navigation";
import { checkReach, dropBuriedIslands, findFloors, overhead, worldTriangles } from "./nav-tools.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "world", "models");
const dry = process.argv.includes("--dry-run");
const log = (...a) => console.log("[seiou]", ...a);

await init();
const { navMesh } = importNavMesh(new Uint8Array(readFileSync(join(OUT, "campus.navmesh"))));
const query = new NavMeshQuery(navMesh);
// What's overhead comes from the served model, which has the same shape
// the navmesh was baked from.
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const { positions, indices } = worldTriangles(await io.read(join(OUT, "campus.glb")));
const above = overhead(positions, indices);
const { dropped, total } = dropBuriedIslands(navMesh, above, log);
log(`Turned off ${dropped} of ${total} polygons under floors.`);
checkReach(query, log);
const floors = findFloors(query, above, log);
if (dry) process.exit(0);
writeFileSync(join(OUT, "campus.navmesh"), exportNavMesh(navMesh));
writeFileSync(join(OUT, "floors.json"), JSON.stringify(floors, null, 1));
log("Wrote campus.navmesh and floors.json.");
