// Turns the original photos in worlds/seisugbo/media-src/ (not committed:
// tens of megabytes of phone photos) into the small WebP files the world
// serves, in worlds/seisugbo/world/media/:
//
//   tex/<id>.webp    at most 512 px on the long edge, for the picture on the
//                    wall. A few tens of kilobytes each, so the whole
//                    exhibition downloads in a couple of megabytes and takes
//                    little graphics memory, even on a phone or a headset.
//   view/<id>.webp   at most 1600 px, fetched only when someone opens a
//                    piece to look at it closely.
//
// Metadata is stripped (phone photos carry GPS positions), and each photo is
// turned upright from its EXIF orientation first. Transparent PNGs (the
// hanging fish) keep their transparency.
//
//   node worlds/seisugbo/scripts/optimize-media.mjs
//
// Needs sharp, which is already in node_modules (it comes with wrangler).
// Run it after adding or replacing a photo in media-src/, then list the
// piece in client/collection.ts. The build never runs it: the outputs are
// committed, so a deploy needs neither sharp nor the originals.
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..", "media-src");
const OUT = resolve(HERE, "..", "world", "media");

const SIZES = [
  { dir: "tex", edge: 512, quality: 74 },
  { dir: "view", edge: 1600, quality: 80 },
];

/** GroupA_12.jpg → a12 */
function idFor(file) {
  const m = parse(file).name.match(/^Group([A-Z])_(\d+)$/i);
  return m ? `${m[1].toLowerCase()}${Number(m[2])}` : parse(file).name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

for (const { dir } of SIZES) mkdirSync(join(OUT, dir), { recursive: true });

let before = 0;
let after = 0;
const files = readdirSync(SRC).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
for (const file of files) {
  const input = join(SRC, file);
  before += statSync(input).size;
  const id = idFor(file);
  const line = [id.padEnd(5)];
  for (const { dir, edge, quality } of SIZES) {
    const output = join(OUT, dir, `${id}.webp`);
    const info = await sharp(input)
      .rotate()
      .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
      .webp({ quality, alphaQuality: 90, effort: 6, smartSubsample: true })
      .toFile(output);
    after += info.size;
    line.push(`${dir} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`);
  }
  console.log(line.join("   "));
}
console.log(`\n${files.length} pictures: ${(before / 1048576).toFixed(1)} MB of originals → ${(after / 1048576).toFixed(1)} MB served.`);
