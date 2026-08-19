#!/usr/bin/env node
// Idempotently ensures the R2 bucket wrangler.jsonc's `r2_buckets` binding
// expects actually exists. Without this, a fresh Git-connected Cloudflare
// deploy (Workers Builds) fails on first push with e.g.:
//   R2 bucket 'seiza-avatars' not found. [code: 10085]
// `wrangler deploy` on the wrangler 3.x line this project is pinned to
// only *binds* to an existing bucket — it doesn't create one. (Newer
// wrangler has a beta "automatic resource provisioning" feature that
// does — see
// https://developers.cloudflare.com/changelog/2025-10-24-automatic-resource-provisioning/
// — not adopted here since it needs wrangler >=4.45.0 and a config-shape
// change this project hasn't verified yet. This script works on the
// pinned version with no upgrade required.)
//
// Runs as part of `npm run build`, which is what Cloudflare Workers
// Builds actually executes (see its build log: "Executing user build
// command: npm run build"). Deliberately a no-op when Cloudflare
// credentials aren't available, so a plain local `npm run build` (e.g.
// before `npm run worker:dev`) doesn't require being logged into
// Cloudflare.

import { execSync } from "node:child_process";

// Keep this in sync with wrangler.jsonc's r2_buckets[0].bucket_name.
const BUCKET_NAME = "seiza-avatars";

function run(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });
}

function outputOf(err) {
  return `${err.stdout?.toString() ?? ""}${err.stderr?.toString() ?? ""}`;
}

// `wrangler whoami` exits 0 even when logged out — it prints "You are
// not authenticated" as plain output rather than erroring. So the check
// has to read the text, not the exit code.
let whoamiOutput;
try {
  whoamiOutput = run("npx wrangler whoami").toString();
} catch (err) {
  whoamiOutput = outputOf(err);
}
if (/not authenticated/i.test(whoamiOutput)) {
  console.log("[ensure-r2-bucket] Not authenticated with Cloudflare — skipping (fine for local builds).");
  process.exit(0);
}

try {
  run(`npx wrangler r2 bucket create ${BUCKET_NAME}`);
  console.log(`[ensure-r2-bucket] Created R2 bucket "${BUCKET_NAME}".`);
} catch (err) {
  const output = outputOf(err);
  if (/already exists|already in use/i.test(output)) {
    console.log(`[ensure-r2-bucket] R2 bucket "${BUCKET_NAME}" already exists — continuing.`);
  } else {
    console.error(`[ensure-r2-bucket] Could not create R2 bucket "${BUCKET_NAME}":`);
    console.error(output);
    console.error(
      `[ensure-r2-bucket] If this is a permissions problem, create the bucket manually once ` +
        `(Cloudflare dashboard → R2 → Create bucket → "${BUCKET_NAME}", or run ` +
        `\`npx wrangler r2 bucket create ${BUCKET_NAME}\` yourself with credentials that can manage R2), then retry the deploy.`
    );
    process.exit(1);
  }
}
