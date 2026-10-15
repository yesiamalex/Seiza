// Builds the Seizora deployment into dist/: Seiza's own client and Worker
// unchanged, with the world switched to "seizora", plus everything that is
// Seizora's alone (world config, generated models and info boards, and the
// control room at /seizora/).
//
//   node worlds/seizora/build.mjs
//   npx wrangler deploy --config worlds/seizora/wrangler.jsonc
//
// Nothing in Seiza's own source is changed, and the default world's files
// are never touched: building Seiza afterwards (npm run build) overwrites
// dist/ with the default world again.
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DIST = join(ROOT, "dist");
const WORLD_ID = "seizora";

function step(label, fn) {
  console.log(`\n[seizora] ${label}`);
  return fn();
}

// 1. Seiza itself, built for this world: the same steps as its own
//    `npm run build`, run one at a time so the last one can be optional.
const env = { ...process.env, VITE_SEIZA_WORLD_ID: WORLD_ID };
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "inherit", env });
step("Building Seiza for the seizora world", () => {
  run("node scripts/fetch-assets.mjs");
  run("npx tsc --noEmit");
  run("npx vite build");
  // Finds or creates the avatar KV namespace and writes its id into the
  // root wrangler.jsonc; step 5 copies it across. It needs Cloudflare
  // credentials, which a dashboard build has and a local one may not, so
  // a failure here is a warning: the deploy itself reports a missing id.
  try {
    run("node scripts/ensure-kv-namespace.mjs");
  } catch {
    console.warn("[seizora] Could not look up the avatar namespace (not logged in to Cloudflare?). Continuing.");
  }
});

// 2. The world config, where Seiza's client looks for it.
step("Adding the world config", () => {
  mkdirSync(join(DIST, "worlds", WORLD_ID), { recursive: true });
  copyFileSync(join(HERE, "world", "world.json"), join(DIST, "worlds", WORLD_ID, "world.json"));
});

// 3. Models and info boards, generated rather than committed.
step("Generating models and info boards", () =>
  execSync(`node "${join(HERE, "models", "build-models.mjs")}" "${join(DIST, "worlds", WORLD_ID, "models")}"`, { cwd: ROOT, stdio: "inherit" })
);

// 4. The control room, a separate small page served at /seizora/.
await step("Building the control room", async () => {
  const { build } = await import("vite");
  await build({
    configFile: false,
    root: join(HERE, "sim"),
    base: "/seizora/",
    logLevel: "warn",
    build: { outDir: join(DIST, "seizora"), emptyOutDir: true },
  });
});

// 5. The avatar store's id, copied from the root config so both Workers
//    find the same namespace. Left as is when the root has none yet (a
//    local build without Cloudflare credentials).
step("Linking the avatar store", () => {
  const rootConfig = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
  const id = rootConfig.match(/"binding":\s*"AVATARS"[^}]*"id":\s*"([^"]*)"/)?.[1];
  const ownPath = join(HERE, "wrangler.jsonc");
  const own = readFileSync(ownPath, "utf8");
  if (!id || id.startsWith("REPLACE")) {
    console.log("[seizora] No avatar namespace id in wrangler.jsonc yet; fine for a local build.");
    return;
  }
  const updated = own.replace(/("binding":\s*"AVATARS"[^}]*"id":\s*")[^"]*(")/, `$1${id}$2`);
  if (updated !== own) writeFileSync(ownPath, updated);
  console.log(`[seizora] Avatar namespace ${id}.`);
});

console.log("\n[seizora] Built. Deploy with: npx wrangler deploy --config worlds/seizora/wrangler.jsonc");
