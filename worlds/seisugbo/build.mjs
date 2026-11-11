// Builds the Seisugbo deployment into dist/: Seiza's own client and Worker,
// with the world switched to "seisugbo", plus Seisugbo's world config, its
// pictures (world/media/, already optimized: see scripts/optimize-media.mjs),
// and its icon. The lane, the court, and the boards are code in
// worlds/seisugbo/client/, which Seiza's client loads through its world
// extension hook, so they're part of the client build.
//
//   node worlds/seisugbo/build.mjs
//   npx wrangler deploy --config worlds/seisugbo/wrangler.jsonc
//
// The default world's files are never touched: building Seiza afterwards
// (npm run build) overwrites dist/ with the default world again.
import { execSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DIST = join(ROOT, "dist");
const WORLD_ID = "seisugbo";

function step(label, fn) {
  console.log(`\n[seisugbo] ${label}`);
  return fn();
}

// 1. Seiza itself, built for this world: the same steps as its own
//    `npm run build`, run one at a time so the last one can be optional.
const env = { ...process.env, VITE_SEIZA_WORLD_ID: WORLD_ID };
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "inherit", env });
step("Building Seiza for the seisugbo world", () => {
  run("node scripts/fetch-assets.mjs");
  run("npx tsc --noEmit");
  run("npx vite build");
  // Finds or creates the avatar KV namespace and writes its id into the
  // root wrangler.jsonc; step 3 copies it across. It needs Cloudflare
  // credentials, which a dashboard build has and a local one may not, so
  // a failure here is a warning: the deploy itself reports a missing id.
  try {
    run("node scripts/ensure-kv-namespace.mjs");
  } catch {
    console.warn("[seisugbo] Could not look up the avatar namespace (not logged in to Cloudflare?). Continuing.");
  }
});

// 2. The world config and pictures, where Seiza's client looks for them,
//    and the icon.
step("Adding the world config and pictures", () => {
  mkdirSync(join(DIST, "worlds", WORLD_ID), { recursive: true });
  cpSync(join(HERE, "world"), join(DIST, "worlds", WORLD_ID), { recursive: true });
  // Seisugbo's own tab icon, over Seiza's in this build's output only, at
  // its own URL: browsers cache icons hard, so one at Seiza's URL keeps
  // showing Seiza's in any browser that has seen it.
  copyFileSync(join(HERE, "favicon.svg"), join(DIST, "favicon.svg"));
  const indexPath = join(DIST, "index.html");
  const index = readFileSync(indexPath, "utf8");
  const withIcon = index.replace(/href="\/favicon\.svg(\?[^"]*)?"/, 'href="/favicon.svg?v=seisugbo-1"');
  if (withIcon === index) console.warn("[seisugbo] No favicon link found in index.html; the tab may show Seiza's icon.");
  writeFileSync(indexPath, withIcon);
});

// 3. The avatar store's id, copied from the root config so both Workers
//    find the same namespace. Left as is when the root has none yet (a
//    local build without Cloudflare credentials).
step("Linking the avatar store", () => {
  const rootConfig = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
  const id = rootConfig.match(/"binding":\s*"AVATARS"[^}]*"id":\s*"([^"]*)"/)?.[1];
  const ownPath = join(HERE, "wrangler.jsonc");
  const own = readFileSync(ownPath, "utf8");
  if (!id || id.startsWith("REPLACE")) {
    console.log("[seisugbo] No avatar namespace id in wrangler.jsonc yet; fine for a local build.");
    return;
  }
  const updated = own.replace(/("binding":\s*"AVATARS"[^}]*"id":\s*")[^"]*(")/, `$1${id}$2`);
  if (updated !== own) writeFileSync(ownPath, updated);
  console.log(`[seisugbo] Avatar namespace ${id}.`);
});

console.log("\n[seisugbo] Built. Deploy with: npx wrangler deploy --config worlds/seisugbo/wrangler.jsonc");
