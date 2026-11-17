// Builds the guides' avatars, Chancy Joan and Dean Rob, from their own
// rigged .glb exports (Avaturn, Mixamo bone names) into VRM, with Seiza's
// own importer: the same conversion an uploaded .glb avatar gets in the
// browser (src/avatar/import/glbToVrm.ts), run here once instead.
//
//   npx vite-node worlds/seiou/scripts/build-guides.mjs
//
// Reads worlds/seiou/media-src/chancy.glb and dean-rob.glb (kept local, not
// committed) and writes world/avatars/chancy.vrm and dean-rob.vrm, which
// are committed and served at /worlds/seiou/avatars/. Seinag's guides are
// the same two, and its build copies these files across.
//
// The textures are left as they are: the exports already keep them at
// 1024 px or less, and shrinking them further needs a browser canvas.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { convertGlbToVrm } from "../../../src/avatar/import/glbToVrm.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEIOU = resolve(HERE, "..");
const OUT = join(SEIOU, "world", "avatars");

const GUIDES = [
  { source: "chancy.glb", out: "chancy.vrm", name: "Chancy Joan" },
  { source: "dean-rob.glb", out: "dean-rob.vrm", name: "Dean Rob" },
];

mkdirSync(OUT, { recursive: true });
for (const guide of GUIDES) {
  const bytes = readFileSync(join(SEIOU, "media-src", guide.source));
  const result = await convertGlbToVrm(new Blob([bytes]), { name: guide.name, compressTextures: false });
  writeFileSync(join(OUT, guide.out), new Uint8Array(await result.blob.arrayBuffer()));
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  console.log(`[guides] ${guide.name}: ${mb(result.originalBytes)} → ${mb(result.vrmBytes)}, ${result.bones} bones mapped`);
  for (const note of result.notes) console.log(`[guides]   ${note}`);
}
