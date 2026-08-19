#!/usr/bin/env node
// Idempotently ensures a KV namespace titled NAMESPACE_TITLE exists and
// patches its id into wrangler.jsonc's AVATARS kv_namespaces binding.
//
// Why this exists: unlike an R2 bucket (referenced by a stable name, so
// "create or reuse by name" is naturally idempotent), a KV namespace is
// referenced in wrangler.jsonc by an opaque id that must already exist
// before `wrangler deploy` can bind to it — and multiple KV namespaces
// can share the same title, so blindly calling `create` on every build
// would leak a new orphaned namespace on every single push. This script
// avoids that by always looking the namespace up by title first (via
// `wrangler kv namespace list`) and only creating one if that lookup
// finds nothing — safe to run on every build, including a brand new git
// checkout (Cloudflare Workers Builds clones fresh every time, so this
// script's own edit to wrangler.jsonc from a previous build was never
// there to begin with — the title lookup is what makes it self-healing
// instead of needing to persist anything back to git).
//
// Runs as part of `npm run build`, which is what Cloudflare Workers
// Builds actually executes (see its build log: "Executing user build
// command: npm run build"). Deliberately a no-op when Cloudflare
// credentials aren't available, so a plain local `npm run build` (e.g.
// before `npm run worker:dev`) doesn't require being logged into
// Cloudflare.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const NAMESPACE_TITLE = "seiza-avatars";
const WRANGLER_CONFIG_PATH = new URL("../wrangler.jsonc", import.meta.url);

function run(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });
}

function outputOf(err) {
  return `${err.stdout?.toString() ?? ""}${err.stderr?.toString() ?? ""}`;
}

function findNamespaceId() {
  const raw = run("npx wrangler kv namespace list").toString();
  let namespaces;
  try {
    namespaces = JSON.parse(raw);
  } catch {
    throw new Error(`Could not parse \`wrangler kv namespace list\` output as JSON:\n${raw}`);
  }
  const match = namespaces.find((ns) => typeof ns.title === "string" && ns.title.toLowerCase().includes(NAMESPACE_TITLE));
  return match?.id ?? null;
}

function patchWranglerConfig(namespaceId) {
  const content = readFileSync(WRANGLER_CONFIG_PATH, "utf8");
  const pattern = /("binding":\s*"AVATARS"[^}]*"id":\s*")[^"]*(")/;
  if (!pattern.test(content)) {
    console.error('[ensure-kv-namespace] Could not find the AVATARS kv_namespaces binding in wrangler.jsonc to patch.');
    process.exit(1);
  }
  const updated = content.replace(pattern, `$1${namespaceId}$2`);
  if (updated === content) {
    console.log(`[ensure-kv-namespace] wrangler.jsonc already has the correct namespace id — nothing to do.`);
    return;
  }
  writeFileSync(WRANGLER_CONFIG_PATH, updated);
  console.log(`[ensure-kv-namespace] Set AVATARS namespace id to ${namespaceId} in wrangler.jsonc.`);
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
  console.log("[ensure-kv-namespace] Not authenticated with Cloudflare — skipping (fine for local builds).");
  process.exit(0);
}

try {
  let namespaceId = findNamespaceId();

  if (!namespaceId) {
    console.log(`[ensure-kv-namespace] No namespace titled "${NAMESPACE_TITLE}" found — creating one.`);
    try {
      run(`npx wrangler kv namespace create ${NAMESPACE_TITLE}`);
    } catch (err) {
      const output = outputOf(err);
      if (!/already exists/i.test(output)) {
        throw err;
      }
    }
    namespaceId = findNamespaceId();
  }

  if (!namespaceId) {
    throw new Error(`Namespace "${NAMESPACE_TITLE}" still not found after attempting to create it.`);
  }

  patchWranglerConfig(namespaceId);
} catch (err) {
  console.error(`[ensure-kv-namespace] Could not ensure KV namespace "${NAMESPACE_TITLE}" exists:`);
  console.error(err instanceof Error ? (outputOf(err) || err.message) : String(err));
  console.error(
    `[ensure-kv-namespace] If this is a permissions problem, create the namespace manually once ` +
      `(Cloudflare dashboard → Workers & Pages → KV → Create namespace → "${NAMESPACE_TITLE}", then ` +
      `paste its id into wrangler.jsonc's AVATARS kv_namespaces binding yourself), then retry the deploy.`
  );
  process.exit(1);
}
