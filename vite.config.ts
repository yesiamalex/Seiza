import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Keeps local-only test models out of every build.
 *
 * `public/__poselab/` holds VRM files for the local pose lab, some of which
 * may not be redistributed. The folder is gitignored, but Vite copies all of
 * `public/` into `dist/`, so a deploy from this machine would have served
 * them publicly. The dev server still serves the folder, so the pose lab
 * keeps working.
 */
function excludeLocalOnlyAssets(): Plugin {
  return {
    name: "seiza-exclude-local-only-assets",
    apply: "build",
    closeBundle() {
      rmSync(resolve(__dirname, "dist/__poselab"), { recursive: true, force: true });
    },
  };
}

// Static frontend dev server only. The Worker (worker/index.ts, which
// also hosts the room server as a bound Durable Object — worker/room.ts)
// runs separately via `npm run worker:dev` — see DOCS.md's "Local
// development" section.
export default defineConfig({
  plugins: [react(), excludeLocalOnlyAssets()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/rooms": { target: "ws://127.0.0.1:8787", ws: true, changeOrigin: true },
    },
  },
});
