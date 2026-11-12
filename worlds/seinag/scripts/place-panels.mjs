// Works out where Seinag's hypothetical rooftop solar arrays go, from
// SeiOU's campus model and navmesh (worlds/seiou/world/models/), and
// writes them to worlds/seinag/world/solar.json:
//
//   node worlds/seinag/scripts/place-panels.mjs
//
// A module goes wherever a roof is flat, walkable (so it's a real roof, not
// a parapet), open to the sky, and has room for the whole module. Rows face
// south (+Z: north is -Z in Seiza) at a 15° tilt, as Seizora's farm does.
// The WCMPB's roof deck stays clear for visitors; the Academic Residences
// already has panels in the model, so it's left as it is.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { importNavMesh, init, NavMeshQuery } from "recast-navigation";
import { overhead, worldTriangles } from "../../seiou/scripts/nav-tools.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS = join(HERE, "..", "..", "seiou", "world", "models");
const OUT = join(HERE, "..", "world", "solar.json");

/** One module: 1.7 m across, 1.1 m up the slope, about 400 Wp. */
export const MODULE = { width: 1.7, depth: 1.1, wp: 400 };
/** Spacing: modules side by side, and rows far enough apart not to shade
 *  each other at a low sun. */
const STEP_X = 1.8;
const STEP_Z = 2.0;

const BUILDINGS = {
  main: { name: "Main Building", box: [104, 126, -23, 23] },
  // The pods have pitched roofs: only their flat tops.
  tlh: { name: "Teaching and Learning Hub", box: [116, 148, 44, 82], minY: 8.5 },
  ccdl: { name: "CCDL", box: [263, 291, -113, -79] },
  // Above the roof deck (14.8 m) only: the deck is for people.
  wcmpb: { name: "World-Class Multi-Purpose Building", box: [192, 258, 120, 184], minY: 17 },
};

await init();
await MeshoptDecoder.ready;
const { navMesh } = importNavMesh(new Uint8Array(readFileSync(join(MODELS, "campus.navmesh"))));
const query = new NavMeshQuery(navMesh);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const { positions, indices } = worldTriangles(await io.read(join(MODELS, "campus.glb")));
const above = overhead(positions, indices);

/** The roof height at (x, z) near `y`, or null where there's no roof. */
function roofAt(x, y, z) {
  const r = query.findClosestPoint({ x, y, z }, { halfExtents: { x: 0.1, y: 0.4, z: 0.1 } });
  if (!r.success || !r.polyRef || Math.hypot(r.point.x - x, r.point.z - z) > 0.05) return null;
  return r.point.y;
}

const arrays = {};
let total = 0;
for (const [id, { name, box: [x0, x1, z0, z1], minY = 2.5 }] of Object.entries(BUILDINGS)) {
  const modules = [];
  for (let x = x0 + 1; x < x1 - 1; x += STEP_X)
    for (let z = z0 + 1; z < z1 - 1; z += STEP_Z)
      for (let y = minY; y < 25; y += 0.5) {
        const h = roofAt(x, y, z);
        if (h === null || h < minY) continue;
        // Open sky, and the module's corners on the same flat roof.
        if (above(x, h + 0.3, z) < 30) continue;
        const corners = [
          [x - MODULE.width / 2, z - MODULE.depth / 2],
          [x + MODULE.width / 2, z - MODULE.depth / 2],
          [x - MODULE.width / 2, z + MODULE.depth / 2],
          [x + MODULE.width / 2, z + MODULE.depth / 2],
        ];
        if (!corners.every(([cx, cz]) => {
          const c = roofAt(cx, h, cz);
          return c !== null && Math.abs(c - h) < 0.15;
        })) continue;
        if (!modules.some((m) => Math.hypot(m[0] - x, m[2] - z) < 0.5 && Math.abs(m[1] - h) < 1)) modules.push([+x.toFixed(2), +h.toFixed(2), +z.toFixed(2)]);
        break;
      }
  arrays[id] = { name, modules };
  total += modules.length;
  console.log(`[seinag] ${name}: ${modules.length} modules, ${((modules.length * MODULE.wp) / 1000).toFixed(1)} kWp`);
}
console.log(`[seinag] Total: ${total} modules, ${((total * MODULE.wp) / 1e6).toFixed(3)} MWp`);
writeFileSync(OUT, JSON.stringify({ module: MODULE, arrays }, null, 1));
