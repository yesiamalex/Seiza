#!/usr/bin/env node
// Downloads assets that THIRD_PARTY_ASSETS.md says can't be bundled in the
// repo directly (license doesn't permit redistribution). Run via
// `npm run fetch-assets`.
//
// Empty by design right now — see THIRD_PARTY_ASSETS.md and
// public/worlds/default/README.md. Add entries as real gesture/avatar
// sources are confirmed.

/** @type {{ url: string; destination: string; note: string }[]} */
const ASSETS = [
  // { url: "https://example.com/bow.vrma", destination: "public/gestures/bow.vrma", note: "TODO: source + license, see THIRD_PARTY_ASSETS.md" },
];

if (ASSETS.length === 0) {
  console.log("No fetchable third-party assets configured yet. See THIRD_PARTY_ASSETS.md.");
  process.exit(0);
}

for (const asset of ASSETS) {
  console.log(`Fetching ${asset.url} -> ${asset.destination}`);
  const res = await fetch(asset.url);
  if (!res.ok) {
    console.error(`Failed to fetch ${asset.url}: ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(asset.destination), { recursive: true });
  await writeFile(asset.destination, buf);
}
